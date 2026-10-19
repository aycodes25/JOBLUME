import type { FetchText } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { createJobbermanScraper } from './jobberman.js';
import { createJSearchScraper } from './jsearch.js';
import { createMyJobMagScraper } from './myjobmag.js';
import { createRemotiveScraper } from './remotive.js';
import type { Scraper } from './types.js';

export const SCRAPE_SOURCES = ['remotive', 'myjobmag', 'jobberman', 'jsearch'] as const;
export type ScrapeSource = (typeof SCRAPE_SOURCES)[number];

/** Max NEW jobs processed per run, to keep detail requests polite. */
export const SCRAPE_LIMITS: Record<ScrapeSource, number> = {
  remotive: 100,
  myjobmag: 25,
  jobberman: 25,
  jsearch: 50,
};

const SIX_HOURS = 6 * 60 * 60 * 1000;

/** How often the scheduler runs each source. JSearch is daily to stay inside its small monthly quota. */
export const SCRAPE_EVERY_MS: Record<ScrapeSource, number> = {
  remotive: SIX_HOURS,
  myjobmag: SIX_HOURS,
  jobberman: SIX_HOURS,
  jsearch: 24 * 60 * 60 * 1000,
};

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
    jsearch: extra.jsearch ?? inertJSearch(),
  };
}
