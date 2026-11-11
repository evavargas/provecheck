import { randomUUID } from 'node:crypto';
import type { Transporter } from 'nodemailer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp, type App } from '../../app.js';
import { loadEnv } from '../../lib/env.js';
import { createDb } from '../../plugins/db.js';
import { createSupabase } from '../../plugins/supabase.js';
import { createUser } from '../users/create-user.js';

const run = randomUUID().slice(0, 8);
const TEMP = 'Temporary-pass-1';
const NEW = 'Brand-new-pass-1';

const env = loadEnv({
  ...process.env,
  LOG_LEVEL: process.env.TEST_LOG ?? 'silent',
  LOGIN_MAX_ATTEMPTS: '1000',
  SMTP_USER: 'sender@example.test',
  MAIL_FROM: 'sender@example.test',
});
const db = createDb(env.DATABASE_URL);
const supabase = createSupabase(env);
let app: App;
const orgs: string[] = [];
const authIds: string[] = [];
let adminToken: string;
let otherAdminToken: string;
let collabToken: string;
let collabId: string;
const sent: { to: string; subject: string; attachments: { filename: string }[] }[] = [];
let failMail = false;
const mailer = {
  sendMail: vi.fn(async (m: (typeof sent)[number]) => {
    if (failMail) throw new Error('smtp down');
    sent.push(m);
  }),
} as unknown as Transporter;

const call = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

async function activeUser(orgId: string, suffix: string, role: 'admin' | 'collaborator') {
  const username = `${suffix}${run}`;
  const email = `${suffix}.${run}@example.test`;
  const id = await createUser(
    { db, supabase },
    {
      organizationId: orgId,
      role,
      name: suffix,
      username,
      email,
      phone: '099000000',
      temporaryPassword: TEMP,
    },
  );
  authIds.push(id);
  const login = (password: string) =>
    app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: username, password } });
  const first = (await login(TEMP)).json().session.accessToken;
  await app.inject({
    method: 'POST',
    url: '/auth/first-login',
    headers: { authorization: `Bearer ${first}` },
    payload: { email, newPassword: NEW },
  });
  return (await login(NEW)).json().session.accessToken as string;
}

// A valid 1x1 JPEG.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);
const START = '2027-03-01T13:00:00.000Z';
const NOW = () => new Date().toISOString();
const content = {
  blocks: [{ type: 'paragraph', content: [{ text: 'Done ' }, { text: 'well', bold: true }] }],
};

beforeAll(async () => {
  app = await buildApp(env, { mailer });
  for (const n of ['A', 'B']) {
    const { rows } = await db.pool.query<{ id: string }>(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
      [`Docs ${n} ${run}`],
    );
    orgs.push(rows[0]!.id);
  }
  adminToken = await activeUser(orgs[0]!, 'dadmin', 'admin');
  otherAdminToken = await activeUser(orgs[1]!, 'dother', 'admin');
  collabToken = await activeUser(orgs[0]!, 'dcollab', 'collaborator');
  collabId = (await call('GET', '/me', collabToken)).json().id;
});

afterAll(async () => {
  await db.pool.query('DELETE FROM jobs WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM notifications_outbox WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM documents WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM task_photos WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM task_report_drafts WHERE organization_id = ANY($1)', [orgs]);
  await db.tx(async (c) => {
    await c.query('ALTER TABLE task_reports DISABLE TRIGGER USER');
    await c.query('DELETE FROM task_reports WHERE organization_id = ANY($1)', [orgs]);
    await c.query('ALTER TABLE task_reports ENABLE TRIGGER USER');
  });
  await db.pool.query('DELETE FROM task_assignments WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM tasks WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM audit_log WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM user_identifiers WHERE user_id = ANY($1)', [authIds]);
  await db.pool.query('DELETE FROM users WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM client_companies WHERE organization_id = ANY($1)', [orgs]);
  for (const id of authIds) await supabase.admin.auth.admin.deleteUser(id);
  await db.pool.query('DELETE FROM organizations WHERE id = ANY($1)', [orgs]);
  await app.close();
});

/** Creates a company (optionally with a mail), a task on site and returns ids. */
async function onSiteTask(email?: string) {
  const company = (
    await call('POST', '/client-companies', adminToken, {
      legalName: `Co ${randomUUID().slice(0, 6)} ${run}`,
      address: 'Calle 1',
      ...(email ? { email } : {}),
    })
  ).json();
  const task = (
    await call('POST', '/tasks', adminToken, {
      clientCompanyId: company.id,
      scheduledStartAt: START,
      description: 'Work',
      assignments: [{ collaboratorId: collabId }],
    })
  ).json();
  await call('POST', `/tasks/${task.id}/arrival`, collabToken, {
    deviceArrivedAt: NOW(),
    attendanceDelayed: false,
  });
  return task.id as string;
}

