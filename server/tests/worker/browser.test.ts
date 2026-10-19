import { describe, expect, it, vi } from 'vitest';
import { createPageFetcher, PAGE_TIMEOUT_MS, type BrowserLike, type ContextLike, type PageLike } from '../../src/worker/browser.js';

function fakeBrowser(opts: { goto?: PageLike['goto']; connected?: () => boolean } = {}) {
  const events: string[] = [];
  const page: PageLike = {
    goto: opts.goto ?? vi.fn<PageLike['goto']>().mockImplementation(async () => ({ status: () => 200 })),
    content: vi.fn<PageLike['content']>().mockImplementation(async () => '<html>job</html>'),
    url: () => 'https://www.linkedin.com/jobs/view/4012345678/',
    close: vi.fn<PageLike['close']>().mockImplementation(async () => {
      events.push('page.close');
    }),
  };
  const context: ContextLike = {
    newPage: vi.fn<ContextLike['newPage']>().mockImplementation(async () => page),
    close: vi.fn<ContextLike['close']>().mockImplementation(async () => {
      events.push('context.close');
    }),
  };
  const browser: BrowserLike = {
    newContext: vi.fn<BrowserLike['newContext']>().mockImplementation(async () => {
      events.push('newContext');
      return context;
    }),
    isConnected: opts.connected ?? (() => true),
    close: vi.fn<BrowserLike['close']>().mockImplementation(async () => {
      events.push('browser.close');
    }),
  };
  return { browser, context, page, events };
}

const URL_1 = 'https://www.linkedin.com/jobs/view/4012345678/';

describe('createPageFetcher', () => {
  it('loads the page with a 30 s timeout and returns status, final URL and HTML', async () => {
    const f = fakeBrowser();
    const fetcher = createPageFetcher({ launch: async () => f.browser, userAgent: () => 'UA-1' });
    expect(PAGE_TIMEOUT_MS).toBe(30_000);
    expect(await fetcher.fetchPage(URL_1)).toEqual({ status: 200, finalUrl: URL_1, html: '<html>job</html>' });
    expect(f.page.goto).toHaveBeenCalledWith(URL_1, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    expect(f.browser.newContext).toHaveBeenCalledWith({ userAgent: 'UA-1', locale: 'en-GB', viewport: { width: 1366, height: 900 } });
    expect(f.events).toEqual(['newContext', 'page.close', 'context.close']);
  });

  it('reports an unknown status as null', async () => {
    const f = fakeBrowser({ goto: vi.fn<PageLike['goto']>().mockImplementation(async () => null) });
    const fetcher = createPageFetcher({ launch: async () => f.browser, userAgent: () => 'UA' });
    expect((await fetcher.fetchPage(URL_1)).status).toBeNull();
  });

  it('reuses one browser and launches again only after it disconnects', async () => {
    let connected = true;
    const f = fakeBrowser({ connected: () => connected });
    const launch = vi.fn<() => Promise<BrowserLike>>().mockImplementation(async () => f.browser);
    const fetcher = createPageFetcher({ launch, userAgent: () => 'UA' });
    await fetcher.fetchPage(URL_1);
    await fetcher.fetchPage(URL_1);
    expect(launch).toHaveBeenCalledTimes(1);
    connected = false;
    await fetcher.fetchPage(URL_1);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('launches again after a failed launch', async () => {
    const f = fakeBrowser();
    const launch = vi.fn<() => Promise<BrowserLike>>()
      .mockImplementationOnce(async () => {
        throw new Error('no browser');
      })
      .mockImplementation(async () => f.browser);
    const fetcher = createPageFetcher({ launch, userAgent: () => 'UA' });
    await expect(fetcher.fetchPage(URL_1)).rejects.toThrow('no browser');
    await expect(fetcher.fetchPage(URL_1)).resolves.toMatchObject({ status: 200 });
  });

  it('closes the page and context when navigation fails, and rethrows', async () => {
    const f = fakeBrowser({
      goto: vi.fn<PageLike['goto']>().mockImplementation(async () => {
        throw new Error('Timeout 30000ms exceeded');
      }),
    });
    const fetcher = createPageFetcher({ launch: async () => f.browser, userAgent: () => 'UA' });
    await expect(fetcher.fetchPage(URL_1)).rejects.toThrow('Timeout 30000ms exceeded');
    expect(f.events).toEqual(['newContext', 'page.close', 'context.close']);
  });

  it('treats a 5xx answer as a load failure and still closes everything', async () => {
    const f = fakeBrowser({ goto: vi.fn<PageLike['goto']>().mockImplementation(async () => ({ status: () => 503 })) });
    const fetcher = createPageFetcher({ launch: async () => f.browser, userAgent: () => 'UA' });
    await expect(fetcher.fetchPage(URL_1)).rejects.toThrow('503');
    expect(f.events).toEqual(['newContext', 'page.close', 'context.close']);
  });

  it('opens one page at a time', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const goto = vi.fn<PageLike['goto']>()
      .mockImplementationOnce(async () => {
        await gate;
        return { status: () => 200 };
      })
      .mockImplementation(async () => ({ status: () => 200 }));
    const f = fakeBrowser({ goto });
    const fetcher = createPageFetcher({ launch: async () => f.browser, userAgent: () => 'UA' });
    const first = fetcher.fetchPage(URL_1);
    const second = fetcher.fetchPage(URL_1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(f.browser.newContext).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(f.events).toEqual(['newContext', 'page.close', 'context.close', 'newContext', 'page.close', 'context.close']);
  });

  it('close() closes the browser once it was launched', async () => {
    const f = fakeBrowser();
    const fetcher = createPageFetcher({ launch: async () => f.browser, userAgent: () => 'UA' });
    await fetcher.close();
    expect(f.browser.close).not.toHaveBeenCalled();
    await fetcher.fetchPage(URL_1);
    await fetcher.close();
    expect(f.browser.close).toHaveBeenCalledTimes(1);
  });
});
