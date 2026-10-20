import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createArbeitnowScraper, parseArbeitnow } from '../../src/scrapers/arbeitnow.js';

const fixture = readFileSync(new URL('../fixtures/arbeitnow.json', import.meta.url), 'utf8');

describe('parseArbeitnow', () => {
  it('keeps only the remote jobs of the live API shape (the first fixture job is on-site in Dortmund)', () => {
    const stubs = parseArbeitnow(fixture);
    expect(stubs).toHaveLength(2);
    expect(stubs[0]).toEqual({
      title: 'Full-Stack Engineer - ElevenMusic',
      company: 'ElevenLabs',
      location: 'Remote',
      url: 'https://www.arbeitnow.com/jobs/companies/elevenlabs/remote-full-stack-engineer-elevenmusic-401054',
      source: 'arbeitnow',
      description: expect.stringContaining('About ElevenLabs'),
      postedAt: '2026-10-20T17:40:41.000Z',
    });
  });

  it('makes the location say remote and keeps the place', () => {
    const job = (location: string) =>
      JSON.stringify({ data: [{ url: 'https://www.arbeitnow.com/jobs/x', title: 'Dev', company_name: 'Acme', description: '<p>d</p>', remote: true, location, created_at: 1792518041 }] });
    expect(parseArbeitnow(job('Berlin'))[0]!.location).toBe('Remote, Berlin');
    expect(parseArbeitnow(job('Remote'))[0]!.location).toBe('Remote');
    expect(parseArbeitnow(job('Remote (Germany)'))[0]!.location).toBe('Remote (Germany)');
    expect(parseArbeitnow(job(''))[0]!.location).toBe('Remote');
  });

  it('skips entries missing a link, title or company, and tolerates a body with no data', () => {
    const json = JSON.stringify({ data: [{ remote: true, title: 'T', company_name: 'C' }, { remote: true, url: 'u', company_name: 'C' }, { remote: true, url: 'u', title: 'T' }] });
    expect(parseArbeitnow(json)).toEqual([]);
    expect(parseArbeitnow('{}')).toEqual([]);
  });
});

describe('createArbeitnowScraper', () => {
  it('lists the first page of the feed and builds the detail without another request', async () => {
    const fetchText = vi.fn().mockResolvedValue(fixture);
    const scraper = createArbeitnowScraper(fetchText);
    const [stub] = await scraper.list();
    expect(fetchText).toHaveBeenCalledWith('https://www.arbeitnow.com/api/job-board-api', { timeoutMs: 60_000 });
    const job = await scraper.detail(stub!);
    expect(job).toMatchObject({ source: 'arbeitnow', url: stub!.url, companyDomain: null, postedAt: '2026-10-20T17:40:41.000Z' });
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(scraper.detailDelayMs).toBeUndefined();
  });
});
