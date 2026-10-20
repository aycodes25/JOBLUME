import { MOBILE_GMAIL_RETURN } from '@joblume/shared';

export type GmailReturn = { kind: 'connected' } | { kind: 'error'; reason: string };

type Param = string | string[] | undefined;
const first = (v: Param): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Reads the status the API puts on joblume://gmail-return (?status=connected or ?status=error&reason=...). */
export function parseGmailReturn(params: { status?: Param; reason?: Param }): GmailReturn | null {
  const status = first(params.status);
  if (status === 'connected') return { kind: 'connected' };
  if (status === 'error') return { kind: 'error', reason: first(params.reason) || 'unknown' };
  return null;
}

/** The same, from the full redirect URL the in-app browser hands back. Anything that is not our deep link is ignored. */
export function parseGmailReturnUrl(url: string): GmailReturn | null {
  if (!url.startsWith(MOBILE_GMAIL_RETURN)) return null;
  const rest = url.slice(MOBILE_GMAIL_RETURN.length);
  if (rest !== '' && !rest.startsWith('?') && !rest.startsWith('/?')) return null;
  const query = rest.slice(rest.indexOf('?') + 1);
  const params = new URLSearchParams(rest.includes('?') ? query : '');
  return parseGmailReturn({ status: params.get('status') ?? undefined, reason: params.get('reason') ?? undefined });
}

const MESSAGES: Record<string, string> = {
  denied: 'You chose not to allow access. Connect again and allow JobLume to send email.',
  missing_scope: 'JobLume needs permission to send email. Connect again and keep every box ticked.',
  invalid_state: 'The connection link expired. Please start again.',
  no_refresh_token: 'Google did not return a long-lived token. Remove JobLume at myaccount.google.com/permissions and connect again.',
  not_configured: 'Gmail is not set up on this server yet. Follow the Gmail setup guide, then restart the server.',
};

export function describeGmailReason(reason: string): string {
  return MESSAGES[reason] ?? 'Google could not complete the connection. Please try again.';
}
