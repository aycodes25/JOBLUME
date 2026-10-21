import type { Db } from '../../lib/supabase.js';
import type { DigestMatch } from './digest.js';

/** The most matches one digest reads; the email lists fewer. */
const READ_LIMIT = 50;

/**
 * Reads for the new-match digest. Only the job title, company and score are selected: the CV and cover letter
 * text are never read here, so they cannot end up in the email.
 */
export function createAlertRepo(db: Db) {
  return {
    /** Users who turned the digest on, with the score at or above which a match counts. */
    async loadSubscribers(): Promise<Array<{ user_id: string; auto_threshold: number }>> {
      const { data, error } = await db.from('profiles').select('user_id, auto_threshold').eq('notify_new_matches', true);
      if (error) throw error;
      return (data ?? []) as Array<{ user_id: string; auto_threshold: number }>;
    },

    /** The user's pending applications created since `since`, scoring at least `minScore`, not yet in a digest. Best first. */
    async loadNewMatches(userId: string, minScore: number, since: Date): Promise<DigestMatch[]> {
      const { data, error } = await db
        .from('applications')
        .select('id, match_score, job:jobs(title, company)')
        .eq('user_id', userId)
        .eq('status', 'pending_review')
        .is('notified_at', null)
        .gte('match_score', minScore)
        .gte('created_at', since.toISOString())
        .order('match_score', { ascending: false })
        .limit(READ_LIMIT);
      if (error) throw error;
      return ((data ?? []) as unknown as Array<{ id: string; match_score: number; job: { title: string; company: string } | null }>).map((row) => ({
        id: row.id,
        title: row.job?.title ?? 'Untitled role',
        company: row.job?.company ?? 'Unknown company',
        match_score: row.match_score,
      }));
    },

    async markNotified(applicationIds: string[], at: Date): Promise<void> {
      if (applicationIds.length === 0) return;
      const { error } = await db.from('applications').update({ notified_at: at.toISOString() }).in('id', applicationIds);
      if (error) throw error;
    },
  };
}
