import type { ApplicationStatus, EmailSource } from '@joblume/shared';

export const AUTO_SOURCES = ['remotive', 'myjobmag', 'jobberman'] as const;
export const AUTO_MIN_CONFIDENCE = 80;

export interface AutoContext {
  userId: string;
  jobSource: string;
  application: {
    status: ApplicationStatus;
    match_score: number | null;
    email_source: EmailSource | null;
    email_confidence: number | null;
    hiring_manager_email: string | null;
  };
  profile: { apply_mode: 'manual' | 'auto'; auto_threshold: number; daily_cap: number };
  gmailConnected: boolean;
  appliedToday: number;
}

export type AutoReason =
  | 'mode_manual'
  | 'gmail_not_connected'
  | 'not_pending'
  | 'source_not_allowed'
  | 'no_trusted_email'
  | 'score_below_threshold'
  | 'daily_cap_reached';

/** Pure: whether an application may be sent without a click. The send step re-checks the same rules. */
export function checkAutoApply(c: AutoContext): { ok: true } | { ok: false; reason: AutoReason } {
  const a = c.application;
  if (c.profile.apply_mode !== 'auto') return { ok: false, reason: 'mode_manual' };
  if (!c.gmailConnected) return { ok: false, reason: 'gmail_not_connected' };
  if (a.status !== 'pending_review') return { ok: false, reason: 'not_pending' };
  if (!(AUTO_SOURCES as readonly string[]).includes(c.jobSource)) return { ok: false, reason: 'source_not_allowed' };
  if (!a.hiring_manager_email || a.email_source !== 'hunter' || (a.email_confidence ?? 0) < AUTO_MIN_CONFIDENCE) {
    return { ok: false, reason: 'no_trusted_email' };
  }
  if (a.match_score === null || a.match_score < c.profile.auto_threshold) return { ok: false, reason: 'score_below_threshold' };
  if (c.appliedToday >= c.profile.daily_cap) return { ok: false, reason: 'daily_cap_reached' };
  return { ok: true };
}

export async function runAutoApplyCheck(
  applicationId: string,
  d: {
    load(applicationId: string): Promise<AutoContext | null>;
    enqueueSend(args: { userId: string; applicationId: string; delayMs: number }): Promise<void>;
    randomDelay(): number;
  },
): Promise<'queued' | AutoReason | 'skipped'> {
  const ctx = await d.load(applicationId);
  if (!ctx) return 'skipped';
  const verdict = checkAutoApply(ctx);
  if (!verdict.ok) return verdict.reason;
  await d.enqueueSend({ userId: ctx.userId, applicationId, delayMs: d.randomDelay() });
  return 'queued';
}
