import * as cheerio from 'cheerio';
import { parsePostedAt, type JobStub } from '../domain/jobs.js';
import { htmlToText } from '../lib/html.js';
import type { FetchText } from '../lib/http.js';
import { listPages } from './pages.js';
import type { Scraper } from './types.js';

const BASE = 'https://www.myjobmag.com';
const LIST_URL = `${BASE}/jobs`;

export function parseMyJobMagList(html: string): JobStub[] {
  const $ = cheerio.load(html);
  const stubs: JobStub[] = [];
  $('li.mag-b h2 a[href^="/job/"]').each((_, el) => {
    const a = $(el);
    const li = a.closest('li.job-list-li');
    const href = a.attr('href');
    if (!href) return;
    const text = a.text().replace(/\s+/g, ' ').trim();
    const idx = text.lastIndexOf(' at ');
    if (idx <= 0) return;
    const company = text.slice(idx + 4).trim();
    if (!company) return;
    stubs.push({
      title: text.slice(0, idx).trim(),
      company,
      location: '',
      url: new URL(href, BASE).toString(),
      source: 'myjobmag',
      description: $(li).find('li.job-desc').first().text().replace(/\s+/g, ' ').trim(),
    });
  });
  return stubs;
}

// The page's JSON-LD block is not always valid JSON (raw control characters), so the posted time is read with a pattern.
const DATE_POSTED = /"datePosted"\s*:\s*"([^"]+)"/;

export function parseMyJobMagDetail(html: string): { description: string; location: string; postedAt?: string } {
  const $ = cheerio.load(html);
  let location = '';
  $('ul.job-key-info li').each((_, li) => {
    if ($(li).find('.jkey-title').first().text().trim().toLowerCase() !== 'location') return;
    const info = $(li).find('.jkey-info').first();
    const links = info.find('a').map((__, a) => $(a).text().trim()).get().filter(Boolean);
    location = links.length ? links.join(', ') : info.text().replace(/\s+/g, ' ').trim();
  });
  const description = $('.job-details')
    .map((_, el) => htmlToText($(el).html() ?? ''))
    .get()
    .join('\n\n')
    .trim();
  const postedAt = parsePostedAt(DATE_POSTED.exec(html)?.[1]);
  return { description, location, ...(postedAt ? { postedAt } : {}) };
}

/** Listing pages read per scan: /jobs, then /jobs/page/2 and /jobs/page/3 (35 jobs each). */
export const MYJOBMAG_PAGES = 3;
const pageUrl = (page: number) => (page === 1 ? LIST_URL : `${LIST_URL}/page/${page}`);

export function createMyJobMagScraper(fetchText: FetchText, opts: { pages?: number; pause?: () => Promise<void> } = {}): Scraper {
  return {
    source: 'myjobmag',
    detailDelayMs: [1000, 3000],
    async list() {
      return listPages({ fetchText, pageUrl, parse: parseMyJobMagList, pages: opts.pages ?? MYJOBMAG_PAGES, pause: opts.pause });
    },
    async detail(stub) {
      const { description, location, postedAt } = parseMyJobMagDetail(await fetchText(stub.url));
      return {
        title: stub.title,
        company: stub.company,
        location: location || stub.location,
        description: description || stub.description || '',
        source: 'myjobmag',
        url: stub.url,
        companyDomain: null,
        postedAt: postedAt ?? null,
      };
    },
  };
}
