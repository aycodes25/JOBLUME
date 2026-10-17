export type GmailReturn = { kind: 'connected' } | { kind: 'error'; reason: string };

/** Reads the ?gmail=... result the API appends when it sends the browser back to Settings. */
export function parseGmailReturn(search: string): GmailReturn | null {
  const params = new URLSearchParams(search);
  const result = params.get('gmail');
  if (result === 'connected') return { kind: 'connected' };
  if (result === 'error') return { kind: 'error', reason: params.get('reason') ?? 'unknown' };
  return null;
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
