import { normaliseJob, parsePostedAt, type JobStub } from '../domain/jobs.js';
import { htmlToText } from '../lib/html.js';
import type { FetchText } from '../lib/http.js';
import { defaultPagePause } from './pages.js';
import type { Scraper } from './types.js';

const SEARCH_URL = 'https://himalayas.app/jobs/api/search';
// The search is cached by Himalayas; an uncached query has been seen taking 45 seconds.
const TIMEOUT_MS = 60_000;

/** Searched when no user has a role yet. */
export const HIMALAYAS_DEFAULT_QUERIES = ['developer', 'engineer'] as const;
export const HIMALAYAS_MAX_QUERIES = 3;

interface HimalayasJob {
  title?: string;
  companyName?: string;
  locationRestrictions?: unknown;
  description?: string;
  pubDate?: number;
  applicationLink?: string;
}

/**
 * The search words: the desired roles of all users, most shared first, at most `max`. Falls back to developer and
 * engineer when nobody has a role. Each is searched for jobs open to Nigeria, so worldwide jobs are included.
 */
export function buildHimalayasQueries(profiles: Array<{ desired_roles: string[] }>, max: number = HIMALAYAS_MAX_QUERIES): string[] {
  const counts = new Map<string, { n: number; first: number }>();
  let order = 0;
  for (const p of profiles) {
    for (const raw of new Set(p.desired_roles.map((r) => r.replace(/\s+/g, ' ').trim().toLowerCase()))) {
      if (raw.length < 2) continue;
      const entry = counts.get(raw);
      if (entry) entry.n++;
      else counts.set(raw, { n: 1, first: order++ });
    }
  }
  const queries = [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first)
    .slice(0, max)
    .map(([role]) => role);
  return queries.length > 0 ? queries : [...HIMALAYAS_DEFAULT_QUERIES];
}

export const himalayasSearchUrl = (query: string): string =>
  `${SEARCH_URL}?${new URLSearchParams({ q: query, country: 'NG', sort: 'recent' }).toString()}`;

/**
 * One search response to stubs. No restrictions means open worldwide; otherwise the countries are the location.
 * The terms ask for a link back to Himalayas and naming it as the source, so the job's Himalayas page (its
 * applicationLink) is kept as the stored link and the board is shown as "Himalayas".
 */
export function parseHimalayas(json: string): JobStub[] {
  const data = JSON.parse(json) as { jobs?: HimalayasJob[] };
  const stubs: JobStub[] = [];
  for (const job of data.jobs ?? []) {
    if (!job.title || !job.companyName || !job.applicationLink) continue;
    const countries = Array.isArray(job.locationRestrictions)
      ? job.locationRestrictions.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
      : [];
    stubs.push({
      title: job.title.trim(),
      company: job.companyName.trim(),
      location: countries.length > 0 ? countries.join(', ') : 'Worldwide',
      url: job.applicationLink,
      source: 'himalayas',
      description: htmlToText(job.description ?? ''),
      postedAt: parsePostedAt(job.pubDate),
    });
  }
  return stubs;
}

export function createHimalayasScraper(
  fetchText: FetchText,
  opts: { loadQueries?: () => Promise<string[]>; pause?: () => Promise<void> } = {},
): Scraper {
  const pause = opts.pause ?? defaultPagePause;
  return {
    source: 'himalayas',
    async list() {
      const queries = opts.loadQueries ? await opts.loadQueries() : [...HIMALAYAS_DEFAULT_QUERIES];
      const byUrl = new Map<string, JobStub>();
      let succeeded = 0;
      let lastError: unknown;
      for (const [i, query] of queries.entries()) {
        if (i > 0) await pause();
        try {
          for (const stub of parseHimalayas(await fetchText(himalayasSearchUrl(query), { timeoutMs: TIMEOUT_MS }))) {
            if (!byUrl.has(stub.url)) byUrl.set(stub.url, stub);
          }
          succeeded++;
        } catch (err) {
          lastError = err;
        }
      }
      if (succeeded === 0 && lastError !== undefined) throw lastError;
      return [...byUrl.values()];
    },
    async detail(stub) {
      const job = normaliseJob({ ...stub, postedAt: stub.postedAt });
      if (!job) throw new Error(`unusable Himalayas job: ${stub.url}`);
      return job;
    },
  };
}
