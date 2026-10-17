import { createHmac, timingSafeEqual } from 'node:crypto';
import type { GmailConfig } from './config.js';

export const GMAIL_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'] as const;
const SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

/** A signing key derived from ENCRYPTION_KEY so the raw key is never used for two purposes. */
const stateKey = (keyHex: string) =>
  createHmac('sha256', Buffer.from(keyHex, 'hex')).update('joblume:gmail-oauth-state').digest();

export function signState(userId: string, keyHex: string, now: number = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, t: now })).toString('base64url');
  const sig = createHmac('sha256', stateKey(keyHex)).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyState(state: unknown, keyHex: string, now: number = Date.now()): { userId: string } | null {
  if (typeof state !== 'string') return null;
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts as [string, string];
  const expected = createHmac('sha256', stateKey(keyHex)).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u?: unknown; t?: unknown };
    if (typeof data.u !== 'string' || typeof data.t !== 'number') return null;
    if (now - data.t > STATE_MAX_AGE_MS || data.t - now > CLOCK_SKEW_MS) return null;
    return { userId: data.u };
  } catch {
    return null;
  }
}

export function buildAuthUrl(cfg: GmailConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export class GmailAuthError extends Error {
  constructor(public readonly code: 'exchange_failed' | 'no_refresh_token' | 'missing_scope' | 'no_email', message?: string) {
    super(message ?? code);
    this.name = 'GmailAuthError';
  }
}

interface TokenResponse {
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

function emailFromIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { email?: unknown };
    return typeof claims.email === 'string' && claims.email.includes('@') ? claims.email : null;
  } catch {
    return null;
  }
}

/** Trade the authorization code for a refresh token. The id token comes straight from Google's token endpoint over TLS. */
export async function exchangeCode(
  cfg: GmailConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ refreshToken: string; email: string }> {
  let data: TokenResponse;
  try {
    const res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new GmailAuthError('exchange_failed');
    const parsed: unknown = await res.json();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new GmailAuthError('exchange_failed');
    data = parsed as TokenResponse;
  } catch {
    throw new GmailAuthError('exchange_failed');
  }
  if (!data.refresh_token) throw new GmailAuthError('no_refresh_token');
  if (!(data.scope ?? '').split(' ').includes(SEND_SCOPE)) throw new GmailAuthError('missing_scope');
  const email = emailFromIdToken(data.id_token);
  if (!email) throw new GmailAuthError('no_email');
  return { refreshToken: data.refresh_token, email: email.toLowerCase() };
}
