import { z } from 'zod';
import type { ApplicationWithJob } from '../../api/deps.js';
import { ApiError } from '../../lib/errors.js';
import { planStatusChange } from '../application-status.js';
import { buildRawMessage, cvAttachmentName } from '../gmail/mime.js';
import { GmailSendError } from '../gmail/send.js';

export interface EmailLogRow {
  application_id: string;
  type: 'application' | 'follow_up';
  to_email: string;
  subject: string;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  rfc_message_id: string | null;
  status: 'sent' | 'failed';
  error: string | null;
}

export interface SendInput {
  to?: string;
  confirmGuess?: boolean;
  method: 'email' | 'auto';
}

export interface SendDeps {
  loadApplication(userId: string, id: string): Promise<ApplicationWithJob | null>;
  loadProfile(userId: string): Promise<{ daily_cap: number } | null>;
  appliedToday(userId: string): Promise<number>;
  hasSentApplicationEmail(applicationId: string): Promise<boolean>;
  isGmailConnected(userId: string): Promise<boolean>;
  getAccessToken(userId: string): Promise<{ accessToken: string; email: string }>;
  downloadPdf(path: string): Promise<Uint8Array>;
  sendMessage(args: { accessToken: string; raw: string; threadId?: string }): Promise<{ id: string; threadId: string }>;
  lock: { acquire(key: string, ttlSeconds: number): Promise<string | null>; release(key: string, token: string): Promise<void> };
  saveSent(userId: string, id: string, changes: Record<string, unknown>): Promise<ApplicationWithJob | null>;
  logEmail(row: EmailLogRow): Promise<void>;
  now(): Date;
  newMessageId(fromEmail: string): string;
  warn?(message: string, meta?: Record<string, unknown>): void;
}

const SENDABLE = new Set(['pending_review', 'approved']);
const DEFAULT_DAILY_CAP = 20;
const AUTO_MIN_CONFIDENCE = 80;
const LOCK_TTL_SECONDS = 60;
const MAX_LOCK_AGE_MS = 25_000;
const emailSchema = z.string().trim().toLowerCase().email().max(254);

type Recipient = { email: string; source: 'hunter' | 'guess' | 'manual'; confidence: number | null };

