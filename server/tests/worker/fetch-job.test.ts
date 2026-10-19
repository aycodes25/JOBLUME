import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { FetchedPage } from '../../src/scrapers/job-page.js';
import { FetchJobError, runFetchJob, type FetchJobDeps } from '../../src/worker/fetch-job.js';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const LINK = { userId: 'u1', url: 'https://www.linkedin.com/jobs/view/4012345678/', source: 'linkedin' as const };
const page = (over: Partial<FetchedPage> = {}): FetchedPage => ({ status: 200, finalUrl: LINK.url, html: fixture('linkedin-job.html'), ...over });

function make(over: Partial<FetchJobDeps> = {}): FetchJobDeps {
  return {
    findJobIdByUrl: vi.fn<FetchJobDeps['findJobIdByUrl']>().mockImplementation(async () => null),
    fetchPage: vi.fn<FetchJobDeps['fetchPage']>().mockImplementation(async () => page()),
    saveJob: vi.fn<FetchJobDeps['saveJob']>().mockImplementation(async () => 'j-new'),
    saveFetch: vi.fn<FetchJobDeps['saveFetch']>().mockImplementation(async () => undefined),
    enqueueUserMatch: vi.fn<FetchJobDeps['enqueueUserMatch']>().mockImplementation(async () => undefined),
    sleep: vi.fn<FetchJobDeps['sleep']>().mockImplementation(async () => undefined),
    randomDelay: () => 3_210,
    isFinalAttempt: false,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...over,
  };
}

describe('runFetchJob: success', () => {
  it('waits, loads the page, saves the job, marks the link done and matches it for that user only', async () => {
    const d = make();
    expect(await runFetchJob(LINK, d)).toEqual({ jobId: 'j-new' });
    expect(d.sleep).toHaveBeenCalledWith(3_210);
    expect(vi.mocked(d.sleep).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(d.fetchPage).mock.invocationCallOrder[0]!);
    expect(d.fetchPage).toHaveBeenCalledWith(LINK.url);
    expect(d.saveJob).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Data Analyst', company: 'Acme Analytics', source: 'linkedin', url: LINK.url,
    }));
    expect(d.saveFetch).toHaveBeenCalledWith('u1', LINK.url, { status: 'done', jobId: 'j-new' });
    expect(d.enqueueUserMatch).toHaveBeenCalledWith('u1', 'j-new');
    expect(d.enqueueUserMatch).toHaveBeenCalledTimes(1);
  });

  it('saves an Indeed job with the indeed source', async () => {
    const url = 'https://ng.indeed.com/viewjob?jk=0123456789abcdef';
    const d = make({ fetchPage: vi.fn<FetchJobDeps['fetchPage']>().mockImplementation(async () => page({ finalUrl: url, html: fixture('indeed-job.html') })) });
    await runFetchJob({ userId: 'u1', url, source: 'indeed' }, d);
    expect(d.saveJob).toHaveBeenCalledWith(expect.objectContaining({ title: 'Backend Engineer', company: 'Paystack', source: 'indeed', url }));
  });

  it('skips the browser when the link is already a stored job', async () => {
    const d = make({ findJobIdByUrl: vi.fn<FetchJobDeps['findJobIdByUrl']>().mockImplementation(async () => 'j-old') });
    expect(await runFetchJob(LINK, d)).toEqual({ jobId: 'j-old' });
    expect(d.fetchPage).not.toHaveBeenCalled();
    expect(d.sleep).not.toHaveBeenCalled();
    expect(d.saveFetch).toHaveBeenCalledWith('u1', LINK.url, { status: 'done', jobId: 'j-old' });
    expect(d.enqueueUserMatch).toHaveBeenCalledWith('u1', 'j-old');
  });

  it('keeps everything scoped to the user who pasted the link', async () => {
    const d = make();
    await runFetchJob({ ...LINK, userId: 'u2' }, d);
    expect(d.saveFetch).toHaveBeenCalledWith('u2', LINK.url, { status: 'done', jobId: 'j-new' });
    expect(d.enqueueUserMatch).toHaveBeenCalledWith('u2', 'j-new');
    expect(vi.mocked(d.saveFetch).mock.calls.every((c) => c[0] === 'u2')).toBe(true);
  });
});

