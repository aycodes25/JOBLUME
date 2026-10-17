import { describe, expect, it, vi } from 'vitest';
import type { ApplicationWithJob } from '../../src/api/deps.js';
import { ApiError } from '../../src/lib/errors.js';
import { GmailSendError } from '../../src/services/gmail/send.js';
import { sendApplication, type SendDeps, type SendInput } from '../../src/services/sending/send-application.js';

const NOW = new Date('2026-10-20T10:00:00.000Z');

const app = (over: Partial<ApplicationWithJob> = {}): ApplicationWithJob => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'cv text', tailored_cv_url: 'u1/tailored/j1.pdf',
  cover_letter_text: 'Dear team,\nI would like to apply.', match_score: 85, missing_keywords: [],
  hiring_manager_email: 'hr@acme.com', email_confidence: 90, email_source: 'hunter', email_candidates: [],
  apply_method: null, status: 'pending_review', applied_at: null, follow_up_at: null, created_at: '',
  job: { title: 'Data Analyst', company: 'Acme', location: 'Lagos', source: 'myjobmag', url: 'https://example.com/j', company_domain: null },
  ...over,
});

function make(over: Partial<SendDeps> = {}): SendDeps {
  return {
    loadApplication: vi.fn().mockResolvedValue(app()),
    loadProfile: vi.fn().mockResolvedValue({ daily_cap: 20 }),
    appliedToday: vi.fn().mockResolvedValue(0),
    hasSentApplicationEmail: vi.fn().mockResolvedValue(false),
    isGmailConnected: vi.fn().mockResolvedValue(true),
    getAccessToken: vi.fn().mockResolvedValue({ accessToken: 'TOK', email: 'me@gmail.com' }),
    downloadPdf: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
    sendMessage: vi.fn().mockResolvedValue({ id: 'gm1', threadId: 'th1' }),
    lock: { acquire: vi.fn().mockResolvedValue('tok-1'), release: vi.fn().mockResolvedValue(undefined) },
    saveSent: vi.fn(async (_u: string, _id: string, changes: Record<string, unknown>) => ({ ...app(), ...changes }) as ApplicationWithJob),
    logEmail: vi.fn().mockResolvedValue(undefined),
    now: () => NOW,
    newMessageId: () => '<fixed@gmail.com>',
    ...over,
  };
}

const send = (d: SendDeps, input: Partial<SendInput> = {}) => sendApplication('u1', 'a1', { method: 'email', ...input }, d);
const decode = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8');
const rejection = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

describe('sendApplication: success', () => {
  it('sends the email with the CV attached, marks the application applied and logs it', async () => {
    const d = make();
    const result = await send(d);

    expect(d.lock.acquire).toHaveBeenCalledWith('send-lock-a1', 60);
    expect(d.lock.release).toHaveBeenCalledWith('send-lock-a1', 'tok-1');

    const args = vi.mocked(d.sendMessage).mock.calls[0]![0];
    expect(args.accessToken).toBe('TOK');
    expect(args.threadId).toBeUndefined();
    const message = decode(args.raw);
    expect(message).toMatch(/Subject: Application for Data Analyst/);
    expect(message).toMatch(/To: .*hr@acme\.com/);
    expect(message).toMatch(/From: .*me@gmail\.com/);
    expect(message).toMatch(/Message-ID: <fixed@gmail\.com>/i);
    expect(message).toContain('I would like to apply.');
    expect(message).toContain('CV - Data Analyst.pdf');

    expect(d.saveSent).toHaveBeenCalledWith('u1', 'a1', expect.objectContaining({
      status: 'applied',
      applied_at: '2026-10-20T10:00:00.000Z',
      follow_up_at: '2026-10-23T10:00:00.000Z',
      apply_method: 'email',
      hiring_manager_email: 'hr@acme.com',
      email_source: 'hunter',
      email_confidence: 90,
    }));
    expect(d.logEmail).toHaveBeenCalledWith({
      application_id: 'a1', type: 'application', to_email: 'hr@acme.com', subject: 'Application for Data Analyst',
      gmail_message_id: 'gm1', gmail_thread_id: 'th1', rfc_message_id: '<fixed@gmail.com>', status: 'sent', error: null,
    });
    expect(result.status).toBe('applied');
  });

  it('also sends an approved application', async () => {
    const d = make({ loadApplication: vi.fn().mockResolvedValue(app({ status: 'approved' })) });
    await expect(send(d)).resolves.toMatchObject({ status: 'applied' });
  });
});

