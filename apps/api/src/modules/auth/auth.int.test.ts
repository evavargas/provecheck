import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../../app.js';
import { loadEnv } from '../../lib/env.js';
import { createDb } from '../../plugins/db.js';
import { createSupabase } from '../../plugins/supabase.js';
import { createUser } from '../users/create-user.js';

const run = randomUUID().slice(0, 8);
const TEMP = 'Temporary-pass-1';
const NEW_PASSWORD = 'Brand-new-pass-1';

const env = loadEnv({
  ...process.env,
  LOG_LEVEL: process.env.TEST_LOG ?? 'silent',
  LOGIN_MAX_ATTEMPTS: '100',
});
const db = createDb(env.DATABASE_URL);
const supabase = createSupabase(env);
let app: App;
let orgId: string;
const userIds: string[] = [];

const post = (url: string, payload: unknown, token?: string) =>
  app.inject({
    method: 'POST',
    url,
    payload: payload as object,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
const login = (identifier: string, password: string) =>
  post('/auth/login', { identifier, password });

async function newUser(suffix: string, extra: { role?: 'admin' | 'collaborator' } = {}) {
  const id = await createUser(
    { db, supabase },
    {
      organizationId: orgId,
      role: extra.role ?? 'collaborator',
      name: `User ${suffix}`,
      username: `u${suffix}${run}`,
      email: `u${suffix}.${run}@example.test`,
      phone: '099000000',
      temporaryPassword: TEMP,
    },
  );
  userIds.push(id);
  return { id, username: `u${suffix}${run}`, email: `u${suffix}.${run}@example.test` };
}

beforeAll(async () => {
  app = await buildApp(env);
  orgId = (
    await db.pool.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
      [`Test ${run}`],
    )
  ).rows[0]!.id;
});

afterAll(async () => {
  await db.pool.query('DELETE FROM audit_log WHERE organization_id = $1', [orgId]);
  await db.pool.query('DELETE FROM user_identifiers WHERE user_id = ANY($1)', [userIds]);
  await db.pool.query('DELETE FROM users WHERE organization_id = $1', [orgId]);
  for (const id of userIds) await supabase.admin.auth.admin.deleteUser(id);
  await db.pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
  await app.close();
});

describe('login', () => {
  it('accepts username or email, case-insensitively', async () => {
    const u = await newUser('login');
    for (const identifier of [
      u.username,
      u.email.toUpperCase(),
      `  ${u.username.toUpperCase()} `,
    ]) {
      const res = await login(identifier, TEMP);
      expect(res.statusCode).toBe(200);
      expect(res.json().mustChangePassword).toBe(true);
      expect(res.json().session.accessToken).toBeTruthy();
    }
  });

  it('gives the same generic error for a wrong password and an unknown user', async () => {
    const u = await newUser('generic');
    const wrong = await login(u.username, 'wrong-password-1');
    const unknown = await login(`nobody${run}`, 'wrong-password-1');
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().code).toBe('INVALID_CREDENTIALS');
    expect({ ...unknown.json(), requestId: 0 }).toEqual({ ...wrong.json(), requestId: 0 });
  });

  it('rejects a deactivated account only after the password is right', async () => {
    const u = await newUser('inactive');
    await db.pool.query(`UPDATE users SET status = 'inactive' WHERE id = $1`, [u.id]);
    expect((await login(u.username, TEMP)).json().code).toBe('ACCOUNT_INACTIVE');
    expect((await login(u.username, 'wrong-password-1')).json().code).toBe('INVALID_CREDENTIALS');
  });

  it('rate limits attempts per identifier', async () => {
    const limited = await buildApp({ ...env, LOGIN_MAX_ATTEMPTS: 3 });
    const attempt = () =>
      limited.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `limit${run}`, password: 'x' },
      });
    for (let i = 0; i < 3; i++) expect((await attempt()).statusCode).toBe(401);
    const blocked = await attempt();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    await limited.close();
  });

  it('rejects unknown body fields', async () => {
    const res = await post('/auth/login', { identifier: 'abc', password: 'x', extra: true });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});

