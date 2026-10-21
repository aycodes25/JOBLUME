import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createWeWorkRemotelyScraper, parseWeWorkRemotely, WWR_FEEDS } from '../../src/scrapers/weworkremotely.js';

const fixture = readFileSync(new URL('../fixtures/weworkremotely.rss', import.meta.url), 'utf8');

const feedWith = (...items: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>${items.join('')}</channel></rss>`;
const item = (title: string, link: string, region = 'Anywhere in the World') =>
  `<item><title>${title}</title><region>${region}</region><description>&lt;p&gt;A role.&lt;/p&gt;</description><pubDate>Tue, 20 Oct 2026 11:32:37 +0000</pubDate><link>${link}</link><guid>${link}</guid></item>`;

describe('parseWeWorkRemotely', () => {
  it('maps the live RSS shape: company from the title prefix, region as the location', () => {
    const stubs = parseWeWorkRemotely(fixture);
    expect(stubs).toHaveLength(3);
    expect(stubs[1]).toEqual({
      title: 'Distribution Engineer',
      company: 'Vertex Marketing Group',
      location: 'Anywhere in the World',
      url: 'https://weworkremotely.com/remote-jobs/vertex-marketing-group-distribution-engineer',
      source: 'weworkremotely',
      description: expect.stringContaining('Scale our distribution by code'),
      postedAt: '2026-10-20T11:32:37.000Z',
    });
    expect(stubs.map((s) => s.location)).toEqual(['North America Only', 'Anywhere in the World', 'USA Only']);
  });

  it('keeps the colons inside a job title and splits on the first ": " only', () => {
    const [stub] = parseWeWorkRemotely(feedWith(item('Acme: Senior Engineer: Platform', 'https://weworkremotely.com/remote-jobs/acme-1')));
    expect(stub).toMatchObject({ company: 'Acme', title: 'Senior Engineer: Platform' });
  });

  it('decodes entities in the description and turns the HTML into text', () => {
    const [stub] = parseWeWorkRemotely(feedWith(item('Acme: Engineer', 'https://weworkremotely.com/remote-jobs/acme-2')));
    expect(stub!.description).toBe('A role.');
  });

  it('uses "Remote" when an item has no region, and the guid when it has no link', () => {
    const xml = feedWith('<item><title>Acme: Engineer</title><description>&lt;p&gt;x&lt;/p&gt;</description><guid>https://weworkremotely.com/remote-jobs/acme-3</guid></item>');
    expect(parseWeWorkRemotely(xml)[0]).toMatchObject({ location: 'Remote', url: 'https://weworkremotely.com/remote-jobs/acme-3' });
  });

  it('skips items with no "Company: " prefix or no link', () => {
    const xml = feedWith(item('No company prefix here', 'https://weworkremotely.com/remote-jobs/x'), item('Acme: Engineer', ''));
    expect(parseWeWorkRemotely(xml)).toEqual([]);
  });
});

describe('createWeWorkRemotelyScraper', () => {
  const pause = async () => undefined;

  it('reads every feed, keeps a job that is in two feeds once, and waits between feeds', async () => {
    const pauseSpy = vi.fn(pause);
    const feeds = ['https://example.com/a.rss', 'https://example.com/b.rss'];
    const fetchText = vi.fn(async (url: string) =>
      url.endsWith('a.rss')
        ? feedWith(item('Acme: One', 'https://weworkremotely.com/remote-jobs/one'), item('Acme: Two', 'https://weworkremotely.com/remote-jobs/two'))
        : feedWith(item('Acme: Two', 'https://weworkremotely.com/remote-jobs/two'), item('Acme: Three', 'https://weworkremotely.com/remote-jobs/three')),
    );
    const stubs = await createWeWorkRemotelyScraper(fetchText, { feeds, pause: pauseSpy }).list();
    expect(stubs.map((s) => s.title)).toEqual(['One', 'Two', 'Three']);
    expect(fetchText.mock.calls.map((c) => c[0])).toEqual(feeds);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it('uses the five WeWorkRemotely feeds by default', async () => {
    const fetchText = vi.fn(async (_url: string) => feedWith());
    await createWeWorkRemotelyScraper(fetchText, { pause }).list();
    expect(fetchText.mock.calls.map((c) => c[0])).toEqual([...WWR_FEEDS]);
    expect(WWR_FEEDS).toHaveLength(5);
    expect(WWR_FEEDS[0]).toBe('https://weworkremotely.com/remote-jobs.rss');
  });

  it('keeps going when one feed fails, and fails only when every feed fails', async () => {
    const some = vi.fn(async (url: string) => {
      if (url.endsWith('a.rss')) throw new Error('HTTP 500');
      return feedWith(item('Acme: One', 'https://weworkremotely.com/remote-jobs/one'));
    });
    const feeds = ['https://example.com/a.rss', 'https://example.com/b.rss'];
    expect(await createWeWorkRemotelyScraper(some, { feeds, pause }).list()).toHaveLength(1);

    const none = vi.fn(async () => { throw new Error('HTTP 500'); });
    await expect(createWeWorkRemotelyScraper(none, { feeds, pause }).list()).rejects.toThrow('HTTP 500');
  });

  it('detail() builds the job without another request and refuses an empty description', async () => {
    const fetchText = vi.fn(async () => fixture);
    const scraper = createWeWorkRemotelyScraper(fetchText, { feeds: ['https://example.com/a.rss'], pause });
    const [stub] = await scraper.list();
    const job = await scraper.detail(stub!);
    expect(job).toMatchObject({ source: 'weworkremotely', url: stub!.url, companyDomain: null, postedAt: '2026-10-20T18:10:55.000Z' });
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(scraper.detailDelayMs).toBeUndefined();
    await expect(scraper.detail({ ...stub!, description: '' })).rejects.toThrow('unusable We Work Remotely job');
  });
});
