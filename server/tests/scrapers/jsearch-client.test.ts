import { describe, expect, it, vi } from 'vitest';
import { createJSearchClient, JSearchError } from '../../src/scrapers/jsearch-client.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok = { status: 'OK', request_id: 'r1', data: [{ job_id: 'a', job_title: 'Data Analyst' }] };
const onsite = { query: 'data analyst in Lagos, Nigeria', remote: false };

function client(impl: () => Promise<Response>) {
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(impl);
  return { fetchImpl, api: createJSearchClient({ apiKey: 'SECRET-KEY' }, fetchImpl) };
}

describe('createJSearchClient.search', () => {
  it('searches Nigeria for an on-site query and sends the key only in headers', async () => {
    const { fetchImpl, api } = client(async () => json(ok));
    expect(await api.search(onsite)).toEqual(ok.data);
    const [url, init] = fetchImpl.mock.calls[0]!;
    const u = new URL(String(url));
    expect(u.origin + u.pathname).toBe('https://jsearch.p.rapidapi.com/search');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      query: 'data analyst in Lagos, Nigeria', page: '1', num_pages: '1', date_posted: 'week', country: 'ng',
    });
    expect(String(url)).not.toContain('SECRET-KEY');
    expect(init?.headers).toEqual({ 'x-rapidapi-key': 'SECRET-KEY', 'x-rapidapi-host': 'jsearch.p.rapidapi.com' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('asks for remote jobs without a country', async () => {
    const { fetchImpl, api } = client(async () => json(ok));
    await api.search({ query: 'designer remote', remote: true });
    const u = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(Object.fromEntries(u.searchParams)).toEqual({
      query: 'designer remote', page: '1', num_pages: '1', date_posted: 'week', work_from_home: 'true',
    });
  });

  it('returns an empty list when JSearch really found nothing', async () => {
    const { api } = client(async () => json({ status: 'OK', data: [] }));
    expect(await api.search(onsite)).toEqual([]);
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate_limited'],
    [500, 'failed'],
    [503, 'failed'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    const { api } = client(async () => json({ message: 'nope' }, status));
    await expect(api.search(onsite)).rejects.toMatchObject({ name: 'JSearchError', kind });
  });

  it('maps a timeout to timeout', async () => {
    const { api } = client(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    await expect(api.search(onsite)).rejects.toMatchObject({ name: 'JSearchError', kind: 'timeout' });
  });

  it('maps a network failure to failed and never puts the key in the error', async () => {
    const { api } = client(async () => {
      throw new TypeError('fetch failed for SECRET-KEY');
    });
    const err = await api.search(onsite).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JSearchError);
    expect((err as JSearchError).kind).toBe('failed');
    expect((err as JSearchError).neverSent).toBe(true);
    expect((err as JSearchError).message).not.toContain('SECRET-KEY');
    expect(JSON.stringify(err)).not.toContain('SECRET-KEY');
  });

  it.each([
    ['a body that is not JSON', () => new Response('<html>oops</html>', { status: 200 })],
    ['an empty object', () => json({})],
    ['data that is not a list', () => json({ status: 'OK', data: {} })],
    ['null data', () => json({ status: 'OK', data: null })],
    ['a bare list', () => json([])],
  ])('treats a 200 with %s as malformed, never as no jobs', async (_name, make) => {
    const { api } = client(async () => make());
    await expect(api.search(onsite)).rejects.toMatchObject({ name: 'JSearchError', kind: 'malformed' });
  });

  it('treats a 200 whose status is not OK as failed', async () => {
    const { api } = client(async () => json({ status: 'ERROR', data: [] }));
    await expect(api.search(onsite)).rejects.toMatchObject({ kind: 'failed' });
  });
});
