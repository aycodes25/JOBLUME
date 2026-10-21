import { normaliseJob, parsePostedAt, type JobStub } from '../domain/jobs.js';
import { htmlToText } from '../lib/html.js';
import type { FetchText } from '../lib/http.js';
import type { Scraper } from './types.js';

const API_URL = 'https://www.workingnomads.com/api/exposed_jobs/';
const TIMEOUT_MS = 60_000;

interface WorkingNomadsItem {
  url?: string;
  title?: string;
  company_name?: string;
  location?: string;
  description?: string;
  pub_date?: string;
}

/**
 * The public feed is one JSON array of remote jobs. The job's own Working Nomads link (the board's /job/go/<id>/
 * page) is kept as the stored link and the board is shown as "Working Nomads". Many descriptions are written by
 * hiring agencies; they are kept as they are.
 */
export function parseWorkingNomads(json: string): JobStub[] {
  const data = JSON.parse(json) as unknown;
  if (!Array.isArray(data)) return [];
  const stubs: JobStub[] = [];
  for (const item of data as WorkingNomadsItem[]) {
    if (!item || !item.url || !item.title || !item.company_name) continue;
    stubs.push({
      title: item.title.trim(),
      company: item.company_name.trim(),
      location: item.location?.trim() || 'Remote',
      url: item.url,
      source: 'workingnomads',
      description: htmlToText(item.description ?? ''),
      postedAt: parsePostedAt(item.pub_date),
    });
  }
  return stubs;
}

export function createWorkingNomadsScraper(fetchText: FetchText): Scraper {
  return {
    source: 'workingnomads',
    async list() {
      return parseWorkingNomads(await fetchText(API_URL, { timeoutMs: TIMEOUT_MS }));
    },
    async detail(stub) {
      const job = normaliseJob({ ...stub, postedAt: stub.postedAt });
      if (!job) throw new Error(`unusable Working Nomads job: ${stub.url}`);
      return job;
    },
  };
}
