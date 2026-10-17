import type { Env } from '../../lib/env.js';

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** The OAuth client settings, or null when Gmail is not configured (the feature then answers gmail_not_configured). */
export function gmailConfig(
  env: Partial<Pick<Env, 'GMAIL_CLIENT_ID' | 'GMAIL_CLIENT_SECRET' | 'GMAIL_REDIRECT_URI'>>,
): GmailConfig | null {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REDIRECT_URI) return null;
  return { clientId: env.GMAIL_CLIENT_ID, clientSecret: env.GMAIL_CLIENT_SECRET, redirectUri: env.GMAIL_REDIRECT_URI };
}
