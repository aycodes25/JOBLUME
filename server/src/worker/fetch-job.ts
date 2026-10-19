import { isAllowedJobHost, type JobFetchReason } from '@joblume/shared';
import type { NormalisedJob } from '../domain/jobs.js';
import type { Logger } from '../lib/logger.js';
import type { FetchJobData } from '../queues.js';
import { extractJobPage, type FetchedPage } from '../scrapers/job-page.js';
import type { JobFetchState } from '../services/jobs/fetches-repo.js';

/** A page that loaded but cannot be used. Final: retrying would only hit the site again. */
export class FetchJobError extends Error {
  constructor(public readonly reason: JobFetchReason) {
    super(`job page could not be used: ${reason}`);
    this.name = 'FetchJobError';
  }
}

export interface FetchJobDeps {
  findJobIdByUrl(url: string): Promise<string | null>;
  fetchPage(url: string): Promise<FetchedPage>;
  saveJob(job: NormalisedJob): Promise<string>;
  saveFetch(userId: string, url: string, state: JobFetchState): Promise<void>;
  enqueueUserMatch(userId: string, jobId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  randomDelay(): number;
  /** True on the last queue attempt: a page that still does not load is then recorded as blocked. */
  isFinalAttempt: boolean;
  log: Logger;
}

export async function runFetchJob(data: FetchJobData, d: FetchJobDeps): Promise<{ jobId: string }> {
  const finish = async (jobId: string) => {
    await d.saveFetch(data.userId, data.url, { status: 'done', jobId });
    await d.enqueueUserMatch(data.userId, jobId);
    return { jobId };
  };
  const fail = async (reason: JobFetchReason): Promise<never> => {
    await d.saveFetch(data.userId, data.url, { status: 'failed', reason });
    d.log.info({ userId: data.userId, url: data.url, reason }, 'job link could not be used');
    throw new FetchJobError(reason);
  };

  const existing = await d.findJobIdByUrl(data.url);
  if (existing) return finish(existing);

  await d.sleep(d.randomDelay());
  let page: FetchedPage;
  try {
    page = await d.fetchPage(data.url);
  } catch (err) {
    d.log.warn({ err, userId: data.userId, url: data.url, finalAttempt: d.isFinalAttempt }, 'job page did not load');
    if (d.isFinalAttempt) return fail('blocked');
    throw err;
  }

  // A redirect off LinkedIn/Indeed is never read as a job page, whatever it contains.
  if (!isAllowedJobHost(page.finalUrl)) {
    d.log.warn({ userId: data.userId, url: data.url }, 'job page redirected to a host that is not allowed');
    return fail('blocked');
  }

  const result = extractJobPage(page, { url: data.url, source: data.source });
  if (!result.ok) return fail(result.reason);
  return finish(await d.saveJob(result.job));
}