/** Uploads one photo the way the app does: presign, PUT the three versions, confirm. */
async function uploadPhoto(taskId: string, position = 0, token = collabToken) {
  const photoId = randomUUID();
  const res = await call('POST', `/tasks/${taskId}/photos/presign`, token, {
    photoId,
    position,
    bytes: JPEG.length,
  });
  if (res.statusCode !== 200) return { photoId, res };
  for (const url of Object.values(res.json().uploads as Record<string, string>)) {
    const put = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: JPEG,
    });
    expect(put.ok).toBe(true);
  }
  const confirm = await call('POST', `/tasks/${taskId}/photos/${photoId}/confirm`, token);
  return { photoId, res, confirm };
}
const finalize = (taskId: string, photoIds: string[] = []) =>
  call('POST', `/tasks/${taskId}/finalize`, collabToken, {
    reportId: randomUUID(),
    contentJson: content,
    deviceCompletedAt: NOW(),
    deviceSentAt: NOW(),
    photoIds,
  });

describe('photos', () => {
  it('uploads, confirms and orders photos into the record', async () => {
    const taskId = await onSiteTask();
    const a = await uploadPhoto(taskId, 0);
    const b = await uploadPhoto(taskId, 1);
    expect(a.confirm?.statusCode).toBe(204);
    const done = await finalize(taskId, [b.photoId, a.photoId]);
    expect(done.statusCode).toBe(200);
    const report = (await call('GET', `/tasks/${taskId}/report`, collabToken)).json();
    expect(report.photos.map((p: { id: string }) => p.id)).toEqual([b.photoId, a.photoId]);
    expect(report.photos[0].thumbUrl).toContain('token=');
    expect(report.html).toContain('<strong>well</strong>');
    // After the retention date the photo is shown as expired, without URLs (RN-16).
    await db.pool.query(`UPDATE task_photos SET status = 'expired' WHERE id = $1`, [a.photoId]);
    const later = (await call('GET', `/tasks/${taskId}/report`, adminToken)).json();
    expect(later.photos.find((p: { id: string }) => p.id === a.photoId)).toMatchObject({
      status: 'expired',
      thumbUrl: null,
      originalUrl: null,
    });
  });

  it('refuses photos before arrival, beyond 25 and unconfirmed ones at finalize', async () => {
    const company = (
      await call('POST', '/client-companies', adminToken, {
        legalName: `NoArr ${run}`,
        address: 'A',
      })
    ).json();
    const t = (
      await call('POST', '/tasks', adminToken, {
        clientCompanyId: company.id,
        scheduledStartAt: START,
        description: 'x',
        assignments: [{ collaboratorId: collabId }],
      })
    ).json();
    const early = await call('POST', `/tasks/${t.id}/photos/presign`, collabToken, {
      photoId: randomUUID(),
      position: 0,
      bytes: 10,
    });
    expect(early.statusCode).toBe(409);

    const taskId = await onSiteTask();
    for (let i = 0; i < 25; i++) {
      await db.pool.query(
        `INSERT INTO task_photos (id, organization_id, task_id, uploaded_by, position, original_key, thumb_key, pdf_key, expires_at, status)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'o', 't', 'p', now() + interval '1 day', 'uploaded')`,
        [orgs[0], taskId, collabId, i],
      );
    }
    const over = await call('POST', `/tasks/${taskId}/photos/presign`, collabToken, {
      photoId: randomUUID(),
      position: 0,
      bytes: 10,
    });
    expect(over.json().code).toBe('PHOTO_LIMIT_EXCEEDED');
    const big = await call('POST', `/tasks/${taskId}/photos/presign`, collabToken, {
      photoId: randomUUID(),
      position: 0,
      bytes: 4 * 1024 * 1024,
    });
    expect(big.statusCode).toBe(422);

    const t2 = await onSiteTask();
    const pending = randomUUID();
    await call('POST', `/tasks/${t2}/photos/presign`, collabToken, {
      photoId: pending,
      position: 0,
      bytes: 10,
    });
    const fin = await finalize(t2, [pending]);
    expect(fin.json().code).toBe('PHOTOS_NOT_CONFIRMED');
    expect(
      (await call('POST', `/tasks/${t2}/photos/${pending}/confirm`, collabToken)).json().code,
    ).toBe('PHOTOS_NOT_CONFIRMED');
    expect((await finalize(t2, [randomUUID()])).json().code).toBe('PHOTOS_NOT_CONFIRMED');
  });
});