describe('runFetchJob: failures', () => {
  it.each([
    ['blocked', page({ status: 999, html: '' })],
    ['blocked', page({ html: fixture('indeed-blocked.html') })],
    ['login_required', page({ finalUrl: 'https://www.linkedin.com/authwall?trk=x' })],
    ['not_found', page({ html: fixture('linkedin-expired.html') })],
    ['unparseable', page({ html: '<html><body><h1>Data Analyst</h1></body></html>' })],
  ])('records %s, inserts nothing and fails with that reason', async (reason, loaded) => {
    const d = make({ fetchPage: vi.fn<FetchJobDeps['fetchPage']>().mockImplementation(async () => loaded) });
    const err = await runFetchJob(LINK, d).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchJobError);
    expect((err as FetchJobError).reason).toBe(reason);
    expect(d.saveFetch).toHaveBeenCalledWith('u1', LINK.url, { status: 'failed', reason });
    expect(d.saveJob).not.toHaveBeenCalled();
    expect(d.enqueueUserMatch).not.toHaveBeenCalled();
  });

  it('rethrows a page that did not load so the queue retries it, recording nothing yet', async () => {
    const boom = new Error('Timeout 30000ms exceeded');
    const d = make({ fetchPage: vi.fn<FetchJobDeps['fetchPage']>().mockImplementation(async () => { throw boom; }) });
    await expect(runFetchJob(LINK, d)).rejects.toBe(boom);
    expect(d.saveFetch).not.toHaveBeenCalled();
  });

  it('records blocked when the page still does not load on the last attempt', async () => {
    const d = make({
      isFinalAttempt: true,
      fetchPage: vi.fn<FetchJobDeps['fetchPage']>().mockImplementation(async () => { throw new Error('net::ERR_CONNECTION_RESET'); }),
    });
    await expect(runFetchJob(LINK, d)).rejects.toMatchObject({ name: 'FetchJobError', reason: 'blocked' });
    expect(d.saveFetch).toHaveBeenCalledWith('u1', LINK.url, { status: 'failed', reason: 'blocked' });
    expect(d.saveJob).not.toHaveBeenCalled();
  });
});

describe('runFetchJob: final URL host', () => {
  it('accepts a final URL that stays on LinkedIn or Indeed', async () => {
    const d = make({ fetchPage: vi.fn<FetchJobDeps['fetchPage']>().mockImplementation(async () => page({ finalUrl: 'https://linkedin.com/jobs/view/4012345678/' })) });
    await expect(runFetchJob(LINK, d)).resolves.toEqual({ jobId: 'j-new' });
  });

  it.each([
    ['another host', 'https://evil.example.com/jobs/view/4012345678/'],
    ['a look-alike host', 'https://www.linkedin.com.evil.example/jobs/view/4012345678/'],
    ['plain http', 'http://www.linkedin.com/jobs/view/4012345678/'],
    ['an empty URL', ''],
  ])('records blocked and saves nothing after a redirect to %s', async (_n, finalUrl) => {
    const d = make({ fetchPage: vi.fn<FetchJobDeps['fetchPage']>().mockImplementation(async () => page({ finalUrl })) });
    await expect(runFetchJob(LINK, d)).rejects.toMatchObject({ name: 'FetchJobError', reason: 'blocked' });
    expect(d.saveFetch).toHaveBeenCalledWith('u1', LINK.url, { status: 'failed', reason: 'blocked' });
    expect(d.saveJob).not.toHaveBeenCalled();
    expect(d.enqueueUserMatch).not.toHaveBeenCalled();
  });
});