function parseEmail(raw: string): string | null {
  const parsed = emailSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function resolveRecipient(app: ApplicationWithJob, to: string | undefined): Recipient {
  if (to !== undefined) {
    const email = parseEmail(to);
    if (!email) throw new ApiError(400, 'invalid_request', 'Enter a valid email address');
    if (app.email_source && app.hiring_manager_email?.toLowerCase() === email) {
      return { email, source: app.email_source, confidence: app.email_confidence };
    }
    return { email, source: 'manual', confidence: null };
  }
  const email = app.hiring_manager_email ? parseEmail(app.hiring_manager_email) : null;
  if (!email) throw new ApiError(422, 'no_recipient', 'Add a contact email first');
  return { email, source: app.email_source ?? 'manual', confidence: app.email_confidence };
}

function checkedRecipient(app: ApplicationWithJob, input: SendInput): Recipient {
  const recipient = resolveRecipient(app, input.to);
  if (recipient.source === 'guess' && !input.confirmGuess) {
    throw new ApiError(409, 'guess_not_confirmed', 'Confirm that you want to send to a guessed address');
  }
  if (input.method === 'auto' && !(recipient.source === 'hunter' && (recipient.confidence ?? 0) >= AUTO_MIN_CONFIDENCE)) {
    throw new ApiError(409, 'not_auto_eligible', 'Auto mode only sends to found, high-confidence addresses');
  }
  return recipient;
}

const alreadySent = () => new ApiError(409, 'already_sent', 'This application was already sent or is no longer pending');

export async function sendApplication(userId: string, id: string, input: SendInput, d: SendDeps): Promise<ApplicationWithJob> {
  const app = await d.loadApplication(userId, id);
  if (!app) throw new ApiError(404, 'application_not_found');
  if (!SENDABLE.has(app.status) || (await d.hasSentApplicationEmail(app.id))) throw alreadySent();
  if (!(await d.isGmailConnected(userId))) throw new ApiError(409, 'gmail_not_connected', 'Connect Gmail first');

  checkedRecipient(app, input);

  const profile = await d.loadProfile(userId);
  if ((await d.appliedToday(userId)) >= (profile?.daily_cap ?? DEFAULT_DAILY_CAP)) {
    throw new ApiError(429, 'daily_cap_reached', 'You have reached today\'s application limit');
  }

  const lockKey = `send-lock-${app.id}`;
  const token = await d.lock.acquire(lockKey, LOCK_TTL_SECONDS);
  if (!token) throw alreadySent();
  const lockedAt = d.now().getTime();
  let keepLock = false;
  try {
    const fresh = await d.loadApplication(userId, id);
    if (!fresh || !SENDABLE.has(fresh.status) || (await d.hasSentApplicationEmail(fresh.id))) throw alreadySent();
    const recipient = checkedRecipient(fresh, input);
    if (!fresh.cover_letter_text?.trim()) throw new ApiError(422, 'empty_message', 'The cover letter is empty');
    if (!fresh.tailored_cv_url) throw new ApiError(409, 'cv_not_ready', 'The tailored CV is not ready yet');

    let pdf: Uint8Array;
    try {
      pdf = await d.downloadPdf(fresh.tailored_cv_url);
    } catch {
      throw new ApiError(502, 'send_failed', 'Could not load the tailored CV');
    }

    const { accessToken, email: from } = await d.getAccessToken(userId);
    const role = fresh.job?.title ?? 'the role';
    const subject = `Application for ${role}`;
    const messageId = d.newMessageId(from);
    const raw = await buildRawMessage({
      from,
      to: recipient.email,
      subject,
      text: fresh.cover_letter_text,
      attachment: { filename: cvAttachmentName(role), content: pdf, contentType: 'application/pdf' },
      messageId,
    });

    if (d.now().getTime() - lockedAt > MAX_LOCK_AGE_MS) {
      throw new ApiError(502, 'send_failed', 'The send took too long and was not attempted; please try again');
    }

    let sent: { id: string; threadId: string };
    try {
      sent = await d.sendMessage({ accessToken, raw });
    } catch (err) {
      const kind = err instanceof GmailSendError ? err.kind : 'failed';
      try {
        await d.logEmail({
          application_id: fresh.id, type: 'application', to_email: recipient.email, subject,
          gmail_message_id: null, gmail_thread_id: null, rfc_message_id: messageId, status: 'failed', error: kind,
        });
      } catch {
        d.warn?.('failed log could not be written', { applicationId: fresh.id });
      }
      if (kind === 'unauthorized') throw new ApiError(409, 'gmail_reauth_required', 'Reconnect Gmail');
      if (kind === 'rate_limited') throw new ApiError(429, 'rate_limited', 'Gmail is limiting sending. Try again later');
      throw new ApiError(502, 'send_failed', 'Gmail could not send the email');
    }

    try {
      await d.logEmail({
        application_id: fresh.id, type: 'application', to_email: recipient.email, subject,
        gmail_message_id: sent.id, gmail_thread_id: sent.threadId, rfc_message_id: messageId, status: 'sent', error: null,
      });
    } catch {
      d.warn?.('sent log could not be written', { applicationId: fresh.id });
    }

    keepLock = true;
    const saved = await d.saveSent(userId, id, {
      ...planStatusChange(fresh, 'applied', d.now()),
      apply_method: input.method,
      hiring_manager_email: recipient.email,
      email_source: recipient.source,
      email_confidence: recipient.confidence,
    });
    keepLock = false;
    if (!saved) throw new ApiError(404, 'application_not_found');
    return saved;
  } finally {
    if (!keepLock) await d.lock.release(lockKey, token);
  }
}
