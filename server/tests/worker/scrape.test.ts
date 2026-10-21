import { describe, expect, it, vi } from 'vitest';
import type { JobStub, NormalisedJob } from '../../src/domain/jobs.js';
import type { Scraper } from '../../src/scrapers/types.js';
import type { ScanRunInput } from '../../src/services/scan/runs.js';
import type { MatchCandidate } from '../../src/worker/match.js';
import { HttpError } from '../../src/lib/http.js';
import { JSearchError } from '../../src/scrapers/jsearch-client.js';
import { scanFailureReason } from '../../src/services/scan/runs.js';
import { countRejections, runRecordedScrape, runScrape, type RecordedScrapeDeps, type ScrapeDeps } from '../../src/worker/scrape.js';

const stub = (n: number): JobStub => ({
  title: `Role ${n}`, company: `Co ${n}`, location: 'Lagos', url: `https://x/${n}`, source: 'myjobmag',
});
const full = (s: JobStub): NormalisedJob => ({ ...s, description: 'd', companyDomain: null });
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** A user who wants "Role" jobs in Lagos: titles "Role 1", "Role 2" ... fit, other titles and other cities do not. */
const lagosUser: MatchCandidate = { user_id: 'u1', desired_roles: ['role'], location: 'Lagos' };

function makeDeps(over: Partial<ScrapeDeps> & { stubs?: JobStub[]; detail?: Scraper['detail'] } = {}) {
  const { stubs: givenStubs, detail, ...rest } = over;
  const stubs = givenStubs ?? [stub(1), stub(2), stub(3)];
  const scraper: Scraper = {
    source: 'myjobmag',
    detailDelayMs: [1000, 3000],
    list: vi.fn<Scraper['list']>().mockImplementation(async () => stubs),
    detail: detail ?? vi.fn(async (s: JobStub) => full(s)),
  };
  const deps: ScrapeDeps = {
    scraper,
    maxNew: 25,
    findSeenUrls: vi.fn<ScrapeDeps['findSeenUrls']>().mockImplementation(async () => new Set<string>()),
    insertJobs: vi.fn(async (jobs: NormalisedJob[]) => jobs.map((j) => `id-${j.url}`)),
    enqueueMatch: vi.fn<ScrapeDeps['enqueueMatch']>().mockImplementation(async () => undefined),
    loadCandidates: vi.fn<ScrapeDeps['loadCandidates']>().mockImplementation(async () => [lagosUser]),
    sleep: vi.fn<ScrapeDeps['sleep']>().mockImplementation(async () => undefined),
    log,
    ...rest,
  };
  return deps;
}

describe('runScrape', () => {
  it('fetches details only for unseen urls, inserts them and enqueues a match per new job', async () => {
    const deps = makeDeps({ findSeenUrls: vi.fn<ScrapeDeps['findSeenUrls']>().mockImplementation(async () => new Set(['https://x/2'])) });
    const result = await runScrape(deps);
    expect(deps.scraper.detail).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ listed: 3, newCount: 2, fetched: 2, inserted: 2 });
    expect(deps.enqueueMatch).toHaveBeenCalledWith('id-https://x/1');
    expect(deps.enqueueMatch).toHaveBeenCalledWith('id-https://x/3');
  });

  it('respects maxNew', async () => {
    const deps = makeDeps({ maxNew: 1 });
    expect(await runScrape(deps)).toMatchObject({ newCount: 1, fetched: 1 });
  });

  it('sleeps between detail calls but not before the first', async () => {
    const deps = makeDeps();
    await runScrape(deps);
    expect(deps.sleep).toHaveBeenCalledTimes(2);
    const [ms] = vi.mocked(deps.sleep).mock.calls[0] as [number];
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
    expect(await runScrape(deps)).toMatchObject({ listed: 3, newCount: 3, fetched: 2, inserted: 2 });
    expect(log.warn).toHaveBeenCalled();
  });

  it('collapses same company+title duplicates before inserting', async () => {
    const dup = { ...stub(1), url: 'https://x/9' };
    const deps = makeDeps({ stubs: [stub(1), dup] });
    await runScrape(deps);
    expect(vi.mocked(deps.insertJobs).mock.calls[0]![0]).toHaveLength(1);
  });

  it('does nothing when nothing is new', async () => {
    const deps = makeDeps({ findSeenUrls: vi.fn<ScrapeDeps['findSeenUrls']>().mockImplementation(async () => new Set(['https://x/1', 'https://x/2', 'https://x/3'])) });
    expect(await runScrape(deps)).toEqual({ listed: 3, newCount: 0, fetched: 0, inserted: 0, rejected: { title: 0, location: 0 } });
    expect(deps.enqueueMatch).not.toHaveBeenCalled();
  });

  it('keeps enqueueing matches when one enqueue fails', async () => {
    const enqueueMatch = vi.fn(async (id: string) => {
      if (id === 'id-https://x/1') throw new Error('redis down');
    });
    const deps = makeDeps({ stubs: [stub(1), stub(2)], enqueueMatch });
    await expect(runScrape(deps)).resolves.toMatchObject({ listed: 2, fetched: 2, inserted: 2 });
    expect(enqueueMatch).toHaveBeenCalledWith('id-https://x/2');
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'id-https://x/1' }), 'enqueue match failed');
  });

  it('counts new jobs the title and place checks turn away, by reason', async () => {
    const stubs: JobStub[] = [
      stub(1),
      { ...stub(2), title: 'Marketing Manager' },
      { ...stub(3), title: 'Sales Rep' },
      { ...stub(4), location: 'Abuja' },
    ];
    const deps = makeDeps({ stubs });
    expect(await runScrape(deps)).toMatchObject({ fetched: 4, rejected: { title: 2, location: 1 } });
  });

  it('still scrapes and inserts when the candidates cannot be loaded', async () => {
    const deps = makeDeps({ loadCandidates: vi.fn<ScrapeDeps['loadCandidates']>().mockImplementation(async () => { throw new Error('db down'); }) });
    expect(await runScrape(deps)).toMatchObject({ inserted: 3, rejected: { title: 0, location: 0 } });
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ source: 'myjobmag' }), 'could not count prefilter rejections');
  });
});

