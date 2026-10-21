import { describe, expect, it, vi } from 'vitest';
import { createJSearchClient, extractJobs, JSearchError, jsearchUrl } from '../../src/scrapers/jsearch-client.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok = { status: 'OK', request_id: 'r1', data: [{ job_id: 'a', job_title: 'Data Analyst' }] };
const onsite = { query: 'data analyst in Lagos, Nigeria', remote: false };

function client(impl: () => Promise<Response>) {
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(impl);
  return { fetchImpl, api: createJSearchClient({ apiKey: 'SECRET-KEY', searchPath: '/search' }, fetchImpl) };
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

describe('createJSearchClient network failures', () => {
  const sysError = (code: string, extra: Record<string, unknown> = {}) =>
    Object.assign(new Error(`connect failed ${code}`), { code, ...extra });
  const fetchFailed = (cause: unknown) => new TypeError('fetch failed', { cause });

  function withLog(impl: () => Promise<Response>) {
    const log = { warn: vi.fn() };
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(impl);
    return { log, api: createJSearchClient({ apiKey: 'SECRET-KEY', log, searchPath: '/search' }, fetchImpl) };
  }

  it.each(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED'])(
    'keeps the cause code %s on the error',
    async (code) => {
      const { api } = withLog(async () => {
        throw fetchFailed(sysError(code, { syscall: 'getaddrinfo', hostname: 'jsearch.p.rapidapi.com' }));
      });
      const err = (await api.search(onsite).catch((e: unknown) => e)) as JSearchError;
      expect(err).toBeInstanceOf(JSearchError);
      expect(err.kind).toBe('failed');
      expect(err.neverSent).toBe(true);
      expect(err.networkCode).toBe(code);
      expect(err.message).toBe('Could not reach JSearch');
    },
  );

  it('finds the code inside an AggregateError cause', async () => {
    const { api } = withLog(async () => {
      throw fetchFailed(Object.assign(new AggregateError([sysError('ECONNREFUSED')], 'multi'), {}));
    });
    const err = (await api.search(onsite).catch((e: unknown) => e)) as JSearchError;
    expect(err.networkCode).toBe('ECONNREFUSED');
  });

  it('has no networkCode when the error carries no cause code', async () => {
    const { api } = withLog(async () => {
      throw new TypeError('fetch failed');
    });
    const err = (await api.search(onsite).catch((e: unknown) => e)) as JSearchError;
    expect(err.networkCode).toBeUndefined();
  });

  it('ignores a code that is not a plain code word (never a URL or key)', async () => {
    const { api } = withLog(async () => {
      throw fetchFailed(sysError('https://jsearch.p.rapidapi.com/search?x=SECRET-KEY'));
    });
    const err = (await api.search(onsite).catch((e: unknown) => e)) as JSearchError;
    expect(err.networkCode).toBeUndefined();
    expect(JSON.stringify(err)).not.toContain('SECRET-KEY');
  });

  it('logs the cause at warn without the key, URL query or headers', async () => {
    const { api, log } = withLog(async () => {
      throw fetchFailed(sysError('ENOTFOUND', { syscall: 'getaddrinfo', hostname: 'jsearch.p.rapidapi.com' }));
    });
    await api.search(onsite).catch(() => undefined);
    expect(log.warn).toHaveBeenCalledTimes(1);
    const [obj, msg] = log.warn.mock.calls[0]! as [object, string];
    expect(msg).toBe('JSearch could not be reached');
    expect(obj).toMatchObject({ source: 'jsearch', networkCode: 'ENOTFOUND', cause: { code: 'ENOTFOUND', syscall: 'getaddrinfo', hostname: 'jsearch.p.rapidapi.com' } });
    const text = JSON.stringify(obj);
    expect(text).not.toContain('SECRET-KEY');
    expect(text).not.toContain('x-rapidapi-key');
    expect(text).not.toContain('query=');
  });

  it('scrubs the key from a logged cause message', async () => {
    const { api, log } = withLog(async () => {
      throw fetchFailed(Object.assign(new Error('boom SECRET-KEY'), { code: 'ECONNRESET' }));
    });
    await api.search(onsite).catch(() => undefined);
    expect(JSON.stringify(log.warn.mock.calls[0]![0])).not.toContain('SECRET-KEY');
  });
});

describe('createJSearchClient HTTP diagnostics', () => {
  function withLog(impl: () => Promise<Response>, extra: { provider?: 'rapidapi' | 'openwebninja' } = {}) {
    const log = { warn: vi.fn() };
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(impl);
    return { log, fetchImpl, api: createJSearchClient({ apiKey: 'SECRET-KEY', log, searchPath: '/search', ...extra }, fetchImpl) };
  }

  it('keeps the error message fixed, adds httpStatus and logs a short body snippet with the path only', async () => {
    const { api, log } = withLog(async () => json({ message: 'Endpoint does not exist SECRET-KEY' }, 404));
    const err = await api.search(onsite).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JSearchError);
    expect((err as JSearchError).message).toBe('JSearch answered 404');
    expect((err as JSearchError).httpStatus).toBe(404);
    expect((err as JSearchError).neverSent).toBe(false);
    expect(log.warn).toHaveBeenCalledTimes(1);
    const [obj, msg] = log.warn.mock.calls[0]! as [Record<string, unknown>, string];
    expect(msg).toBe('JSearch answered with an error status');
    expect(obj).toMatchObject({ source: 'jsearch', status: 404, path: '/search', body: 'Endpoint does not exist [key]' });
    const text = JSON.stringify(obj);
    expect(text).not.toContain('SECRET-KEY');
    expect(text).not.toContain('query=');
    expect(text).not.toContain('x-rapidapi-key');
  });

  it('truncates a non-JSON body to 200 characters', async () => {
    const { api, log } = withLog(async () => new Response('x'.repeat(500), { status: 502 }));
    await api.search(onsite).catch(() => undefined);
    expect((log.warn.mock.calls[0]![0] as { body: string }).body).toHaveLength(200);
  });

  it('prefers the error field when there is no message', async () => {
    const { api, log } = withLog(async () => json({ error: 'bad plan' }, 400));
    await api.search(onsite).catch(() => undefined);
    expect((log.warn.mock.calls[0]![0] as { body: string }).body).toBe('bad plan');
  });

  it.each([401, 403, 429])('does not log a body for %i', async (status) => {
    const { api, log } = withLog(async () => json({ message: 'x' }, status));
    await api.search(onsite).catch(() => undefined);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('still throws without a logger or with an unreadable body', async () => {
    const { api } = client(async () => new Response(null, { status: 404 }));
    await expect(api.search(onsite)).rejects.toMatchObject({ kind: 'failed', httpStatus: 404 });
  });
});

describe('createJSearchClient provider', () => {
  const run = async (provider?: 'rapidapi' | 'openwebninja') => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => json(ok));
    const log = { warn: vi.fn() };
    const api = createJSearchClient({ apiKey: 'SECRET-KEY', log, searchPath: '/search', ...(provider ? { provider } : {}) }, fetchImpl);
    await api.search(onsite);
    return fetchImpl.mock.calls[0]!;
  };

  it('uses OpenWeb Ninja with only an x-api-key header', async () => {
    const [url, init] = await run('openwebninja');
    const u = new URL(String(url));
    expect(u.origin + u.pathname).toBe('https://api.openwebninja.com/jsearch/search');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      query: 'data analyst in Lagos, Nigeria', page: '1', num_pages: '1', date_posted: 'week', country: 'ng',
    });
    expect(String(url)).not.toContain('SECRET-KEY');
    expect(init?.headers).toEqual({ 'x-api-key': 'SECRET-KEY' });
  });

  it('defaults to RapidAPI headers', async () => {
    const [url, init] = await run();
    expect(String(url).startsWith('https://jsearch.p.rapidapi.com/search?')).toBe(true);
    expect(init?.headers).toEqual({ 'x-rapidapi-key': 'SECRET-KEY', 'x-rapidapi-host': 'jsearch.p.rapidapi.com' });
    expect((await run('rapidapi'))[1]?.headers).toEqual(init?.headers);
  });

  it('logs the OpenWeb Ninja path on an error and keeps the strict parser', async () => {
    const log = { warn: vi.fn() };
    const bad = createJSearchClient({ apiKey: 'SECRET-KEY', log, provider: 'openwebninja', searchPath: '/search' }, vi.fn<typeof fetch>().mockImplementation(async () => json({ message: 'nope' }, 404)));
    await bad.search(onsite).catch(() => undefined);
    expect(log.warn.mock.calls[0]![0]).toMatchObject({ path: '/jsearch/search', status: 404 });
    const malformed = createJSearchClient({ apiKey: 'SECRET-KEY', provider: 'openwebninja' }, vi.fn<typeof fetch>().mockImplementation(async () => json({ status: 'OK' })));
    await expect(malformed.search(onsite)).rejects.toMatchObject({ kind: 'malformed' });
  });
});

