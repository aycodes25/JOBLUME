import type { JobRow, ProfileRow } from '../db/types.js';
import type { Db } from '../lib/supabase.js';
import type { MatchCandidate } from './match.js';
import type { FinderDeps } from '../services/email/finder.js';
import type { FindEmailDeps } from './find-email.js';
import type { NewApplication } from './tailor.js';

export function createWorkerRepos(db: Db) {
  return {
    async loadJob(id: string): Promise<JobRow | null> {
      const { data, error } = await db.from('jobs').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return (data as JobRow | null) ?? null;
    },

    async loadProfile(userId: string): Promise<ProfileRow | null> {
      const { data, error } = await db.from('profiles').select('*').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return (data as ProfileRow | null) ?? null;
    },

    async loadCandidates(): Promise<MatchCandidate[]> {
      const { data, error } = await db
        .from('profiles')
        .select('user_id, desired_roles, location, skills')
        .not('base_cv_text', 'is', null);
      if (error) throw error;
      return ((data ?? []) as MatchCandidate[]).filter((p) => p.desired_roles.length > 0);
    },

    async loadRecentJobs(days: number, limit: number): Promise<JobRow[]> {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await db
        .from('jobs')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as JobRow[];
    },

    async existingJobIds(userId: string, jobIds: string[]): Promise<Set<string>> {
      if (jobIds.length === 0) return new Set();
      const { data, error } = await db.from('applications').select('job_id').eq('user_id', userId).in('job_id', jobIds);
      if (error) throw error;
      return new Set((data ?? []).map((r) => (r as { job_id: string }).job_id));
    },

    async applicationExists(userId: string, jobId: string): Promise<boolean> {
      const { count, error } = await db
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('job_id', jobId);
      if (error) throw error;
      return (count ?? 0) > 0;
    },

    async insertApplication(row: NewApplication): Promise<string | null> {
      const { data, error } = await db.from('applications').insert(row).select('id').single();
      // 23505 = unique_violation: another worker created it first, which is fine.
      if (error) {
        if (error.code === '23505') return null;
        throw error;
      }
      return (data as { id: string }).id;
    },

    async loadApplicationForEmail(id: string) {
      const { data, error } = await db
        .from('applications')
        .select('id, user_id, status, email_candidates, email_source, whatsapp_number, job:jobs(company, company_domain, description)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Awaited<ReturnType<FindEmailDeps['loadApplication']>>) ?? null;
    },

    /** Conditional write: only a still-pending application with no email chosen yet is updated. Returns whether a row changed. */
    async saveApplicationFields(id: string, changes: Record<string, unknown>): Promise<boolean> {
      const { data, error } = await db
        .from('applications')
        .update(changes)
        .eq('id', id)
        .eq('status', 'pending_review')
        .is('email_source', null)
        .select('id');
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  };
}

export function createCompanyCache(db: Db): FinderDeps['cache'] {
  return {
    async get(key) {
      const { data, error } = await db.from('company_contacts').select('domain, contacts, pattern, fetched_at').eq('company_key', key).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as { domain: string | null; contacts: unknown; pattern: string | null; fetched_at: string };
      return { domain: row.domain, contacts: Array.isArray(row.contacts) ? (row.contacts as never) : [], pattern: row.pattern, fetchedAt: row.fetched_at };
    },
    async put(key, value) {
      const { error } = await db.from('company_contacts').upsert(
        { company_key: key, domain: value.domain, contacts: value.contacts, pattern: value.pattern, fetched_at: new Date().toISOString() },
        { onConflict: 'company_key' },
      );
      if (error) throw error;
    },
  };
}
