import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../../app.js';
import { loadEnv } from '../../lib/env.js';
import { createDb } from '../../plugins/db.js';
import { createSupabase } from '../../plugins/supabase.js';
import { createUser } from './create-user.js';

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
let orgId: string;
let otherOrgId: string;
let adminToken: string;
let adminId: string;
const authIds: string[] = [];

const call = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
const login = (identifier: string, password: string) =>
  app.inject({ method: 'POST', url: '/auth/login', payload: { identifier, password } });

const body = (suffix: string, role: 'admin' | 'collaborator' | 'client_user' = 'collaborator') => ({
  name: `Person ${suffix}`,
  username: `p${suffix}${run}`,
  email: `p${suffix}.${run}@example.test`,
  phone: '099000000',
  role,
  temporaryPassword: TEMP,
});

/** Creates a user directly and finishes their first login, like a long-standing account. */
async function activeUser(
  suffix: string,
  role: 'admin' | 'collaborator' | 'client_user' = 'collaborator',
) {
  const b = body(suffix, role);
  const id = await createUser(
    { db, supabase },
    { organizationId: orgId, ...b, temporaryPassword: TEMP },
  );
  authIds.push(id);
  const token = (await login(b.username, TEMP)).json().session.accessToken;
  await app.inject({
    method: 'POST',
    url: '/auth/first-login',
    headers: { authorization: `Bearer ${token}` },
    payload: { email: b.email, newPassword: NEW },
  });
  const session = (await login(b.username, NEW)).json().session;
  return { id, ...b, token: session.accessToken as string };
}

beforeAll(async () => {
  app = await buildApp(env);
  const org = (n: string) =>
    db.pool.query<{ id: string }>('INSERT INTO organizations (name) VALUES ($1) RETURNING id', [n]);
  orgId = (await org(`Users ${run}`)).rows[0]!.id;
  otherOrgId = (await org(`Other ${run}`)).rows[0]!.id;
  const admin = await activeUser('admin', 'admin');
  adminId = admin.id;
  adminToken = admin.token;
});

