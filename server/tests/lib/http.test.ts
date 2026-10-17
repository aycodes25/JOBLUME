import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError, fetchText, pickUserAgent, randomBetween, USER_AGENTS } from '../../src/lib/http.js';

afterEach(() => vi.unstubAllGlobals());

describe('helpers', () => {
  it('pickUserAgent picks by the random value', () => {
    expect(pickUserAgent(() => 0)).toBe(USER_AGENTS[0]);
    expect(pickUserAgent(() => 0.999)).toBe(USER_AGENTS[USER_AGENTS.length - 1]);
  });

  it('randomBetween stays within [min, max)', () => {
    expect(randomBetween(1000, 3000, () => 0)).toBe(1000);
    expect(randomBetween(1000, 3000, () => 0.9999)).toBe(2999);
  });
});

describe('fetchText', () => {
  it('returns the body and sends a rotating user agent', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('hello', { status: 200 }));
    vi.stubGlobal('fetch', fn);
    expect(await fetchText('https://example.com')).toBe('hello');
    const headers = (fn.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(USER_AGENTS).toContain(headers['user-agent']);
  });

  it('retries on 429 then succeeds', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fn);
    expect(await fetchText('https://example.com', { backoffMs: 1 })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws HttpError immediately on 404 without retrying', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fn);
    await expect(fetchText('https://example.com', { backoffMs: 1 })).rejects.toMatchObject({ status: 404 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retry budget on persistent 500s', async () => {
    const fn = vi.fn().mockImplementation(async () => new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fn);
    await expect(fetchText('https://example.com', { retries: 2, backoffMs: 1 })).rejects.toBeInstanceOf(HttpError);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('fetchText body cleanup', () => {
  it('cancels the response body on a non-OK status', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start() {}, cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 404 })));
    await expect(fetchText('https://example.com', { backoffMs: 1 })).rejects.toMatchObject({ status: 404 });
    expect(cancel).toHaveBeenCalled();
  });
});
