import { describe, expect, it, vi } from 'vitest';
import { CACHE_TTL_MS, createFinder, type CachedContacts } from '../../src/services/email/finder.js';
import { HunterError, type HunterContact, type HunterResult } from '../../src/services/email/hunter.js';

const NOW = new Date('2026-10-20T10:00:00.000Z');
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const recruiter: HunterContact = { email: 'grace@acme.com', type: 'personal', confidence: 88, firstName: 'Grace', lastName: 'Hopper', position: 'Recruiter', department: 'hr' };

type HunterSearch = (q: { company?: string; domain?: string }) => Promise<HunterResult>;

function make(over: { cached?: CachedContacts | null; hunter?: unknown; quota?: boolean } = {}) {
  const cache = { get: vi.fn().mockResolvedValue(over.cached ?? null), put: vi.fn().mockResolvedValue(undefined) };
  const hunter = over.hunter === undefined
    ? { domainSearch: vi.fn<HunterSearch>().mockResolvedValue({ domain: 'acme.com', pattern: null, contacts: [recruiter] }) }
    : (over.hunter as { domainSearch: ReturnType<typeof vi.fn<HunterSearch>> } | null);
  const quota = { consume: vi.fn().mockResolvedValue(over.quota ?? true) };
  const finder = createFinder({ cache, hunter, quota, now: () => NOW, log: log as never });
  return { finder, cache, hunter, quota };
}

describe('createFinder.find', () => {
  it('searches Hunter by company on a cache miss, caches the result and returns ranked candidates', async () => {
    const { finder, cache, hunter, quota } = make();
    const out = await finder.find({ company: 'Acme Ltd', knownDomain: null });
    expect(quota.consume).toHaveBeenCalledTimes(1);
    expect(hunter!.domainSearch).toHaveBeenCalledWith({ company: 'Acme Ltd' });
    expect(cache.get).toHaveBeenCalledWith('acme');
    expect(cache.put).toHaveBeenCalledWith('acme', { domain: 'acme.com', contacts: [recruiter], pattern: null });
    expect(out.map((c) => c.email)).toEqual(['grace@acme.com']);
  });

  it('searches by the known domain when the job has one', async () => {
    const { finder, hunter } = make();
    await finder.find({ company: 'Acme', knownDomain: 'acme.com' });
    expect(hunter!.domainSearch).toHaveBeenCalledWith({ domain: 'acme.com' });
  });

  it('uses a fresh cache entry without calling Hunter or spending quota', async () => {
    const cached: CachedContacts = { domain: 'acme.com', contacts: [recruiter], pattern: null, fetchedAt: new Date(NOW.getTime() - 1000).toISOString() };
    const { finder, hunter, quota } = make({ cached });
    const out = await finder.find({ company: 'Acme', knownDomain: null });
    expect(hunter!.domainSearch).not.toHaveBeenCalled();
    expect(quota.consume).not.toHaveBeenCalled();
    expect(out).toHaveLength(1);
  });

  it('ignores a cache entry older than 30 days', async () => {
    const stale: CachedContacts = { domain: 'old.com', contacts: [], pattern: null, fetchedAt: new Date(NOW.getTime() - CACHE_TTL_MS - 1000).toISOString() };
    const { finder, hunter } = make({ cached: stale });
    await finder.find({ company: 'Acme', knownDomain: null });
    expect(hunter!.domainSearch).toHaveBeenCalledTimes(1);
  });

  it('falls back to guesses when the monthly quota is spent but the domain is known', async () => {
    const { finder, hunter } = make({ quota: false });
    const out = await finder.find({ company: 'Acme', knownDomain: 'acme.com' });
    expect(hunter!.domainSearch).not.toHaveBeenCalled();
    expect(out.every((c) => c.source === 'guess')).toBe(true);
    expect(out[0]!.email).toBe('careers@acme.com');
  });

  it('returns nothing when the quota is spent and no domain is known', async () => {
    expect(await make({ quota: false }).finder.find({ company: 'Acme', knownDomain: null })).toEqual([]);
  });

  it('works without a Hunter key: known domain gives guesses, otherwise nothing', async () => {
    const withDomain = make({ hunter: null });
    expect((await withDomain.finder.find({ company: 'Acme', knownDomain: 'acme.com' })).length).toBe(4);
    expect(withDomain.quota.consume).not.toHaveBeenCalled();
    expect(await make({ hunter: null }).finder.find({ company: 'Acme', knownDomain: null })).toEqual([]);
  });

  it('survives a Hunter error: logs it, caches nothing, and still guesses for a known domain', async () => {
    const hunter = { domainSearch: vi.fn().mockRejectedValue(new HunterError('rate_limited')) };
    const { finder, cache } = make({ hunter });
    const out = await finder.find({ company: 'Acme', knownDomain: 'acme.com' });
    expect(out.every((c) => c.source === 'guess')).toBe(true);
    expect(cache.put).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });

  it('caches a "nothing found" answer so the company is not searched again', async () => {
    const hunter = { domainSearch: vi.fn().mockResolvedValue({ domain: null, pattern: null, contacts: [] }) };
    const { finder, cache } = make({ hunter });
    expect(await finder.find({ company: 'Mystery Holdings', knownDomain: null })).toEqual([]);
    expect(cache.put).toHaveBeenCalledWith('mystery holdings', { domain: null, contacts: [], pattern: null });
  });

  it('returns nothing for a company name with no usable key', async () => {
    const { finder, hunter } = make();
    expect(await finder.find({ company: 'Limited', knownDomain: null })).toEqual([]);
    expect(hunter!.domainSearch).not.toHaveBeenCalled();
  });
});
