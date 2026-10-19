import { LINK_SOURCES } from '@joblume/shared';
import { describe, expect, it } from 'vitest';
import { AUTO_SOURCES, checkAutoApply, type AutoContext } from '../../src/services/sending/auto-apply.js';

const ctx = (jobSource: string): AutoContext => ({
  userId: 'u1',
  jobSource,
  application: { status: 'pending_review', match_score: 99, email_source: 'hunter', email_confidence: 99, hiring_manager_email: 'hr@acme.com' },
  profile: { apply_mode: 'auto', auto_threshold: 50, daily_cap: 20 },
  gmailConnected: true,
  appliedToday: 0,
});

describe('Auto mode never sends LinkedIn or Indeed jobs', () => {
  it.each(LINK_SOURCES)('does not list %s as an auto source', (source) => {
    expect(AUTO_SOURCES as readonly string[]).not.toContain(source);
  });

  it.each(LINK_SOURCES)('refuses a %s job even when every other rule passes', (source) => {
    expect(checkAutoApply(ctx(source))).toEqual({ ok: false, reason: 'source_not_allowed' });
  });

  it('still allows a board source with the same context', () => {
    expect(checkAutoApply(ctx('myjobmag'))).toEqual({ ok: true });
  });
});
