import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { buildHimalayasQueries, createHimalayasScraper, himalayasSearchUrl, parseHimalayas } from '../../src/scrapers/himalayas.js';

const fixture = readFileSync(new URL('../fixtures/himalayas.json', import.meta.url), 'utf8');
const pause = async () => undefined;

describe('parseHimalayas', () => {
  it('maps the live API shape: no restrictions means Worldwide, countries are listed, applicationLink is the link', () => {
    const stubs = parseHimalayas(fixture);
    expect(stubs).toHaveLength(2);
    expect(stubs[0]).toEqual({
      title: 'Software Engineer, AI Coding Tasks (Contract)',
      company: 'Askable',
      location: 'Worldwide',
      url: 'https://himalayas.app/companies/askable/jobs/software-engineer-ai-coding-tasks-contract?utm_source=api',
      source: 'himalayas',
      description: expect.stringContaining('experienced software engineers'),
      postedAt: '2026-10-17T00:52:16.000Z',
    });
    expect(stubs[1]!.location).toBe('India, Nigeria, Philippines, Ukraine, United States');
  });

  it('skips entries missing a title, company or link, and tolerates a body with no jobs', () => {
    const json = JSON.stringify({ jobs: [{ companyName: 'C', applicationLink: 'u' }, { title: 'T', applicationLink: 'u' }, { title: 'T', companyName: 'C' }] });
    expect(parseHimalayas(json)).toEqual([]);
    expect(parseHimalayas('{}')).toEqual([]);
  });

  it('ignores restriction entries that are not text', () => {
    const json = JSON.stringify({ jobs: [{ title: 'T', companyName: 'C', applicationLink: 'https://himalayas.app/x', locationRestrictions: [null, 5, 'Kenya', ' '] }] });
    expect(parseHimalayas(json)[0]!.location).toBe('Kenya');
  });
});

describe('buildHimalayasQueries', () => {
  it('uses the users\' roles, most shared first, at most three', () => {
    const profiles = [
      { desired_roles: ['Full Stack Developer', 'Software Engineer'] },
      { desired_roles: ['software engineer', 'Backend Developer'] },
      { desired_roles: ['Data Analyst'] },
    ];
    expect(buildHimalayasQueries(profiles)).toEqual(['software engineer', 'full stack developer', 'backend developer']);
    expect(buildHimalayasQueries(profiles, 1)).toEqual(['software engineer']);
  });

  it('counts a role once per user and ignores one-letter roles', () => {
    expect(buildHimalayasQueries([{ desired_roles: ['Nurse', 'nurse', 'x'] }])).toEqual(['nurse']);
  });

  it('falls back to developer and engineer when nobody has a role', () => {
    expect(buildHimalayasQueries([])).toEqual(['developer', 'engineer']);
    expect(buildHimalayasQueries([{ desired_roles: [] }])).toEqual(['developer', 'engineer']);
  });
});

describe('himalayasSearchUrl', () => {
  it('searches recent jobs open to Nigeria', () => {
    expect(himalayasSearchUrl('full stack developer')).toBe('https://himalayas.app/jobs/api/search?q=full+stack+developer&country=NG&sort=recent');
  });
});

describe('createHimalayasScraper', () => {
  it('runs one search per query with a long timeout, keeps a job found twice once, and waits between searches', async () => {
    const pauseSpy = vi.fn(pause);
    const fetchText = vi.fn().mockImplementation(async () => fixture);
    const scraper = createHimalayasScraper(fetchText, { loadQueries: async () => ['developer', 'engineer'], pause: pauseSpy });
    const stubs = await scraper.list();
    expect(stubs).toHaveLength(2);
    expect(fetchText.mock.calls).toEqual([
      [himalayasSearchUrl('developer'), { timeoutMs: 60_000 }],
      [himalayasSearchUrl('engineer'), { timeoutMs: 60_000 }],
    ]);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it('searches developer and engineer when no query loader is given', async () => {
    const fetchText = vi.fn().mockImplementation(async () => fixture);
    await createHimalayasScraper(fetchText, { pause }).list();
    expect(fetchText).toHaveBeenCalledTimes(2);
  });

  it('keeps going when one search fails, and fails only when every search fails', async () => {
    const some = vi.fn(async (url: string) => {
      if (url.includes('q=developer')) throw new Error('timeout');
      return fixture;
    });
    const queries = async () => ['developer', 'engineer'];
    expect(await createHimalayasScraper(some, { loadQueries: queries, pause }).list()).toHaveLength(2);
    const none = vi.fn(async () => { throw new Error('timeout'); });
    await expect(createHimalayasScraper(none, { loadQueries: queries, pause }).list()).rejects.toThrow('timeout');
  });

  it('detail() builds the job without another request and refuses an empty description', async () => {
    const fetchText = vi.fn().mockImplementation(async () => fixture);
    const scraper = createHimalayasScraper(fetchText, { loadQueries: async () => ['developer'], pause });
    const [stub] = await scraper.list();
    const job = await scraper.detail(stub!);
    expect(job).toMatchObject({ source: 'himalayas', url: stub!.url, companyDomain: null, postedAt: '2026-10-17T00:52:16.000Z' });
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(scraper.detailDelayMs).toBeUndefined();
    await expect(scraper.detail({ ...stub!, description: '' })).rejects.toThrow('unusable Himalayas job');
  });
});
