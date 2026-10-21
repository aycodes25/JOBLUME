import { describe, expect, it, vi } from 'vitest';
import { createScrapers, SCRAPE_LIMITS, SCRAPE_SOURCES, scrapeIntervalMs } from '../../src/scrapers/index.js';
import type { Scraper } from '../../src/scrapers/types.js';

describe('scraper registry', () => {
  it('lists the sources in the order the scheduler starts them', () => {
    expect(SCRAPE_SOURCES).toEqual(['remotive', 'myjobmag', 'jobberman', 'remoteok', 'weworkremotely', 'himalayas', 'arbeitnow', 'jsearch']);
  });

  it('caps MyJobMag and Jobberman at 60 new jobs a run, and keeps the other limits', () => {
    expect(SCRAPE_LIMITS.myjobmag).toBe(60);
    expect(SCRAPE_LIMITS.jobberman).toBe(60);
    expect(SCRAPE_LIMITS.remotive).toBe(100);
    expect(SCRAPE_LIMITS.remoteok).toBe(60);
    expect(SCRAPE_LIMITS.weworkremotely).toBe(60);
    expect(SCRAPE_LIMITS.himalayas).toBe(60);
    expect(SCRAPE_LIMITS.arbeitnow).toBe(60);
    expect(SCRAPE_LIMITS.jsearch).toBe(50);
  });

  it('runs job boards at the configured interval, JSearch daily and Remotive 4 times a day', () => {
    expect(scrapeIntervalMs('myjobmag', 120)).toBe(2 * 60 * 60 * 1000);
    expect(scrapeIntervalMs('jobberman', 30)).toBe(30 * 60 * 1000);
    expect(scrapeIntervalMs('remoteok', 120)).toBe(2 * 60 * 60 * 1000);
    expect(scrapeIntervalMs('weworkremotely', 60)).toBe(60 * 60 * 1000);
    expect(scrapeIntervalMs('himalayas', 120)).toBe(2 * 60 * 60 * 1000);
    expect(scrapeIntervalMs('arbeitnow', 90)).toBe(90 * 60 * 1000);
    expect(scrapeIntervalMs('jsearch', 120)).toBe(24 * 60 * 60 * 1000);
    expect(scrapeIntervalMs('remotive', 30)).toBe(6 * 60 * 60 * 1000);
  });

  it('uses the JSearch scraper it is given', () => {
    const jsearch: Scraper = { source: 'jsearch', list: vi.fn(), detail: vi.fn() };
    expect(createScrapers(vi.fn(), { jsearch }).jsearch).toBe(jsearch);
  });

  it('falls back to an inert JSearch scraper that lists nothing', async () => {
    expect(await createScrapers(vi.fn()).jsearch.list()).toEqual([]);
  });
});
