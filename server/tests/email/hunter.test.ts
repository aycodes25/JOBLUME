import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createHunterClient, HunterError, parseHunterDomainSearch } from '../../src/services/email/hunter.js';

const sample = JSON.parse(readFileSync(new URL('../fixtures/hunter-domain-search.json', import.meta.url), 'utf8'));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('parseHunterDomainSearch', () => {
  it('reads the domain, pattern and the valid contacts, dropping malformed entries', () => {
    const result = parseHunterDomainSearch(sample);
    expect(result.domain).toBe('acme.com');
    expect(result.pattern).toBe('{first}.{last}');
    expect(result.contacts.map((c) => c.email)).toEqual([
      'ada.lovelace@acme.com', 'grace.hopper@acme.com', 'careers@acme.com', 'alan.turing@acme.com',
    ]);
    expect(result.contacts[1]).toEqual({
      email: 'grace.hopper@acme.com', type: 'personal', confidence: 88, firstName: 'Grace', lastName: 'Hopper',
      position: 'Talent Acquisition Manager', department: 'hr',
    });
    expect(result.contacts[2]).toMatchObject({ type: 'generic', firstName: null, position: null });
  });

  it.each([null, undefined, 'x', {}, { data: null }, { data: { emails: 'nope' } }])('returns an empty result for %j', (input) => {
    expect(parseHunterDomainSearch(input)).toEqual({ domain: null, pattern: null, contacts: [] });
  });
});

describe('createHunterClient', () => {
  const run = (response: Response | Error, q: { company?: string; domain?: string } = { company: 'Acme' }) => {
    const fetchImpl = response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockImplementation(async () => response);
    return { fetchImpl, promise: createHunterClient({ apiKey: 'KEY' }, fetchImpl as unknown as typeof fetch).domainSearch(q) };
  };

  it('searches by company and sends the key in a header, not the URL', async () => {
    const { fetchImpl, promise } = run(json(sample));
    expect((await promise).domain).toBe('acme.com');
    const [url, init] = fetchImpl.mock.calls[0]!;
    const u = new URL(url as string);
    expect(u.origin + u.pathname).toBe('https://api.hunter.io/v2/domain-search');
    expect(u.searchParams.get('company')).toBe('Acme');
    expect(u.searchParams.get('domain')).toBeNull();
    expect(u.searchParams.get('limit')).toBe('10');
    expect(String(url)).not.toContain('KEY');
    expect((init as RequestInit).headers).toMatchObject({ 'x-api-key': 'KEY' });
  });

  it('prefers the domain when both are given', async () => {
    const { fetchImpl, promise } = run(json(sample), { company: 'Acme', domain: 'acme.com' });
    await promise;
    const u = new URL(fetchImpl.mock.calls[0]![0] as string);
    expect(u.searchParams.get('domain')).toBe('acme.com');
    expect(u.searchParams.get('company')).toBeNull();
  });

  it.each([
    ['401', 401, 'auth'],
    ['403', 403, 'rate_limited'],
    ['429', 429, 'rate_limited'],
    ['400', 400, 'bad_request'],
    ['404', 404, 'bad_request'],
    ['500', 500, 'failed'],
  ])('maps a %s response to %s', async (_n, status, kind) => {
    await expect(run(json({}, status)).promise).rejects.toMatchObject({ kind });
  });

  it('maps a network failure to failed and never leaks the key in the error', async () => {
    const err = await run(new TypeError('offline')).promise.catch((e) => e);
    expect(err).toBeInstanceOf(HunterError);
    expect(err.kind).toBe('failed');
    expect(JSON.stringify(err)).not.toContain('KEY');
    expect(err.message).not.toContain('KEY');
  });

  it.each([{}, { data: null }, { meta: {} }, []])('throws failed for a 200 whose body lacks data (%j), so it is not cached', async (body) => {
    await expect(run(json(body)).promise).rejects.toMatchObject({ name: 'HunterError', kind: 'failed' });
  });

  it('throws failed for a 200 that is not JSON', async () => {
    await expect(run(new Response('<html>', { status: 200 })).promise).rejects.toMatchObject({ kind: 'failed' });
  });

  it('requires a company or a domain', async () => {
    await expect(run(json(sample), {}).promise).rejects.toMatchObject({ kind: 'bad_request' });
  });
});
