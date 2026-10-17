import { describe, expect, it, vi } from 'vitest';
import { createGmailService } from '../../src/services/gmail/service.js';
import { signState } from '../../src/services/gmail/oauth.js';

const KEY = 'ab'.repeat(32);
const cfg = { clientId: 'cid', clientSecret: 'csecret', redirectUri: 'http://localhost:4000/gmail/callback' };
const NOW = 1_800_000_000_000;
const SEND_SCOPE = 'openid email https://www.googleapis.com/auth/gmail.send';
const idToken = (email: string) => ['h', Buffer.from(JSON.stringify({ email })).toString('base64url'), 's'].join('.');
const tokenResponse = (over: object = {}) =>
  new Response(JSON.stringify({ access_token: 'a', refresh_token: 'REFRESH', scope: SEND_SCOPE, id_token: idToken('me@gmail.com'), ...over }));

function make(over: { cfg?: typeof cfg | null; fetchImpl?: ReturnType<typeof vi.fn> } = {}) {
  const tokens = { connect: vi.fn().mockResolvedValue(undefined), status: vi.fn(), disconnect: vi.fn().mockResolvedValue(undefined) };
  const service = createGmailService({
    cfg: over.cfg === undefined ? cfg : over.cfg,
    tokens: tokens as never,
    encryptionKey: KEY,
    fetchImpl: (over.fetchImpl ?? vi.fn().mockResolvedValue(tokenResponse())) as unknown as typeof fetch,
    now: () => NOW,
  });
  return { service, tokens };
}

describe('startConnect', () => {
  it('returns a Google URL carrying a state that names the user', () => {
    const { service } = make();
    const url = new URL(service.startConnect('user-1'));
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('state')).toBe(signState('user-1', KEY, NOW));
  });

  it('answers 503 gmail_not_configured without settings', () => {
    expect(() => make({ cfg: null }).service.startConnect('u')).toThrowError(expect.objectContaining({ status: 503, code: 'gmail_not_configured' }));
  });
});

describe('finishConnect', () => {
  it('stores the connection for the user named in a valid state', async () => {
    const { service, tokens } = make();
    const result = await service.finishConnect({ code: 'CODE', state: signState('user-1', KEY, NOW) });
    expect(result).toEqual({ ok: true });
    expect(tokens.connect).toHaveBeenCalledWith('user-1', { refreshToken: 'REFRESH', email: 'me@gmail.com' });
  });

  it('reports denied when Google sent an error', async () => {
    const { service, tokens } = make();
    expect(await service.finishConnect({ error: 'access_denied', state: signState('u', KEY, NOW) })).toEqual({ ok: false, reason: 'denied' });
    expect(tokens.connect).not.toHaveBeenCalled();
  });

  it.each([
    ['no code', { state: signState('u', KEY, NOW) }],
    ['no state', { code: 'c' }],
    ['a forged state', { code: 'c', state: 'x.y' }],
    ['an expired state', { code: 'c', state: signState('u', KEY, NOW - 11 * 60 * 1000) }],
  ])('rejects %s as invalid_state without contacting Google', async (_n, input) => {
    const fetchImpl = vi.fn();
    const { service, tokens } = make({ fetchImpl });
    expect(await service.finishConnect(input)).toEqual({ ok: false, reason: 'invalid_state' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(tokens.connect).not.toHaveBeenCalled();
  });

  it('passes through the reason when the exchange fails', async () => {
    const { service, tokens } = make({ fetchImpl: vi.fn().mockResolvedValue(tokenResponse({ scope: 'openid email' })) });
    expect(await service.finishConnect({ code: 'c', state: signState('u', KEY, NOW) })).toEqual({ ok: false, reason: 'missing_scope' });
    expect(tokens.connect).not.toHaveBeenCalled();
  });

  it('reports not_configured without settings', async () => {
    expect(await make({ cfg: null }).service.finishConnect({ code: 'c', state: 's' })).toEqual({ ok: false, reason: 'not_configured' });
  });
});

describe('status and disconnect', () => {
  it('delegate to the token layer', async () => {
    const { service, tokens } = make();
    tokens.status.mockResolvedValue({ configured: true, connected: true, email: 'me@gmail.com' });
    expect(await service.status('u1')).toEqual({ configured: true, connected: true, email: 'me@gmail.com' });
    await service.disconnect('u1');
    expect(tokens.disconnect).toHaveBeenCalledWith('u1');
  });
});
