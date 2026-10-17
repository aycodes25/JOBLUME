import type { FetchText } from '../lib/http.js';
import { createJobbermanScraper } from './jobberman.js';
import { createMyJobMagScraper } from './myjobmag.js';
import { createRemotiveScraper } from './remotive.js';
import type { Scraper } from './types.js';

export const SCRAPE_SOURCES = ['remotive', 'myjobmag', 'jobberman'] as const;
export type ScrapeSource = (typeof SCRAPE_SOURCES)[number];

/** Max NEW jobs processed per run, to keep detail requests polite. */
export const SCRAPE_LIMITS: Record<ScrapeSource, number> = {
  remotive: 100,
  myjobmag: 25,
  jobberman: 25,
};

export function createScrapers(fetchText: FetchText): Record<ScrapeSource, Scraper> {
  return {
    remotive: createRemotiveScraper(fetchText),
    myjobmag: createMyJobMagScraper(fetchText),
    jobberman: createJobbermanScraper(fetchText),
  };
}
