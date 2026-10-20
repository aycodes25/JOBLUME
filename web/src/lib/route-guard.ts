/** Where the middleware should redirect, or null to continue. */
export function decideRedirect(pathname: string, hasUser: boolean): '/login' | '/queue' | null {
  const onLogin = pathname === '/login';
  if (!hasUser && !onLogin) return '/login';
  if (hasUser && onLogin) return '/queue';
  return null;
}
