import type { ApplicationStatus } from '@joblume/shared';
import { ApiError } from '../../lib/errors.js';
import { buildRawMessage } from '../gmail/mime.js';
import { GmailSendError } from '../gmail/send.js';
import type { EmailLogRow } from '../sending/send-application.js';

export interface FollowUpSendContext {
  followUp: { id: string; application_id: string; subject: string; body: string; status: 'pending_review' | 'sent' | 'dismissed' | 'failed' };
  application: { id: string; user_id: string; status: ApplicationStatus; apply_method: 'email' | 'assisted' | 'auto' | null };
  original: { to_email: string; gmail_thread_id: string; rfc_message_id: string | null; subject: string } | null;
}

export interface FollowUpSendDeps {
  loadContext(userId: string, followUpId: string): Promise<FollowUpSendContext | null>;
  loadProfile(userId: string): Promise<{ daily_cap: number } | null>;
  followUpsSentToday(userId: string): Promise<number>;
  isGmailConnected(userId: string): Promise<boolean>;
  getAccessToken(userId: string): Promise<{ accessToken: string; email: string }>;
  sendMessage(args: { accessToken: string; raw: string; threadId?: string }): Promise<{ id: string; threadId: string }>;
  lock: { acquire(key: string, ttlSeconds: number): Promise<string | null>; release(key: string, token: string): Promise<void> };
  markSent(followUpId: string, applicationId: string, sentAt: string): Promise<void>;
  markFailed(followUpId: string): Promise<void>;
  dismiss(followUpId: string): Promise<void>;
  logEmail(row: EmailLogRow): Promise<void>;
  now(): Date;
  newMessageId(fromEmail: string): string;
}

const DEFAULT_DAILY_CAP = 20;
const alreadySent = () => new ApiError(409, 'already_sent', 'This follow-up was already handled');

export async function sendFollowUp(userId: string, followUpId: string, opts: { automatic: boolean }, d: FollowUpSendDeps): Promise<void> {
  const ctx = await d.loadContext(userId, followUpId);
  if (!ctx) throw new ApiError(404, 'follow_up_not_found');
  if (ctx.followUp.status !== 'pending_review') throw alreadySent();
  if (ctx.application.status !== 'applied') {
    await d.dismiss(followUpId);
    throw new ApiError(409, 'not_applicable', 'This application is no longer waiting for a reply');
  }
  if (!ctx.original) throw new ApiError(409, 'not_applicable', 'There is no sent email to reply to');
  if (!(await d.isGmailConnected(userId))) throw new ApiError(409, 'gmail_not_connected', 'Connect Gmail first');

  const profile = await d.loadProfile(userId);
  if ((await d.followUpsSentToday(userId)) >= (profile?.daily_cap ?? DEFAULT_DAILY_CAP)) {
    throw new ApiError(429, 'daily_cap_reached', 'You have reached today\'s email limit');
  }

  const lockKey = `followup-lock-${followUpId}`;
  const lockToken = await d.lock.acquire(lockKey, 60);
  if (!lockToken) throw alreadySent();
  try {
    const fresh = await d.loadContext(userId, followUpId);
    if (!fresh || fresh.followUp.status !== 'pending_review' || !fresh.original) throw alreadySent();

    const { accessToken, email: from } = await d.getAccessToken(userId);
    const messageId = d.newMessageId(from);
    const { original, followUp } = fresh;
    const raw = await buildRawMessage({
      from,
      to: original.to_email,
      subject: followUp.subject,
      text: followUp.body,
      messageId,
      ...(original.rfc_message_id ? { inReplyTo: original.rfc_message_id, references: original.rfc_message_id } : {}),
    });

    let sent: { id: string; threadId: string };
    try {
      sent = await d.sendMessage({ accessToken, raw, threadId: original.gmail_thread_id });
    } catch (err) {
      const kind = err instanceof GmailSendError ? err.kind : 'failed';
      await d.logEmail({
        application_id: fresh.application.id, type: 'follow_up', to_email: original.to_email, subject: followUp.subject,
        gmail_message_id: null, gmail_thread_id: original.gmail_thread_id, rfc_message_id: messageId, status: 'failed', error: kind,
      });
      if (opts.automatic) await d.markFailed(followUpId);
      if (kind === 'unauthorized') throw new ApiError(409, 'gmail_reauth_required', 'Reconnect Gmail');
      if (kind === 'rate_limited') throw new ApiError(429, 'rate_limited', 'Gmail is limiting sending. Try again later');
      throw new ApiError(502, 'send_failed', 'Gmail could not send the email');
    }

    await d.logEmail({
      application_id: fresh.application.id, type: 'follow_up', to_email: original.to_email, subject: followUp.subject,
      gmail_message_id: sent.id, gmail_thread_id: sent.threadId, rfc_message_id: messageId, status: 'sent', error: null,
    });
    await d.markSent(followUpId, fresh.application.id, d.now().toISOString());
  } finally {
    await d.lock.release(lockKey, lockToken);
  }
}
