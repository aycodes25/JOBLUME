import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createScrapers, SCRAPE_LIMITS, SCRAPE_SOURCES } from '../../src/scrapers/index.js';
import { createJobbermanScraper, parseJobbermanDetail, parseJobbermanList } from '../../src/scrapers/jobberman.js';

const read = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const LIST_SNIPPET = `
<div data-cy="listing-cards-components">
  <div class="flex-1"><div class="w-full">
    <div class="flex items-center">
      <a href="https://www.jobberman.com/listings/program-officer-z8xz28" data-cy="listing-title-link" title="Program Officer"><p>Program Officer</p></a>
    </div>
    <p class="text-sm text-blue-700"> Leadership Initiative for Youth Empowerment </p>
    <div class="flex flex-wrap mt-3">
      <span class="mb-3 px-3 py-1 rounded"> Lagos </span>
      <span class="mb-3 px-3 py-1 rounded">Full Time</span>
    </div>
  </div></div>
</div>
<div data-cy="listing-cards-components">
  <div class="flex items-center"><a href="https://www.jobberman.com/listings/x" data-cy="listing-title-link" title="No Company"></a></div>
</div>`;

const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
const DETAIL_SNIPPET = `<html><head>${ld({ '@context': 'https://schema.org', '@graph': [
  { '@type': 'WebPage', name: 'x' },
  { '@type': 'JobPosting', title: 'Program Officer', description: '<p><b>Responsibilities:</b></p><ul><li>Find donors</li></ul>' },
] })}</head></html>`;

describe('parseJobbermanList', () => {
  it('extracts title, company, location and url; skips cards without a company', () => {
    expect(parseJobbermanList(LIST_SNIPPET)).toEqual([
      {
        title: 'Program Officer',
        company: 'Leadership Initiative for Youth Empowerment',
        location: 'Lagos',
        url: 'https://www.jobberman.com/listings/program-officer-z8xz28',
        source: 'jobberman',
      },
    ]);
  });

  it('parses the live list page', () => {
    const stubs = parseJobbermanList(read('jobberman-list.html'));
    expect(stubs.length).toBeGreaterThan(5);
    for (const s of stubs) {
      expect(s.url).toMatch(/^https:\/\/www\.jobberman\.com\/listings\//);
      expect(s.title).not.toBe('');
      expect(s.company).not.toBe('');
    }
  });
});

describe('parseJobbermanDetail', () => {
  it('reads the JobPosting description from JSON-LD', () => {
    expect(parseJobbermanDetail(DETAIL_SNIPPET)).toEqual({ description: 'Responsibilities:\n• Find donors' });
  });

  it('returns an empty description when there is no JobPosting or the JSON is invalid', () => {
    expect(parseJobbermanDetail('<html></html>')).toEqual({ description: '' });
    expect(parseJobbermanDetail('<script type="application/ld+json">{oops</script>')).toEqual({ description: '' });
  });

  it('parses the live detail page', () => {
    expect(parseJobbermanDetail(read('jobberman-detail.html')).description.length).toBeGreaterThan(100);
  });
});

describe('createJobbermanScraper', () => {
  it('detail() fetches the listing page and returns the description', async () => {
    const fetchText = vi.fn().mockResolvedValue(DETAIL_SNIPPET);
    const scraper = createJobbermanScraper(fetchText);
    const stub = parseJobbermanList(LIST_SNIPPET)[0]!;
    const job = await scraper.detail(stub);
    expect(fetchText).toHaveBeenCalledWith(stub.url);
    expect(job).toMatchObject({ company: stub.company, location: 'Lagos', source: 'jobberman', companyDomain: null });
    expect(job.description).toContain('Find donors');
    expect(scraper.detailDelayMs).toEqual([1000, 3000]);
  });
});

describe('createScrapers', () => {
  it('registers every source with a positive limit', () => {
    const scrapers = createScrapers(vi.fn());
    for (const source of SCRAPE_SOURCES) {
      expect(scrapers[source].source).toBe(source);
      expect(SCRAPE_LIMITS[source]).toBeGreaterThan(0);
    }
  });
});

describe('jobberman hardening', () => {
  it('parses a top-level JSON-LD array', () => {
    const html = `<script type="application/ld+json">${JSON.stringify([{ '@type': 'JobPosting', description: '<p>Array form</p>' }])}</script>`;
    expect(parseJobbermanDetail(html).description).toContain('Array form');
  });

  it('skips cards whose url is not on www.jobberman.com', () => {
    const card = (href: string) => `<div data-cy="listing-cards-components"><div><a href="${href}" data-cy="listing-title-link" title="T"></a></div><p>Co</p></div>`;
    const stubs = parseJobbermanList(card('https://evil.example.com/x') + card('/listings/ok') + card('https://www.jobberman.com.evil.io/y'));
    expect(stubs.map((s) => s.url)).toEqual(['https://www.jobberman.com/listings/ok']);
  });
});
