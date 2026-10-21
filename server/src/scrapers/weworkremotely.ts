import * as cheerio from 'cheerio';
import { normaliseJob, parsePostedAt, type JobStub } from '../domain/jobs.js';
import { htmlToText } from '../lib/html.js';
import type { FetchText } from '../lib/http.js';
import { defaultPagePause } from './pages.js';
import type { Scraper } from './types.js';

/** The all-categories feed and the four programming feeds (the programming feeds list jobs the main feed does not). */
export const WWR_FEEDS = [
  'https://weworkremotely.com/remote-jobs.rss',
  'https://weworkremotely.com/categories/remote-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss',
] as const;

/**
 * One RSS feed to stubs. An item's title is "Company: Job title". Its region ("Anywhere in the World", "USA Only", ...)
 * becomes the location. The item's own weworkremotely.com page is kept as the stored link, and the board is shown as
 * "We Work Remotely".
 */
export function parseWeWorkRemotely(xml: string): JobStub[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const stubs: JobStub[] = [];
  $('item').each((_, el) => {
    const item = $(el);
    const heading = item.children('title').text().replace(/\s+/g, ' ').trim();
    const url = item.children('link').text().trim() || item.children('guid').text().trim();
    const split = heading.indexOf(': ');
    if (split <= 0 || !url) return;
    const company = heading.slice(0, split).trim();
    const title = heading.slice(split + 2).trim();
    if (!company || !title) return;
    stubs.push({
      title,
      company,
      location: item.children('region').text().trim() || 'Remote',
      url,
      source: 'weworkremotely',
      description: htmlToText(item.children('description').text()),
      postedAt: parsePostedAt(item.children('pubDate').text()),
    });
  });
  return stubs;
}

export function createWeWorkRemotelyScraper(
  fetchText: FetchText,
  opts: { feeds?: readonly string[]; pause?: () => Promise<void> } = {},
): Scraper {
  const feeds = opts.feeds ?? WWR_FEEDS;
  const pause = opts.pause ?? defaultPagePause;
  return {
    source: 'weworkremotely',
    async list() {
      const byUrl = new Map<string, JobStub>();
      let succeeded = 0;
      let lastError: unknown;
      for (const [i, feed] of feeds.entries()) {
        if (i > 0) await pause();
        try {
          for (const stub of parseWeWorkRemotely(await fetchText(feed))) if (!byUrl.has(stub.url)) byUrl.set(stub.url, stub);
          succeeded++;
        } catch (err) {
          lastError = err;
        }
      }
      // One feed down is fine; every feed down is a failed scan.
      if (succeeded === 0 && lastError !== undefined) throw lastError;
      return [...byUrl.values()];
    },
    async detail(stub) {
      const job = normaliseJob({ ...stub, postedAt: stub.postedAt });
      if (!job) throw new Error(`unusable We Work Remotely job: ${stub.url}`);
      return job;
    },
  };
}
