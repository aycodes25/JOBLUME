import { describe, expect, it, vi } from 'vitest';
import type { JobStub, NormalisedJob } from '../../src/domain/jobs.js';
import type { Scraper } from '../../src/scrapers/types.js';
import { runScrape, type ScrapeDeps } from '../../src/worker/scrape.js';

const stub = (n: number): JobStub => ({
  title: `Role ${n}`, company: `Co ${n}`, location: 'Lagos', url: `https://x/${n}`, source: 'myjobmag',
});
const full = (s: JobStub): NormalisedJob => ({ ...s, description: 'd', companyDomain: null });
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function makeDeps(over: Partial<ScrapeDeps> & { stubs?: JobStub[]; detail?: Scraper['detail'] } = {}) {
  const stubs = over.stubs ?? [stub(1), stub(2), stub(3)];
  const scraper: Scraper = {
    source: 'myjobmag',
    detailDelayMs: [1000, 3000],
    list: vi.fn().mockResolvedValue(stubs),
    detail: over.detail ?? vi.fn(async (s: JobStub) => full(s)),
  };
  const deps: ScrapeDeps = {
    scraper,
    maxNew: 25,
    findSeenUrls: vi.fn().mockResolvedValue(new Set<string>()),
    insertJobs: vi.fn(async (jobs: NormalisedJob[]) => jobs.map((j) => `id-${j.url}`)),
    enqueueMatch: vi.fn().mockResolvedValue(undefined),
    sleep: vi.fn().mockResolvedValue(undefined),
    log,
    ...over,
  };
  return deps;
}

describe('runScrape', () => {
  it('fetches details only for unseen urls, inserts them and enqueues a match per new job', async () => {
    const deps = makeDeps({ findSeenUrls: vi.fn().mockResolvedValue(new Set(['https://x/2'])) });
    const result = await runScrape(deps);
    expect(deps.scraper.detail).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ listed: 3, fetched: 2, inserted: 2 });
    expect(deps.enqueueMatch).toHaveBeenCalledWith('id-https://x/1');
    expect(deps.enqueueMatch).toHaveBeenCalledWith('id-https://x/3');
  });

  it('respects maxNew', async () => {
    const deps = makeDeps({ maxNew: 1 });
    expect((await runScrape(deps)).fetched).toBe(1);
  });

  it('sleeps between detail calls but not before the first', async () => {
    const deps = makeDeps();
    await runScrape(deps);
    expect(deps.sleep).toHaveBeenCalledTimes(2);
    const [ms] = (deps.sleep as ReturnType<typeof vi.fn>).mock.calls[0] as [number];
    expect(ms).toBeGreaterThanOrEqual(1000);
    expect(ms).toBeLessThan(3000);
  });

  it('does not sleep when the scraper declares no delay', async () => {
    const deps = makeDeps();
    delete deps.scraper.detailDelayMs;
    await runScrape(deps);
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it('keeps going when one detail request fails', async () => {
    const detail = vi.fn(async (s: JobStub) => {
      if (s.url === 'https://x/2') throw new Error('boom');
      return full(s);
    });
    const deps = makeDeps({ detail });
    const result = await runScrape(deps);
    expect(result).toEqual({ listed: 3, fetched: 2, inserted: 2 });
    expect(log.warn).toHaveBeenCalled();
  });

  it('collapses same company+title duplicates before inserting', async () => {
    const dup = { ...stub(1), url: 'https://x/9' };
    const deps = makeDeps({ stubs: [stub(1), dup] });
    await runScrape(deps);
    expect((deps.insertJobs as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toHaveLength(1);
  });

  it('does nothing when nothing is new', async () => {
    const deps = makeDeps({ findSeenUrls: vi.fn().mockResolvedValue(new Set(['https://x/1', 'https://x/2', 'https://x/3'])) });
    expect(await runScrape(deps)).toEqual({ listed: 3, fetched: 0, inserted: 0 });
    expect(deps.enqueueMatch).not.toHaveBeenCalled();
  });

  it('keeps enqueueing matches when one enqueue fails', async () => {
    const enqueueMatch = vi.fn(async (id: string) => {
      if (id === 'id-https://x/1') throw new Error('redis down');
    });
    const deps = makeDeps({ stubs: [stub(1), stub(2)], enqueueMatch });
    await expect(runScrape(deps)).resolves.toEqual({ listed: 2, fetched: 2, inserted: 2 });
    expect(enqueueMatch).toHaveBeenCalledWith('id-https://x/2');
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'id-https://x/1' }), 'enqueue match failed');
  });
});
