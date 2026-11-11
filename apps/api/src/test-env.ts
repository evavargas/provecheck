import { loadEnv } from './lib/env.js';

/** Dummy connection settings: unit tests never open a connection. */
export const unitSource = {
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://x:x@127.0.0.1:1/x',
  SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_ANON_KEY: 'x',
  SUPABASE_SERVICE_ROLE_KEY: 'x',
};

export const unitEnv = () => loadEnv(unitSource);
