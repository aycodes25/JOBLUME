import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './env.js';

export type Db = SupabaseClient;

export function createSupabaseAdmin(env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'>): Db {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