describe('first login', () => {
  it('blocks everything but /me, first-login and logout until completed', async () => {
    const u = await newUser('blocked');
    const { session } = (await login(u.username, TEMP)).json();
    const headers = { authorization: `Bearer ${session.accessToken}` };
    expect((await app.inject({ method: 'GET', url: '/me', headers })).statusCode).toBe(200);
    const blocked = await app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      headers,
      payload: { theme: 'dark' },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('rejects weak, unchanged and taken values', async () => {
    const a = await newUser('fl-a');
    const b = await newUser('fl-b');
    const token = (await login(a.username, TEMP)).json().session.accessToken;

    expect(
      (await post('/auth/first-login', { email: a.email, newPassword: 'short' }, token)).statusCode,
    ).toBe(422);
    const same = await post('/auth/first-login', { email: a.email, newPassword: TEMP }, token);
    expect(same.statusCode).toBe(422);
    expect(same.json().details).toMatchObject({ reason: 'same_as_temporary' });
    const taken = await post(
      '/auth/first-login',
      { email: b.email.toUpperCase(), newPassword: NEW_PASSWORD },
      token,
    );
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toMatchObject({ code: 'IDENTIFIER_TAKEN', details: { field: 'email' } });
    // a failed attempt must leave the account untouched
    expect((await login(a.username, TEMP)).statusCode).toBe(200);
  });

  it('confirms the (corrected) email, sets the password and unlocks the account', async () => {
    const u = await newUser('fl-ok');
    const token = (await login(u.username, TEMP)).json().session.accessToken;
    const corrected = `fixed.${run}@example.test`;

    const res = await post(
      '/auth/first-login',
      { email: corrected, newPassword: NEW_PASSWORD },
      token,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: corrected, mustChangePassword: false });

    expect((await login(u.username, TEMP)).statusCode).toBe(401);
    const after = await login(corrected, NEW_PASSWORD);
    expect(after.statusCode).toBe(200);
    expect(after.json().mustChangePassword).toBe(false);

    const row = await db.pool.query(`SELECT status, email_confirmed_at FROM users WHERE id = $1`, [
      u.id,
    ]);
    expect(row.rows[0]).toMatchObject({ status: 'active' });
    expect(row.rows[0].email_confirmed_at).not.toBeNull();
    // the email identifier moved, the old one is free again
    const ids = await db.pool.query(
      `SELECT identifier FROM user_identifiers WHERE user_id = $1 ORDER BY kind`,
      [u.id],
    );
    expect(ids.rows.map((r) => r.identifier)).toEqual([corrected, u.username]);
    expect(
      (
        await post(
          '/auth/first-login',
          { email: corrected, newPassword: 'Another-pass-123' },
          after.json().session.accessToken,
        )
      ).statusCode,
    ).toBe(403);
  });
});

describe('session', () => {
  async function activeSession() {
    const u = await newUser(`s${randomUUID().slice(0, 4)}`);
    const token = (await login(u.username, TEMP)).json().session.accessToken;
    await post('/auth/first-login', { email: u.email, newPassword: NEW_PASSWORD }, token);
    return { u, ...(await login(u.username, NEW_PASSWORD)).json() };
  }

  it('rejects requests without a valid token', async () => {
    expect((await app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/me', headers: { authorization: 'Bearer nope' } }))
        .statusCode,
    ).toBe(401);
  });

  it('stores theme and language preferences in the profile (RLS path)', async () => {
    const s = await activeSession();
    const headers = { authorization: `Bearer ${s.session.accessToken}` };
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      headers,
      payload: { theme: 'dark', locale: 'en' },
    });
    expect(res.json()).toMatchObject({ theme: 'dark', locale: 'en' });
    const reset = await app.inject({
      method: 'PATCH',
      url: '/me/preferences',
      headers,
      payload: { locale: null },
    });
    expect(reset.json()).toMatchObject({ theme: 'dark', locale: null });
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/me/preferences',
          headers,
          payload: { theme: 'neon' },
        })
      ).statusCode,
    ).toBe(422);
  });

  it('refreshes and logs out', async () => {
    const s = await activeSession();
    const refreshed = await post('/auth/refresh', { refreshToken: s.session.refreshToken });
    expect(refreshed.statusCode).toBe(200);
    expect((await post('/auth/refresh', { refreshToken: 'bogus' })).statusCode).toBe(401);

    const token = refreshed.json().session.accessToken;
    expect((await post('/auth/logout', {}, token)).statusCode).toBe(204);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/me',
          headers: { authorization: `Bearer ${token}` },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('changes the password with the current one', async () => {
    const s = await activeSession();
    const token = s.session.accessToken;
    expect(
      (
        await post(
          '/auth/change-password',
          { currentPassword: 'wrong-pass-123', newPassword: 'Third-pass-1234' },
          token,
        )
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await post(
          '/auth/change-password',
          { currentPassword: NEW_PASSWORD, newPassword: 'Third-pass-1234' },
          token,
        )
      ).statusCode,
    ).toBe(204);
    expect((await login(s.u.username, NEW_PASSWORD)).statusCode).toBe(401);
    expect((await login(s.u.username, 'Third-pass-1234')).statusCode).toBe(200);
  });
});
