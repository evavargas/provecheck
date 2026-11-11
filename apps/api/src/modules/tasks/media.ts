import {
  MAX_PHOTOS_PER_REPORT,
  type PresignedPhotoDto,
  type PresignPhotoInput,
  type OutboxDto,
  type ReportContent,
  type ReportPhotoDto,
  type TaskDocumentDto,
  type TaskReportDto,
} from '@provecheck/shared';
import type pg from 'pg';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import { enqueue } from '../../lib/jobs.js';
import { photoKeys, type Storage } from '../../lib/storage.js';
import type { Actor, Db } from '../../plugins/db.js';

export function createTaskMedia(deps: { db: Db; storage: Storage }) {
  const { db, storage } = deps;

  /** The caller must be on the task, have arrived, and the task must still be open (F7). */
  async function assertCanUpload(c: pg.PoolClient, actor: Actor, taskId: string) {
    const task = await c.query<{ status: string }>(
      'SELECT status FROM tasks_public WHERE id = $1',
      [taskId],
    );
    if (!task.rows[0]) throw new AppError('NOT_FOUND');
    const mine = await c.query<{ arrived: boolean }>(
      'SELECT bool_or(arrived_at IS NOT NULL AND active AND collaborator_id = $2) AS arrived FROM app.task_team($1) GROUP BY ()',
      [taskId, actor.id],
    );
    if (task.rows[0].status !== 'on_site' || !mine.rows[0]?.arrived)
      throw new AppError('INVALID_STATE_TRANSITION');
  }

  return {
    /** F7.2: registers the photo and hands out one upload URL per stored version. Repeating the call is safe. */
    async presign(
      actor: Actor,
      taskId: string,
      input: PresignPhotoInput,
    ): Promise<PresignedPhotoDto> {
      const keys = photoKeys(actor.orgId, taskId, input.photoId);
      await db.asActor(actor, async (c) => {
        await assertCanUpload(c, actor, taskId);
        const existing = await c.query<{ uploaded_by: string; task_id: string }>(
          'SELECT uploaded_by, task_id FROM task_photos WHERE id = $1',
          [input.photoId],
        );
        if (existing.rows[0]) {
          if (existing.rows[0].uploaded_by !== actor.id || existing.rows[0].task_id !== taskId)
            throw new AppError('FORBIDDEN');
          return;
        }
        // Counted per task, not per caller: the 25 photo cap is for the whole record (RN-17). A trigger backs it up.
        const count = await c.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM task_photos WHERE task_id = $1 AND status <> 'expired'`,
          [taskId],
        );
        if (count.rows[0]!.n >= MAX_PHOTOS_PER_REPORT) throw new AppError('PHOTO_LIMIT_EXCEEDED');
        await c.query(
          `INSERT INTO task_photos (id, organization_id, task_id, uploaded_by, position, original_key, thumb_key, pdf_key, bytes, sha256, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() + interval '180 days')`,
          [
            input.photoId,
            actor.orgId,
            taskId,
            actor.id,
            input.position,
            keys.original,
            keys.thumb,
            keys.pdf,
            input.bytes,
            input.sha256 ?? null,
          ],
        );
      });
      const [original, thumb, pdf] = await Promise.all([
        storage.signedUpload(keys.original),
        storage.signedUpload(keys.thumb),
        storage.signedUpload(keys.pdf),
      ]);
      return { photoId: input.photoId, uploads: { original, thumb, pdf } };
    },

    /** Marks the photo uploaded once the three objects really exist in Storage. */
    async confirm(actor: Actor, taskId: string, photoId: string): Promise<void> {
      const keys = photoKeys(actor.orgId, taskId, photoId);
      await db.asActor(actor, async (c) => {
        const row = await c.query(
          `SELECT 1 FROM task_photos WHERE id = $1 AND task_id = $2 AND uploaded_by = $3`,
          [photoId, taskId, actor.id],
        );
        if (!row.rowCount) throw new AppError('NOT_FOUND');
      });
      const found = await Promise.all(
        [keys.original, keys.thumb, keys.pdf].map((k) => storage.exists(k)),
      );
      if (found.some((f) => !f)) throw new AppError('PHOTOS_NOT_CONFIRMED');
      await db.asActor(actor, (c) =>
        c.query(
          `UPDATE task_photos SET status = 'uploaded' WHERE id = $1 AND status = 'uploading'`,
          [photoId],
        ),
      );
    },

    /** F8/P-04: the record with its photos. Read URLs live ten minutes and disappear once the photo expired (RN-16). */
    async report(actor: Actor, taskId: string): Promise<TaskReportDto> {
      const { report, photos } = await db.asActor(actor, async (c) => {
        const r = await c.query<{
          id: string;
          content_html: string;
          content_json: ReportContent;
          completed_by: string;
          received_at: Date;
        }>(
          'SELECT id, content_html, content_json, completed_by, received_at FROM task_reports WHERE task_id = $1',
          [taskId],
        );
        if (!r.rows[0]) throw new AppError('NOT_FOUND');
        const p = await c.query<{
          id: string;
          position: number;
          status: ReportPhotoDto['status'];
          original_key: string;
          thumb_key: string;
        }>(
          `SELECT id, position, status, original_key, thumb_key FROM task_photos
           WHERE task_id = $1 AND status <> 'uploading' ORDER BY position, created_at`,
          [taskId],
        );
        return { report: r.rows[0], photos: p.rows };
      });
      return {
        id: report.id,
        html: report.content_html,
        content: report.content_json,
        completedBy: report.completed_by,
        completedAt: report.received_at.toISOString(),
        photos: await Promise.all(
          photos.map(async (p) => ({
            id: p.id,
            position: p.position,
            status: p.status,
            thumbUrl: p.status === 'uploaded' ? await storage.signedRead(p.thumb_key) : null,
            originalUrl: p.status === 'uploaded' ? await storage.signedRead(p.original_key) : null,
          })),
        ),
      };
    },

    /** Latest PDF, or PDF_PENDING while the job has not produced it (client users get this too, scoped by RLS). */
    async document(actor: Actor, taskId: string): Promise<TaskDocumentDto> {
      const doc = await db.asActor(actor, async (c) => {
        const { rows } = await c.query<{ pdf_key: string; version: number; generated_at: Date }>(
          'SELECT pdf_key, version, generated_at FROM documents WHERE task_id = $1 ORDER BY version DESC LIMIT 1',
          [taskId],
        );
        return rows[0];
      });
      if (!doc) throw new AppError('PDF_PENDING');
      return {
        url: await storage.signedRead(doc.pdf_key),
        version: doc.version,
        generatedAt: doc.generated_at.toISOString(),
      };
    },

    /** Mail history of a task for the admin (F9.3): sent, failed or skipped for lack of a contact. */
    async outbox(actor: Actor, taskId: string): Promise<{ items: OutboxDto[] }> {
      const { rows } = await db.asActor(actor, (c) =>
        c.query<{
          id: string;
          recipient: string | null;
          status: OutboxDto['status'];
          attempts: number;
          error: string | null;
          created_at: Date;
          sent_at: Date | null;
        }>(
          `SELECT id, recipient, status, attempts, error, created_at, sent_at FROM notifications_outbox WHERE task_id = $1 ORDER BY created_at DESC`,
          [taskId],
        ),
      );
      return {
        items: rows.map((r) => ({
          id: r.id,
          recipient: r.recipient,
          status: r.status,
          attempts: r.attempts,
          error: r.error,
          createdAt: r.created_at.toISOString(),
          sentAt: r.sent_at?.toISOString() ?? null,
        })),
      };
    },

    /** F16: the admin queues the mail again, optionally to another address. */
    async resend(actor: Actor, taskId: string, recipientOverride?: string): Promise<void> {
      await db.asActor(actor, async (c) => {
        const found = await c.query('SELECT 1 FROM documents WHERE task_id = $1', [taskId]);
        if (!found.rowCount) throw new AppError('PDF_PENDING');
        await enqueue(c, actor.orgId, 'send-pdf-mail', {
          taskId,
          ...(recipientOverride ? { recipientOverride } : {}),
        });
        await audit(c, {
          orgId: actor.orgId,
          actorId: actor.id,
          entity: 'task',
          entityId: taskId,
          action: 'resend_pdf',
          after: { recipientOverride: recipientOverride ?? null },
        });
      });
    },
  };
}
export type TaskMedia = ReturnType<typeof createTaskMedia>;
