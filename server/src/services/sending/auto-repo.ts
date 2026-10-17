import type { Db } from '../../lib/supabase.js';
import type { AutoContext } from './auto-apply.js';

export function createAutoApplyLoader(db: Db, isGmailConnected: (userId: string) => Promise<boolean>) {
  return async function load(applicationId: string): Promise<AutoContext | null> {
    const { data, error } = await db
      .from('applications')
      .select('user_id, status, match_score, email_source, email_confidence, hiring_manager_email, job:jobs(source)')
      .eq('id', applicationId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as unknown as {
      user_id: string; status: AutoContext['application']['status']; match_score: number | null;
      email_source: AutoContext['application']['email_source']; email_confidence: number | null;
      hiring_manager_email: string | null; job: { source: string } | null;
    };
    const profile = await db.from('profiles').select('apply_mode, auto_threshold, daily_cap').eq('user_id', row.user_id).maybeSingle();
    if (profile.error) throw profile.error;
    if (!profile.data) return null;
    const applied = await db.rpc('applications_applied_today', { uid: row.user_id });
    if (applied.error) throw applied.error;
    return {
      userId: row.user_id,
      jobSource: row.job?.source ?? '',
      application: {
        status: row.status, match_score: row.match_score, email_source: row.email_source,
        email_confidence: row.email_confidence, hiring_manager_email: row.hiring_manager_email,
      },
      profile: profile.data as AutoContext['profile'],
      gmailConnected: await isGmailConnected(row.user_id),
      appliedToday: Number(applied.data ?? 0),
    };
  };
}