describe('pdf and mail queue', () => {
  it('finalize queues the PDF; the worker builds it, stores it and mails it to the company', async () => {
    const taskId = await onSiteTask('billing@client.test');
    const photo = await uploadPhoto(taskId);
    expect((await finalize(taskId, [photo.photoId])).statusCode).toBe(200);
    expect((await call('GET', `/tasks/${taskId}/pdf`, adminToken)).json().code).toBe('PDF_PENDING');

    sent.length = 0;
    await app.worker.runOnce();
    // generate-pdf, which queues send-pdf-mail, which runs in the same pass
    const pdf = (await call('GET', `/tasks/${taskId}/pdf`, adminToken)).json();
    const file = await fetch(pdf.url);
    expect(file.ok).toBe(true);
    expect((await file.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    expect(
      Buffer.from(await (await fetch(pdf.url)).arrayBuffer())
        .subarray(0, 4)
        .toString(),
    ).toBe('%PDF');

    const mail = sent.find((m) => m.to === 'billing@client.test');
    expect(mail?.subject).toMatch(/^Servicio realizado/);
    expect(mail?.attachments[0]?.filename).toMatch(/\.pdf$/);
    const outbox = await db.pool.query(
      `SELECT status, recipient FROM notifications_outbox WHERE task_id = $1`,
      [taskId],
    );
    expect(outbox.rows).toEqual([{ status: 'sent', recipient: 'billing@client.test' }]);

    const history = (await call('GET', `/tasks/${taskId}/outbox`, adminToken)).json();
    expect(history.items).toMatchObject([{ status: 'sent', recipient: 'billing@client.test' }]);
    expect((await call('GET', `/tasks/${taskId}/outbox`, collabToken)).statusCode).toBe(403);

    // Running again changes nothing: no second PDF, no second mail.
    await app.worker.runOnce();
    expect(
      (await db.pool.query('SELECT 1 FROM documents WHERE task_id = $1', [taskId])).rowCount,
    ).toBe(1);
  });

  it('records skipped_no_contact when nobody can receive it, then resends to another address', async () => {
    const taskId = await onSiteTask();
    await finalize(taskId);
    sent.length = 0;
    await app.worker.runOnce();
    expect(sent).toHaveLength(0);
    const row = await db.pool.query(`SELECT status FROM notifications_outbox WHERE task_id = $1`, [
      taskId,
    ]);
    expect(row.rows).toEqual([{ status: 'skipped_no_contact' }]);

    expect((await call('POST', `/tasks/${taskId}/resend-pdf`, collabToken, {})).statusCode).toBe(
      403,
    );
    expect(
      (await call('POST', `/tasks/${taskId}/resend-pdf`, otherAdminToken, {})).statusCode,
    ).toBe(404);
    expect(
      (
        await call('POST', `/tasks/${taskId}/resend-pdf`, adminToken, {
          recipientOverride: 'other@client.test',
        })
      ).statusCode,
    ).toBe(204);
    await app.worker.runOnce();
    expect(sent.map((m) => m.to)).toEqual(['other@client.test']);
    const rows = await db.pool.query(
      `SELECT status FROM notifications_outbox WHERE task_id = $1 ORDER BY created_at`,
      [taskId],
    );
    expect(rows.rows.map((r) => r.status)).toEqual(['skipped_no_contact', 'sent']);
  });

  it('retries with backoff and leaves a failed outbox row when attempts run out', async () => {
    const taskId = await onSiteTask('retry@client.test');
    await finalize(taskId);
    failMail = true;
    try {
      for (let i = 0; i < 6; i++) {
        await app.worker.runOnce();
        await db.pool.query(
          `UPDATE jobs SET run_at = now() WHERE status = 'pending' AND organization_id = $1`,
          [orgs[0]],
        );
      }
    } finally {
      failMail = false;
    }
    const job = await db.pool.query(
      `SELECT status, attempts, last_error FROM jobs WHERE type = 'send-pdf-mail' AND payload->>'taskId' = $1`,
      [taskId],
    );
    expect(job.rows[0]).toMatchObject({ status: 'failed', attempts: 5, last_error: 'smtp down' });
    const outbox = await db.pool.query(
      `SELECT status, error, attempts FROM notifications_outbox WHERE task_id = $1`,
      [taskId],
    );
    expect(outbox.rows).toEqual([{ status: 'failed', error: 'smtp down', attempts: 5 }]);
  });
});
