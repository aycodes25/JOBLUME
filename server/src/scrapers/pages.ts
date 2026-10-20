import type { JobStub } from '../domain/jobs.js';
import { randomBetween, sleep, type FetchText } from '../lib/http.js';

/** A short random wait between two listing pages of the same site, so the requests are not a burst. */
export const defaultPagePause = (): Promise<void> => sleep(randomBetween(1000, 3000));

/**
 * Reads listing pages 1..pages one after another and joins the jobs (a job seen twice is kept once).
 * Page 1 failing is an error, because then nothing was read. A later page failing or coming back empty
 * (past the last page) just stops: the earlier pages are still worth having.
 */
export async function listPages(opts: {
  fetchText: FetchText;
  pageUrl(page: number): string;
  parse(html: string): JobStub[];
  pages: number;
  pause?: () => Promise<void>;
}): Promise<JobStub[]> {
  const pause = opts.pause ?? defaultPagePause;
  const seen = new Set<string>();
  const out: JobStub[] = [];
  for (let page = 1; page <= opts.pages; page++) {
    if (page > 1) await pause();
    let stubs: JobStub[];
    try {
      stubs = opts.parse(await opts.fetchText(opts.pageUrl(page)));
    } catch (err) {
      if (page === 1) throw err;
      break;
    }
    if (stubs.length === 0) break;
    for (const stub of stubs) {
      if (seen.has(stub.url)) continue;
      seen.add(stub.url);
      out.push(stub);
    }
  }
  return out;
}
