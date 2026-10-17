import type { JobRow, ProfileRow } from '../db/types.js';
import type { Db } from '../lib/supabase.js';
import type { MatchCandidate } from './match.js';
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
        .select('user_id, desired_roles, location')
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

    async insertApplication(row: NewApplication): Promise<void> {
      const { error } = await db.from('applications').insert(row);
      // 23505 = unique_violation: another worker created it first, which is fine.
      if (error && error.code !== '23505') throw error;
    },
  };
}
