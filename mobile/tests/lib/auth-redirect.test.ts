import { decideAuthRedirect } from '@/lib/auth-redirect';

describe('decideAuthRedirect', () => {
  it.each([
    [undefined, 'signedOut', '/login'],
    ['(tabs)', 'signedOut', '/login'],
    ['application', 'signedOut', '/login'],
    ['gmail-return', 'signedOut', '/login'],
    ['login', 'signedOut', null],
    ['login', 'signedIn', '/queue'],
    ['(tabs)', 'signedIn', null],
    ['onboarding', 'signedIn', null],
    ['login', 'loading', null],
    ['(tabs)', 'loading', null],
  ] as const)('segment %s while %s -> %s', (segment, status, expected) => {
    expect(decideAuthRedirect(segment, status)).toBe(expected);
  });
});
