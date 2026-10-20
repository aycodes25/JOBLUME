import { describe, expect, it } from 'vitest';
import { describeGmailReason, parseGmailReturn } from '@/lib/gmail-return';

describe('parseGmailReturn', () => {
  it('reads a successful return', () => {
    expect(parseGmailReturn('?gmail=connected')).toEqual({ kind: 'connected' });
  });

  it('reads an error with its reason, or unknown when there is none', () => {
    expect(parseGmailReturn('?gmail=error&reason=missing_scope')).toEqual({ kind: 'error', reason: 'missing_scope' });
    expect(parseGmailReturn('?gmail=error')).toEqual({ kind: 'error', reason: 'unknown' });
  });

  it.each(['', '?other=1', '?gmail=maybe'])('returns null for %j', (search) => {
    expect(parseGmailReturn(search)).toBeNull();
  });
});

describe('describeGmailReason', () => {
  it.each([
    ['denied', /not to allow|did not allow|chose not/i],
    ['missing_scope', /permission to send/i],
    ['invalid_state', /expired/i],
    ['no_refresh_token', /permissions/i],
    ['not_configured', /not set up/i],
  ])('explains %s', (reason, pattern) => {
    expect(describeGmailReason(reason)).toMatch(pattern);
  });

  it('falls back to a generic message', () => {
    expect(describeGmailReason('server_error')).toMatch(/could not complete/i);
    expect(describeGmailReason('who-knows')).toMatch(/could not complete/i);
  });
});
