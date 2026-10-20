import * as cheerio from 'cheerio';
import { parsePostedAt, type JobStub } from '../domain/jobs.js';
import { htmlToText } from '../lib/html.js';
import type { FetchText } from '../lib/http.js';
import type { Scraper } from './types.js';

const LIST_URL = 'https://www.jobberman.com/jobs';

export function parseJobbermanList(html: string): JobStub[] {
  const $ = cheerio.load(html);
  const stubs: JobStub[] = [];
  $('[data-cy="listing-cards-components"]').each((_, card) => {
    const a = $(card).find('a[data-cy="listing-title-link"]').first();
    const href = a.attr('href');
    const title = (a.attr('title') || a.text()).replace(/\s+/g, ' ').trim();
    const company = a.closest('div').next('p').text().replace(/\s+/g, ' ').trim();
    if (!href || !title || !company) return;
    const url = new URL(href, 'https://www.jobberman.com');
    if (url.host !== 'www.jobberman.com') return;
    stubs.push({
      title,
      company,
      location: $(card).find('span.rounded').first().text().replace(/\s+/g, ' ').trim(),
      url: url.toString(),
      source: 'jobberman',
    });
  });
  return stubs;
}

export function parseJobbermanDetail(html: string): { description: string; postedAt?: string } {
  const $ = cheerio.load(html);
  let description = '';
  let postedAt: string | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (description) return;
    try {
      const json = JSON.parse($(el).contents().text()) as { '@graph'?: unknown[] } | unknown[];
      const nodes = (Array.isArray(json) ? json : (json['@graph'] ?? [json])) as Array<{ '@type'?: string; description?: string; datePosted?: string }>;
      const posting = nodes.find((n) => n['@type'] === 'JobPosting' && n.description);
      if (posting?.description) {
        description = htmlToText(posting.description);
        postedAt = parsePostedAt(posting.datePosted);
      }
    } catch {
      /* ignore malformed JSON-LD blocks */
    }
  });
  return { description, ...(postedAt ? { postedAt } : {}) };
}

export function createJobbermanScraper(fetchText: FetchText): Scraper {
  return {
    source: 'jobberman',
    detailDelayMs: [1000, 3000],
    async list() {
      return parseJobbermanList(await fetchText(LIST_URL));
    },
    async detail(stub) {
      const { description, postedAt } = parseJobbermanDetail(await fetchText(stub.url));
      return {
        title: stub.title,
        company: stub.company,
        location: stub.location,
        description: description || stub.description || '',
        source: 'jobberman',
        url: stub.url,
        companyDomain: null,
        postedAt: postedAt ?? null,
      };
    },
  };
}
