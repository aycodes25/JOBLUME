import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/lib/errors.js';
import { GmailSendError } from '../../src/services/gmail/send.js';
import { sendFollowUp, type FollowUpSendContext, type FollowUpSendDeps } from '../../src/services/followups/send-followup.js';

const NOW = new Date('2026-10-23T10:00:00.000Z');
const context = (over: { followUp?: Partial<FollowUpSendContext['followUp']>; application?: Partial<FollowUpSendContext['application']>; original?: FollowUpSendContext['original'] } = {}): FollowUpSendContext => ({
  followUp: { id: 'f1', application_id: 'a1', subject: 'Re: Application for Data Analyst', body: 'Dear team, any update please?', status: 'pending_review', ...over.followUp },
  application: { id: 'a1', user_id: 'u1', status: 'applied', apply_method: 'email', ...over.application },
  original: over.original === undefined
    ? { to_email: 'hr@acme.com', gmail_thread_id: 'th1', rfc_message_id: '<orig@gmail.com>', subject: 'Application for Data Analyst' }
    : over.original,
});

function make(over: Partial<FollowUpSendDeps> = {}): FollowUpSendDeps {
  return {
    loadContext: vi.fn().mockResolvedValue(context()),
    loadProfile: vi.fn().mockResolvedValue({ daily_cap: 20 }),
    followUpsSentToday: vi.fn().mockResolvedValue(0),
    hasSentFollowUpEmail: vi.fn().mockResolvedValue(false),
    autoEnabled: vi.fn().mockResolvedValue(true),
    isGmailConnected: vi.fn().mockResolvedValue(true),
    getAccessToken: vi.fn().mockResolvedValue({ accessToken: 'TOK', email: 'me@gmail.com' }),
    sendMessage: vi.fn().mockResolvedValue({ id: 'gm2', threadId: 'th1' }),
    lock: { acquire: vi.fn().mockResolvedValue('tok-1'), release: vi.fn().mockResolvedValue(undefined), extend: vi.fn().mockResolvedValue(undefined) },
    markSent: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    dismiss: vi.fn().mockResolvedValue(undefined),
    logEmail: vi.fn().mockResolvedValue(undefined),
    now: () => NOW,
    newMessageId: () => '<reply@gmail.com>',
    ...over,
  };
}

const run = (d: FollowUpSendDeps, automatic = false) => sendFollowUp('u1', 'f1', { automatic }, d);
const rejection = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);
const decode = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8');

describe('sendFollowUp: success', () => {
  it('replies on the original thread, logs it and marks the follow-up sent', async () => {
    const d = make();
    await run(d);
    const args = vi.mocked(d.sendMessage).mock.calls[0]![0];
    expect(args.threadId).toBe('th1');
    expect(args.accessToken).toBe('TOK');
    const message = decode(args.raw);
    expect(message).toMatch(/Subject: Re: Application for Data Analyst/);
    expect(message).toMatch(/To: .*hr@acme\.com/);
    expect(message).toMatch(/In-Reply-To: <orig@gmail\.com>/);
    expect(message).toMatch(/References: <orig@gmail\.com>/);
    expect(message).toMatch(/Message-ID: <reply@gmail\.com>/i);
    expect(message).toContain('any update please?');
    expect(message).not.toMatch(/multipart\/mixed/i);
    expect(d.logEmail).toHaveBeenCalledWith({
      application_id: 'a1', type: 'follow_up', to_email: 'hr@acme.com', subject: 'Re: Application for Data Analyst',
      gmail_message_id: 'gm2', gmail_thread_id: 'th1', rfc_message_id: '<reply@gmail.com>', status: 'sent', error: null,
    });
    expect(d.markSent).toHaveBeenCalledWith('f1', 'a1', NOW.toISOString());
    expect(d.lock.acquire).toHaveBeenCalledWith('followup-lock-f1', 60);
    expect(d.lock.release).toHaveBeenCalledWith('followup-lock-f1', 'tok-1');
  });

  it('still replies when the original message id was not stored (thread id only)', async () => {
    const d = make({ loadContext: vi.fn().mockResolvedValue(context({ original: { to_email: 'hr@acme.com', gmail_thread_id: 'th1', rfc_message_id: null, subject: 's' } })) });
    await run(d);
    const message = decode(vi.mocked(d.sendMessage).mock.calls[0]![0].raw);
    expect(message).not.toMatch(/In-Reply-To:/i);
    expect(vi.mocked(d.sendMessage).mock.calls[0]![0].threadId).toBe('th1');
  });
});