describe('createJSearchClient search path (v2)', () => {
  const v2ok = { status: 'OK', request_id: 'r', data: { jobs: [{ job_id: 'a', job_title: 'Data Analyst' }], next_cursor: 'abc' } };
  const run = async (cfg: { provider?: 'rapidapi' | 'openwebninja'; searchPath?: '/search' | '/search-v2' }, q = onsite, body: unknown = v2ok) => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => json(body));
    const api = createJSearchClient({ apiKey: 'SECRET-KEY', ...cfg }, fetchImpl);
    const result = await api.search(q);
    const [url, init] = fetchImpl.mock.calls[0]!;
    return { result, u: new URL(String(url)), init };
  };

  it('defaults to /search-v2 on RapidAPI, with no page parameter', async () => {
    const { u, init } = await run({});
    expect(u.origin + u.pathname).toBe('https://jsearch.p.rapidapi.com/search-v2');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      query: 'data analyst in Lagos, Nigeria', num_pages: '1', date_posted: 'week', country: 'ng',
    });
    expect(init?.headers).toEqual({ 'x-rapidapi-key': 'SECRET-KEY', 'x-rapidapi-host': 'jsearch.p.rapidapi.com' });
  });

  it('uses OpenWeb Ninja /search-v2 with x-api-key and work_from_home for remote', async () => {
    const { u, init } = await run({ provider: 'openwebninja' }, { query: 'designer remote', remote: true });
    expect(u.origin + u.pathname).toBe('https://api.openwebninja.com/jsearch/search-v2');
    expect(u.searchParams.has('page')).toBe(false);
    expect(u.searchParams.get('work_from_home')).toBe('true');
    expect(u.searchParams.has('country')).toBe(false);
    expect(init?.headers).toEqual({ 'x-api-key': 'SECRET-KEY' });
  });

  it('sends page only on the legacy path, for both providers', async () => {
    const rapid = await run({ searchPath: '/search' }, onsite, ok);
    expect(rapid.u.pathname).toBe('/search');
    expect(rapid.u.searchParams.get('page')).toBe('1');
    const ninja = await run({ provider: 'openwebninja', searchPath: '/search' }, onsite, ok);
    expect(ninja.u.origin + ninja.u.pathname).toBe('https://api.openwebninja.com/jsearch/search');
    expect(ninja.u.searchParams.get('page')).toBe('1');
  });

  it('builds the URL per provider and path', () => {
    expect(jsearchUrl('rapidapi', '/search')).toBe('https://jsearch.p.rapidapi.com/search');
    expect(jsearchUrl(undefined, '/search-v2')).toBe('https://jsearch.p.rapidapi.com/search-v2');
    expect(jsearchUrl('openwebninja', '/search-v2')).toBe('https://api.openwebninja.com/jsearch/search-v2');
  });

  it('parses both reply shapes', async () => {
    expect((await run({}, onsite, v2ok)).result).toEqual(v2ok.data.jobs);
    expect((await run({ searchPath: '/search' }, onsite, ok)).result).toEqual(ok.data);
    expect((await run({}, onsite, { status: 'OK', data: { jobs: [] } })).result).toEqual([]);
  });

  it('extractJobs accepts an array or an object with a jobs array only', () => {
    expect(extractJobs([1])).toEqual([1]);
    expect(extractJobs({ jobs: [2] })).toEqual([2]);
    for (const bad of [undefined, null, 'x', 3, {}, { jobs: {} }, { jobs: null }, { items: [] }]) expect(extractJobs(bad)).toBeUndefined();
  });

  it.each([
    ['data object without jobs', { status: 'OK', data: { next_cursor: 'x' } }],
    ['jobs that is not a list', { status: 'OK', data: { jobs: 'none' } }],
    ['no data', { status: 'OK' }],
    ['null data', { status: 'OK', data: null }],
  ])('treats %s as malformed on v2', async (_n, body) => {
    await expect(run({}, onsite, body)).rejects.toMatchObject({ kind: 'malformed' });
  });

  it('still fails a v2 reply whose status is not OK', async () => {
    await expect(run({}, onsite, { ...v2ok, status: 'ERROR' })).rejects.toMatchObject({ kind: 'failed' });
  });

  it('flags a 404 "does not exist" body as endpointMissing, and other 404s not', async () => {
    const mk = (body: unknown) => createJSearchClient({ apiKey: 'K' }, vi.fn<typeof fetch>().mockImplementation(async () => json(body, 404)));
    const missing = (await mk({ message: "Endpoint '/search' does not exist" }).search(onsite).catch((e: unknown) => e)) as JSearchError;
    expect(missing.httpStatus).toBe(404);
    expect(missing.endpointMissing).toBe(true);
    expect(missing.message).toBe('JSearch answered 404');
    const other = (await mk({ message: 'not subscribed' }).search(onsite).catch((e: unknown) => e)) as JSearchError;
    expect(other.endpointMissing).toBe(false);
  });
});
