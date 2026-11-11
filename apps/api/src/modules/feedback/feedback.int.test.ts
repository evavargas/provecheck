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
let collab2Id: string;
let collab2Token: string;
let companyId: string;
let otherCompanyId: string;
let clientToken: string;
let client2Token: string;
let strangerToken: string;
const mailer = { sendMail: vi.fn(async () => undefined) } as unknown as Transporter;

const call = (
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  url: string,
  token: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

async function activeUser(
  orgId: string,
  suffix: string,
  role: 'admin' | 'collaborator' | 'client_user',
  clientCompanyId?: string,
) {
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
      ...(clientCompanyId ? { clientCompanyId } : {}),
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

const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);
const NOW = () => new Date().toISOString();
const content = { blocks: [{ type: 'paragraph', content: [{ text: 'Done' }] }] };

beforeAll(async () => {
  app = await buildApp(env, { mailer });
  for (const n of ['A', 'B']) {
    const { rows } = await db.pool.query<{ id: string }>(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
      [`Feedback ${n} ${run}`],
    );
    orgs.push(rows[0]!.id);
  }
  adminToken = await activeUser(orgs[0]!, 'fadmin', 'admin');
  otherAdminToken = await activeUser(orgs[1]!, 'fother', 'admin');
  collabToken = await activeUser(orgs[0]!, 'fcollab', 'collaborator');
  collabId = (await call('GET', '/me', collabToken)).json().id;
  collab2Token = await activeUser(orgs[0]!, 'fcollab2', 'collaborator');
  collab2Id = (await call('GET', '/me', collab2Token)).json().id;
  const company = async (name: string) =>
    (
      await call('POST', '/client-companies', adminToken, {
        legalName: `${name} ${run}`,
        address: 'Calle 1',
        email: `${name}@client.test`,
      })
    ).json().id as string;
  companyId = await company('Alpha');
  otherCompanyId = await company('Beta');
  clientToken = await activeUser(orgs[0]!, 'fclient', 'client_user', companyId);
  client2Token = await activeUser(orgs[0]!, 'fclient2', 'client_user', companyId);
  strangerToken = await activeUser(orgs[0]!, 'fstranger', 'client_user', otherCompanyId);
});

afterAll(async () => {
  await db.pool.query('DELETE FROM jobs WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM task_ratings WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM objection_attachments WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM objections WHERE organization_id = ANY($1)', [orgs]);
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

/** A finished task of the first company with two collaborators, cost and fees that must never reach the client. */
async function finishedTask() {
  const task = (
    await call('POST', '/tasks', adminToken, {
      clientCompanyId: companyId,
      scheduledStartAt: '2027-03-01T13:00:00.000Z',
      description: 'Work',
      costUyu: 31337,
      assignments: [
        { collaboratorId: collabId, feeUyu: 4242 },
        { collaboratorId: collab2Id, feeUyu: 5151 },
      ],
    })
  ).json();
  await call('POST', `/tasks/${task.id}/arrival`, collabToken, {
    deviceArrivedAt: NOW(),
    attendanceDelayed: false,
  });
  const done = await call('POST', `/tasks/${task.id}/finalize`, collabToken, {
    reportId: randomUUID(),
    contentJson: content,
    deviceCompletedAt: NOW(),
    deviceSentAt: NOW(),
  });
  expect(done.statusCode).toBe(200);
  return task.id as string;
}

async function attachment(
  taskId: string,
  stagingId: string,
  position: number,
  token = clientToken,
) {
  const attachmentId = randomUUID();
  const res = await call('POST', `/tasks/${taskId}/objection/attachments/presign`, token, {
    attachmentId,
    stagingId,
    position,
    bytes: JPEG.length,
  });
  if (res.statusCode !== 200) return { attachmentId, res };
  for (const url of Object.values(res.json().uploads as Record<string, string>)) {
    expect(
      (await fetch(url, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: JPEG }))
        .ok,
    ).toBe(true);
  }
  const confirm = await call(
    'POST',
    `/tasks/${taskId}/objection/attachments/${attachmentId}/confirm`,
    token,
  );
  return { attachmentId, res, confirm };
}

describe('client view', () => {
  it('shows only the company tasks, without costs, fees or other people ratings (RN-1, RN-13)', async () => {
    const id = await finishedTask();
    const mine = await call('GET', '/tasks', clientToken);
    expect(mine.json().items.map((t: { id: string }) => t.id)).toContain(id);
    const detail = await call('GET', `/tasks/${id}`, clientToken);
    expect(detail.json()).toMatchObject({
      status: 'completed',
      canFileObjection: true,
      canRate: true,
      closed: false,
    });
    expect(
      detail
        .json()
        .team.map((m: { name: string }) => m.name)
        .sort(),
    ).toEqual(['fcollab', 'fcollab2']);
    expect(mine.body + detail.body).not.toMatch(/cost|fee|31337|4242|5151/i);
    // A colleague of the same company sees it too; a client of another company does not.
    expect((await call('GET', `/tasks/${id}`, client2Token)).statusCode).toBe(200);
    expect((await call('GET', `/tasks/${id}`, strangerToken)).statusCode).toBe(404);
    expect(
      (await call('GET', '/tasks', strangerToken)).json().items.map((t: { id: string }) => t.id),
    ).not.toContain(id);
    expect((await call('GET', `/tasks/${id}`, otherAdminToken)).statusCode).toBe(404);
  });

  it('reads the record and the PDF status of a visible task', async () => {
    const id = await finishedTask();
    expect((await call('GET', `/tasks/${id}/report`, clientToken)).statusCode).toBe(200);
    expect((await call('GET', `/tasks/${id}/report`, strangerToken)).statusCode).toBe(404);
    expect((await call('GET', `/tasks/${id}/pdf`, clientToken)).json().code).toBe('PDF_PENDING');
  });
});

describe('objection', () => {
  it('is filed once with images, moves the task and hides the internal notes (RN-7, RN-21, RN-22)', async () => {
    const id = await finishedTask();
    const staging = randomUUID();
    const a = await attachment(id, staging, 0);
    const b = await attachment(id, staging, 1);
    expect(a.confirm?.statusCode).toBe(204);

    expect(
      (
        await call('POST', `/tasks/${id}/objection`, clientToken, {
          stagingId: staging,
          description: 'bad',
          attachmentIds: [],
        })
      ).statusCode,
    ).toBe(422);
    const filed = await call('POST', `/tasks/${id}/objection`, clientToken, {
      stagingId: staging,
      description: 'The floor was left dirty',
      attachmentIds: [b.attachmentId, a.attachmentId],
    });
    expect(filed.statusCode).toBe(201);
    expect(filed.json()).toMatchObject({
      status: 'objection_filed',
      canFileObjection: false,
      objection: { description: 'The floor was left dirty', status: 'open' },
    });
    expect(filed.json().objection.attachments.map((x: { id: string }) => x.id)).toEqual([
      b.attachmentId,
      a.attachmentId,
    ]);

    // One objection per task, whoever tries again (RN-7).
    const again = await call('POST', `/tasks/${id}/objection`, client2Token, {
      stagingId: randomUUID(),
      description: 'Second try here',
      attachmentIds: [],
    });
    expect(again.json().code).toBe('OBJECTION_ALREADY_EXISTS');

    // The admin manages it; the notes never reach the client.
    const list = (await call('GET', '/objections?status=open', adminToken)).json().items;
    const row = list.find((o: { taskId: string }) => o.taskId === id);
    expect(row).toMatchObject({ status: 'open', author: { name: 'fclient' }, ageDays: 0 });
    const detail = (await call('GET', `/objections/${row.id}`, adminToken)).json();
    expect(detail.attachments).toHaveLength(2);
    expect(detail.attachments[0].thumbUrl).toContain('token=');
    const reviewed = await call('PATCH', `/objections/${row.id}`, adminToken, {
      status: 'in_review',
      internalNotes: 'secret-note-123',
    });
    expect(reviewed.json()).toMatchObject({
      status: 'in_review',
      internalNotes: 'secret-note-123',
      taskStatus: 'in_review',
    });
    const seen = await call('GET', `/tasks/${id}`, clientToken);
    expect(seen.json()).toMatchObject({ status: 'in_review', objection: { status: 'in_review' } });
    expect(seen.body).not.toContain('secret-note-123');
    expect(seen.body).not.toMatch(/internal/i);
    await call('PATCH', `/objections/${row.id}`, adminToken, { status: 'resolved' });
    expect((await call('GET', `/tasks/${id}`, clientToken)).json().status).toBe('resolved');
    const { rows } = await db.pool.query(
      `SELECT action FROM audit_log WHERE entity_id = ANY($1) ORDER BY id`,
      [[id, row.id]],
    );
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(['objection_filed', 'status_change']),
    );
  });

  it('is refused after the window, for other roles, with unconfirmed or too many images', async () => {
    const id = await finishedTask();
    expect(
      (
        await call('POST', `/tasks/${id}/objection`, strangerToken, {
          stagingId: randomUUID(),
          description: 'Not my task',
          attachmentIds: [],
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await call('POST', `/tasks/${id}/objection`, adminToken, {
          stagingId: randomUUID(),
          description: 'I am the admin',
          attachmentIds: [],
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call('POST', `/tasks/${id}/objection`, collabToken, {
          stagingId: randomUUID(),
          description: 'I am the worker',
          attachmentIds: [],
        })
      ).statusCode,
    ).toBe(403);

    const unconfirmed = randomUUID();
    const staging = randomUUID();
    await call('POST', `/tasks/${id}/objection/attachments/presign`, clientToken, {
      attachmentId: unconfirmed,
      stagingId: staging,
      position: 0,
      bytes: 10,
    });
    const notReady = await call('POST', `/tasks/${id}/objection`, clientToken, {
      stagingId: staging,
      description: 'With a pending image',
      attachmentIds: [unconfirmed],
    });
    expect(notReady.json().code).toBe('PHOTOS_NOT_CONFIRMED');

    const full = randomUUID();
    for (let i = 0; i < 5; i++) {
      await db.pool.query(
        `INSERT INTO objection_attachments (id, organization_id, task_id, staging_id, uploaded_by, position, original_key, thumb_key, expires_at)
         SELECT gen_random_uuid(), $1, $2, $3, id, $4, 'o', 't', now() + interval '1 day' FROM users WHERE role = 'client_user' AND organization_id = $1 LIMIT 1`,
        [orgs[0], id, full, i],
      );
    }
    const sixth = await call('POST', `/tasks/${id}/objection/attachments/presign`, clientToken, {
      attachmentId: randomUUID(),
      stagingId: full,
      position: 0,
      bytes: 10,
    });
    expect(sixth.json().code).toBe('ATTACHMENT_LIMIT_EXCEEDED');

    await db.pool.query(
      `UPDATE tasks SET objection_deadline_at = now() - interval '1 hour' WHERE id = $1`,
      [id],
    );
    const closed = await call('GET', `/tasks/${id}`, clientToken);
    expect(closed.json()).toMatchObject({ canFileObjection: false, canRate: false, closed: true });
    const late = await call('POST', `/tasks/${id}/objection`, clientToken, {
      stagingId: randomUUID(),
      description: 'Too late now',
      attachmentIds: [],
    });
    expect(late.json().code).toBe('OBJECTION_WINDOW_CLOSED');
  });

  it('keeps objections of other organizations out of the admin list', async () => {
    expect((await call('GET', '/objections', otherAdminToken)).json().items).toHaveLength(0);
    expect((await call('GET', '/objections', clientToken)).statusCode).toBe(403);
    expect((await call('GET', '/objections', collabToken)).statusCode).toBe(403);
  });
});

describe('ratings', () => {
  it('lets the client rate each collaborator, edit while open, and only the admin reads them (RN-8)', async () => {
    const id = await finishedTask();
    const team = (await call('GET', `/tasks/${id}`, clientToken)).json().team as {
      assignmentId: string;
      name: string;
    }[];
    const first = team.find((m) => m.name === 'fcollab')!;
    const second = team.find((m) => m.name === 'fcollab2')!;

    expect(
      (await call('PUT', `/tasks/${id}/ratings/${first.assignmentId}`, clientToken, { stars: 6 }))
        .statusCode,
    ).toBe(422);
    const saved = await call('PUT', `/tasks/${id}/ratings/${first.assignmentId}`, clientToken, {
      stars: 4,
      comment: 'Good',
    });
    expect(saved.json().team.find((m: { name: string }) => m.name === 'fcollab').myRating).toEqual({
      stars: 4,
      comment: 'Good',
    });
    const edited = await call('PUT', `/tasks/${id}/ratings/${first.assignmentId}`, clientToken, {
      stars: 5,
      comment: '',
    });
    expect(edited.json().team.find((m: { name: string }) => m.name === 'fcollab').myRating).toEqual(
      { stars: 5, comment: null },
    );
    await call('PUT', `/tasks/${id}/ratings/${second.assignmentId}`, clientToken, {
      stars: 2,
      comment: 'Late',
    });
    // A colleague rates independently and never sees these.
    await call('PUT', `/tasks/${id}/ratings/${first.assignmentId}`, client2Token, { stars: 3 });
    expect(
      (await call('GET', `/tasks/${id}`, client2Token))
        .json()
        .team.find((m: { name: string }) => m.name === 'fcollab2').myRating,
    ).toBeNull();

    expect(
      (await call('PUT', `/tasks/${id}/ratings/${first.assignmentId}`, strangerToken, { stars: 1 }))
        .statusCode,
    ).toBe(404);
    expect(
      (await call('PUT', `/tasks/${id}/ratings/${randomUUID()}`, clientToken, { stars: 1 }))
        .statusCode,
    ).toBe(404);
    expect(
      (await call('PUT', `/tasks/${id}/ratings/${first.assignmentId}`, collabToken, { stars: 5 }))
        .statusCode,
    ).toBe(403);

    const summary = (await call('GET', '/ratings/summary', adminToken)).json().items;
    const mine = summary.find((s: { collaboratorId: string }) => s.collaboratorId === collabId);
    expect(mine).toMatchObject({ count: 2, average: 4, distribution: [0, 0, 1, 0, 1] });
    const list = (await call('GET', `/ratings?collaboratorId=${collab2Id}`, adminToken)).json()
      .items;
    expect(list).toMatchObject([
      { stars: 2, comment: 'Late', collaboratorName: 'fcollab2', authorName: 'fclient' },
    ]);
    for (const token of [clientToken, collabToken]) {
      expect((await call('GET', '/ratings', token)).statusCode).toBe(403);
      expect((await call('GET', '/ratings/summary', token)).statusCode).toBe(403);
    }
    expect((await call('GET', '/ratings/summary', otherAdminToken)).json().items).toEqual([]);

    await db.pool.query(
      `UPDATE tasks SET objection_deadline_at = now() - interval '1 minute' WHERE id = $1`,
      [id],
    );
    const late = await call('PUT', `/tasks/${id}/ratings/${first.assignmentId}`, clientToken, {
      stars: 1,
    });
    expect(late.json().code).toBe('RATING_WINDOW_CLOSED');
    expect(
      (await call('GET', `/tasks/${id}`, clientToken))
        .json()
        .team.find((m: { name: string }) => m.name === 'fcollab').myRating.stars,
    ).toBe(5);
  });
});