describe('sendApplication: checks, in order', () => {
  it('404 for an unknown application, with nothing else touched', async () => {
    const d = make({ loadApplication: vi.fn().mockResolvedValue(null) });
    expect(await rejection(send(d))).toMatchObject({ status: 404, code: 'application_not_found' });
    expect(d.isGmailConnected).not.toHaveBeenCalled();
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it.each(['applied', 'interviewing', 'rejected', 'offer', 'skipped'] as const)('409 already_sent for status %s', async (status) => {
    const d = make({ loadApplication: vi.fn().mockResolvedValue(app({ status })) });
    expect(await rejection(send(d))).toMatchObject({ status: 409, code: 'already_sent' });
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it('409 already_sent when an application email was already logged as sent', async () => {
    const d = make({ hasSentApplicationEmail: vi.fn().mockResolvedValue(true) });
    expect(await rejection(send(d))).toMatchObject({ status: 409, code: 'already_sent' });
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it('409 gmail_not_connected before looking at the recipient, the cap or the lock', async () => {
    const d = make({ isGmailConnected: vi.fn().mockResolvedValue(false), loadApplication: vi.fn().mockResolvedValue(app({ hiring_manager_email: null })) });
    expect(await rejection(send(d))).toMatchObject({ status: 409, code: 'gmail_not_connected' });
    expect(d.appliedToday).not.toHaveBeenCalled();
    expect(d.lock.acquire).not.toHaveBeenCalled();
  });

  it('422 no_recipient when there is no stored or pasted address', async () => {
    const d = make({ loadApplication: vi.fn().mockResolvedValue(app({ hiring_manager_email: null, email_source: null, email_confidence: null })) });
    expect(await rejection(send(d))).toMatchObject({ status: 422, code: 'no_recipient' });
  });

  it('409 guess_not_confirmed for a guessed address unless confirmGuess is true', async () => {
    const guess = app({ hiring_manager_email: 'careers@acme.com', email_source: 'guess', email_confidence: 30 });
    const refused = make({ loadApplication: vi.fn().mockResolvedValue(guess) });
    expect(await rejection(send(refused))).toMatchObject({ status: 409, code: 'guess_not_confirmed' });
    expect(refused.sendMessage).not.toHaveBeenCalled();

    const confirmed = make({ loadApplication: vi.fn().mockResolvedValue(guess) });
    await send(confirmed, { confirmGuess: true });
    expect(confirmed.saveSent).toHaveBeenCalledWith('u1', 'a1', expect.objectContaining({ email_source: 'guess', email_confidence: 30 }));
  });

  it('429 daily_cap_reached at the cap, allowed one below it', async () => {
    const atCap = make({ appliedToday: vi.fn().mockResolvedValue(20) });
    expect(await rejection(send(atCap))).toMatchObject({ status: 429, code: 'daily_cap_reached' });
    expect(atCap.lock.acquire).not.toHaveBeenCalled();

    const below = make({ appliedToday: vi.fn().mockResolvedValue(19) });
    await expect(send(below)).resolves.toBeDefined();
  });

  it('uses the profile daily cap', async () => {
    const d = make({ loadProfile: vi.fn().mockResolvedValue({ daily_cap: 3 }), appliedToday: vi.fn().mockResolvedValue(3) });
    expect(await rejection(send(d))).toMatchObject({ code: 'daily_cap_reached' });
  });

  it('409 already_sent when the lock is held, without releasing a lock it never took', async () => {
    const d = make({ lock: { acquire: vi.fn().mockResolvedValue(null), release: vi.fn() } });
    expect(await rejection(send(d))).toMatchObject({ status: 409, code: 'already_sent' });
    expect(d.lock.release).not.toHaveBeenCalled();
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it('re-checks the application after taking the lock', async () => {
    const d = make({ loadApplication: vi.fn().mockResolvedValueOnce(app()).mockResolvedValueOnce(app({ status: 'applied' })) });
    expect(await rejection(send(d))).toMatchObject({ code: 'already_sent' });
    expect(d.sendMessage).not.toHaveBeenCalled();
    expect(d.lock.release).toHaveBeenCalledWith('send-lock-a1', 'tok-1');
  });
});

describe('sendApplication: recipient', () => {
  it('uses a pasted address and records it as manual with no confidence', async () => {
    const d = make();
    await send(d, { to: 'jane@acme.com' });
    expect(decode(vi.mocked(d.sendMessage).mock.calls[0]![0].raw)).toMatch(/To: .*jane@acme\.com/);
    expect(d.saveSent).toHaveBeenCalledWith('u1', 'a1', expect.objectContaining({ hiring_manager_email: 'jane@acme.com', email_source: 'manual', email_confidence: null }));
  });

  it('keeps the original source when the pasted address equals the stored one', async () => {
    const d = make();
    await send(d, { to: 'HR@acme.com' });
    expect(d.saveSent).toHaveBeenCalledWith('u1', 'a1', expect.objectContaining({ email_source: 'hunter', email_confidence: 90 }));
  });

  it('rejects a comma-separated pasted address with 400', async () => {
    const d = make();
    expect(await rejection(send(d, { to: 'a@x.com, evil@y.com' }))).toMatchObject({ status: 400, code: 'invalid_request' });
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it('422 no_recipient when the stored address is a comma-separated list, and nothing is sent', async () => {
    const d = make({ loadApplication: vi.fn().mockResolvedValue(app({ hiring_manager_email: 'a@x.com, evil@y.com' })) });
    expect(await rejection(send(d))).toMatchObject({ status: 422, code: 'no_recipient' });
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects an invalid pasted address with 400', async () => {
    const d = make();
    expect(await rejection(send(d, { to: 'not-an-email' }))).toMatchObject({ status: 400, code: 'invalid_request' });
    expect(d.sendMessage).not.toHaveBeenCalled();
  });
});

describe('sendApplication: content and failures', () => {
  it('422 empty_message without a cover letter, 409 cv_not_ready without a PDF', async () => {
    const noLetter = make({ loadApplication: vi.fn().mockResolvedValue(app({ cover_letter_text: '   ' })) });
    expect(await rejection(send(noLetter))).toMatchObject({ status: 422, code: 'empty_message' });
    const noCv = make({ loadApplication: vi.fn().mockResolvedValue(app({ tailored_cv_url: null })) });
    expect(await rejection(send(noCv))).toMatchObject({ status: 409, code: 'cv_not_ready' });
  });

  it('502 send_failed and the lock released when the PDF cannot be loaded', async () => {
    const d = make({ downloadPdf: vi.fn().mockRejectedValue(new Error('storage down')) });
    expect(await rejection(send(d))).toMatchObject({ status: 502, code: 'send_failed' });
    expect(d.sendMessage).not.toHaveBeenCalled();
    expect(d.lock.release).toHaveBeenCalled();
  });

  it('lets token errors through without logging a failed email', async () => {
    const d = make({ getAccessToken: vi.fn().mockRejectedValue(new ApiError(409, 'gmail_reauth_required')) });
    expect(await rejection(send(d))).toMatchObject({ code: 'gmail_reauth_required' });
    expect(d.logEmail).not.toHaveBeenCalled();
    expect(d.lock.release).toHaveBeenCalled();
  });

  it.each([
    ['unauthorized', 409, 'gmail_reauth_required'],
    ['rate_limited', 429, 'rate_limited'],
    ['rejected', 502, 'send_failed'],
    ['failed', 502, 'send_failed'],
  ] as const)('maps a %s Gmail failure to %i %s, logs it and leaves the application alone', async (kind, status, code) => {
    const d = make({ sendMessage: vi.fn().mockRejectedValue(new GmailSendError(kind)) });
    expect(await rejection(send(d))).toMatchObject({ status, code });
    expect(d.saveSent).not.toHaveBeenCalled();
    expect(d.logEmail).toHaveBeenCalledWith(expect.objectContaining({ application_id: 'a1', type: 'application', status: 'failed', error: kind, gmail_message_id: null }));
    expect(d.lock.release).toHaveBeenCalledWith('send-lock-a1', 'tok-1');
  });

  it('answers 404 if the application disappears after the email went out (the sent log remains)', async () => {
    const d = make({ saveSent: vi.fn().mockResolvedValue(null) });
    expect(await rejection(send(d))).toMatchObject({ status: 404 });
    expect(d.logEmail).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
  });
});

describe('sendApplication: lost writes, expired locks and re-checks', () => {
  const sentRow = expect.objectContaining({ status: 'sent' });
  const logRejectingForSent = () =>
    vi.fn(async (row: { status: string }) => {
      if (row.status === 'sent') throw new Error('db down');
    });

  it('still saves the application, warns and releases the lock when the sent log cannot be written', async () => {
    const warn = vi.fn();
    const d = make({ logEmail: logRejectingForSent(), warn });
    const result = await send(d);
    expect(d.logEmail).toHaveBeenCalledWith(sentRow);
    expect(d.saveSent).toHaveBeenCalled();
    expect(result.status).toBe('applied');
    expect(warn).toHaveBeenCalledWith('sent log could not be written', { applicationId: 'a1' });
    expect(d.lock.release).toHaveBeenCalledWith('send-lock-a1', 'tok-1');
  });

  it('propagates a saveSent failure and keeps the lock so a quick second click cannot resend', async () => {
    const d = make({ saveSent: vi.fn().mockRejectedValue(new Error('db down')) });
    expect(await rejection(send(d))).toMatchObject({ message: 'db down' });
    expect(d.sendMessage).toHaveBeenCalledTimes(1);
    expect(d.lock.release).not.toHaveBeenCalled();
  });

  it('propagates a saveSent failure and keeps the lock when the sent log also failed', async () => {
    const d = make({ logEmail: logRejectingForSent(), saveSent: vi.fn().mockRejectedValue(new Error('db down')), warn: vi.fn() });
    expect(await rejection(send(d))).toMatchObject({ message: 'db down' });
    expect(d.lock.release).not.toHaveBeenCalled();
  });

  it('still maps the Gmail error when the failed log cannot be written either', async () => {
    const d = make({
      sendMessage: vi.fn().mockRejectedValue(new GmailSendError('rate_limited')),
      logEmail: vi.fn().mockRejectedValue(new Error('db down')),
      warn: vi.fn(),
    });
    expect(await rejection(send(d))).toMatchObject({ status: 429, code: 'rate_limited' });
    expect(d.warn).toHaveBeenCalled();
    expect(d.lock.release).toHaveBeenCalledWith('send-lock-a1', 'tok-1');
  });

  it('does not send when the lock is nearly expired', async () => {
    let calls = 0;
    const d = make({ now: () => new Date(NOW.getTime() + (calls++ === 0 ? 0 : 40_000)) });
    expect(await rejection(send(d))).toMatchObject({ status: 502, code: 'send_failed' });
    expect(d.sendMessage).not.toHaveBeenCalled();
    expect(d.lock.release).toHaveBeenCalledWith('send-lock-a1', 'tok-1');
  });

  it('resolves the recipient again from the re-checked application', async () => {
    const guess = app({ hiring_manager_email: 'careers@acme.com', email_source: 'guess', email_confidence: 30 });
    const d = make({ loadApplication: vi.fn().mockResolvedValueOnce(app()).mockResolvedValueOnce(guess) });
    expect(await rejection(send(d))).toMatchObject({ status: 409, code: 'guess_not_confirmed' });
    expect(d.sendMessage).not.toHaveBeenCalled();
    expect(d.lock.release).toHaveBeenCalledWith('send-lock-a1', 'tok-1');
  });
});

describe('sendApplication: auto method', () => {
  it('accepts a Hunter address with confidence exactly 80', async () => {
    const d = make({ loadApplication: vi.fn().mockResolvedValue(app({ email_confidence: 80 })) });
    await expect(send(d, { method: 'auto' })).resolves.toMatchObject({ status: 'applied' });
  });

  it('records apply_method auto for a Hunter address with confidence 80 or more', async () => {
    const d = make();
    await send(d, { method: 'auto' });
    expect(d.saveSent).toHaveBeenCalledWith('u1', 'a1', expect.objectContaining({ apply_method: 'auto' }));
  });

  it.each([
    ['a guess', { hiring_manager_email: 'careers@acme.com', email_source: 'guess' as const, email_confidence: 30 }],
    ['a manual address', { hiring_manager_email: 'jane@acme.com', email_source: 'manual' as const, email_confidence: null }],
    ['a low-confidence Hunter address', { email_confidence: 79 }],
  ])('refuses to auto-send to %s', async (_n, over) => {
    const d = make({ loadApplication: vi.fn().mockResolvedValue(app(over)) });
    expect(await rejection(send(d, { method: 'auto', confirmGuess: true }))).toMatchObject({ status: 409, code: 'not_auto_eligible' });
    expect(d.sendMessage).not.toHaveBeenCalled();
  });
});
