import { describe, expect, it } from 'vitest';
import { ApiRequestError, createApiClient } from './api-client';
import type { SessionDto } from './auth';

const session = (n: number): SessionDto => ({
  accessToken: `a${n}`,
  refreshToken: `r${n}`,
  expiresAt: 0,
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function setup(responses: Response[]) {
  let current: SessionDto | null = session(1);
  const calls: { url: string; auth: string | null }[] = [];
  const client = createApiClient({
    baseUrl: 'http://api',
    store: { get: () => current, set: (s) => (current = s) },
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push({
        url: String(url),
        auth: (init.headers as Record<string, string>).authorization ?? null,
      });
      return responses.shift()!;
    }) as typeof fetch,
  });
  return { client, calls, session: () => current };
}

describe('api client', () => {
  it('refreshes once on 401 and retries with the new token', async () => {
    const t = setup([
      json(401, { code: 'UNAUTHORIZED' }),
      json(200, { session: session(2) }),
      json(200, { id: 'u1' }),
    ]);
    expect(await t.client.me()).toEqual({ id: 'u1' });
    expect(t.calls.map((c) => c.url)).toEqual([
      'http://api/me',
      'http://api/auth/refresh',
      'http://api/me',
    ]);
    expect(t.calls[2]!.auth).toBe('Bearer a2');
    expect(t.session()?.refreshToken).toBe('r2');
  });

  it('clears the session when the refresh token is rejected', async () => {
    const t = setup([json(401, { code: 'UNAUTHORIZED' }), json(401, { code: 'UNAUTHORIZED' })]);
    await expect(t.client.me()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(t.session()).toBeNull();
  });

  it('surfaces API error codes and does not refresh on login failures', async () => {
    const t = setup([json(401, { code: 'INVALID_CREDENTIALS' })]);
    const err = await t.client.login({ identifier: 'a@b.c', password: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.code).toBe('INVALID_CREDENTIALS');
    expect(t.calls).toHaveLength(1);
  });

  it('reports network failures with their own code', async () => {
    const client = createApiClient({
      baseUrl: 'http://api',
      store: { get: () => null, set: () => undefined },
      fetchImpl: (async () => {
        throw new TypeError('offline');
      }) as typeof fetch,
    });
    await expect(client.me()).rejects.toMatchObject({ code: 'NETWORK' });
  });
});

describe('users api', () => {
  it('builds the query string without empty values', async () => {
    const t = setup([json(200, { items: [], nextCursor: null })]);
    await t.client.users.list({ role: 'collaborator', q: '', limit: 10 });
    expect(t.calls[0]!.url).toBe('http://api/users?role=collaborator&limit=10');
  });
});
