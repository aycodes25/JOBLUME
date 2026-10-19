import type { JobFetch, JobFetchReason } from '@joblume/shared';
import type { Db } from '../../lib/supabase.js';

export type JobFetchState =
  | { status: 'queued' }
  | { status: 'done'; jobId: string }
  | { status: 'failed'; reason: JobFetchReason };

export interface JobFetchesRepo {
  save(userId: string, url: string, state: JobFetchState): Promise<void>;
  listRecent(userId: string, limit: number): Promise<JobFetch[]>;
}

const COLUMNS = 'id, url, status, reason, job_id, created_at, updated_at';

/** job_fetches is server-write-only: this service-role repo is the only writer. Every query is scoped to one user. */
export function createJobFetchesRepo(db: Db, now: () => Date = () => new Date()): JobFetchesRepo {
  return {
    async save(userId, url, state) {
      const at = now().toISOString();
      const row = {
        user_id: userId,
        url,
        status: state.status,
        reason: state.status === 'failed' ? state.reason : null,
        job_id: state.status === 'done' ? state.jobId : null,
        updated_at: at,
        // A new paste moves the link to the top of the recent list.
        ...(state.status === 'queued' ? { created_at: at } : {}),
      };
      const { error } = await db.from('job_fetches').upsert(row, { onConflict: 'user_id,url' });
      if (error) throw error;
    },
    async listRecent(userId, limit) {
      const { data, error } = await db
        .from('job_fetches')
        .select(COLUMNS)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as JobFetch[];
    },
  };
}
