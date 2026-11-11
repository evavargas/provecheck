import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../../app.js';
import { loadEnv } from '../../lib/env.js';
import { createDb } from '../../plugins/db.js';
import { createSupabase } from '../../plugins/supabase.js';
import { createStorage } from '../../lib/storage.js';
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
const storage = createStorage(supabase, env.STORAGE_BUCKET);
let app: App;
const orgs: string[] = [];
const authIds: string[] = [];
let adminToken: string;
let otherAdminToken: string;
let collabToken: string;

const call = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

beforeAll(async () => {
  app = await buildApp(env);
  for (const n of ['A', 'B']) {
    const { rows } = await db.pool.query<{ id: string }>(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
      [`Org ${n} ${run}`],
    );
    orgs.push(rows[0]!.id);
  }
  adminToken = await activeUser(orgs[0]!, 'oadmin', 'admin');
  otherAdminToken = await activeUser(orgs[1]!, 'oother', 'admin');
  collabToken = await activeUser(orgs[0]!, 'ocollab', 'collaborator');
});

afterAll(async () => {
  await storage.remove(orgs.flatMap((o) => [`org/${o}/logo/logo.png`, `org/${o}/logo/logo.jpg`]));
  await db.pool.query('DELETE FROM audit_log WHERE organization_id = ANY($1)', [orgs]);
  await db.pool.query('DELETE FROM user_identifiers WHERE user_id = ANY($1)', [authIds]);
  await db.pool.query('DELETE FROM users WHERE organization_id = ANY($1)', [orgs]);
  for (const id of authIds) await supabase.admin.auth.admin.deleteUser(id);
  await db.pool.query('DELETE FROM organizations WHERE id = ANY($1)', [orgs]);
  await app.close();
});

describe('organization', () => {
  it('is admin only and shows the mail status without secrets', async () => {
    expect((await call('GET', '/organization', collabToken)).statusCode).toBe(403);
    expect((await call('PATCH', '/organization', collabToken, { name: 'x' })).statusCode).toBe(403);
    const res = await call('GET', '/organization', adminToken);
    expect(res.json()).toMatchObject({
      name: `Org A ${run}`,
      timezone: 'America/Montevideo',
      defaultObjectionWindowHours: 336,
      logoUrl: null,
    });
    expect(res.body).not.toContain(env.SMTP_PASSWORD || 'no-password-set');
    expect(typeof res.json().mail.configured).toBe('boolean');
  });

  it('updates settings with validation and audits before/after', async () => {
    const res = await call('PATCH', '/organization', adminToken, {
      name: `Renamed ${run}`,
      timezone: 'America/Sao_Paulo',
      defaultLocale: 'en',
      defaultObjectionWindowHours: 100,
    });
    expect(res.json()).toMatchObject({
      name: `Renamed ${run}`,
      timezone: 'America/Sao_Paulo',
      defaultLocale: 'en',
      defaultObjectionWindowHours: 100,
    });
    for (const bad of [
      { defaultObjectionWindowHours: 0 },
      { defaultObjectionWindowHours: 9000 },
      { timezone: 'Mars/Base' },
      { defaultLocale: 'fr' },
      { name: ' ' },
      { id: 'x' },
    ]) {
      expect((await call('PATCH', '/organization', adminToken, bad)).statusCode).toBe(422);
    }
    // The other organization is untouched.
    expect((await call('GET', '/organization', otherAdminToken)).json().name).toBe(`Org B ${run}`);
    const { rows } = await db.pool.query(
      `SELECT before, after FROM audit_log WHERE entity = 'organization' AND organization_id = $1 AND action = 'update'`,
      [orgs[0]],
    );
    expect(rows[0].before.name).toBe(`Org A ${run}`);
    expect(rows[0].after.defaultObjectionWindowHours).toBe(100);
  });

  it('uploads, shows and removes the logo', async () => {
    expect(
      (
        await call('POST', '/organization/logo/presign', adminToken, {
          contentType: 'image/gif',
          bytes: 10,
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await call('POST', '/organization/logo/presign', adminToken, {
          contentType: 'image/png',
          bytes: 2 * 1024 * 1024,
        })
      ).statusCode,
    ).toBe(422);
    // Confirming before uploading fails.
    expect(
      (await call('POST', '/organization/logo/confirm', adminToken, { contentType: 'image/png' }))
        .statusCode,
    ).toBe(422);
    const { uploadUrl } = (
      await call('POST', '/organization/logo/presign', adminToken, {
        contentType: 'image/png',
        bytes: PNG.length,
      })
    ).json();
    expect(
      (
        await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'content-type': 'image/png' },
          body: PNG,
        })
      ).ok,
    ).toBe(true);
    const confirmed = await call('POST', '/organization/logo/confirm', adminToken, {
      contentType: 'image/png',
    });
    expect(confirmed.json().logoUrl).toContain('token=');
    expect((await fetch(confirmed.json().logoUrl)).ok).toBe(true);
    expect((await call('GET', '/organization', otherAdminToken)).json().logoUrl).toBeNull();
    const removed = await call('DELETE', '/organization/logo', adminToken);
    expect(removed.json().logoUrl).toBeNull();
    expect(await storage.exists(`org/${orgs[0]}/logo/logo.png`)).toBe(false);
  });
});

describe('audit', () => {
  it('lists newest first with filters and paging, only for the own organization', async () => {
    const all = (await call('GET', '/audit?limit=2', adminToken)).json();
    expect(all.items).toHaveLength(2);
    expect(all.items[0].id).toBeGreaterThan(all.items[1].id);
    expect(all.items[0].actorName).toBe('oadmin');
    expect(all.nextCursor).not.toBeNull();
    const next = (await call('GET', `/audit?limit=2&cursor=${all.nextCursor}`, adminToken)).json();
    expect(next.items.every((e: { id: number }) => e.id < all.items[1].id)).toBe(true);
    const logoOnly = (await call('GET', '/audit?entity=organization', adminToken)).json().items;
    expect(logoOnly.length).toBeGreaterThanOrEqual(3);
    expect(logoOnly.every((e: { entity: string }) => e.entity === 'organization')).toBe(true);
    expect((await call('GET', `/audit?entityId=${orgs[0]}`, otherAdminToken)).json().items).toEqual(
      [],
    );
    expect((await call('GET', '/audit', collabToken)).statusCode).toBe(403);
  });
});
