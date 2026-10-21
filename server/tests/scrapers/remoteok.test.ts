import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createRemoteOkScraper, parseRemoteOk } from '../../src/scrapers/remoteok.js';

const fixture = readFileSync(new URL('../fixtures/remoteok.json', import.meta.url), 'utf8');

describe('parseRemoteOk', () => {
  it('maps the live API shape to stubs and skips the terms notice at the start', () => {
    const stubs = parseRemoteOk(fixture);
    expect(stubs).toHaveLength(3);
    expect(stubs[0]).toEqual({
      title: 'Senior Software Engineer',
      company: 'Sothebys',
      location: 'Remote',
      url: 'https://remoteOK.com/remote-jobs/remote-senior-software-engineer-sothebys-1137545',
      source: 'remoteok',
      description: expect.stringContaining('Established in 1744'),
      postedAt: '2026-10-18T19:00:02.000Z',
    });
  });

  it('keeps a named place as the location, and falls back to "Remote" when it is empty', () => {
    const [first, , third] = parseRemoteOk(fixture);
    expect(first!.location).toBe('Remote');
    expect(third!.location).toBe('Copenhagen');
  });

  it('keeps RemoteOK\'s own job page as the link (the terms ask for a link back)', () => {
    for (const stub of parseRemoteOk(fixture)) expect(stub.url).toMatch(/^https:\/\/remoteOK\.com\/remote-jobs\//);
  });

  it('strips the "mention the word" instruction RemoteOK adds to descriptions', () => {
    const json = JSON.stringify([
      { legal: 'terms' },
      {
        url: 'https://remoteOK.com/remote-jobs/x-1', position: 'Backend Engineer', company: 'Acme', epoch: 1792350002,
        description: '<p>Build APIs.</p><br/><br/>Please mention the word **MERITORIOUS** and tag RMTAyLjkxLjEwNC43OQ== when applying to show you read the job post completely (#RMTAyLjkxLjEwNC43OQ==). This is a beta feature to avoid spam applicants.',
      },
    ]);
    const [stub] = parseRemoteOk(json);
    expect(stub!.description).toBe('Build APIs.');
  });

  it('skips entries missing a title, company or link, and tolerates a non-array body', () => {
    const json = JSON.stringify([{ legal: 'x' }, { position: 'T', company: 'C' }, { url: 'u', company: 'C' }, { url: 'u', position: 'T' }]);
    expect(parseRemoteOk(json)).toEqual([]);
    expect(parseRemoteOk('{"error":"nope"}')).toEqual([]);
  });
});

describe('createRemoteOkScraper', () => {
  it('lists the feed with a long timeout, and builds the detail without another request', async () => {
    const fetchText = vi.fn().mockResolvedValue(fixture);
    const scraper = createRemoteOkScraper(fetchText);
    const [stub] = await scraper.list();
    expect(fetchText).toHaveBeenCalledWith('https://remoteok.com/api', { timeoutMs: 60_000 });
    const job = await scraper.detail(stub!);
    expect(job).toMatchObject({ source: 'remoteok', url: stub!.url, companyDomain: null, postedAt: '2026-10-18T19:00:02.000Z' });
    expect(job.description.length).toBeGreaterThan(20);
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(scraper.detailDelayMs).toBeUndefined();
  });

  it('detail() refuses a job with no description', async () => {
    const scraper = createRemoteOkScraper(vi.fn());
    await expect(
      scraper.detail({ title: 'T', company: 'C', location: 'Remote', url: 'https://remoteOK.com/remote-jobs/x', source: 'remoteok', description: '' }),
    ).rejects.toThrow('unusable RemoteOK job');
  });
});
