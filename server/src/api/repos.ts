import type { ApplicationStatus, ProfileRow } from '../db/types.js';
import type { Db } from '../lib/supabase.js';
import type { AnalyticsRow } from '../services/analytics.js';
export { createGmailTokenStore } from '../services/gmail/store.js';
import type { ApplicationWithJob, ApplicationsRepo, ProfilePatch, ProfileRepo } from './deps.js';
import { PROFILE_SELECT, flattenProfile, splitProfilePatch } from './profile-merge.js';

const APP_SELECT = '*, job:jobs(title, company, location, source, url, company_domain, posted_at)';

export function createProfileRepo(db: Db): ProfileRepo {
  return {
    async get(userId) {
      const { data, error } = await db.from('profiles').select(PROFILE_SELECT).eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data ? flattenProfile(data as unknown as Record<string, unknown>) : null;
    },
    async update(userId, patch: ProfilePatch) {
      const { profile, fullName } = splitProfilePatch(patch);
      if (fullName !== undefined) {
        const { error: nameError } = await db.from('users').update({ full_name: fullName }).eq('id', userId);
        if (nameError) throw nameError;
      }
      const { data, error } = await db
        .from('profiles')
        .update({ ...profile, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .select(PROFILE_SELECT)
        .single();
      if (error) throw error;
      return flattenProfile(data as unknown as Record<string, unknown>);
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
