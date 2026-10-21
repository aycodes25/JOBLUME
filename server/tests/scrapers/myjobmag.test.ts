import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createMyJobMagScraper, isAllowedMyJobMagUrl, MYJOBMAG_USER_AGENT, parseMyJobMagDetail, parseMyJobMagList } from '../../src/scrapers/myjobmag.js';

const read = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const LIST_SNIPPET = `
<ul>
<li class="job-list-li"><ul>
  <li class="job-logo"><a href="/jobs-at/viju"><img alt="Viju"></a></li>
  <li class="job-info"><ul>
    <li class="mag-b"><h2><a href="/job/quality-assurance-viju-industries-nigeria-limited">Quality Assurance at Viju Industries Nigeria Limited</a></h2></li>
    <li class="job-desc">A leading firm in the beverage production industry</li>
  </ul></li>
</ul></li>
<li class="job-list-li" style="text-align:center;"><a href="/jobs?page=2">Next</a></li>
</ul>`;

const DETAIL_SNIPPET = `
<ul class="job-key-info">
  <li><span class="jkey-title">Job Type</span> <span class="jkey-info"><a>Full Time</a></span></li>
  <li><span class="jkey-title">Location</span> <span class="jkey-info"><a href='/jobs-location/abuja'>Abuja</a> , <a href='/jobs-location/ogun'>Ogun</a></span></li>
</ul>
<div class="job-details"><p><strong>About job</strong></p><ul><li>Run lab tests</li><li>Issue reports</li></ul></div>`;

