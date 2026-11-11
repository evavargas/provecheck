import { createHash } from 'node:crypto';
import { formatDateTime, type ReportContent } from '@provecheck/shared';
import type { Transporter } from 'nodemailer';
import type { Env } from '../../lib/env.js';
import { enqueue, type Job } from '../../lib/jobs.js';
import type { Storage } from '../../lib/storage.js';
import type { Db } from '../../plugins/db.js';
import { renderTaskPdf, type PdfData } from './pdf.js';

const MAIL_ATTACHMENT_LIMIT = 10 * 1024 * 1024;

interface TaskRow {
  id: string;
  organization_id: string;
  address: string;
  recipient_name: string | null;
  scheduled_start_at: Date;
  completed_at: Date;
  objection_deadline_at: Date;
  org_name: string;
  default_locale: 'es-UY' | 'en';
  timezone: string;
  logo_key: string | null;
  company_name: string | null;
  company_email: string | null;
  client_user_name: string | null;
  client_user_email: string | null;
  service_type: string | null;
  content_json: ReportContent;
}

const load = async (db: Db, taskId: string) => {
  const { rows } = await db.pool.query<TaskRow>(
    `SELECT t.id, t.organization_id, t.address, t.recipient_name, t.scheduled_start_at, t.completed_at, t.objection_deadline_at,
            o.name AS org_name, o.default_locale, o.timezone, o.logo_key, c.legal_name AS company_name, c.email AS company_email,
            cu.name AS client_user_name, cu.email::text AS client_user_email, st.name AS service_type, r.content_json
     FROM tasks t JOIN organizations o ON o.id = t.organization_id JOIN task_reports r ON r.task_id = t.id
     LEFT JOIN client_companies c ON c.id = t.client_company_id LEFT JOIN users cu ON cu.id = t.client_user_id
     LEFT JOIN service_types st ON st.id = t.service_type_id
     WHERE t.id = $1 AND t.status <> 'cancelled'`,
    [taskId],
  );
  if (!rows[0]) throw new Error(`task ${taskId} has no finished record`);
  return rows[0];
};

/** RN-4: the client user's mail, else the company's, else nobody. */
const recipientOf = (t: TaskRow) => t.client_user_email ?? t.company_email ?? null;

