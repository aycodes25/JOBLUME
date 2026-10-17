import type { FollowUp, FollowUpWithJob } from '@joblume/shared';
import type { Db } from '../../lib/supabase.js';
import type { DraftContext } from './draft.js';
import type { FollowUpSendContext } from './send-followup.js';

const startOfUtcDay = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
};

export function createFollowUpRepo(db: Db) {
  return {
    // ---- API side (scoped to the user through the application) ----
    async listForUser(userId: string, status?: FollowUp['status']): Promise<FollowUpWithJob[]> {
      let q = db
        .from('follow_ups')
        .select('*, application:applications!inner(user_id, job:jobs(title, company))')
        .eq('application.user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown as Array<FollowUp & { application: { job: { title: string; company: string } | null } | null }>).map(
        ({ application, ...followUp }) => ({ ...followUp, job: application?.job ?? null }),
      );
    },

    async getForUser(userId: string, id: string): Promise<FollowUp | null> {
      const { data, error } = await db
        .from('follow_ups')
        .select('*, application:applications!inner(user_id)')
        .eq('id', id)
        .eq('application.user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { application: _application, ...followUp } = data as unknown as FollowUp & { application: unknown };
      return followUp;
    },

    async updateForUser(userId: string, id: string, patch: Record<string, unknown>): Promise<FollowUp | null> {
      const owned = await this.getForUser(userId, id);
      if (!owned) return null;
      const { data, error } = await db.from('follow_ups').update(patch).eq('id', id).eq('status', 'pending_review').select('*').maybeSingle();
      if (error) throw error;
      return (data as FollowUp | null) ?? null;
    },

    // ---- worker side ----
    async findDue(limit: number): Promise<{ id: string }[]> {
      const { data, error } = await db
        .from('applications')
        .select('id')
        .eq('status', 'applied')
        .in('apply_method', ['email', 'auto'])
        .lte('follow_up_at', new Date().toISOString())
        .order('follow_up_at', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as { id: string }[];
    },

    async followUpExists(applicationId: string): Promise<boolean> {
      const { count, error } = await db.from('follow_ups').select('id', { count: 'exact', head: true }).eq('application_id', applicationId);
      if (error) throw error;
      return (count ?? 0) > 0;
    },

    async insertFollowUp(row: { application_id: string; subject: string; body: string }): Promise<string | null> {
      const { data, error } = await db.from('follow_ups').insert(row).select('id').single();
      if (error) {
        if (error.code === '23505') return null;
        throw error;
      }
      return (data as { id: string }).id;
    },

    async clearFollowUpDate(applicationId: string): Promise<void> {
      const { error } = await db.from('applications').update({ follow_up_at: null }).eq('id', applicationId);
      if (error) throw error;
    },

    async loadDraftContext(applicationId: string): Promise<DraftContext | null> {
      const { data, error } = await db
        .from('applications')
        .select('id, user_id, status, applied_at, apply_method, cover_letter_text, job:jobs(title, company)')
        .eq('id', applicationId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const app = data as unknown as {
        id: string; user_id: string; status: DraftContext['status']; applied_at: string | null;
        apply_method: DraftContext['applyMethod']; cover_letter_text: string | null; job: DraftContext['job'];
      };
      const [profile, log, user] = await Promise.all([
        db.from('profiles').select('auto_followup, base_cv_text').eq('user_id', app.user_id).maybeSingle(),
        db.from('email_logs').select('subject').eq('application_id', applicationId).eq('type', 'application').eq('status', 'sent').order('sent_at', { ascending: false }).limit(1).maybeSingle(),
        db.from('users').select('gmail_refresh_token_enc').eq('id', app.user_id).maybeSingle(),
      ]);
      if (profile.error) throw profile.error;
      if (log.error) throw log.error;
      if (user.error) throw user.error;
      const p = profile.data as { auto_followup: boolean; base_cv_text: string | null } | null;
      return {
        id: app.id,
        userId: app.user_id,
        status: app.status,
        appliedAt: app.applied_at,
        applyMethod: app.apply_method,
        coverLetter: app.cover_letter_text,
        job: app.job,
        originalSubject: (log.data as { subject: string | null } | null)?.subject ?? null,
        cvHeader: (p?.base_cv_text ?? '').slice(0, 400),
        autoFollowup: p?.auto_followup ?? false,
        gmailConnected: Boolean((user.data as { gmail_refresh_token_enc: string | null } | null)?.gmail_refresh_token_enc),
      };
    },

    async loadSendContext(userId: string, followUpId: string): Promise<FollowUpSendContext | null> {
      const { data, error } = await db
        .from('follow_ups')
        .select('id, application_id, subject, body, status, application:applications!inner(id, user_id, status, apply_method)')
        .eq('id', followUpId)
        .eq('application.user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as FollowUpSendContext['followUp'] & { application: FollowUpSendContext['application'] };
      const { application, ...followUp } = row;
      const log = await db
        .from('email_logs')
        .select('to_email, subject, gmail_thread_id, rfc_message_id')
        .eq('application_id', application.id)
        .eq('type', 'application')
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (log.error) throw log.error;
      const l = log.data as { to_email: string; subject: string; gmail_thread_id: string | null; rfc_message_id: string | null } | null;
      return {
        followUp,
        application,
        original: l && l.gmail_thread_id ? { to_email: l.to_email, subject: l.subject, gmail_thread_id: l.gmail_thread_id, rfc_message_id: l.rfc_message_id } : null,
      };
    },

    async followUpsSentToday(userId: string): Promise<number> {
      const { count, error } = await db
        .from('email_logs')
        .select('id, application:applications!inner(user_id)', { count: 'exact', head: true })
        .eq('application.user_id', userId)
        .eq('type', 'follow_up')
        .eq('status', 'sent')
        .gte('sent_at', startOfUtcDay());
      if (error) throw error;
      return count ?? 0;
    },

    async hasSentFollowUpEmail(applicationId: string): Promise<boolean> {
      const { count, error } = await db
        .from('email_logs')
        .select('id', { count: 'exact', head: true })
        .eq('application_id', applicationId)
        .eq('type', 'follow_up')
        .eq('status', 'sent');
      if (error) throw error;
      return (count ?? 0) > 0;
    },

    async autoEnabled(userId: string): Promise<boolean> {
      const { data, error } = await db.from('profiles').select('auto_followup').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return Boolean((data as { auto_followup: boolean } | null)?.auto_followup);
    },

    async markSent(followUpId: string, applicationId: string, sentAt: string): Promise<void> {
      const a = await db.from('follow_ups').update({ status: 'sent', sent_at: sentAt }).eq('id', followUpId);
      if (a.error) throw a.error;
      const b = await db.from('applications').update({ follow_up_at: null }).eq('id', applicationId);
      if (b.error) throw b.error;
    },

    async markFailed(followUpId: string): Promise<void> {
      const { error } = await db.from('follow_ups').update({ status: 'failed' }).eq('id', followUpId);
      if (error) throw error;
    },

    async dismiss(followUpId: string): Promise<void> {
      const { error } = await db.from('follow_ups').update({ status: 'dismissed' }).eq('id', followUpId).eq('status', 'pending_review');
      if (error) throw error;
    },
  };
}

export type FollowUpRepo = ReturnType<typeof createFollowUpRepo>;
