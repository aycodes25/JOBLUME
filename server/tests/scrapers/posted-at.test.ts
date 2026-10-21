import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { JobStub, NormalisedJob } from '../../src/domain/jobs.js';
import type { Db } from '../../src/lib/supabase.js';
import { parseJobbermanDetail } from '../../src/scrapers/jobberman.js';
import { parseJSearchJob } from '../../src/scrapers/jsearch.js';
import { createMyJobMagScraper, parseMyJobMagDetail } from '../../src/scrapers/myjobmag.js';
import { createRemotiveScraper, parseRemotive } from '../../src/scrapers/remotive.js';
import { insertJobs } from '../../src/services/jobs/repo.js';

const read = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

describe('posted time from each source', () => {
  it('Remotive: publication_date has no zone and is read as UTC', () => {
    const [first] = parseRemotive(read('remotive.json'));
    expect(first!.postedAt).toBe('2026-10-14T20:33:44.000Z');
  });

  it('Remotive: detail() keeps the posted time', async () => {
    const scraper = createRemotiveScraper(vi.fn().mockResolvedValue(read('remotive.json')));
    const [stub] = await scraper.list();
    expect((await scraper.detail(stub!)).postedAt).toBe('2026-10-14T20:33:44.000Z');
  });

  it('MyJobMag: reads datePosted from the detail page even though its JSON-LD is not valid JSON', () => {
    expect(parseMyJobMagDetail(read('myjobmag-detail.html')).postedAt).toBe('2026-10-17T08:04:44.000Z');
  });

  it('MyJobMag: no datePosted means no postedAt', () => {
    expect(parseMyJobMagDetail('<div class="job-details"><p>Hello</p></div>')).not.toHaveProperty('postedAt');
  });

  it('MyJobMag: detail() passes the posted time on', async () => {
    const stub: JobStub = { title: 'QA', company: 'Viju', location: '', url: 'https://www.myjobmag.com/job/qa', source: 'myjobmag' };
    const job = await createMyJobMagScraper(vi.fn().mockResolvedValue(read('myjobmag-detail.html'))).detail(stub);
    expect(job.postedAt).toBe('2026-10-17T08:04:44.000Z');
  });

  it('Jobberman: reads datePosted from the JobPosting JSON-LD', () => {
    expect(parseJobbermanDetail(read('jobberman-detail.html')).postedAt).toBe('2026-10-16T00:00:00.000Z');
  });

  it('Jobberman: a JobPosting without datePosted gives no postedAt', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', description: '<p>x</p>' })}</script>`;
    expect(parseJobbermanDetail(html)).not.toHaveProperty('postedAt');
  });

  it('JSearch: job_posted_at_datetime_utc becomes postedAt', () => {
    const job = parseJSearchJob({
      job_publisher: 'LinkedIn', job_title: 'Data Analyst', employer_name: 'Acme', job_description: 'Do data.',
      job_apply_link: 'https://www.linkedin.com/jobs/view/4012345678/', job_posted_at_datetime_utc: '2026-10-19T08:30:00.000Z',
    });
    expect(job?.postedAt).toBe('2026-10-19T08:30:00.000Z');
  });
});

type Result = { data?: unknown; error?: unknown };

/** A Supabase stand-in: records every chained call; each awaited query takes the next queued result. */
function fakeDb(results: Result[] = []) {
  const calls: unknown[][] = [];
  const chain: object = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') {
        const next = results.shift() ?? {};
        return (resolve: (v: unknown) => void) => resolve({ data: next.data ?? null, error: next.error ?? null });
      }
      return (...args: unknown[]) => {
        calls.push([String(prop), ...args]);
        return chain;
      };
    },
  });
  return { db: { from: (table: string) => (calls.push(['from', table]), chain) } as unknown as Db, calls };
}

describe('insertJobs and posted_at', () => {
  const job = (over: Partial<NormalisedJob> = {}): NormalisedJob => ({
    title: 'Data Analyst', company: 'Acme', location: 'Lagos', description: 'd', source: 'remoteok',
    url: 'https://remoteok.com/remote-jobs/1', companyDomain: null, ...over,
  });

  it('stores the posted time, and null when the source gave none', async () => {
    const { db, calls } = fakeDb([{ data: [{ id: 'j1' }, { id: 'j2' }] }]);
    await insertJobs(db, [job({ postedAt: '2026-10-19T16:00:04.000Z' }), job({ title: 'Other', url: 'https://remoteok.com/remote-jobs/2' })]);
    const upsert = calls.find((c) => c[0] === 'upsert')!;
    const rows = upsert[1] as Array<{ posted_at: string | null }>;
    expect(rows.map((r) => r.posted_at)).toEqual(['2026-10-19T16:00:04.000Z', null]);
  });
});