describe('sendFollowUp: checks', () => {
  it('404 follow_up_not_found for an unknown follow-up', async () => {
    const d = make({ loadContext: vi.fn().mockResolvedValue(null) });
    expect(await rejection(run(d))).toMatchObject({ status: 404, code: 'follow_up_not_found' });
  });

  it('409 already_sent unless the follow-up is pending review', async () => {
    const d = make({ loadContext: vi.fn().mockResolvedValue(context({ followUp: { status: 'sent' } })) });
    expect(await rejection(run(d))).toMatchObject({ status: 409, code: 'already_sent' });
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it('dismisses the draft and answers not_applicable when the card has moved on', async () => {
    const d = make({ loadContext: vi.fn().mockResolvedValue(context({ application: { status: 'interviewing' } })) });
    expect(await rejection(run(d))).toMatchObject({ status: 409, code: 'not_applicable' });
    expect(d.dismiss).toHaveBeenCalledWith('f1');
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it('answers not_applicable, without dismissing, when there is no sent email to reply to', async () => {
    const d = make({ loadContext: vi.fn().mockResolvedValue(context({ original: null })) });
    expect(await rejection(run(d))).toMatchObject({ status: 409, code: 'not_applicable' });
    expect(d.dismiss).not.toHaveBeenCalled();
  });

  it('409 gmail_not_connected', async () => {
    const d = make({ isGmailConnected: vi.fn().mockResolvedValue(false) });
    expect(await rejection(run(d))).toMatchObject({ status: 409, code: 'gmail_not_connected' });
    expect(d.lock.acquire).not.toHaveBeenCalled();
  });

  it('429 daily_cap_reached when today\'s follow-ups reach the cap', async () => {
    const d = make({ followUpsSentToday: vi.fn().mockResolvedValue(20) });
    expect(await rejection(run(d))).toMatchObject({ status: 429, code: 'daily_cap_reached' });
    const below = make({ followUpsSentToday: vi.fn().mockResolvedValue(19) });
    await expect(run(below)).resolves.toBeUndefined();
  });

  it('409 already_sent when the lock is held, and re-checks after taking it', async () => {
    const held = make({ lock: { acquire: vi.fn().mockResolvedValue(null), release: vi.fn(), extend: vi.fn() } });
    expect(await rejection(run(held))).toMatchObject({ code: 'already_sent' });
    expect(held.lock.release).not.toHaveBeenCalled();

    const raced = make({ loadContext: vi.fn().mockResolvedValueOnce(context()).mockResolvedValueOnce(context({ followUp: { status: 'sent' } })) });
    expect(await rejection(run(raced))).toMatchObject({ code: 'already_sent' });
    expect(raced.sendMessage).not.toHaveBeenCalled();
    expect(raced.lock.release).toHaveBeenCalled();
  });

  it('lets token errors through without logging', async () => {
    const d = make({ getAccessToken: vi.fn().mockRejectedValue(new ApiError(409, 'gmail_reauth_required')) });
    expect(await rejection(run(d))).toMatchObject({ code: 'gmail_reauth_required' });
    expect(d.logEmail).not.toHaveBeenCalled();
    expect(d.lock.release).toHaveBeenCalled();
  });
});

describe('sendFollowUp: failures', () => {
  it.each([
    ['unauthorized', 409, 'gmail_reauth_required'],
    ['rate_limited', 429, 'rate_limited'],
    ['rejected', 502, 'send_failed'],
    ['failed', 502, 'send_failed'],
  ] as const)('maps a %s Gmail failure to %i %s and logs it', async (kind, status, code) => {
    const d = make({ sendMessage: vi.fn().mockRejectedValue(new GmailSendError(kind)) });
    expect(await rejection(run(d))).toMatchObject({ status, code });
    expect(d.markSent).not.toHaveBeenCalled();
    expect(d.logEmail).toHaveBeenCalledWith(expect.objectContaining({ type: 'follow_up', status: 'failed', error: kind }));
    expect(d.markFailed).not.toHaveBeenCalled();
    expect(d.lock.release).toHaveBeenCalled();
  });

  it('marks the follow-up failed when an automatic send fails, so it is not retried forever', async () => {
    const d = make({ sendMessage: vi.fn().mockRejectedValue(new GmailSendError('failed')) });
    await rejection(run(d, true));
    expect(d.markFailed).toHaveBeenCalledWith('f1');
  });
});

describe('sendFollowUp: duplicate-send protections', () => {
  it('refuses with already_sent, without sending, when a sent follow-up log exists (before the lock)', async () => {
    const d = make({ hasSentFollowUpEmail: vi.fn().mockResolvedValue(true) });
    expect(await rejection(run(d))).toMatchObject({ status: 409, code: 'already_sent' });
    expect(d.sendMessage).not.toHaveBeenCalled();
    expect(d.lock.acquire).not.toHaveBeenCalled();
    expect(d.markSent).toHaveBeenCalledWith('f1', 'a1', NOW.toISOString());
    expect(d.hasSentFollowUpEmail).toHaveBeenCalledWith('a1');
  });

  it('re-checks the sent log after taking the lock and releases it', async () => {
    const d = make({ hasSentFollowUpEmail: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true) });
    expect(await rejection(run(d))).toMatchObject({ code: 'already_sent' });
    expect(d.sendMessage).not.toHaveBeenCalled();
    expect(d.lock.release).toHaveBeenCalledWith('followup-lock-f1', 'tok-1');
  });

  it('still answers already_sent when reconciling the status fails', async () => {
    const d = make({ hasSentFollowUpEmail: vi.fn().mockResolvedValue(true), markSent: vi.fn().mockRejectedValue(new Error('db')) });
    expect(await rejection(run(d))).toMatchObject({ code: 'already_sent' });
  });

  it('aborts before Gmail when too much of the lock was spent', async () => {
    const times = [0, 30_000];
    let i = 0;
    const d = make({ now: () => new Date(NOW.getTime() + (times[Math.min(i++, 1)] ?? 0)) });
    expect(await rejection(run(d))).toMatchObject({ status: 502, code: 'send_failed' });
    expect(d.sendMessage).not.toHaveBeenCalled();
    expect(d.lock.release).toHaveBeenCalled();
  });

  it('still marks the follow-up sent when the sent-log write fails, and warns', async () => {
    const warn = vi.fn();
    const d = make({ logEmail: vi.fn().mockRejectedValue(new Error('db')), warn });
    await expect(run(d)).resolves.toBeUndefined();
    expect(d.markSent).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    expect(d.lock.release).toHaveBeenCalled();
  });

  it('keeps the lock and surfaces a safe error when markSent fails after a successful send', async () => {
    const d = make({ markSent: vi.fn().mockRejectedValue(new Error('secret db detail')) });
    const err = await rejection(run(d));
    expect(err).toMatchObject({ status: 502, code: 'send_failed' });
    expect(String((err as Error).message)).not.toContain('secret');
    expect(d.sendMessage).toHaveBeenCalledTimes(1);
    expect(d.lock.release).not.toHaveBeenCalled();
  });
});

describe('sendFollowUp: failure bookkeeping', () => {
  it('does not mask the Gmail error when the failed-log write throws, and still marks failed (auto)', async () => {
    const d = make({ sendMessage: vi.fn().mockRejectedValue(new GmailSendError('rate_limited')), logEmail: vi.fn().mockRejectedValue(new Error('db')) });
    expect(await rejection(run(d, true))).toMatchObject({ status: 429, code: 'rate_limited' });
    expect(d.markFailed).toHaveBeenCalledWith('f1');
    expect(d.lock.release).toHaveBeenCalled();
  });

  it('does not mask the Gmail error when markFailed throws', async () => {
    const d = make({ sendMessage: vi.fn().mockRejectedValue(new GmailSendError('failed')), markFailed: vi.fn().mockRejectedValue(new Error('db')) });
    expect(await rejection(run(d, true))).toMatchObject({ status: 502, code: 'send_failed' });
  });
});

describe('sendFollowUp: automatic sends', () => {
  it('refuses without sending, failing or dismissing when auto follow-up was switched off', async () => {
    const d = make({ autoEnabled: vi.fn().mockResolvedValue(false) });
    expect(await rejection(run(d, true))).toMatchObject({ status: 409, code: 'auto_disabled' });
    expect(d.autoEnabled).toHaveBeenCalledWith('u1');
    expect(d.sendMessage).not.toHaveBeenCalled();
    expect(d.markFailed).not.toHaveBeenCalled();
    expect(d.dismiss).not.toHaveBeenCalled();
  });

  it('re-checks the toggle after taking the lock', async () => {
    const d = make({ autoEnabled: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false) });
    expect(await rejection(run(d, true))).toMatchObject({ code: 'auto_disabled' });
    expect(d.sendMessage).not.toHaveBeenCalled();
    expect(d.lock.release).toHaveBeenCalled();
  });

  it('does not consult the toggle for a manual send', async () => {
    const d = make({ autoEnabled: vi.fn().mockResolvedValue(false) });
    await expect(run(d)).resolves.toBeUndefined();
    expect(d.autoEnabled).not.toHaveBeenCalled();
  });
});

describe('sendFollowUp: lock extension and release', () => {
  it('extends the lock to 24 hours after the reply went out', async () => {
    const d = make();
    await run(d);
    expect(d.lock.extend).toHaveBeenCalledWith('followup-lock-f1', 'tok-1', 86_400);
  });

  it('does not fail when extending the lock fails', async () => {
    const warn = vi.fn();
    const d = make({ warn, lock: { acquire: vi.fn().mockResolvedValue('tok-1'), release: vi.fn(), extend: vi.fn().mockRejectedValue(new Error('redis down')) } });
    await expect(run(d)).resolves.toBeUndefined();
    expect(d.markSent).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('does not extend the lock when Gmail refused the send', async () => {
    const d = make({ sendMessage: vi.fn().mockRejectedValue(new GmailSendError('failed')) });
    await rejection(run(d));
    expect(d.lock.extend).not.toHaveBeenCalled();
  });

  it('keeps the original error when releasing the lock throws', async () => {
    const warn = vi.fn();
    const d = make({ warn, sendMessage: vi.fn().mockRejectedValue(new GmailSendError('failed')), lock: { acquire: vi.fn().mockResolvedValue('tok-1'), release: vi.fn().mockRejectedValue(new Error('redis down')), extend: vi.fn() } });
    expect(await rejection(run(d))).toMatchObject({ status: 502, code: 'send_failed' });
    expect(warn).toHaveBeenCalled();
  });
});
