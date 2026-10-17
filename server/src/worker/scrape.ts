import { dedupeJobs, type NormalisedJob } from '../domain/jobs.js';
import type { Logger } from '../lib/logger.js';
import { randomBetween } from '../lib/http.js';
import type { Scraper } from '../scrapers/types.js';

export interface ScrapeDeps {
  scraper: Scraper;
  maxNew: number;
  findSeenUrls(urls: string[]): Promise<Set<string>>;
  insertJobs(jobs: NormalisedJob[]): Promise<string[]>;
  enqueueMatch(jobId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  log: Logger;
}

export async function runScrape(d: ScrapeDeps): Promise<{ listed: number; fetched: number; inserted: number }> {
  const stubs = await d.scraper.list();
  const seen = await d.findSeenUrls(stubs.map((s) => s.url));
  const fresh = stubs.filter((s) => !seen.has(s.url)).slice(0, d.maxNew);

  const jobs: NormalisedJob[] = [];
  for (const [i, stub] of fresh.entries()) {
    const delay = d.scraper.detailDelayMs;
    if (i > 0 && delay) await d.sleep(randomBetween(delay[0], delay[1]));
    try {
      jobs.push(await d.scraper.detail(stub));
    } catch (err) {
      d.log.warn({ err, url: stub.url, source: d.scraper.source }, 'detail fetch failed, skipping job');
    }
  }

  const ids = await d.insertJobs(dedupeJobs(jobs));
  for (const id of ids) await d.enqueueMatch(id);
  d.log.info({ source: d.scraper.source, listed: stubs.length, fetched: jobs.length, inserted: ids.length }, 'scrape finished');
  return { listed: stubs.length, fetched: jobs.length, inserted: ids.length };
}
