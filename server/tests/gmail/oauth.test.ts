import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { gmailConfig } from '../../src/services/gmail/config.js';
import {
  buildAuthUrl, exchangeCode, GmailAuthError, GMAIL_SCOPES, signState, verifyState,
} from '../../src/services/gmail/oauth.js';

const KEY = 'ab'.repeat(32);
const OTHER_KEY = 'cd'.repeat(32);
const cfg = { clientId: 'cid', clientSecret: 'csecret', redirectUri: 'http://localhost:4000/gmail/callback' };
const NOW = 1_800_000_000_000;

describe('gmailConfig', () => {
  it('is null unless all three settings are present', () => {
    expect(gmailConfig({})).toBeNull();
    expect(gmailConfig({ GMAIL_CLIENT_ID: 'a', GMAIL_CLIENT_SECRET: 'b' })).toBeNull();
    expect(gmailConfig({ GMAIL_CLIENT_ID: 'a', GMAIL_CLIENT_SECRET: 'b', GMAIL_REDIRECT_URI: 'http://x/cb' })).toEqual({
      clientId: 'a', clientSecret: 'b', redirectUri: 'http://x/cb',
    });
  });
});

describe('state signing', () => {
  it('round-trips the user id', () => {
    expect(verifyState(signState('user-1', KEY, NOW), KEY, NOW + 1000)).toEqual({ userId: 'user-1' });
  });

  it('rejects a state signed with another key', () => {
    expect(verifyState(signState('user-1', OTHER_KEY, NOW), KEY, NOW)).toBeNull();
  });

  it('rejects a tampered payload or signature', () => {
    const [payload, sig] = signState('user-1', KEY, NOW).split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ u: 'user-2', t: NOW })).toString('base64url');
    expect(verifyState(`${forged}.${sig}`, KEY, NOW)).toBeNull();
    expect(verifyState(`${payload}.${sig.slice(0, -2)}AA`, KEY, NOW)).toBeNull();
  });

  it('rejects an expired state (older than 10 minutes) and one from the future', () => {
    const state = signState('user-1', KEY, NOW);
    expect(verifyState(state, KEY, NOW + 10 * 60 * 1000 + 1)).toBeNull();
    expect(verifyState(state, KEY, NOW + 10 * 60 * 1000)).toEqual({ userId: 'user-1' });
    expect(verifyState(signState('user-1', KEY, NOW + 5 * 60 * 1000), KEY, NOW)).toBeNull();
  });

  it.each(['', 'nodots', 'a.b.c', '.', 'x.y'])('rejects malformed state %j', (state) => {
    expect(verifyState(state, KEY, NOW)).toBeNull();
  });

  it('returns null for non-string input instead of throwing', () => {
    expect(verifyState(undefined as never, KEY, NOW)).toBeNull();
    expect(verifyState(['a.b'] as never, KEY, NOW)).toBeNull();
    expect(verifyState(42 as never, KEY, NOW)).toBeNull();
  });

  describe('correctly signed but badly shaped payloads', () => {
    const signRaw = (raw: string) => {
      const payload = Buffer.from(raw).toString('base64url');
      const hmacKey = createHmac('sha256', Buffer.from(KEY, 'hex')).update('joblume:gmail-oauth-state').digest();
      const sig = createHmac('sha256', hmacKey).update(payload).digest('base64url');
      return `${payload}.${sig}`;
    };

    it('rejects a non-string u', () => {
      expect(verifyState(signRaw(JSON.stringify({ u: 5, t: NOW })), KEY, NOW)).toBeNull();
    });

    it('rejects a non-number t', () => {
      expect(verifyState(signRaw(JSON.stringify({ u: 'user-1', t: 'now' })), KEY, NOW)).toBeNull();
    });

    it('rejects a payload that is not JSON', () => {
      expect(verifyState(signRaw('not json'), KEY, NOW)).toBeNull();
    });

    it('accepts the same helper when the payload is valid (sanity check)', () => {
      expect(verifyState(signRaw(JSON.stringify({ u: 'user-1', t: NOW })), KEY, NOW)).toEqual({ userId: 'user-1' });
    });
  });
});

