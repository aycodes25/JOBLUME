import type { ApplicationStatus, ProfileRow } from '../db/types.js';
import type { Db } from '../lib/supabase.js';
import type { AnalyticsRow } from '../services/analytics.js';
import type { GmailTokenStore } from '../services/gmail/tokens.js';
import type { ApplicationWithJob, ApplicationsRepo, ProfilePatch, ProfileRepo } from './deps.js';

const APP_SELECT = '*, job:jobs(title, company, location, source, url, company_domain)';

export function createProfileRepo(db: Db): ProfileRepo {
  return {
    async get(userId) {
      const { data, error } = await db.from('profiles').select('*').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return (data as ProfileRow | null) ?? null;
    },
    async update(userId, patch: ProfilePatch) {
      const { data, error } = await db
        .from('profiles')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .select('*')
        .single();
      if (error) throw error;
      return data as ProfileRow;
    },
  };
}

export function createApplicationsRepo(db: Db): ApplicationsRepo {
  return {
    async list(userId, status?: ApplicationStatus) {
      let q = db.from('applications').select(APP_SELECT).eq('user_id', userId).order('match_score', { ascending: false, nullsFirst: false }).limit(200);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ApplicationWithJob[];
    },
    async get(userId, id) {
      const { data, error } = await db.from('applications').select(APP_SELECT).eq('user_id', userId).eq('id', id).maybeSingle();
      if (error) throw error;
      return (data as unknown as ApplicationWithJob | null) ?? null;
    },
    async update(userId, id, patch) {
      const { data, error } = await db
        .from('applications')
        .update(patch)
        .eq('user_id', userId)
        .eq('id', id)
        .select(APP_SELECT)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ApplicationWithJob | null) ?? null;
    },
    async listForAnalytics(userId) {
      const { data, error } = await db.from('applications').select('status, match_score').eq('user_id', userId);
      if (error) throw error;
      return (data ?? []) as AnalyticsRow[];
    },
  };
}

export async function setCv(db: Db, userId: string, v: { text: string; path: string; filename: string }): Promise<void> {
  const { error } = await db
    .from('profiles')
    .update({ base_cv_text: v.text, base_cv_url: v.path, base_cv_filename: v.filename, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw error;
}

export function createGmailTokenStore(db: Db): GmailTokenStore {
  return {
    async get(userId) {
      const { data, error } = await db.from('users').select('gmail_refresh_token_enc, gmail_email').eq('id', userId).maybeSingle();
      if (error) throw error;
      const row = data as { gmail_refresh_token_enc: string | null; gmail_email: string | null } | null;
      return { encryptedToken: row?.gmail_refresh_token_enc ?? null, email: row?.gmail_email ?? null };
    },
    async save(userId, value) {
      const { error } = await db
        .from('users')
        .update({ gmail_refresh_token_enc: value.encryptedToken, gmail_email: value.email, gmail_connected_at: value.connectedAt })
        .eq('id', userId);
      if (error) throw error;
    },
    async clear(userId) {
      const { error } = await db
        .from('users')
        .update({ gmail_refresh_token_enc: null, gmail_email: null, gmail_connected_at: null })
        .eq('id', userId);
      if (error) throw error;
    },
  };
}
