import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
let collab2Token: string;
let collab2Id: string;
let clientUserId: string;
let clientToken: string;

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

async function userId(token: string) {
  return (await call('GET', '/me', token)).json().id as string;
}

beforeAll(async () => {
  app = await buildApp(env);
  for (const n of ['A', 'B']) {
    const { rows } = await db.pool.query<{ id: string }>(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
      [`Tasks ${n} ${run}`],
    );
    orgs.push(rows[0]!.id);
  }
  adminToken = await activeUser(orgs[0]!, 'tadmin', 'admin');
  otherAdminToken = await activeUser(orgs[1]!, 'tother', 'admin');
  collabToken = await activeUser(orgs[0]!, 'tcollab', 'collaborator');
  collabId = await userId(collabToken);
  collab2Token = await activeUser(orgs[0]!, 'tcollab2', 'collaborator');
  collab2Id = await userId(collab2Token);
  clientToken = await activeUser(orgs[0]!, 'tclient', 'client_user');
  clientUserId = await userId(clientToken);
});

afterAll(async () => {
  await db.pool.query('DELETE FROM task_assignments WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM jobs WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM task_report_drafts WHERE organization_id = ANY($1)', [orgs]);
  // Reports are immutable on purpose; test cleanup is the only place that removes them.
  await db.tx(async (c) => {
    await c.query('ALTER TABLE task_reports DISABLE TRIGGER USER');
    await c.query('DELETE FROM task_reports WHERE organization_id = ANY($1)', [orgs]);
    await c.query('ALTER TABLE task_reports ENABLE TRIGGER USER');
  });
  await db.pool.query('DELETE FROM tasks WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM audit_log WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM user_identifiers WHERE user_id = ANY($1)', [authIds]);
  await db.pool.query('DELETE FROM users WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM client_companies WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM service_types WHERE organization_id = ANY($1)', [orgs]);
  for (const id of authIds) await supabase.admin.auth.admin.deleteUser(id);
  await db.pool.query('DELETE FROM organizations WHERE id = ANY($1)', [orgs]);
  await app.close();
});

const START = '2027-03-01T13:00:00.000Z';
const newTask = (over: Record<string, unknown> = {}) => ({
  clientUserId,
  address: 'Calle 1',
  scheduledStartAt: START,
  description: 'Clean the office',
  assignments: [{ collaboratorId: collabId, feeUyu: 500 }],
  ...over,
});
const create = async (over: Record<string, unknown> = {}) =>
  (await call('POST', '/tasks', adminToken, newTask(over))).json();

describe('access', () => {
  it('is admin only', async () => {
    expect((await call('GET', '/tasks', clientToken)).statusCode).toBe(403);
    expect((await call('POST', '/tasks', collabToken, newTask())).statusCode).toBe(403);
    expect((await call('PATCH', `/tasks/${randomUUID()}`, collabToken, {})).statusCode).toBe(403);
  });
});

