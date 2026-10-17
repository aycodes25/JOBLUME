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
  hasSentFollowUpEmail(applicationId: string): Promise<boolean>;
  autoEnabled(userId: string): Promise<boolean>;
  isGmailConnected(userId: string): Promise<boolean>;
  getAccessToken(userId: string): Promise<{ accessToken: string; email: string }>;
  sendMessage(args: { accessToken: string; raw: string; threadId?: string }): Promise<{ id: string; threadId: string }>;
  lock: {
    acquire(key: string, ttlSeconds: number): Promise<string | null>;
    release(key: string, token: string): Promise<void>;
    /** Token-checked TTL extension: keeps the lock alive after an email went out. */
    extend(key: string, token: string, ttlSeconds: number): Promise<void>;
  };
  markSent(followUpId: string, applicationId: string, sentAt: string): Promise<void>;
  markFailed(followUpId: string): Promise<void>;
  dismiss(followUpId: string): Promise<void>;
  logEmail(row: EmailLogRow): Promise<void>;
  now(): Date;
  newMessageId(fromEmail: string): string;
  warn?(message: string, meta?: Record<string, unknown>): void;
}

const DEFAULT_DAILY_CAP = 20;
const LOCK_TTL_SECONDS = 60;
const MAX_LOCK_AGE_MS = 25_000;
const SENT_LOCK_TTL_SECONDS = 24 * 60 * 60;
const alreadySent = () => new ApiError(409, 'already_sent', 'This follow-up was already handled');

export async function sendFollowUp(userId: string, followUpId: string, opts: { automatic: boolean }, d: FollowUpSendDeps): Promise<void> {
  /** A follow-up email already went out: repair the draft's status if cheap, then refuse. */
  const refuseSent = async (applicationId: string): Promise<never> => {
    try {
      await d.markSent(followUpId, applicationId, d.now().toISOString());
    } catch {
      d.warn?.('follow-up status could not be reconciled', { followUpId });
    }
    throw alreadySent();
  };
  const requireAutoStillOn = async () => {
    if (opts.automatic && !(await d.autoEnabled(userId))) {
      throw new ApiError(409, 'auto_disabled', 'Automatic follow-ups are turned off');
    }
  };

  const ctx = await d.loadContext(userId, followUpId);
  if (!ctx) throw new ApiError(404, 'follow_up_not_found');
  if (ctx.followUp.status !== 'pending_review') throw alreadySent();
  if (ctx.application.status !== 'applied') {
    await d.dismiss(followUpId);
    throw new ApiError(409, 'not_applicable', 'This application is no longer waiting for a reply');
  }
  if (!ctx.original) throw new ApiError(409, 'not_applicable', 'There is no sent email to reply to');
  if (await d.hasSentFollowUpEmail(ctx.application.id)) return refuseSent(ctx.application.id);
  await requireAutoStillOn();
  if (!(await d.isGmailConnected(userId))) throw new ApiError(409, 'gmail_not_connected', 'Connect Gmail first');

  const profile = await d.loadProfile(userId);
  if ((await d.followUpsSentToday(userId)) >= (profile?.daily_cap ?? DEFAULT_DAILY_CAP)) {
    throw new ApiError(429, 'daily_cap_reached', 'You have reached today\'s email limit');
  }

  const lockKey = `followup-lock-${followUpId}`;
  const lockToken = await d.lock.acquire(lockKey, LOCK_TTL_SECONDS);
  if (!lockToken) throw alreadySent();
  const lockedAt = d.now().getTime();
  let keepLock = false;
  try {
    const fresh = await d.loadContext(userId, followUpId);
    if (!fresh || fresh.followUp.status !== 'pending_review' || !fresh.original) throw alreadySent();
    if (await d.hasSentFollowUpEmail(fresh.application.id)) return await refuseSent(fresh.application.id);
    await requireAutoStillOn();

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

    if (d.now().getTime() - lockedAt > MAX_LOCK_AGE_MS) {
      throw new ApiError(502, 'send_failed', 'The send took too long and was not attempted; please try again');
    }

    let sent: { id: string; threadId: string };
    try {
      sent = await d.sendMessage({ accessToken, raw, threadId: original.gmail_thread_id });
    } catch (err) {
      const kind = err instanceof GmailSendError ? err.kind : 'failed';
      try {
        await d.logEmail({
          application_id: fresh.application.id, type: 'follow_up', to_email: original.to_email, subject: followUp.subject,
          gmail_message_id: null, gmail_thread_id: original.gmail_thread_id, rfc_message_id: messageId, status: 'failed', error: kind,
        });
      } catch {
        d.warn?.('failed log could not be written', { followUpId });
      }
      if (opts.automatic) {
        try {
          await d.markFailed(followUpId);
        } catch {
          d.warn?.('follow-up could not be marked failed', { followUpId });
        }
      }
      if (kind === 'unauthorized') throw new ApiError(409, 'gmail_reauth_required', 'Reconnect Gmail');
      if (kind === 'rate_limited') throw new ApiError(429, 'rate_limited', 'Gmail is limiting sending. Try again later');
      throw new ApiError(502, 'send_failed', 'Gmail could not send the email');
    }

    // The email is out. Keep the lock until the status is recorded so nothing can re-send meanwhile.
    keepLock = true;
    try {
      await d.lock.extend(lockKey, lockToken, SENT_LOCK_TTL_SECONDS);
    } catch {
      d.warn?.('follow-up lock could not be extended', { followUpId });
    }
    try {
      await d.logEmail({
        application_id: fresh.application.id, type: 'follow_up', to_email: original.to_email, subject: followUp.subject,
        gmail_message_id: sent.id, gmail_thread_id: sent.threadId, rfc_message_id: messageId, status: 'sent', error: null,
      });
    } catch {
      d.warn?.('sent log could not be written', { followUpId });
    }
    try {
      await d.markSent(followUpId, fresh.application.id, d.now().toISOString());
    } catch {
      d.warn?.('follow-up status could not be saved after sending', { followUpId });
      throw new ApiError(502, 'send_failed', 'The email was sent but could not be recorded; do not send it again');
    }
    keepLock = false;
  } finally {
    if (!keepLock) {
      try {
        await d.lock.release(lockKey, lockToken);
      } catch {
        d.warn?.('follow-up lock could not be released', { followUpId });
      }
    }
  }
}
