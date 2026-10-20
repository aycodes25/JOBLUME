import { describeGmailReason, parseGmailReturn, parseGmailReturnUrl } from '@/lib/gmail-return';

describe('parseGmailReturn', () => {
  it('reads a successful return', () => {
    expect(parseGmailReturn({ status: 'connected' })).toEqual({ kind: 'connected' });
  });

  it('reads an error with its reason, or unknown when there is none', () => {
    expect(parseGmailReturn({ status: 'error', reason: 'missing_scope' })).toEqual({ kind: 'error', reason: 'missing_scope' });
    expect(parseGmailReturn({ status: 'error' })).toEqual({ kind: 'error', reason: 'unknown' });
  });

  it('takes the first value of a repeated parameter', () => {
    expect(parseGmailReturn({ status: ['error', 'connected'], reason: ['denied', 'x'] })).toEqual({ kind: 'error', reason: 'denied' });
  });

  it.each([{}, { status: 'maybe' }, { status: undefined }])('returns null for %j', (params) => {
    expect(parseGmailReturn(params)).toBeNull();
  });
});

describe('parseGmailReturnUrl', () => {
  it('reads the deep link the server redirects to', () => {
    expect(parseGmailReturnUrl('joblume://gmail-return?status=connected')).toEqual({ kind: 'connected' });
    expect(parseGmailReturnUrl('joblume://gmail-return?status=error&reason=denied')).toEqual({ kind: 'error', reason: 'denied' });
    expect(parseGmailReturnUrl('joblume://gmail-return/?status=connected')).toEqual({ kind: 'connected' });
  });

  it.each([
    'https://evil.example/?status=connected',
    'joblume://other?status=connected',
    'joblume://gmail-returnx?status=connected',
    'joblume://gmail-return',
  ])('ignores %s', (url) => {
    expect(parseGmailReturnUrl(url)).toBeNull();
  });
});

describe('describeGmailReason', () => {
  it.each([
    ['denied', /chose not/i],
    ['missing_scope', /permission to send/i],
    ['invalid_state', /expired/i],
    ['no_refresh_token', /permissions/i],
    ['not_configured', /not set up/i],
  ])('explains %s', (reason, pattern) => {
    expect(describeGmailReason(reason)).toMatch(pattern);
  });

  it('falls back to a generic message', () => {
    expect(describeGmailReason('server_error')).toMatch(/could not complete/i);
  });
});