describe('create', () => {
  it('creates a scheduled task with assignments, costs and an audit row', async () => {
    const res = await call(
      'POST',
      '/tasks',
      adminToken,
      newTask({ costUyu: 1200.5, recipientName: ' ' }),
    );
    expect(res.statusCode).toBe(201);
    const task = res.json();
    expect(task).toMatchObject({
      status: 'scheduled',
      clientUserId,
      costUyu: 1200.5,
      recipientName: null,
      scheduledStartAt: START,
    });
    expect(task.assignments).toMatchObject([
      { collaboratorId: collabId, feeUyu: 500, active: true },
    ]);
    const { rowCount } = await db.pool.query(
      `SELECT 1 FROM audit_log WHERE entity = 'task' AND entity_id = $1 AND action = 'create'`,
      [task.id],
    );
    expect(rowCount).toBe(1);
  });

  it('pre-fills the address from the company', async () => {
    const company = (
      await call('POST', '/client-companies', adminToken, {
        legalName: `Co ${run}`,
        address: 'Av. 18 de Julio',
      })
    ).json();
    const task = await create({
      clientCompanyId: company.id,
      clientUserId: undefined,
      address: undefined,
    });
    expect(task.address).toBe('Av. 18 de Julio');
    expect(task.clientCompanyName).toBe(`Co ${run}`);
  });

  it('enforces RN-2 and RN-27 and checks references', async () => {
    const noRecipient = await call(
      'POST',
      '/tasks',
      adminToken,
      newTask({ clientUserId: undefined }),
    );
    expect(noRecipient.statusCode).toBe(422);
    const empty = await call('POST', '/tasks', adminToken, newTask({ assignments: [] }));
    expect(empty.json().code).toBe('EMPTY_ASSIGNMENT');
    const notCollab = await call(
      'POST',
      '/tasks',
      adminToken,
      newTask({ assignments: [{ collaboratorId: clientUserId }] }),
    );
    expect(notCollab.statusCode).toBe(422);
    const dup = await call(
      'POST',
      '/tasks',
      adminToken,
      newTask({ assignments: [{ collaboratorId: collabId }, { collaboratorId: collabId }] }),
    );
    expect(dup.statusCode).toBe(422);
    const negative = await call('POST', '/tasks', adminToken, newTask({ costUyu: -1 }));
    expect(negative.statusCode).toBe(422);
    const noAddress = await call('POST', '/tasks', adminToken, newTask({ address: undefined }));
    expect(noAddress.statusCode).toBe(422);
    const foreign = await call('POST', '/tasks', otherAdminToken, newTask());
    expect(foreign.statusCode).toBe(422);
  });
});

describe('list and get', () => {
  it('filters, paginates and isolates organizations', async () => {
    const a = await create({
      description: `needle ${run}`,
      scheduledStartAt: '2027-04-01T10:00:00.000Z',
    });
    await create({
      description: `needle ${run}`,
      scheduledStartAt: '2027-04-02T10:00:00.000Z',
      assignments: [{ collaboratorId: collab2Id }],
    });
    const q = `q=needle%20${run}`;
    expect((await call('GET', `/tasks?${q}`, adminToken)).json().items).toHaveLength(2);
    const byCollab = (
      await call('GET', `/tasks?${q}&collaboratorId=${collab2Id}`, adminToken)
    ).json();
    expect(byCollab.items).toHaveLength(1);
    const range = (
      await call('GET', `/tasks?${q}&from=2027-04-02T00:00:00.000Z`, adminToken)
    ).json();
    expect(range.items).toHaveLength(1);
    const first = (await call('GET', `/tasks?${q}&limit=1`, adminToken)).json();
    expect(first.items[0].scheduledStartAt).toBe('2027-04-02T10:00:00.000Z');
    const second = (
      await call('GET', `/tasks?${q}&limit=1&cursor=${first.nextCursor}`, adminToken)
    ).json();
    expect(second.items[0].id).toBe(a.id);
    expect(second.nextCursor).toBeNull();
    expect(
      (await call('GET', `/tasks?${q}&status=cancelled,completed`, adminToken)).json().items,
    ).toHaveLength(0);
    expect((await call('GET', `/tasks?${q}`, otherAdminToken)).json().items).toHaveLength(0);
    expect((await call('GET', `/tasks/${a.id}`, otherAdminToken)).statusCode).toBe(404);
  });
});

