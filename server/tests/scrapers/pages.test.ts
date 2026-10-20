import { describe, expect, it, vi } from 'vitest';
import type { JobStub } from '../../src/domain/jobs.js';
import { createJobbermanScraper, JOBBERMAN_PAGES } from '../../src/scrapers/jobberman.js';
import { createMyJobMagScraper, MYJOBMAG_PAGES } from '../../src/scrapers/myjobmag.js';
import { listPages } from '../../src/scrapers/pages.js';

const stub = (n: number): JobStub => ({ title: `Role ${n}`, company: 'Co', location: '', url: `https://x/${n}`, source: 'myjobmag' });
const pageOf = (...ns: number[]) => ns.map(String).join(',');
const parse = (html: string): JobStub[] => (html === '' ? [] : html.split(',').map((n) => stub(Number(n))));

function run(pages: Record<number, string | Error>, count = 3) {
  const fetchText = vi.fn(async (url: string) => {
    const page = Number(new URL(url).searchParams.get('page') ?? 1);
    const body = pages[page];
    if (body instanceof Error) throw body;
    return body ?? '';
  });
  const pause = vi.fn<() => Promise<void>>().mockImplementation(async () => undefined);
  const promise = listPages({ fetchText, pageUrl: (p) => `https://example.com/jobs?page=${p}`, parse, pages: count, pause });
  return { fetchText, pause, promise };
}

describe('listPages', () => {
  it('reads each page in turn, joins the jobs and waits between pages', async () => {
    const { fetchText, pause, promise } = run({ 1: pageOf(1, 2), 2: pageOf(3), 3: pageOf(4, 5) });
    expect((await promise).map((s) => s.url)).toEqual(['https://x/1', 'https://x/2', 'https://x/3', 'https://x/4', 'https://x/5']);
    expect(fetchText.mock.calls.map((c) => c[0])).toEqual([
      'https://example.com/jobs?page=1', 'https://example.com/jobs?page=2', 'https://example.com/jobs?page=3',
    ]);
    expect(pause).toHaveBeenCalledTimes(2);
  });

  it('keeps a job that appears on two pages once', async () => {
    const { promise } = run({ 1: pageOf(1, 2), 2: pageOf(2, 3), 3: pageOf(3) });
    expect((await promise).map((s) => s.url)).toEqual(['https://x/1', 'https://x/2', 'https://x/3']);
  });

  it('throws when page 1 fails, because nothing was read', async () => {
    const { promise } = run({ 1: new Error('HTTP 403') });
    await expect(promise).rejects.toThrow('HTTP 403');
  });

  it('keeps earlier pages and stops when a later page fails', async () => {
    const { fetchText, promise } = run({ 1: pageOf(1, 2), 2: new Error('timeout'), 3: pageOf(9) });
    expect((await promise).map((s) => s.url)).toEqual(['https://x/1', 'https://x/2']);
    expect(fetchText).toHaveBeenCalledTimes(2);
  });

  it('stops at the first empty page (past the last page)', async () => {
    const { fetchText, promise } = run({ 1: pageOf(1), 2: '', 3: pageOf(9) });
    expect((await promise).map((s) => s.url)).toEqual(['https://x/1']);
    expect(fetchText).toHaveBeenCalledTimes(2);
  });

  it('page 1 empty is an empty list, not an error', async () => {
    const { promise } = run({ 1: '' });
    expect(await promise).toEqual([]);
  });
});

const myJobMagCard = (n: number) =>
  `<li class="job-list-li"><ul><li class="mag-b"><h2><a href="/job/role-${n}-acme">Role ${n} at Acme</a></h2></li></ul></li>`;
const jobbermanCard = (n: number) =>
  `<div data-cy="listing-cards-components"><div><a href="https://www.jobberman.com/listings/role-${n}" data-cy="listing-title-link" title="Role ${n}"></a></div><p>Acme</p></div>`;

describe('MyJobMag pages', () => {
  it('reads /jobs, /jobs/page/2 and /jobs/page/3', async () => {
    expect(MYJOBMAG_PAGES).toBe(3);
    const fetchText = vi.fn(async (url: string) => myJobMagCard(url.endsWith('/page/2') ? 2 : url.endsWith('/page/3') ? 3 : 1));
    const stubs = await createMyJobMagScraper(fetchText, { pause: async () => undefined }).list();
    expect(fetchText.mock.calls.map((c) => c[0])).toEqual([
      'https://www.myjobmag.com/jobs', 'https://www.myjobmag.com/jobs/page/2', 'https://www.myjobmag.com/jobs/page/3',
    ]);
    expect(stubs.map((s) => s.url)).toEqual([
      'https://www.myjobmag.com/job/role-1-acme', 'https://www.myjobmag.com/job/role-2-acme', 'https://www.myjobmag.com/job/role-3-acme',
    ]);
  });

  it('can be told to read fewer pages', async () => {
    const fetchText = vi.fn(async () => myJobMagCard(1));
    await createMyJobMagScraper(fetchText, { pages: 1 }).list();
    expect(fetchText).toHaveBeenCalledTimes(1);
  });
});

describe('Jobberman pages', () => {
  it('reads /jobs, /jobs?page=2 and /jobs?page=3', async () => {
    expect(JOBBERMAN_PAGES).toBe(3);
    const fetchText = vi.fn(async (url: string) => jobbermanCard(url.endsWith('page=2') ? 2 : url.endsWith('page=3') ? 3 : 1));
    const stubs = await createJobbermanScraper(fetchText, { pause: async () => undefined }).list();
    expect(fetchText.mock.calls.map((c) => c[0])).toEqual([
      'https://www.jobberman.com/jobs', 'https://www.jobberman.com/jobs?page=2', 'https://www.jobberman.com/jobs?page=3',
    ]);
    expect(stubs.map((s) => s.url)).toEqual([
      'https://www.jobberman.com/listings/role-1', 'https://www.jobberman.com/listings/role-2', 'https://www.jobberman.com/listings/role-3',
    ]);
  });
});
