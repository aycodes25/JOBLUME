import { describe, expect, it, vi } from 'vitest';
import { GmailSendError, sendGmailMessage } from '../../src/services/gmail/send.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const run = (response: Response | Error, args: { threadId?: string } = {}) => {
  const fetchImpl = response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockResolvedValue(response);
  return { fetchImpl, promise: sendGmailMessage({ accessToken: 'TOK', raw: 'RAW', ...args }, fetchImpl as unknown as typeof fetch) };
};

describe('sendGmailMessage', () => {
  it('posts the raw message with the bearer token and returns the ids', async () => {
    const { fetchImpl, promise } = run(json({ id: 'm1', threadId: 't1' }));
    expect(await promise).toEqual({ id: 'm1', threadId: 't1' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer TOK', 'content-type': 'application/json' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ raw: 'RAW' });
  });

  it('includes the thread id when replying', async () => {
    const { fetchImpl, promise } = run(json({ id: 'm1', threadId: 't1' }), { threadId: 't1' });
    await promise;
    expect(JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ raw: 'RAW', threadId: 't1' });
  });

  it.each([
    ['401', json({}, 401), 'unauthorized'],
    ['400', json({ error: { message: 'Invalid To header' } }, 400), 'rejected'],
    ['429', json({}, 429), 'rate_limited'],
    ['403 rate limit', json({ error: { errors: [{ reason: 'userRateLimitExceeded' }] } }, 403), 'rate_limited'],
    ['403 permissions', json({ error: { errors: [{ reason: 'insufficientPermissions' }] } }, 403), 'unauthorized'],
    ['500', json({}, 500), 'failed'],
  ])('maps a %s response to %s', async (_n, response, kind) => {
    await expect(run(response).promise).rejects.toMatchObject({ kind });
  });

  it('maps a network failure to failed', async () => {
    await expect(run(new TypeError('offline')).promise).rejects.toMatchObject({ kind: 'failed' });
  });

  it('treats a response without ids as failed', async () => {
    const err = await run(json({ id: 'm1' })).promise.catch((e) => e);
    expect(err).toBeInstanceOf(GmailSendError);
    expect(err.kind).toBe('failed');
  });
});
