import type { FetchText } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { createArbeitnowScraper } from './arbeitnow.js';
import { createJobbermanScraper } from './jobberman.js';
import { createJSearchScraper } from './jsearch.js';
import { createMyJobMagScraper } from './myjobmag.js';
import { createRemoteOkScraper } from './remoteok.js';
import { createRemotiveScraper } from './remotive.js';
import type { Scraper } from './types.js';

export const SCRAPE_SOURCES = ['remotive', 'myjobmag', 'jobberman', 'remoteok', 'arbeitnow', 'jsearch'] as const;
export type ScrapeSource = (typeof SCRAPE_SOURCES)[number];

/** Max NEW jobs processed per run, to keep detail requests polite. */
export const SCRAPE_LIMITS: Record<ScrapeSource, number> = {
  remotive: 100,
  myjobmag: 60,
  jobberman: 60,
  remoteok: 60,
  arbeitnow: 60,
  jsearch: 50,
};

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How often the scheduler runs a source. Job boards use SCRAPE_EVERY_MINUTES. Two sources keep their own pace:
 * JSearch is daily to stay inside its small monthly quota, and Remotive asks callers to fetch at most 4 times a day.
 */
export function scrapeIntervalMs(source: ScrapeSource, boardMinutes: number): number {
  if (source === 'jsearch') return ONE_DAY_MS;
  if (source === 'remotive') return SIX_HOURS_MS;
  return boardMinutes * 60_000;
}

const inertJSearch = () =>
  createJSearchScraper({
    client: null,
    quota: { consume: async () => false, refund: async () => undefined },
    loadProfiles: async () => [],
    log: logger,
  });

export function createScrapers(fetchText: FetchText, extra: { jsearch?: Scraper } = {}): Record<ScrapeSource, Scraper> {
  return {
    remotive: createRemotiveScraper(fetchText),
    myjobmag: createMyJobMagScraper(fetchText),
    jobberman: createJobbermanScraper(fetchText),
    remoteok: createRemoteOkScraper(fetchText),
    arbeitnow: createArbeitnowScraper(fetchText),
    jsearch: extra.jsearch ?? inertJSearch(),
  };
}
