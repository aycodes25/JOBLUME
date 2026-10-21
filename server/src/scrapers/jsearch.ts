import { canonicalJobUrl, type LinkSource } from '@joblume/shared';
import { domainFromWebsite, normaliseJob, tidyLocation, type JobStub, type NormalisedJob } from '../domain/jobs.js';
import type { Logger } from '../lib/logger.js';
import { JSearchError, type JSearchClient, type JSearchJob, type JSearchQuery } from './jsearch-client.js';
import type { Scraper } from './types.js';

/** Requests per run. The scheduler runs JSearch daily, so 2 a run keeps the 50-a-month budget lasting most of the month. */
export const JSEARCH_MAX_QUERIES = 2;

export interface QueryProfile {
  desired_roles: string[];
  location: 'Lagos' | 'Abuja' | 'Remote' | null;
}

const PLACE: Record<'Lagos' | 'Abuja', string> = { Lagos: 'Lagos, Nigeria', Abuja: 'Abuja, Nigeria' };

/** The union of every user's role and place, most shared first, capped. */
export function buildJSearchQueries(profiles: QueryProfile[], max: number = JSEARCH_MAX_QUERIES): JSearchQuery[] {
  const counts = new Map<string, { q: JSearchQuery; n: number; first: number }>();
  let order = 0;
  for (const p of profiles) {
    for (const rawRole of p.desired_roles) {
      const role = rawRole.replace(/\s+/g, ' ').trim().toLowerCase();
      if (role.length < 2) continue;
      const q: JSearchQuery =
        p.location === 'Remote'
          ? { query: `${role} remote`, remote: true }
          : { query: `${role} in ${p.location ? PLACE[p.location] : 'Nigeria'}`, remote: false };
      const key = `${q.remote}|${q.query}`;
      const entry = counts.get(key);
      if (entry) entry.n++;
      else counts.set(key, { q, n: 1, first: order++ });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.first - b.first)
    .slice(0, max)
    .map((e) => e.q);
}

export function publisherSource(publisher: unknown): LinkSource | null {
  if (typeof publisher !== 'string') return null;
  const p = publisher.trim().toLowerCase();
  if (p === 'linkedin' || p.startsWith('linkedin ')) return 'linkedin';
  if (p === 'indeed' || p.startsWith('indeed ')) return 'indeed';
  return null;
}

/** The first link (apply link, then apply options) that is a canonical job page on the publisher's own site. */
function jobLinkFor(raw: JSearchJob, source: LinkSource): string | null {
  const options = Array.isArray(raw.apply_options) ? (raw.apply_options as Array<{ apply_link?: unknown } | null>) : [];
  for (const candidate of [raw.job_apply_link, ...options.map((o) => o?.apply_link)]) {
    const link = canonicalJobUrl(candidate);
    if (link && link.source === source) return link.url;
  }
  return null;
}

export function parseJSearchJob(raw: JSearchJob): NormalisedJob | null {
  const source = publisherSource(raw.job_publisher);
  if (!source) return null;
  const url = jobLinkFor(raw, source);
  if (!url) return null;
  return normaliseJob({
    title: raw.job_title,
    company: raw.employer_name,
    location: raw.job_is_remote === true ? 'Remote' : tidyLocation([raw.job_city, raw.job_state, raw.job_country]),
    description: raw.job_description,
    source,
    url,
    companyDomain: domainFromWebsite(raw.employer_website),
    postedAt: raw.job_posted_at_datetime_utc,
  });
}

export interface JSearchScraperDeps {
  /** Null when JSEARCH_API_KEY is not set: the scraper then lists nothing. */
  client: Pick<JSearchClient, 'search'> | null;
  quota: { consume(): Promise<boolean>; refund(): Promise<void> };
  loadProfiles(): Promise<QueryProfile[]>;
  log: Logger;
  maxQueries?: number;
}

export function createJSearchScraper(d: JSearchScraperDeps): Scraper {
  // list() keeps the full jobs so detail() needs no extra request.
  const found = new Map<string, NormalisedJob>();
  return {
    source: 'jsearch',
    async list(): Promise<JobStub[]> {
      found.clear();
      if (!d.client) return [];
      const queries = buildJSearchQueries(await d.loadProfiles(), d.maxQueries ?? JSEARCH_MAX_QUERIES);
      let succeeded = 0;
      let lastError: unknown;
      for (const q of queries) {
        if (!(await d.quota.consume())) {
          d.log.warn({ source: 'jsearch' }, 'JSearch monthly limit reached; skipping until next month');
          break;
        }
        let results: JSearchJob[];
        try {
          results = await d.client.search(q);
        } catch (err) {
          // Only a request that never reached RapidAPI used no budget; anything that was sent counts.
          if (err instanceof JSearchError && err.neverSent) {
            try {
              await d.quota.refund();
            } catch (refundErr) {
              d.log.warn({ err: refundErr }, 'jsearch quota refund failed');
            }
          }
          if (err instanceof JSearchError && err.kind === 'auth') throw err;
          d.log.warn({ err, source: 'jsearch', query: q.query }, 'JSearch query failed');
          lastError = err;
          continue;
        }
        succeeded++;
        for (const raw of results) {
          const job = parseJSearchJob(raw);
          if (job && !found.has(job.url)) found.set(job.url, job);
        }
      }
      // Keep what earlier queries found; fail only when every attempted query failed.
      if (lastError !== undefined && succeeded === 0) throw lastError;
      return [...found.values()].map(({ title, company, location, url, source, description, postedAt }) => ({ title, company, location, url, source, description, postedAt }));
    },
    async detail(stub) {
      return (
        found.get(stub.url) ?? {
          title: stub.title, company: stub.company, location: stub.location, description: stub.description ?? '',
          source: stub.source, url: stub.url, companyDomain: null,
        }
      );
    },
  };
}