describe('countRejections', () => {
  const job = (title: string, location: string) => ({ title, location, source: 'myjobmag' as const });
  const abujaUser: MatchCandidate = { user_id: 'u2', desired_roles: ['nurse'], location: 'Abuja' };

  it('counts nothing when there are no candidates', () => {
    expect(countRejections([job('Anything', 'Lagos')], [])).toEqual({ title: 0, location: 0 });
  });

  it('does not count a job any one user would accept', () => {
    expect(countRejections([job('Nurse', 'Abuja'), job('Role 1', 'Lagos')], [lagosUser, abujaUser])).toEqual({ title: 0, location: 0 });
  });

  it('counts a job as location when its title fits somebody, and as title otherwise', () => {
    expect(countRejections([job('Role 1', 'Kano'), job('Welder', 'Lagos')], [lagosUser, abujaUser])).toEqual({ title: 1, location: 1 });
  });

  it('skips users without roles', () => {
    const noRoles: MatchCandidate = { user_id: 'u3', desired_roles: [], location: 'Lagos' };
    expect(countRejections([job('Welder', 'Lagos')], [noRoles])).toEqual({ title: 0, location: 0 });
  });
});

describe('runRecordedScrape', () => {
  function recorded(over: Partial<RecordedScrapeDeps> = {}) {
    const runs: ScanRunInput[] = [];
    const times = ['2026-10-20T10:00:00.000Z', '2026-10-20T10:00:09.000Z'];
    const deps: RecordedScrapeDeps = {
      ...makeDeps(),
      recordRun: vi.fn<RecordedScrapeDeps['recordRun']>().mockImplementation(async (run) => void runs.push(run)),
      now: vi.fn(() => new Date(times.shift() ?? '2026-10-20T10:00:09.000Z')),
      ...over,
    };
    return { deps, runs };
  }

  it('records an ok run with the counts and both times', async () => {
    const { deps, runs } = recorded();
    vi.mocked(deps.scraper.list).mockImplementation(async () => [stub(1), { ...stub(2), title: 'Welder' }]);
    await runRecordedScrape(deps);
    expect(runs).toEqual([
      {
        source: 'myjobmag', started_at: '2026-10-20T10:00:00.000Z', finished_at: '2026-10-20T10:00:09.000Z', status: 'ok', error: null,
        listed: 2, new_count: 2, inserted: 2, rejected_title: 1, rejected_location: 0,
      },
    ]);
  });

  it('records a failed run with the reason, then rethrows the error', async () => {
    const { deps, runs } = recorded();
    vi.mocked(deps.scraper.list).mockImplementation(async () => { throw new HttpError(403, 'https://www.myjobmag.com/jobs'); });
    await expect(runRecordedScrape(deps)).rejects.toThrow('HTTP 403');
    expect(runs).toEqual([
      {
        source: 'myjobmag', started_at: '2026-10-20T10:00:00.000Z', finished_at: '2026-10-20T10:00:09.000Z', status: 'failed',
        error: 'http_403', listed: 0, new_count: 0, inserted: 0, rejected_title: 0, rejected_location: 0,
      },
    ]);
  });

  it('never stores a Himalayas query URL or a role in the error, only a fixed reason', async () => {
    const { deps, runs } = recorded();
    const leaky = new HttpError(500, 'https://himalayas.app/jobs/api/search?q=Secret%20Quantum%20Role&country=NG');
    vi.mocked(deps.scraper.list).mockImplementation(async () => { throw leaky; });
    await expect(runRecordedScrape(deps)).rejects.toBe(leaky);
    expect(runs[0]!.error).toBe('http_500');
    expect(JSON.stringify(runs)).not.toMatch(/himalayas|Secret|Quantum|q=/i);
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ err: leaky }), expect.any(String));
  });

  it('does not fail the scan when the run cannot be recorded', async () => {
    const { deps } = recorded({ recordRun: vi.fn<RecordedScrapeDeps['recordRun']>().mockImplementation(async () => { throw new Error('db down'); }) });
    await expect(runRecordedScrape(deps)).resolves.toMatchObject({ inserted: 3 });
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ source: 'myjobmag' }), 'could not record the scan run');
  });
});

describe('scanFailureReason', () => {
  const named = (name: string) => Object.assign(new Error('secret detail'), { name });

  it('maps errors to fixed reasons', () => {
    expect(scanFailureReason(new HttpError(403, 'https://x/?q=role'))).toBe('http_403');
    expect(scanFailureReason(named('TimeoutError'))).toBe('timeout');
    expect(scanFailureReason(named('AbortError'))).toBe('timeout');
    expect(scanFailureReason(new TypeError('fetch failed'))).toBe('network');
    expect(scanFailureReason(new SyntaxError('Unexpected token < in JSON'))).toBe('parse');
    expect(scanFailureReason(new JSearchError('rate_limited', 'x'))).toBe('jsearch_rate_limited');
    expect(scanFailureReason(new JSearchError('auth'))).toBe('jsearch_auth');
    expect(scanFailureReason({ code: '23505', message: 'duplicate key', details: 'Key (x)=(y)', hint: null })).toBe('db');
    expect(scanFailureReason(new Error('anything else'))).toBe('unknown');
    expect(scanFailureReason('a string')).toBe('unknown');
  });
});
