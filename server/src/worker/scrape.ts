import { dedupeJobs, type NormalisedJob } from '../domain/jobs.js';
import { prefilterJob } from '../domain/prefilter.js';
import type { Logger } from '../lib/logger.js';
import { randomBetween } from '../lib/http.js';
import type { Scraper } from '../scrapers/types.js';
import { scanFailureReason, type ScanRunInput } from '../services/scan/runs.js';
import type { MatchCandidate } from './match.js';

export interface ScrapeDeps {
  scraper: Scraper;
  maxNew: number;
  findSeenUrls(urls: string[]): Promise<Set<string>>;
  insertJobs(jobs: NormalisedJob[]): Promise<string[]>;
  enqueueMatch(jobId: string): Promise<void>;
  /** Profiles that could receive these jobs; used only to count how many new jobs the title and place checks turn away. */
  loadCandidates(): Promise<MatchCandidate[]>;
  sleep(ms: number): Promise<void>;
  log: Logger;
}

export interface ScrapeResult {
  /** Jobs the source listed. */
  listed: number;
  /** Listed jobs not stored before (capped at maxNew). */
  newCount: number;
  /** New jobs whose details were read. */
  fetched: number;
  /** Jobs actually added to the database. */
  inserted: number;
  /** New jobs that no user's roles fit on the title, or that fit on the title for somebody but not the place. */
  rejected: { title: number; location: number };
}

/**
 * How many of these jobs no candidate would accept, by reason. A job counts once: as "location" when its title fits
 * at least one user (only the place was wrong), otherwise as "title". With no candidates nothing is counted.
 */
export function countRejections(jobs: Array<Pick<NormalisedJob, 'title' | 'location' | 'source'>>, candidates: MatchCandidate[]): ScrapeResult['rejected'] {
  const rejected = { title: 0, location: 0 };
  if (candidates.length === 0) return rejected;
  for (const job of jobs) {
    const reasons = candidates.map((c) => prefilterJob(job, c));
    if (reasons.some((r) => r.ok)) continue;
    const failed = reasons.flatMap((r) => (r.ok || r.reason === 'no_roles' ? [] : [r.reason]));
    if (failed.includes('location')) rejected.location++;
    else if (failed.includes('title')) rejected.title++;
  }
  return rejected;
}

export async function runScrape(d: ScrapeDeps): Promise<ScrapeResult> {
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

  const unique = dedupeJobs(jobs);
  const ids = await d.insertJobs(unique);
  for (const id of ids) {
    try {
      await d.enqueueMatch(id);
    } catch (err) {
      d.log.warn({ err, jobId: id }, 'enqueue match failed');
    }
  }

  let rejected = { title: 0, location: 0 };
  try {
    rejected = countRejections(unique, await d.loadCandidates());
  } catch (err) {
    // The counts are only for the Last scan card: never fail a scan over them.
    d.log.warn({ err, source: d.scraper.source }, 'could not count prefilter rejections');
  }

  const result: ScrapeResult = { listed: stubs.length, newCount: fresh.length, fetched: jobs.length, inserted: ids.length, rejected };
  d.log.info({ source: d.scraper.source, ...result }, 'scrape finished');
  return result;
}

export interface RecordedScrapeDeps extends ScrapeDeps {
  recordRun(run: ScanRunInput): Promise<void>;
  now(): Date;
}

/** runScrape, then one scan_runs row: 'ok' with the counts, or 'failed' with a short reason (the error is still thrown). */
export async function runRecordedScrape(d: RecordedScrapeDeps): Promise<ScrapeResult> {
  const startedAt = d.now();
  const zero = { listed: 0, new_count: 0, inserted: 0, rejected_title: 0, rejected_location: 0 };
  const save = async (run: ScanRunInput) => {
    try {
      await d.recordRun(run);
    } catch (err) {
      d.log.warn({ err, source: d.scraper.source }, 'could not record the scan run');
    }
  };
  try {
    const result = await runScrape(d);
    await save({
      source: d.scraper.source, started_at: startedAt.toISOString(), finished_at: d.now().toISOString(), status: 'ok', error: null,
      listed: result.listed, new_count: result.newCount, inserted: result.inserted,
      rejected_title: result.rejected.title, rejected_location: result.rejected.location,
    });
    return result;
  } catch (err) {
    d.log.warn({ err, source: d.scraper.source }, 'scan failed');
    await save({
      source: d.scraper.source, started_at: startedAt.toISOString(), finished_at: d.now().toISOString(), status: 'failed',
      error: scanFailureReason(err), ...zero,
    });
    throw err;
  }
}
