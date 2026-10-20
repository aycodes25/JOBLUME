import { MOBILE_GMAIL_RETURN } from '@joblume/shared';
import { parseGmailReturnUrl, type GmailReturn } from './gmail-return';

/** expo-web-browser's openAuthSessionAsync result, reduced to what we read. */
export type AuthSessionResult = { type: 'success'; url: string } | { type: string };

export interface GmailConnectDeps {
  /** POST /gmail/connect (with the app return target). */
  start(): Promise<{ url: string }>;
  /** Opens the consent page in the in-app browser and resolves when it closes or redirects to `returnUrl`. */
  openAuth(url: string, returnUrl: string): Promise<AuthSessionResult>;
  /** Re-reads GET /gmail/status. */
  refresh(): Promise<void>;
}

/**
 * Connect Gmail from the phone: ask the API for Google's consent URL, open it only if it is https on accounts.google.com,
 * read the joblume://gmail-return result, and always refresh the Gmail status afterwards (Expo Go cannot receive the
 * joblume:// redirect, so the refresh is what shows the new state there).
 */
export async function connectGmail(deps: GmailConnectDeps): Promise<GmailReturn | null> {
  const { url } = await deps.start();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'error', reason: 'unknown' };
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'accounts.google.com') return { kind: 'error', reason: 'unknown' };
  try {
    const result = await deps.openAuth(url, MOBILE_GMAIL_RETURN);
    return result.type === 'success' && 'url' in result ? parseGmailReturnUrl(result.url) : null;
  } finally {
    await deps.refresh();
  }
}