describe('update and cancel', () => {
  it('edits a scheduled task and audits before/after', async () => {
    const t = await create();
    const res = await call('PATCH', `/tasks/${t.id}`, adminToken, {
      description: 'New text',
      costUyu: 99,
    });
    expect(res.json()).toMatchObject({ description: 'New text', costUyu: 99 });
    const { rows } = await db.pool.query(
      `SELECT before, after FROM audit_log WHERE entity_id = $1 AND action = 'update'`,
      [t.id],
    );
    expect(rows[0].before.description).toBe('Clean the office');
    expect(rows[0].after.description).toBe('New text');
    const noRecipient = await call('PATCH', `/tasks/${t.id}`, adminToken, { clientUserId: null });
    expect(noRecipient.statusCode).toBe(422);
  });

  it('locks recipient and schedule once on site, and everything but cost after', async () => {
    const t = await create();
    await db.pool.query(`UPDATE tasks SET status = 'on_site' WHERE id = $1`, [t.id]);
    expect(
      (await call('PATCH', `/tasks/${t.id}`, adminToken, { scheduledStartAt: START })).json().code,
    ).toBe('INVALID_STATE_TRANSITION');
    expect(
      (await call('PATCH', `/tasks/${t.id}`, adminToken, { description: 'Still ok' })).statusCode,
    ).toBe(200);
    await db.pool.query(`UPDATE tasks SET status = 'completed' WHERE id = $1`, [t.id]);
    expect(
      (await call('PATCH', `/tasks/${t.id}`, adminToken, { description: 'x' })).statusCode,
    ).toBe(409);
    expect((await call('PATCH', `/tasks/${t.id}`, adminToken, { costUyu: 10 })).statusCode).toBe(
      200,
    );
  });

  it('cancels only scheduled tasks and needs a reason', async () => {
    const t = await create();
    expect((await call('POST', `/tasks/${t.id}/cancel`, adminToken, {})).statusCode).toBe(422);
    const res = await call('POST', `/tasks/${t.id}/cancel`, adminToken, { reason: 'Client asked' });
    expect(res.json()).toMatchObject({ status: 'cancelled', cancellationReason: 'Client asked' });
    expect(
      (await call('POST', `/tasks/${t.id}/cancel`, adminToken, { reason: 'again' })).statusCode,
    ).toBe(409);
    expect((await call('PATCH', `/tasks/${t.id}`, adminToken, { costUyu: 1 })).statusCode).toBe(
      409,
    );
    const onSite = await create();
    await db.pool.query(`UPDATE tasks SET status = 'on_site' WHERE id = $1`, [onSite.id]);
    expect(
      (await call('POST', `/tasks/${onSite.id}/cancel`, adminToken, { reason: 'late' })).statusCode,
    ).toBe(409);
  });
});

describe('assignments', () => {
  it('adds a collaborator and rejects one who is already active', async () => {
    const t = await create();
    const res = await call('POST', `/tasks/${t.id}/assignments`, adminToken, {
      collaboratorId: collab2Id,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().assignments.filter((a: { active: boolean }) => a.active)).toHaveLength(2);
    const dup = await call('POST', `/tasks/${t.id}/assignments`, adminToken, {
      collaboratorId: collab2Id,
    });
    expect(dup.statusCode).toBe(422);
  });

  it('replaces an assignment keeping the history, never leaving the task empty', async () => {
    const t = await create();
    const old = t.assignments[0];
    const res = await call('POST', `/tasks/${t.id}/assignments/${old.id}/replace`, adminToken, {
      collaboratorId: collab2Id,
      feeUyu: 700,
    });
    expect(res.statusCode).toBe(200);
    const list = res.json().assignments;
    expect(list).toHaveLength(2);
    expect(list.find((a: { id: string }) => a.id === old.id).active).toBe(false);
    expect(list.filter((a: { active: boolean }) => a.active)).toMatchObject([
      { collaboratorId: collab2Id, feeUyu: 700 },
    ]);
    const { rows } = await db.pool.query('SELECT replaced_by FROM task_assignments WHERE id = $1', [
      old.id,
    ]);
    expect(rows[0].replaced_by).not.toBeNull();
    // The replaced row is no longer active, so it cannot be replaced again.
    expect(
      (
        await call('POST', `/tasks/${t.id}/assignments/${old.id}/replace`, adminToken, {
          collaboratorId: collabId,
        })
      ).statusCode,
    ).toBe(404);
    // A failing replacement rolls back: the original stays active.
    const t2 = await create({
      assignments: [{ collaboratorId: collabId }, { collaboratorId: collab2Id }],
    });
    const first = t2.assignments.find(
      (a: { collaboratorId: string }) => a.collaboratorId === collabId,
    );
    const clash = await call(
      'POST',
      `/tasks/${t2.id}/assignments/${first.id}/replace`,
      adminToken,
      { collaboratorId: collab2Id },
    );
    expect(clash.statusCode).toBe(422);
    const after = (await call('GET', `/tasks/${t2.id}`, adminToken)).json();
    expect(after.assignments.filter((a: { active: boolean }) => a.active)).toHaveLength(2);
  });

  it('does not change a cancelled task', async () => {
    const t = await create();
    await call('POST', `/tasks/${t.id}/cancel`, adminToken, { reason: 'x' });
    expect(
      (await call('POST', `/tasks/${t.id}/assignments`, adminToken, { collaboratorId: collab2Id }))
        .statusCode,
    ).toBe(409);
  });
});

const NOW = () => new Date().toISOString();
const content = {
  blocks: [{ type: 'paragraph', content: [{ text: 'All <done>' }, { text: 'ok', bold: true }] }],
};
const finalizeBody = (over: Record<string, unknown> = {}) => ({
  reportId: randomUUID(),
  contentJson: content,
  deviceCompletedAt: NOW(),
  deviceSentAt: NOW(),
  ...over,
});
const arrive = (id: string, token = collabToken, delayed = false) =>
  call('POST', `/tasks/${id}/arrival`, token, {
    deviceArrivedAt: NOW(),
    attendanceDelayed: delayed,
  });

describe('collaborator view', () => {
  it('sees only their open tasks, with no cost or fee anywhere (RN-13)', async () => {
    const mine = await create({
      costUyu: 4321,
      description: `mine ${run}`,
      assignments: [
        { collaboratorId: collabId, feeUyu: 777 },
        { collaboratorId: collab2Id, feeUyu: 888 },
      ],
    });
    const theirs = await create({
      description: `theirs ${run}`,
      assignments: [{ collaboratorId: collab2Id }],
    });
    const res = await call('GET', '/tasks', collabToken);
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((t: { id: string }) => t.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
    const detail = await call('GET', `/tasks/${mine.id}`, collabToken);
    const raw = res.body + detail.body;
    expect(raw).not.toMatch(/cost|fee/i);
    expect(raw).not.toMatch(/:(4321|777|888)[,}\]]/);
    expect(detail.json().team.map((m: { name: string }) => m.name)).toHaveLength(2);
    expect((await call('GET', `/tasks/${theirs.id}`, collabToken)).statusCode).toBe(404);
  });
});

