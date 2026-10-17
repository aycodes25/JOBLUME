import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createRemotiveScraper, parseRemotive } from '../../src/scrapers/remotive.js';

const fixture = readFileSync(new URL('../fixtures/remotive.json', import.meta.url), 'utf8');

describe('parseRemotive', () => {
  it('maps the live API shape to stubs', () => {
    const stubs = parseRemotive(fixture);
    expect(stubs).toHaveLength(3);
    for (const s of stubs) {
      expect(s.source).toBe('remotive');
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.company.length).toBeGreaterThan(0);
      expect(s.url).toMatch(/^https:\/\/remotive\.com\//);
      expect(s.description).not.toMatch(/<[a-z][\s\S]*>/i);
    }
  });

  it('falls back to "Remote" when no location is given', () => {
    const json = JSON.stringify({
      jobs: [{ url: 'https://remotive.com/x', title: 'T', company_name: 'C', candidate_required_location: '', description: '<p>d</p>' }],
    });
    expect(parseRemotive(json)[0]!.location).toBe('Remote');
  });

  it('skips entries missing a url, title or company', () => {
    const json = JSON.stringify({ jobs: [{ title: 'T', company_name: 'C' }, { url: 'u', company_name: 'C' }] });
    expect(parseRemotive(json)).toEqual([]);
  });
});

describe('createRemotiveScraper', () => {
  it('lists via the API and builds the detail without another request', async () => {
    const fetchText = vi.fn().mockResolvedValue(fixture);
    const scraper = createRemotiveScraper(fetchText);
    const [stub] = await scraper.list();
    expect(fetchText).toHaveBeenCalledWith('https://remotive.com/api/remote-jobs?limit=100');
    const job = await scraper.detail(stub!);
    expect(job).toMatchObject({ source: 'remotive', url: stub!.url, companyDomain: null });
    expect(job.description.length).toBeGreaterThan(20);
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(scraper.detailDelayMs).toBeUndefined();
  });
});