describe('buildAuthUrl', () => {
  it('asks for offline access with the send-only scope and carries the state', () => {
    const url = new URL(buildAuthUrl(cfg, 'STATE123'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('redirect_uri')).toBe(cfg.redirectUri);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('STATE123');
    expect(url.searchParams.get('scope')).toBe(GMAIL_SCOPES.join(' '));
    expect(url.searchParams.get('scope')).toContain('gmail.send');
    expect(url.searchParams.get('scope')).not.toMatch(/readonly|modify|mail\.google\.com/);
  });
});

const idToken = (claims: object) => ['h', Buffer.from(JSON.stringify(claims)).toString('base64url'), 's'].join('.');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const SEND_SCOPE = 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.send';

describe('exchangeCode', () => {
  it('posts the code and returns the refresh token and email', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({ access_token: 'a', refresh_token: 'r', scope: SEND_SCOPE, id_token: idToken({ email: 'me@gmail.com' }) }),
    );
    const out = await exchangeCode(cfg, 'CODE', fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ refreshToken: 'r', email: 'me@gmail.com' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams((init as RequestInit).body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('CODE');
    expect(body.get('client_id')).toBe('cid');
    expect(body.get('client_secret')).toBe('csecret');
    expect(body.get('redirect_uri')).toBe(cfg.redirectUri);
  });

  const run = (response: Response) =>
    exchangeCode(cfg, 'CODE', vi.fn().mockResolvedValue(response) as unknown as typeof fetch);

  it('fails with exchange_failed on an HTTP error', async () => {
    await expect(run(json({ error: 'invalid_grant' }, 400))).rejects.toMatchObject({ code: 'exchange_failed' });
  });

  it('fails with no_refresh_token when Google sends none', async () => {
    await expect(run(json({ access_token: 'a', scope: SEND_SCOPE, id_token: idToken({ email: 'me@gmail.com' }) }))).rejects.toMatchObject({ code: 'no_refresh_token' });
  });

  it('fails with missing_scope when the user did not grant gmail.send', async () => {
    await expect(run(json({ access_token: 'a', refresh_token: 'r', scope: 'openid email', id_token: idToken({ email: 'me@gmail.com' }) }))).rejects.toMatchObject({ code: 'missing_scope' });
  });

  it('fails with no_email when the id token carries no address', async () => {
    await expect(run(json({ access_token: 'a', refresh_token: 'r', scope: SEND_SCOPE, id_token: idToken({}) }))).rejects.toMatchObject({ code: 'no_email' });
    await expect(run(json({ access_token: 'a', refresh_token: 'r', scope: SEND_SCOPE }))).rejects.toBeInstanceOf(GmailAuthError);
  });

  it('fails with exchange_failed on a 200 with a non-JSON body', async () => {
    const p = run(new Response('not json', { status: 200 }));
    await expect(p).rejects.toMatchObject({ code: 'exchange_failed' });
    await expect(run(new Response('not json', { status: 200 }))).rejects.toBeInstanceOf(GmailAuthError);
  });

  it('fails with exchange_failed when the JSON body is not an object', async () => {
    await expect(run(new Response('null', { status: 200 }))).rejects.toMatchObject({ code: 'exchange_failed' });
    await expect(run(new Response('[]', { status: 200 }))).rejects.toMatchObject({ code: 'exchange_failed' });
  });

  it('lower-cases the email', async () => {
    const out = await run(
      json({ access_token: 'a', refresh_token: 'r', scope: SEND_SCOPE, id_token: idToken({ email: 'Me@Gmail.com' }) }),
    );
    expect(out.email).toBe('me@gmail.com');
  });

  it('turns a network failure into exchange_failed', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('offline'));
    await expect(exchangeCode(cfg, 'CODE', fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({ code: 'exchange_failed' });
  });
});