export function createDocumentHandlers(deps: {
  db: Db;
  storage: Storage;
  mailer: Transporter;
  env: Env;
}) {
  const { db, storage, mailer, env } = deps;

  async function generatePdf(job: Job) {
    const taskId = String(job.payload.taskId);
    const already = await db.pool.query('SELECT 1 FROM documents WHERE task_id = $1', [taskId]);
    if (already.rowCount) return; // a retry after success must not produce a second PDF
    const t = await load(db, taskId);

    const team = await db.pool.query<{
      name: string;
      arrived_at: Date | null;
      attendance_delayed: boolean;
    }>(
      `SELECT u.name, a.arrived_at, a.attendance_delayed FROM task_assignments a JOIN users u ON u.id = a.collaborator_id
       WHERE a.task_id = $1 AND (a.active OR a.arrived_at IS NOT NULL) ORDER BY a.created_at, u.name`,
      [taskId],
    );
    const photoRows = await db.pool.query<{ pdf_key: string; sha256: string | null }>(
      `SELECT pdf_key, sha256 FROM task_photos WHERE task_id = $1 AND status = 'uploaded' ORDER BY position, created_at`,
      [taskId],
    );
    const photos = await Promise.all(photoRows.rows.map((p) => storage.download(p.pdf_key)));
    // A missing or broken logo never blocks the record: the PDF just goes without it.
    const logo = t.logo_key
      ? await storage.download(t.logo_key).then(
          (data) => ({
            data,
            format: t.logo_key!.endsWith('.png') ? ('png' as const) : ('jpg' as const),
          }),
          () => null,
        )
      : null;
    const shortHash = createHash('sha256')
      .update(JSON.stringify(t.content_json))
      .update(photoRows.rows.map((p) => p.sha256 ?? '').join(','))
      .digest('hex')
      .slice(0, 8);

    const data: PdfData = {
      taskShortId: t.id.slice(0, 8).toUpperCase(),
      orgName: t.org_name,
      locale: t.default_locale,
      timezone: t.timezone,
      logo,
      recipient: t.company_name ?? t.client_user_name ?? '',
      address: t.address,
      serviceType: t.service_type,
      recipientName: t.recipient_name,
      scheduledStartAt: t.scheduled_start_at.toISOString(),
      completedAt: t.completed_at.toISOString(),
      objectionDeadlineAt: t.objection_deadline_at.toISOString(),
      generatedAt: new Date().toISOString(),
      shortHash,
      team: team.rows.map((m) => ({
        name: m.name,
        arrivedAt: m.arrived_at?.toISOString() ?? null,
        delayed: m.attendance_delayed,
      })),
      content: t.content_json,
      photos,
    };
    const pdf = await renderTaskPdf(data);
    const key = `org/${t.organization_id}/tasks/${taskId}/pdf/v1.pdf`;
    await storage.upload(key, pdf, 'application/pdf');
    await db.tx(async (c) => {
      await c.query(
        `INSERT INTO documents (organization_id, task_id, pdf_key, hash, version) VALUES ($1,$2,$3,$4,1)`,
        [t.organization_id, taskId, key, shortHash],
      );
      await enqueue(c, t.organization_id, 'send-pdf-mail', { taskId });
    });
  }

  async function sendPdfMail(job: Job) {
    const taskId = String(job.payload.taskId);
    const override =
      typeof job.payload.recipientOverride === 'string' ? job.payload.recipientOverride : null;
    const t = await load(db, taskId);
    const to = override ?? recipientOf(t);
    const record = (status: 'sent' | 'failed' | 'skipped_no_contact', error?: string) =>
      db.pool.query(
        `INSERT INTO notifications_outbox (organization_id, task_id, channel, recipient, type, status, attempts, error, sent_at)
         VALUES ($1,$2,'email',$3,'task_pdf',$4::outbox_status,$5,$6, CASE WHEN $4::text = 'sent' THEN now() END)`,
        [t.organization_id, taskId, to, status, job.attempts, error ?? null],
      );

    // RN-4: without a contact there is nothing to retry; the admin sees the alert and can resend to another address.
    if (!to) return void (await record('skipped_no_contact'));

    try {
      if (!env.SMTP_USER) throw new Error('SMTP is not configured');
      const doc = await db.pool.query<{ pdf_key: string }>(
        'SELECT pdf_key FROM documents WHERE task_id = $1 ORDER BY version DESC LIMIT 1',
        [taskId],
      );
      if (!doc.rows[0]) throw new Error('the PDF does not exist yet');
      const pdf = await storage.download(doc.rows[0].pdf_key);
      const es = t.default_locale !== 'en';
      const date = formatDateTime(t.completed_at.toISOString(), t.default_locale, t.timezone).slice(
        0,
        10,
      );
      const where = t.company_name ?? t.address;
      const deadline = formatDateTime(
        t.objection_deadline_at.toISOString(),
        t.default_locale,
        t.timezone,
      );
      const attach = pdf.length < MAIL_ATTACHMENT_LIMIT;
      const link = attach ? null : await storage.signedRead(doc.rows[0].pdf_key, 7 * 24 * 3600);
      const appLink = env.APP_URL
        ? es
          ? `\n\nVer en la app: ${env.APP_URL}`
          : `\n\nView in the app: ${env.APP_URL}`
        : '';
      await mailer.sendMail({
        from: env.MAIL_FROM || env.SMTP_USER,
        to,
        subject: es
          ? `Servicio realizado: ${t.service_type ?? '—'} en ${where} (${date})`
          : `Service completed: ${t.service_type ?? '—'} at ${where} (${date})`,
        text: es
          ? `Hola,\n\n${t.org_name} realizó un servicio en ${t.address} el ${date}.\n${attach ? 'Adjuntamos el registro en PDF.' : `El registro en PDF pesa más de 10 MB: ${link}`}${appLink}\n\nPodés presentar un descargo hasta el ${deadline}.`
          : `Hello,\n\n${t.org_name} completed a service at ${t.address} on ${date}.\n${attach ? 'The PDF record is attached.' : `The PDF record is larger than 10 MB: ${link}`}${appLink}\n\nYou can file an objection until ${deadline}.`,
        attachments: attach
          ? [
              {
                filename: `service-record-${t.id.slice(0, 8)}.pdf`,
                content: pdf,
                contentType: 'application/pdf',
              },
            ]
          : [],
      });
      await record('sent');
    } catch (err) {
      // Intermediate failures just retry; the last one leaves a visible `failed` row for the admin (F9.3).
      if (job.attempts >= job.maxAttempts)
        await record('failed', (err as Error).message.slice(0, 300));
      throw err;
    }
  }

  return { 'generate-pdf': generatePdf, 'send-pdf-mail': sendPdfMail };
}
