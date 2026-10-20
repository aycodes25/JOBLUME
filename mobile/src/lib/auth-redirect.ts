import type { SessionStatus } from './session';

/**
 * Where the auth gate should send the user, or null to stay. Mirrors web/src/lib/route-guard.ts:
 * signed out anywhere but /login goes to /login; signed in on /login goes to /queue. Nothing moves while the session loads.
 */
export function decideAuthRedirect(firstSegment: string | undefined, status: SessionStatus): '/login' | '/queue' | null {
  if (status === 'loading') return null;
  const onLogin = firstSegment === 'login';
  if (status === 'signedOut' && !onLogin) return '/login';
  if (status === 'signedIn' && onLogin) return '/queue';
  return null;
}