describe('parseMyJobMagList', () => {
  it('extracts title, company, absolute url and teaser; skips the pagination item', () => {
    expect(parseMyJobMagList(LIST_SNIPPET)).toEqual([
      {
        title: 'Quality Assurance',
        company: 'Viju Industries Nigeria Limited',
        location: '',
        url: 'https://www.myjobmag.com/job/quality-assurance-viju-industries-nigeria-limited',
        source: 'myjobmag',
        description: 'A leading firm in the beverage production industry',
      },
    ]);
  });

  it('splits on the LAST " at " so titles containing "at" survive', () => {
    const html = `<li class="job-list-li"><li class="mag-b"><h2><a href="/job/x">Data Analyst at Scale at Acme Ltd</a></h2></li></li>`;
    const [stub] = parseMyJobMagList(html);
    expect(stub).toMatchObject({ title: 'Data Analyst at Scale', company: 'Acme Ltd' });
  });

  it('parses the live list page', () => {
    const stubs = parseMyJobMagList(read('myjobmag-list.html'));
    expect(stubs.length).toBeGreaterThan(5);
    for (const s of stubs) {
      expect(s.url).toMatch(/^https:\/\/www\.myjobmag\.com\/job\//);
      expect(s.title).not.toBe('');
      expect(s.company).not.toBe('');
    }
  });
});

describe('parseMyJobMagDetail', () => {
  it('extracts joined locations and the description text', () => {
    expect(parseMyJobMagDetail(DETAIL_SNIPPET)).toEqual({
      location: 'Abuja, Ogun',
      description: 'About job\n• Run lab tests\n• Issue reports',
    });
  });

  it('parses the live detail page', () => {
    const d = parseMyJobMagDetail(read('myjobmag-detail.html'));
    expect(d.description.length).toBeGreaterThan(100);
    expect(d.location).not.toBe('');
  });
});

describe('createMyJobMagScraper', () => {
  it('detail() fetches the page and merges location and description', async () => {
    const fetchText = vi.fn().mockResolvedValue(DETAIL_SNIPPET);
    const scraper = createMyJobMagScraper(fetchText);
    const stub = parseMyJobMagList(LIST_SNIPPET)[0]!;
    const job = await scraper.detail(stub);
    expect(fetchText).toHaveBeenCalledWith(stub.url, { userAgent: MYJOBMAG_USER_AGENT });
    expect(job).toMatchObject({ location: 'Abuja, Ogun', source: 'myjobmag', companyDomain: null });
    expect(job.description).toContain('Run lab tests');
    expect(scraper.detailDelayMs).toEqual([1000, 3000]);
  });

  it('detail() falls back to the list teaser when the page has no description', async () => {
    const scraper = createMyJobMagScraper(vi.fn().mockResolvedValue('<html></html>'));
    const job = await scraper.detail(parseMyJobMagList(LIST_SNIPPET)[0]!);
    expect(job.description).toBe('A leading firm in the beverage production industry');
  });
});

describe('MyJobMag honest user agent and robots.txt-allowed URLs', () => {
  const noPause = async () => {};

  it('identifies itself as JobLumeBot', () => {
    expect(MYJOBMAG_USER_AGENT).toBe('JobLumeBot/1.0 (personal job-search tool)');
  });

  it('sends the bot user agent on every list and detail request, and only requests allowed URLs', async () => {
    const calls: Array<{ url: string; opts: { userAgent?: string } | undefined }> = [];
    const fetchText = vi.fn<(url: string, opts?: { timeoutMs?: number; userAgent?: string }) => Promise<string>>(async (url, opts) => {
      calls.push({ url, opts });
      return url.endsWith('/jobs') || url.includes('/jobs/page/') ? LIST_SNIPPET : DETAIL_SNIPPET;
    });
    const scraper = createMyJobMagScraper(fetchText, { pause: noPause });
    const stubs = await scraper.list();
    await scraper.detail(stubs[0]!);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) {
      expect(c.opts?.userAgent).toBe(MYJOBMAG_USER_AGENT);
      expect(isAllowedMyJobMagUrl(c.url)).toBe(true);
      expect(c.url).not.toContain('?');
    }
  });

  it('builds list pages /jobs, /jobs/page/2, /jobs/page/3', async () => {
    const urls: string[] = [];
    const scraper = createMyJobMagScraper(
      vi.fn(async (url: string) => {
        urls.push(url);
        return LIST_SNIPPET.replace('quality-assurance-viju', `qa-${urls.length}`);
      }),
      { pause: noPause },
    );
    await scraper.list();
    expect(urls).toEqual(['https://www.myjobmag.com/jobs', 'https://www.myjobmag.com/jobs/page/2', 'https://www.myjobmag.com/jobs/page/3']);
  });

  it('isAllowedMyJobMagUrl accepts only the allowed shapes', () => {
    for (const ok of ['https://www.myjobmag.com/jobs', 'https://www.myjobmag.com/jobs/page/2', 'https://www.myjobmag.com/jobs/page/12', 'https://www.myjobmag.com/job/some-slug-1']) {
      expect(isAllowedMyJobMagUrl(ok)).toBe(true);
    }
    for (const bad of [
      'https://www.myjobmag.com/jobs?page=2',
      'https://www.myjobmag.com/job/slug?x=1',
      'https://www.myjobmag.com/apply-now/slug',
      'https://www.myjobmag.com/search/jobs?q=a',
      'https://www.myjobmag.com/jobs-at/viju',
      'https://www.myjobmag.com/job/',
      'https://www.myjobmag.com/job/a/b',
      'https://other.example/job/slug',
      'not a url',
    ]) {
      expect(isAllowedMyJobMagUrl(bad)).toBe(false);
    }
  });

  it('detail() refuses a stub whose url robots.txt disallows, without requesting it', async () => {
    const fetchText = vi.fn().mockResolvedValue(DETAIL_SNIPPET);
    const scraper = createMyJobMagScraper(fetchText);
    const stub = { ...parseMyJobMagList(LIST_SNIPPET)[0]!, url: 'https://www.myjobmag.com/apply-now/x' };
    await expect(scraper.detail(stub)).rejects.toThrow(/robots/);
    expect(fetchText).not.toHaveBeenCalled();
  });

  it('the list parser drops links that are not /job/<slug>', () => {
    const html = LIST_SNIPPET.replace('/job/quality-assurance-viju-industries-nigeria-limited', '/job/quality?ref=1');
    expect(parseMyJobMagList(html)).toEqual([]);
  });
});
