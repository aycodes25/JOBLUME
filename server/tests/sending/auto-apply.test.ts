import { describe, expect, it, vi } from 'vitest';
import { AUTO_MIN_CONFIDENCE, AUTO_SOURCES, checkAutoApply, runAutoApplyCheck, type AutoContext } from '../../src/services/sending/auto-apply.js';

const ctx = (over: { application?: Partial<AutoContext['application']>; profile?: Partial<AutoContext['profile']> } & Partial<Omit<AutoContext, 'application' | 'profile'>> = {}): AutoContext => ({
  userId: 'u1',
  jobSource: 'myjobmag',
  gmailConnected: true,
  appliedToday: 0,
  ...over,
  application: { status: 'pending_review', match_score: 85, email_source: 'hunter', email_confidence: 90, hiring_manager_email: 'hr@acme.com', ...over.application },
  profile: { apply_mode: 'auto', auto_threshold: 80, daily_cap: 20, ...over.profile },
});

describe('checkAutoApply', () => {
  it('has the documented sources and confidence floor', () => {
    expect([...AUTO_SOURCES]).toEqual(['remotive', 'myjobmag', 'jobberman']);
    expect(AUTO_MIN_CONFIDENCE).toBe(80);
  });

  it('passes when every condition holds', () => {
    expect(checkAutoApply(ctx())).toEqual({ ok: true });
  });

  it.each(AUTO_SOURCES)('allows the %s source', (jobSource) => {
    expect(checkAutoApply(ctx({ jobSource }))).toEqual({ ok: true });
  });

  it.each([
    ['manual mode', ctx({ profile: { apply_mode: 'manual' } }), 'mode_manual'],
    ['Gmail not connected', ctx({ gmailConnected: false }), 'gmail_not_connected'],
    ['an application no longer pending', ctx({ application: { status: 'approved' } }), 'not_pending'],
    ['LinkedIn', ctx({ jobSource: 'linkedin' }), 'source_not_allowed'],
    ['Indeed', ctx({ jobSource: 'indeed' }), 'source_not_allowed'],
    ['a guessed address', ctx({ application: { email_source: 'guess', email_confidence: 30 } }), 'no_trusted_email'],
    ['a pasted address', ctx({ application: { email_source: 'manual', email_confidence: null } }), 'no_trusted_email'],
    ['a Hunter address below 80', ctx({ application: { email_confidence: 79 } }), 'no_trusted_email'],
    ['an address published in the posting, even at confidence 95', ctx({ application: { email_source: 'posting', email_confidence: 95 } }), 'no_trusted_email'],
    ['no address at all', ctx({ application: { hiring_manager_email: null } }), 'no_trusted_email'],
    ['a score below the threshold', ctx({ application: { match_score: 79 } }), 'score_below_threshold'],
    ['no score', ctx({ application: { match_score: null } }), 'score_below_threshold'],
    ['the daily cap reached', ctx({ appliedToday: 20 }), 'daily_cap_reached'],
  ])('refuses %s', (_n, input, reason) => {
    expect(checkAutoApply(input)).toEqual({ ok: false, reason });
  });

  it('treats the threshold, the confidence floor and the cap boundaries correctly', () => {
    expect(checkAutoApply(ctx({ application: { match_score: 80 } }))).toEqual({ ok: true });
    expect(checkAutoApply(ctx({ application: { email_confidence: 80 } }))).toEqual({ ok: true });
    expect(checkAutoApply(ctx({ appliedToday: 19 }))).toEqual({ ok: true });
    expect(checkAutoApply(ctx({ profile: { daily_cap: 5 }, appliedToday: 5 }))).toEqual({ ok: false, reason: 'daily_cap_reached' });
  });
});

describe('runAutoApplyCheck', () => {
  const make = (loaded: AutoContext | null) => ({
    load: vi.fn<(id: string) => Promise<AutoContext | null>>().mockResolvedValue(loaded),
    enqueueSend: vi.fn<(a: { userId: string; applicationId: string; delayMs: number }) => Promise<void>>().mockResolvedValue(undefined),
    randomDelay: () => 11_000,
  });

  it('queues an automatic send after the random delay when eligible', async () => {
    const d = make(ctx());
    expect(await runAutoApplyCheck('a1', d)).toBe('queued');
    expect(d.enqueueSend).toHaveBeenCalledWith({ userId: 'u1', applicationId: 'a1', delayMs: 11_000 });
  });

  it('returns the reason and queues nothing when not eligible', async () => {
    const d = make(ctx({ profile: { apply_mode: 'manual' } }));
    expect(await runAutoApplyCheck('a1', d)).toBe('mode_manual');
    expect(d.enqueueSend).not.toHaveBeenCalled();
  });

  it('skips an application that cannot be loaded', async () => {
    const d = make(null);
    expect(await runAutoApplyCheck('a1', d)).toBe('skipped');
    expect(d.enqueueSend).not.toHaveBeenCalled();
  });
});
