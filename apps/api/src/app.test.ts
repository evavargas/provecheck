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
