import { describe, expect, it, vi } from 'vitest';
import { decrypt } from '../../src/lib/crypto.js';
import { createGmailTokens, type GmailTokenStore } from '../../src/services/gmail/tokens.js';

const KEY = 'ab'.repeat(32);
const cfg = { clientId: 'cid', clientSecret: 'csecret', redirectUri: 'http://localhost:4000/gmail/callback' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeStore(initial: { encryptedToken: string | null; email: string | null } = { encryptedToken: null, email: null }) {
  let row = { ...initial, connectedAt: null as string | null };
  const store: GmailTokenStore = {
    get: vi.fn(async () => ({ encryptedToken: row.encryptedToken, email: row.email })),
    save: vi.fn(async (_u, v) => { row = { encryptedToken: v.encryptedToken, email: v.email, connectedAt: v.connectedAt }; }),
    clear: vi.fn(async () => { row = { encryptedToken: null, email: null, connectedAt: null }; }),
  };
  return { store, row: () => row };
}

function make(over: { cfg?: typeof cfg | null; fetchImpl?: ReturnType<typeof vi.fn>; now?: () => number } = {}) {
  const { store, row } = fakeStore();
  const fetchImpl = over.fetchImpl ?? vi.fn();
  let clock = 1_800_000_000_000;
  const tokens = createGmailTokens({
    store,
    cfg: over.cfg === undefined ? cfg : over.cfg,
    encryptionKey: KEY,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: over.now ?? (() => clock),
  });
  return { tokens, store, row, fetchImpl, advance: (ms: number) => { clock += ms; } };
}

describe('connect and status', () => {
  it('stores the refresh token encrypted, with the address and connection time', async () => {
    const { tokens, row } = make();
    await tokens.connect('u1', { refreshToken: 'REFRESH', email: 'me@gmail.com' });
    const saved = row();
    expect(saved.encryptedToken).not.toBeNull();
    expect(saved.encryptedToken).not.toContain('REFRESH');
    expect(decrypt(saved.encryptedToken!, KEY)).toBe('REFRESH');
    expect(saved.email).toBe('me@gmail.com');
    expect(saved.connectedAt).toBe(new Date(1_800_000_000_000).toISOString());
  });

  it('refuses to connect when Gmail is not configured', async () => {
    const { tokens } = make({ cfg: null });
    await expect(tokens.connect('u1', { refreshToken: 'r', email: 'a@b.c' })).rejects.toMatchObject({ status: 503, code: 'gmail_not_configured' });
  });

  it('reports configured, connected and the address', async () => {
    const { tokens } = make();
    expect(await tokens.status('u1')).toEqual({ configured: true, connected: false, email: null });
    expect(await tokens.isConnected('u1')).toBe(false);
    await tokens.connect('u1', { refreshToken: 'r', email: 'me@gmail.com' });
    expect(await tokens.status('u1')).toEqual({ configured: true, connected: true, email: 'me@gmail.com' });
    expect(await tokens.isConnected('u1')).toBe(true);
  });

  it('reports configured false when the settings are missing', async () => {
    expect(await make({ cfg: null }).tokens.status('u1')).toEqual({ configured: false, connected: false, email: null });
  });
});

describe('getAccessToken', () => {
  it('fails with gmail_not_connected when nothing is stored', async () => {
    const { tokens } = make();
    await expect(tokens.getAccessToken('u1')).rejects.toMatchObject({ status: 409, code: 'gmail_not_connected' });
  });

  it('exchanges the refresh token and returns the access token and address', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ access_token: 'ACCESS', expires_in: 3600 }));
    const { tokens } = make({ fetchImpl });
    await tokens.connect('u1', { refreshToken: 'REFRESH', email: 'me@gmail.com' });
    expect(await tokens.getAccessToken('u1')).toEqual({ accessToken: 'ACCESS', email: 'me@gmail.com' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams((init as RequestInit).body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('REFRESH');
    expect(body.get('client_id')).toBe('cid');
    expect(body.get('client_secret')).toBe('csecret');
  });

  it('caches the access token until shortly before it expires', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => json({ access_token: 'ACCESS', expires_in: 3600 }));
    const { tokens, advance } = make({ fetchImpl });
    await tokens.connect('u1', { refreshToken: 'r', email: 'me@gmail.com' });
    await tokens.getAccessToken('u1');
    await tokens.getAccessToken('u1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    advance(3600_000 - 30_000);
    await tokens.getAccessToken('u1');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('on invalid_grant clears the stored token and asks the user to reconnect', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: 'invalid_grant' }, 400));
    const { tokens, store } = make({ fetchImpl });
    await tokens.connect('u1', { refreshToken: 'r', email: 'me@gmail.com' });
    await expect(tokens.getAccessToken('u1')).rejects.toMatchObject({ status: 409, code: 'gmail_reauth_required' });
    expect(store.clear).toHaveBeenCalledWith('u1');
    await expect(tokens.getAccessToken('u1')).rejects.toMatchObject({ code: 'gmail_not_connected' });
  });

  it('answers send_failed for any other Google error, and for a network failure, without clearing the token', async () => {
    const refused = make({ fetchImpl: vi.fn().mockResolvedValue(json({ error: 'invalid_client' }, 401)) });
    await refused.tokens.connect('u1', { refreshToken: 'r', email: 'a@b.c' });
    await expect(refused.tokens.getAccessToken('u1')).rejects.toMatchObject({ status: 502, code: 'send_failed' });
    expect(refused.store.clear).not.toHaveBeenCalled();

    const offline = make({ fetchImpl: vi.fn().mockRejectedValue(new TypeError('offline')) });
    await offline.tokens.connect('u1', { refreshToken: 'r', email: 'a@b.c' });
    await expect(offline.tokens.getAccessToken('u1')).rejects.toMatchObject({ status: 502, code: 'send_failed' });
  });

  it('treats an unreadable stored token as a reconnect request', async () => {
    const { tokens, store } = make();
    await store.save('u1', { encryptedToken: 'garbage', email: 'a@b.c', connectedAt: 'x' });
    await expect(tokens.getAccessToken('u1')).rejects.toMatchObject({ code: 'gmail_reauth_required' });
    expect(store.clear).toHaveBeenCalledWith('u1');
  });

  it('refuses when Gmail is not configured', async () => {
    await expect(make({ cfg: null }).tokens.getAccessToken('u1')).rejects.toMatchObject({ status: 503, code: 'gmail_not_configured' });
  });
});

describe('disconnect', () => {
  it('revokes the token at Google and clears it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const { tokens, store } = make({ fetchImpl });
    await tokens.connect('u1', { refreshToken: 'REFRESH', email: 'me@gmail.com' });
    await tokens.disconnect('u1');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://oauth2.googleapis.com/revoke');
    expect(new URLSearchParams((init as RequestInit).body as string).get('token')).toBe('REFRESH');
    expect(store.clear).toHaveBeenCalledWith('u1');
  });

  it('clears the token even when the revoke call fails', async () => {
    const { tokens, store } = make({ fetchImpl: vi.fn().mockRejectedValue(new TypeError('offline')) });
    await tokens.connect('u1', { refreshToken: 'r', email: 'a@b.c' });
    await expect(tokens.disconnect('u1')).resolves.toBeUndefined();
    expect(store.clear).toHaveBeenCalledWith('u1');
  });

  it('does nothing when there is no connection', async () => {
    const { tokens, fetchImpl, store } = make();
    await tokens.disconnect('u1');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
  });
});
