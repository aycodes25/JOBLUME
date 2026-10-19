import type { FetchedPage } from '../scrapers/job-page.js';

export const PAGE_TIMEOUT_MS = 30_000;

/** The few browser methods we use. Tests pass fakes; production passes a stealth Chromium. */
export interface PageLike {
  goto(url: string, opts: { waitUntil: 'domcontentloaded'; timeout: number }): Promise<{ status(): number } | null>;
  content(): Promise<string>;
  url(): string;
  close(): Promise<void>;
}

export interface ContextLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

export interface BrowserLike {
  newContext(opts: { userAgent: string; locale: string; viewport: { width: number; height: number } }): Promise<ContextLike>;
  isConnected(): boolean;
  close(): Promise<void>;
}

export interface PageFetcher {
  fetchPage(url: string): Promise<FetchedPage>;
  close(): Promise<void>;
}

/** One reused browser, one page at a time, a fresh context per page, everything closed in finally. */
export function createPageFetcher(d: { launch(): Promise<BrowserLike>; userAgent(): string; timeoutMs?: number }): PageFetcher {
  const timeout = d.timeoutMs ?? PAGE_TIMEOUT_MS;
  let browser: Promise<BrowserLike> | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  async function getBrowser(): Promise<BrowserLike> {
    if (browser) {
      const current = await browser.catch(() => null);
      if (current && current.isConnected()) return current;
    }
    browser = d.launch();
    return browser;
  }

  async function fetchOnce(url: string): Promise<FetchedPage> {
    const b = await getBrowser();
    const context = await b.newContext({ userAgent: d.userAgent(), locale: 'en-GB', viewport: { width: 1366, height: 900 } });
    let page: PageLike | null = null;
    try {
      page = await context.newPage();
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      const status = response ? response.status() : null;
      // A server error is temporary: throw so the queue retries it.
      if (status !== null && status >= 500) throw new Error(`The job site answered ${status}`);
      return { status, finalUrl: page.url(), html: await page.content() };
    } finally {
      if (page) await page.close().catch(() => undefined);
      await context.close().catch(() => undefined);
    }
  }

  return {
    fetchPage(url) {
      const run = queue.then(() => fetchOnce(url));
      queue = run.catch(() => undefined);
      return run;
    },
    async close() {
      const current = browser;
      browser = null;
      if (!current) return;
      const b = await current.catch(() => null);
      if (b) await b.close().catch(() => undefined);
    },
  };
}

let stealthApplied = false;

/** Loaded lazily so the API process and the test suite never load the browser packages. */
export async function launchStealthChromium(): Promise<BrowserLike> {
  const { chromium } = await import('playwright-extra');
  const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth');
  if (!stealthApplied) {
    chromium.use(StealthPlugin());
    stealthApplied = true;
  }
  return chromium.launch({ headless: true });
}
