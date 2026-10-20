import { describe, expect, it, vi } from 'vitest';
import { createScrapers, SCRAPE_EVERY_MS, SCRAPE_LIMITS, SCRAPE_SOURCES } from '../../src/scrapers/index.js';
import type { Scraper } from '../../src/scrapers/types.js';

describe('scraper registry', () => {
  it('includes jsearch with its own limit and a daily schedule', () => {
    expect(SCRAPE_SOURCES).toEqual(['remotive', 'myjobmag', 'jobberman', 'jsearch']);
    expect(SCRAPE_LIMITS.jsearch).toBe(50);
    expect(SCRAPE_EVERY_MS.jsearch).toBe(24 * 60 * 60 * 1000);
    for (const s of ['remotive', 'myjobmag', 'jobberman'] as const) expect(SCRAPE_EVERY_MS[s]).toBe(6 * 60 * 60 * 1000);
  });

  it('uses the JSearch scraper it is given', () => {
    const jsearch: Scraper = { source: 'jsearch', list: vi.fn(), detail: vi.fn() };
    expect(createScrapers(vi.fn(), { jsearch }).jsearch).toBe(jsearch);
  });

  it('falls back to an inert JSearch scraper that lists nothing', async () => {
    expect(await createScrapers(vi.fn()).jsearch.list()).toEqual([]);
  });
});
