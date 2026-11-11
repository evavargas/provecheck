import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../lib/env.js';

const opts = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export interface Supabase {
  /** Service role: backend only, never sent to a client. */
  admin: SupabaseClient;
  /** Fresh anon client per call, so sign-ins never share state. */
  anon(): SupabaseClient;
}

export function createSupabase(env: Env): Supabase {
  return {
    admin: createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts),
    anon: () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts),
  };
}
