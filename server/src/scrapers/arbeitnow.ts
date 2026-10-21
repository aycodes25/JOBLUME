import { normaliseJob, parsePostedAt, type JobStub } from '../domain/jobs.js';
import { htmlToText } from '../lib/html.js';
import type { FetchText } from '../lib/http.js';
import type { Scraper } from './types.js';

const API_URL = 'https://www.arbeitnow.com/api/job-board-api';
// The first page holds the 300 newest jobs, and the feed is rebuilt every hour.
const TIMEOUT_MS = 60_000;

interface ArbeitnowItem {
  url?: string;
  title?: string;
  company_name?: string;
  location?: string;
  description?: string;
  remote?: boolean;
  created_at?: number;
}

/**
 * Only the jobs Arbeitnow flags as remote are kept: the rest are on-site jobs in Germany. The terms ask for a link
 * back to Arbeitnow, so the job's own Arbeitnow page is kept as the stored link and the board is shown as "Arbeitnow".
 */
export function parseArbeitnow(json: string): JobStub[] {
  const data = JSON.parse(json) as { data?: ArbeitnowItem[] };
  const stubs: JobStub[] = [];
  for (const item of data.data ?? []) {
    if (item.remote !== true || !item.url || !item.title || !item.company_name) continue;
    const place = item.location?.trim() ?? '';
    stubs.push({
      title: item.title.trim(),
      company: item.company_name.trim(),
      location: /remote/i.test(place) ? place : place ? `Remote, ${place}` : 'Remote',
      url: item.url,
      source: 'arbeitnow',
      description: htmlToText(item.description ?? ''),
      postedAt: parsePostedAt(item.created_at),
    });
  }
  return stubs;
}

export function createArbeitnowScraper(fetchText: FetchText): Scraper {
  return {
    source: 'arbeitnow',
    async list() {
      return parseArbeitnow(await fetchText(API_URL, { timeoutMs: TIMEOUT_MS }));
    },
    async detail(stub) {
      const job = normaliseJob({ ...stub, postedAt: stub.postedAt });
      if (!job) throw new Error(`unusable Arbeitnow job: ${stub.url}`);
      return job;
    },
  };
}