describe('arrival', () => {
  it('moves the task on site, is idempotent per collaborator and records the delay', async () => {
    const t = await create({
      assignments: [{ collaboratorId: collabId }, { collaboratorId: collab2Id }],
    });
    const first = await arrive(t.id, collabToken, true);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ status: 'on_site', myAttendanceDelayed: true });
    const arrivedAt = first.json().myArrivedAt;
    const again = await arrive(t.id, collabToken, false);
    expect(again.json().myArrivedAt).toBe(arrivedAt);
    expect(again.json().myAttendanceDelayed).toBe(true);
    // The second collaborator records their own, without changing the first.
    const second = await arrive(t.id, collab2Token);
    expect(second.json().myArrivedAt).not.toBeNull();
    expect(
      (await call('GET', `/tasks/${t.id}`, adminToken))
        .json()
        .assignments.filter((a: { arrivedAt: string | null }) => a.arrivedAt),
    ).toHaveLength(2);
  });

  it('rejects other people, cancelled tasks and replaced collaborators', async () => {
    const t = await create();
    expect((await arrive(t.id, collab2Token)).statusCode).toBe(404);
    expect((await arrive(t.id, adminToken)).statusCode).toBe(403);
    const replaced = t.assignments[0];
    await call('POST', `/tasks/${t.id}/assignments/${replaced.id}/replace`, adminToken, {
      collaboratorId: collab2Id,
    });
    // Once replaced, a finished-or-not task is no longer theirs to start.
    expect((await arrive(t.id, collabToken)).statusCode).toBeGreaterThanOrEqual(404);
    const c = await create();
    await call('POST', `/tasks/${c.id}/cancel`, adminToken, { reason: 'x' });
    expect((await arrive(c.id)).statusCode).toBe(409);
  });
});