afterAll(async () => {
  const orgs = [orgId, otherOrgId];
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

describe('access', () => {
  it('is admin only', async () => {
    const collab = await activeUser('c-acc');
    for (const [m, url] of [
      ['GET', '/users'],
      ['GET', '/users/availability?identifier=abc'],
      ['GET', '/client-companies'],
    ] as const) {
      expect((await call(m, url, collab.token)).statusCode).toBe(403);
    }
    expect((await call('POST', '/users', collab.token, body('x1'))).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/users' })).statusCode).toBe(401);
  });
});

describe('create', () => {
  it('creates a pending user who can do the first login, and audits it', async () => {
    const b = body('new1');
    const res = await call('POST', '/users', adminToken, b);
    expect(res.statusCode).toBe(201);
    const user = res.json();
    authIds.push(user.id);
    expect(user).toMatchObject({
      username: b.username,
      email: b.email,
      role: 'collaborator',
      status: 'pending_first_login',
    });
    expect(JSON.stringify(user)).not.toContain(TEMP);

    const login1 = await login(b.username, TEMP);
    expect(login1.statusCode).toBe(200);
    expect(login1.json().mustChangePassword).toBe(true);
    const audited = await db.pool.query(
      `SELECT actor_id FROM audit_log WHERE entity_id = $1 AND action = 'create'`,
      [user.id],
    );
    expect(audited.rows[0].actor_id).toBe(adminId);
  });

  it('rejects taken usernames and emails, case-insensitively and across kinds', async () => {
    const first = (await call('POST', '/users', adminToken, body('dup'))).json();
    authIds.push(first.id);
    const sameUsername = await call('POST', '/users', adminToken, {
      ...body('dup2'),
      username: first.username.toUpperCase(),
    });
    expect(sameUsername.statusCode).toBe(409);
    expect(sameUsername.json()).toMatchObject({
      code: 'IDENTIFIER_TAKEN',
      details: { field: 'username' },
    });
    const sameEmail = await call('POST', '/users', adminToken, {
      ...body('dup3'),
      email: first.email.toUpperCase(),
    });
    expect(sameEmail.json()).toMatchObject({
      code: 'IDENTIFIER_TAKEN',
      details: { field: 'email' },
    });
  });

  it('validates the payload', async () => {
    const bad = [
      { ...body('v1'), username: 'Has Space' },
      { ...body('v2'), username: 'a@b' },
      { ...body('v3'), temporaryPassword: 'short' },
      { ...body('v4'), role: 'superuser' },
      { ...body('v5'), clientCompanyId: randomUUID() },
      { ...body('v6'), extra: 1 },
    ];
    for (const b of bad) expect((await call('POST', '/users', adminToken, b)).statusCode).toBe(422);
  });

  it('links a client user to an existing company only', async () => {
    const company = await db.pool.query<{ id: string }>(
      `INSERT INTO client_companies (organization_id, legal_name) VALUES ($1, $2) RETURNING id`,
      [orgId, `Company ${run}`],
    );
    const companyId = company.rows[0]!.id;
    const ok = await call('POST', '/users', adminToken, {
      ...body('cl1', 'client_user'),
      clientCompanyId: companyId,
    });
    expect(ok.statusCode).toBe(201);
    authIds.push(ok.json().id);
    expect(ok.json()).toMatchObject({
      clientCompanyId: companyId,
      clientCompanyName: `Company ${run}`,
    });
    const missing = await call('POST', '/users', adminToken, {
      ...body('cl2', 'client_user'),
      clientCompanyId: randomUUID(),
    });
    expect(missing.statusCode).toBe(422);

    const options = (await call('GET', '/client-companies', adminToken)).json();
    expect(options.items).toContainEqual({ id: companyId, name: `Company ${run}` });

    const unlink = await call('PATCH', `/users/${ok.json().id}/client-company`, adminToken, {
      clientCompanyId: null,
    });
    expect(unlink.json().clientCompanyId).toBeNull();
    const collab = await activeUser('cc-collab');
    expect(
      (
        await call('PATCH', `/users/${collab.id}/client-company`, adminToken, {
          clientCompanyId: companyId,
        })
      ).statusCode,
    ).toBe(422);
  });
});

describe('availability', () => {
  it('reports which identifier is taken', async () => {
    const u = await activeUser('av');
    const get = async (identifier: string, except?: string) =>
      (
        await call(
          'GET',
          `/users/availability?identifier=${encodeURIComponent(identifier)}${except ? `&exceptUserId=${except}` : ''}`,
          adminToken,
        )
      ).json();
    expect(await get(u.username.toUpperCase())).toEqual({ available: false, kind: 'username' });
    expect(await get(u.email)).toEqual({ available: false, kind: 'email' });
    expect(await get(`free${run}`)).toEqual({ available: true, kind: null });
    expect(await get(u.username, u.id)).toEqual({ available: true, kind: null });
  });
});

describe('list', () => {
  it('filters, searches and paginates with a cursor', async () => {
    const tag = `list${run}`;
    for (let i = 0; i < 5; i++) {
      const b = {
        ...body(`l${i}`),
        name: `${tag} Person ${i}`,
        role: i < 3 ? 'collaborator' : 'client_user',
      } as const;
      const res = await call('POST', '/users', adminToken, b);
      authIds.push(res.json().id);
    }
    const page1 = (await call('GET', `/users?q=${tag}&limit=2`, adminToken)).json();
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = (
      await call('GET', `/users?q=${tag}&limit=2&cursor=${page1.nextCursor}`, adminToken)
    ).json();
    const page3 = (
      await call('GET', `/users?q=${tag}&limit=2&cursor=${page2.nextCursor}`, adminToken)
    ).json();
    const ids = [...page1.items, ...page2.items, ...page3.items].map((u: { id: string }) => u.id);
    expect(new Set(ids).size).toBe(5);
    expect(page3.nextCursor).toBeNull();

    const clients = (await call('GET', `/users?q=${tag}&role=client_user`, adminToken)).json();
    expect(clients.items).toHaveLength(2);
    expect(
      (await call('GET', `/users?q=${tag}&status=active`, adminToken)).json().items,
    ).toHaveLength(0);
    // LIKE wildcards in the search are literal
    expect((await call('GET', '/users?q=%25', adminToken)).json().items).toHaveLength(0);
    expect((await call('GET', '/users?cursor=garbage', adminToken)).statusCode).toBe(422);
  });

  it('never shows users from another organization', async () => {
    const stranger = randomUUID();
    await supabase.admin.auth.admin
      .createUser({
        id: stranger,
        email: `stranger.${run}@example.test`,
        password: TEMP,
        email_confirm: true,
      } as never)
      .then((r) => {
        if (r.data.user) authIds.push(r.data.user.id);
        return r;
      });
    const strangerId = authIds.at(-1)!;
    await db.pool.query(
      `INSERT INTO users (id, organization_id, role, name, username, email, phone) VALUES ($1,$2,'collaborator','Stranger',$3,$4,'1')`,
      [strangerId, otherOrgId, `stranger${run}`, `stranger.${run}@example.test`],
    );
    await db.pool.query(`INSERT INTO user_identifiers VALUES ($1,$2,'username'), ($3,$2,'email')`, [
      `stranger${run}`,
      strangerId,
      `stranger.${run}@example.test`,
    ]);
    expect((await call('GET', `/users?q=stranger${run}`, adminToken)).json().items).toHaveLength(0);
    expect((await call('GET', `/users/${strangerId}`, adminToken)).statusCode).toBe(404);
    expect(
      (await call('PATCH', `/users/${strangerId}`, adminToken, { name: 'Hacked' })).statusCode,
    ).toBe(404);
  });
});

describe('update', () => {
  it('changes profile data and moves the identifiers', async () => {
    const u = await activeUser('upd');
    const res = await call('PATCH', `/users/${u.id}`, adminToken, {
      name: 'Renamed',
      username: `renamed${run}`,
      email: `renamed.${run}@example.test`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Renamed', username: `renamed${run}` });
    expect((await login(`renamed${run}`, NEW)).statusCode).toBe(200);
    expect((await login(`renamed.${run}@example.test`, NEW)).statusCode).toBe(200);
    expect((await login(u.username, NEW)).statusCode).toBe(401);
    // the old username is free again
    expect(
      (await call('GET', `/users/availability?identifier=${u.username}`, adminToken)).json()
        .available,
    ).toBe(true);
  });

  it('refuses identifiers owned by someone else and leaves the user untouched', async () => {
    const a = await activeUser('upd-a');
    const b = await activeUser('upd-b');
    const res = await call('PATCH', `/users/${a.id}`, adminToken, {
      name: 'Partial',
      email: b.email,
    });
    expect(res.statusCode).toBe(409);
    expect((await call('GET', `/users/${a.id}`, adminToken)).json().name).toBe(`Person upd-a`);
  });
});

describe('deactivate and reactivate', () => {
  it('blocks login and live sessions, and can be undone', async () => {
    const u = await activeUser('deact');
    const res = await call('POST', `/users/${u.id}/deactivate`, adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('inactive');
    expect((await login(u.username, NEW)).json().code).toBe('ACCOUNT_INACTIVE');
    expect((await call('GET', '/me', u.token)).statusCode).toBeGreaterThanOrEqual(401);
    expect((await call('POST', `/users/${u.id}/deactivate`, adminToken)).statusCode).toBe(409);

    const back = await call('POST', `/users/${u.id}/reactivate`, adminToken);
    expect(back.json().status).toBe('active');
    expect((await login(u.username, NEW)).statusCode).toBe(200);
  });

  it('refuses to deactivate yourself', async () => {
    expect((await call('POST', `/users/${adminId}/deactivate`, adminToken)).statusCode).toBe(403);
  });

  it('lists pending tasks instead of deactivating a collaborator who still has work (RN-14)', async () => {
    const u = await activeUser('busy');
    const taskId = randomUUID();
    await db.pool.query(
      `INSERT INTO client_companies (organization_id, legal_name) VALUES ($1, $2)`,
      [orgId, `Busy ${run}`],
    );
    const company = (
      await db.pool.query(`SELECT id FROM client_companies WHERE legal_name = $1`, [`Busy ${run}`])
    ).rows[0].id;
    await db.pool.query(
      `INSERT INTO tasks (id, organization_id, client_company_id, address, scheduled_start_at, description, created_by)
       VALUES ($1,$2,$3,'Street 123', now() + interval '1 day', 'work', $4)`,
      [taskId, orgId, company, adminId],
    );
    await db.pool.query(
      `INSERT INTO task_assignments (organization_id, task_id, collaborator_id) VALUES ($1,$2,$3)`,
      [orgId, taskId, u.id],
    );

    const res = await call('POST', `/users/${u.id}/deactivate`, adminToken);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      code: 'HAS_PENDING_TASKS',
      details: { tasks: [{ id: taskId, address: 'Street 123' }] },
    });
    expect((await call('GET', `/users/${u.id}`, adminToken)).json().status).toBe('active');

    await db.pool.query(`UPDATE tasks SET status = 'completed' WHERE id = $1`, [taskId]);
    expect((await call('POST', `/users/${u.id}/deactivate`, adminToken)).statusCode).toBe(200);
  });
});

describe('reset password', () => {
  it('ends sessions, invalidates the old password and forces a new first login', async () => {
    const u = await activeUser('reset');
    const res = await call('POST', `/users/${u.id}/reset-password`, adminToken, {
      temporaryPassword: 'Another-temp-12',
    });
    expect(res.statusCode).toBe(204);
    expect((await login(u.username, NEW)).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: 'x' } }))
        .statusCode,
    ).toBe(401);

    const again = await login(u.username, 'Another-temp-12');
    expect(again.statusCode).toBe(200);
    expect(again.json().mustChangePassword).toBe(true);
    expect((await call('GET', `/users/${u.id}`, adminToken)).json().status).toBe(
      'pending_first_login',
    );
    expect(
      (
        await call('POST', `/users/${u.id}/reset-password`, adminToken, {
          temporaryPassword: 'short',
        })
      ).statusCode,
    ).toBe(422);
  });
});
