import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadEnv } from './lib/env.js';
import { unitEnv, unitSource } from './test-env.js';

describe('api', () => {
  it('answers /health', async () => {
    const app = await buildApp(unitEnv());
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('lets browsers send PUT and PATCH from an allowed origin', async () => {
    const origin = 'http://localhost:5173';
    const app = await buildApp(loadEnv({ ...unitSource, CORS_ORIGINS: origin }));
    for (const method of ['PUT', 'PATCH']) {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/tasks/x/draft',
        headers: { origin, 'access-control-request-method': method },
      });
      expect(res.headers['access-control-allow-methods']).toContain(method);
    }
  });

  it('returns a stable error code for unknown routes', async () => {
    const app = await buildApp(unitEnv());
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });

  it('rejects an invalid PORT', () => {
    expect(() => loadEnv({ ...unitSource, PORT: 'abc' })).toThrow();
  });
});
