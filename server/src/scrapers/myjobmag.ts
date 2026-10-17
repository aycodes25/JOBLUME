import * as cheerio from 'cheerio';
import type { JobStub } from '../domain/jobs.js';
import { htmlToText } from '../lib/html.js';
import type { FetchText } from '../lib/http.js';
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

export function parseMyJobMagDetail(html: string): { description: string; location: string } {
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
  return { description, location };
}

export function createMyJobMagScraper(fetchText: FetchText): Scraper {
  return {
    source: 'myjobmag',
    detailDelayMs: [1000, 3000],
    async list() {
      return parseMyJobMagList(await fetchText(LIST_URL));
    },
    async detail(stub) {
      const { description, location } = parseMyJobMagDetail(await fetchText(stub.url));
      return {
        title: stub.title,
        company: stub.company,
        location: location || stub.location,
        description: description || stub.description || '',
        source: 'myjobmag',
        url: stub.url,
        companyDomain: null,
      };
    },
  };
}