describe('finalize', () => {
  it('needs the caller to have arrived, then creates one immutable record and the objection deadline', async () => {
    const t = await create();
    expect(
      (await call('POST', `/tasks/${t.id}/finalize`, collabToken, finalizeBody())).statusCode,
    ).toBe(409);
    await arrive(t.id);
    const body = finalizeBody();
    const res = await call('POST', `/tasks/${t.id}/finalize`, collabToken, body);
    expect(res.statusCode).toBe(200);
    expect(res.json().report.html).toBe('<p>All &lt;done&gt;<strong>ok</strong></p>');

    const done = (await call('GET', `/tasks/${t.id}`, adminToken)).json();
    expect(done.status).toBe('completed');
    const hours =
      (new Date(done.objectionDeadlineAt).getTime() - new Date(done.completedAt).getTime()) /
      3_600_000;
    expect(Math.round(hours)).toBe(336);

    // Same reportId: idempotent. Another one: ALREADY_FINALIZED with the existing record.
    expect((await call('POST', `/tasks/${t.id}/finalize`, collabToken, body)).statusCode).toBe(200);
    const late = await call('POST', `/tasks/${t.id}/finalize`, collabToken, finalizeBody());
    expect(late.statusCode).toBe(409);
    expect(late.json()).toMatchObject({
      code: 'ALREADY_FINALIZED',
      details: { report: { id: body.reportId } },
    });
    const { rowCount } = await db.pool.query(
      `SELECT 1 FROM audit_log WHERE entity_id = $1 AND action = 'finalize'`,
      [t.id],
    );
    expect(rowCount).toBe(1);
  });

  it('uses the company window and corrects the device clock drift (RN-6)', async () => {
    const company = (
      await call('POST', '/client-companies', adminToken, {
        legalName: `Win ${run}`,
        address: 'A',
        objectionWindowHours: 48,
      })
    ).json();
    const t = await create({ clientCompanyId: company.id, clientUserId: undefined });
    await arrive(t.id);
    const finished = new Date(Date.now() - 3 * 3_600_000).toISOString();
    await call(
      'POST',
      `/tasks/${t.id}/finalize`,
      collabToken,
      finalizeBody({ deviceCompletedAt: finished, deviceSentAt: NOW() }),
    );
    const done = (await call('GET', `/tasks/${t.id}`, adminToken)).json();
    // Finished three hours before it synced, so the completion is about three hours back.
    const ageH = (Date.now() - new Date(done.completedAt).getTime()) / 3_600_000;
    expect(ageH).toBeGreaterThan(2.9);
    expect(ageH).toBeLessThan(3.1);
    const window =
      (new Date(done.objectionDeadlineAt).getTime() - new Date(done.completedAt).getTime()) /
      3_600_000;
    expect(Math.round(window)).toBe(48);
  });

  it('lets only one of two collaborators finish, and refuses empty records', async () => {
    const t = await create({
      assignments: [{ collaboratorId: collabId }, { collaboratorId: collab2Id }],
    });
    await arrive(t.id);
    await arrive(t.id, collab2Token);
    const empty = await call(
      'POST',
      `/tasks/${t.id}/finalize`,
      collabToken,
      finalizeBody({ contentJson: { blocks: [] } }),
    );
    expect(empty.statusCode).toBe(422);
    const markup = await call(
      'POST',
      `/tasks/${t.id}/finalize`,
      collabToken,
      finalizeBody({ contentJson: { blocks: [{ type: 'html', content: '<b>x</b>' }] } }),
    );
    expect(markup.statusCode).toBe(422);
    const [a, b] = await Promise.all([
      call('POST', `/tasks/${t.id}/finalize`, collabToken, finalizeBody()),
      call('POST', `/tasks/${t.id}/finalize`, collab2Token, finalizeBody()),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const { rows } = await db.pool.query(
      'SELECT count(*)::int AS n FROM task_reports WHERE task_id = $1',
      [t.id],
    );
    expect(rows[0].n).toBe(1);
  });

  it('saves and returns the draft', async () => {
    const t = await create();
    expect((await call('GET', `/tasks/${t.id}/draft`, collabToken)).json().contentJson).toBeNull();
    const put = await call('PUT', `/tasks/${t.id}/draft`, collabToken, { contentJson: content });
    expect(put.statusCode).toBe(204);
    expect((await call('GET', `/tasks/${t.id}/draft`, collabToken)).json().contentJson).toEqual(
      content,
    );
    expect((await call('GET', `/tasks/${t.id}/draft`, collab2Token)).statusCode).toBe(404);
  });
});
