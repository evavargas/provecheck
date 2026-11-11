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

beforeAll(async () => {
  app = await buildApp(env);
  for (const n of ['A', 'B']) {
    const { rows } = await db.pool.query<{ id: string }>(
      'INSERT INTO organizations (name, default_objection_window_hours) VALUES ($1, 100) RETURNING id',
      [`Catalogs ${n} ${run}`],
    );
    orgs.push(rows[0]!.id);
  }
  adminToken = await activeUser(orgs[0]!, 'cadmin', 'admin');
  otherAdminToken = await activeUser(orgs[1]!, 'cother', 'admin');
  collabToken = await activeUser(orgs[0]!, 'ccollab', 'collaborator');
});

afterAll(async () => {
  await db.pool.query('DELETE FROM audit_log WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM user_identifiers WHERE user_id = ANY($1)', [authIds]);
  await db.pool.query('DELETE FROM users WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM client_companies WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM service_types WHERE organization_id = ANY($1)', [orgs]);
  for (const id of authIds) await supabase.admin.auth.admin.deleteUser(id);
  await db.pool.query('DELETE FROM organizations WHERE id = ANY($1)', [orgs]);
  await app.close();
});

describe('access', () => {
  it('is admin only', async () => {
    for (const url of ['/client-companies', '/client-companies/options', '/service-types']) {
      expect((await call('GET', url, collabToken)).statusCode).toBe(403);
    }
    expect((await call('POST', '/service-types', collabToken, { name: 'x' })).statusCode).toBe(403);
  });
});

describe('client companies', () => {
  it('creates, normalizes, lists with the organization default and audits', async () => {
    const res = await call('POST', '/client-companies', adminToken, {
      legalName: `  Acme ${run} `,
      email: 'Billing@Acme.test',
      address: '',
      contacts: [{ name: 'Ana', email: '' }],
      objectionWindowHours: null,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      legalName: `Acme ${run}`,
      email: 'billing@acme.test',
      address: null,
      objectionWindowHours: null,
      active: true,
      contacts: [{ name: 'Ana' }],
    });
    const list = (await call('GET', `/client-companies?q=acme%20${run}`, adminToken)).json();
    expect(list.items).toHaveLength(1);
    expect(list.defaultObjectionWindowHours).toBe(100);
    const { rowCount } = await db.pool.query(
      `SELECT 1 FROM audit_log WHERE entity = 'client_company' AND entity_id = $1 AND action = 'create'`,
      [res.json().id],
    );
    expect(rowCount).toBe(1);
  });

  it('rejects duplicates, bad windows and unknown fields', async () => {
    const dup = await call('POST', '/client-companies', adminToken, { legalName: `Acme ${run}` });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe('NAME_TAKEN');
    for (const objectionWindowHours of [0, 8761, 1.5]) {
      const bad = await call('POST', '/client-companies', adminToken, {
        legalName: `Bad ${run}`,
        objectionWindowHours,
      });
      expect(bad.statusCode).toBe(422);
    }
    const extra = await call('POST', '/client-companies', adminToken, {
      legalName: `Extra ${run}`,
      organizationId: orgs[1],
    });
    expect(extra.statusCode).toBe(422);
  });

  it('updates fields, clears the window and records before/after', async () => {
    const created = (
      await call('POST', '/client-companies', adminToken, {
        legalName: `Upd ${run}`,
        objectionWindowHours: 48,
      })
    ).json();
    const res = await call('PATCH', `/client-companies/${created.id}`, adminToken, {
      phone: '099111222',
      objectionWindowHours: null,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ phone: '099111222', objectionWindowHours: null });
    const { rows } = await db.pool.query(
      `SELECT before, after FROM audit_log WHERE entity_id = $1 AND action = 'update'`,
      [created.id],
    );
    expect(rows[0].before.objectionWindowHours).toBe(48);
    expect(rows[0].after.objectionWindowHours).toBeNull();
  });

  it('deactivates and reactivates, hiding inactive ones from the options', async () => {
    const created = (
      await call('POST', '/client-companies', adminToken, { legalName: `Off ${run}` })
    ).json();
    const off = await call('POST', `/client-companies/${created.id}/deactivate`, adminToken);
    expect(off.json().active).toBe(false);
    const options = (await call('GET', '/client-companies/options', adminToken)).json().items;
    expect(options.some((o: { id: string }) => o.id === created.id)).toBe(false);
    const filtered = (await call('GET', `/client-companies?active=false`, adminToken)).json();
    expect(filtered.items.some((c: { id: string }) => c.id === created.id)).toBe(true);
    const on = await call('POST', `/client-companies/${created.id}/reactivate`, adminToken);
    expect(on.json().active).toBe(true);
  });

  it('paginates by cursor', async () => {
    for (const n of [1, 2, 3]) {
      await call('POST', '/client-companies', adminToken, { legalName: `Page${n} ${run}` });
    }
    const first = (await call('GET', `/client-companies?q=page&limit=2`, adminToken)).json();
    expect(first.items).toHaveLength(2);
    const second = (
      await call('GET', `/client-companies?q=page&limit=2&cursor=${first.nextCursor}`, adminToken)
    ).json();
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });

  it('is isolated per organization', async () => {
    const created = (
      await call('POST', '/client-companies', adminToken, { legalName: `Iso ${run}` })
    ).json();
    const other = (await call('GET', '/client-companies?q=iso', otherAdminToken)).json();
    expect(other.items).toHaveLength(0);
    expect(
      (await call('PATCH', `/client-companies/${created.id}`, otherAdminToken, { phone: '123' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `/client-companies/${created.id}/deactivate`, otherAdminToken))
        .statusCode,
    ).toBe(404);
  });
});

describe('service types', () => {
  it('creates, renames, deactivates and rejects duplicates', async () => {
    const created = await call('POST', '/service-types', adminToken, { name: ` Pest ${run} ` });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: `Pest ${run}`, active: true });
    const id = created.json().id;

    expect(
      (await call('POST', '/service-types', adminToken, { name: `Pest ${run}` })).json().code,
    ).toBe('NAME_TAKEN');
    const renamed = await call('PATCH', `/service-types/${id}`, adminToken, {
      name: `Pest control ${run}`,
    });
    expect(renamed.json().name).toBe(`Pest control ${run}`);
    const off = await call('PATCH', `/service-types/${id}`, adminToken, { active: false });
    expect(off.json().active).toBe(false);

    const active = (await call('GET', '/service-types?active=true', adminToken)).json().items;
    expect(active.some((s: { id: string }) => s.id === id)).toBe(false);
    const all = (await call('GET', '/service-types', adminToken)).json().items;
    expect(all.some((s: { id: string }) => s.id === id)).toBe(true);
  });

  it('keeps types private to the organization', async () => {
    const created = (
      await call('POST', '/service-types', adminToken, { name: `Mine ${run}` })
    ).json();
    expect((await call('GET', '/service-types', otherAdminToken)).json().items).toHaveLength(0);
    expect(
      (await call('PATCH', `/service-types/${created.id}`, otherAdminToken, { active: false }))
        .statusCode,
    ).toBe(404);
    // The same name is free in another organization.
    expect(
      (await call('POST', '/service-types', otherAdminToken, { name: `Mine ${run}` })).statusCode,
    ).toBe(201);
  });
});
