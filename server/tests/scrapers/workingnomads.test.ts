import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createWorkingNomadsScraper, parseWorkingNomads } from '../../src/scrapers/workingnomads.js';

const fixture = readFileSync(new URL('../fixtures/workingnomads.json', import.meta.url), 'utf8');

describe('parseWorkingNomads', () => {
  it('maps the live API shape to stubs, with the board\'s own job link and the publication date', () => {
    const stubs = parseWorkingNomads(fixture);
    expect(stubs).toHaveLength(3);
    expect(stubs[0]).toEqual({
      title: 'Language specialist',
      company: 'iMerit Technology',
      location: 'Global',
      url: 'https://www.workingnomads.com/job/go/1939844/',
      source: 'workingnomads',
      description: expect.stringContaining('native or fluent speakers'),
      postedAt: '2026-10-14T04:32:03.000Z',
    });
  });

  it('turns the HTML description into plain text', () => {
    const [first] = parseWorkingNomads(fixture);
    expect(first!.description).not.toMatch(/<\/?(p|strong|h1)>/);
    expect(first!.description).toContain('Native & Fluent Speakers');
  });

  it('falls back to "Remote" when the location is empty, and skips entries missing a title, company or link', () => {
    const json = JSON.stringify([
      { url: 'https://www.workingnomads.com/job/go/1/', title: 'T', company_name: 'C', description: '<p>d</p>', location: '', pub_date: '2026-10-14T00:32:03-04:00' },
      { title: 'T', company_name: 'C' },
      { url: 'u', company_name: 'C' },
      { url: 'u', title: 'T' },
    ]);
    const stubs = parseWorkingNomads(json);
    expect(stubs).toHaveLength(1);
    expect(stubs[0]!.location).toBe('Remote');
  });

  it('tolerates a non-array body', () => {
    expect(parseWorkingNomads('{"error":"nope"}')).toEqual([]);
  });
});

describe('createWorkingNomadsScraper', () => {
  it('lists the feed once, and builds the detail without another request', async () => {
    const fetchText = vi.fn().mockResolvedValue(fixture);
    const scraper = createWorkingNomadsScraper(fetchText);
    const [stub] = await scraper.list();
    expect(fetchText).toHaveBeenCalledWith('https://www.workingnomads.com/api/exposed_jobs/', { timeoutMs: 60_000 });
    const job = await scraper.detail(stub!);
    expect(job).toMatchObject({ source: 'workingnomads', url: stub!.url, companyDomain: null });
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(scraper.detailDelayMs).toBeUndefined();
  });

  it('detail() refuses an unsafe link', async () => {
    const scraper = createWorkingNomadsScraper(vi.fn());
    await expect(
      scraper.detail({ title: 'T', company: 'C', location: 'Remote', url: 'javascript:alert(1)', source: 'workingnomads', description: 'x' }),
    ).rejects.toThrow('unusable Working Nomads job');
  });
});
