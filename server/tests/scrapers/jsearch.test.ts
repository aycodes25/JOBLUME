import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { JSearchError, type JSearchClient, type JSearchJob } from '../../src/scrapers/jsearch-client.js';
import {
  buildJSearchQueries, createJSearchScraper, JSEARCH_MAX_QUERIES, parseJSearchJob, publisherSource, type JSearchScraperDeps,
} from '../../src/scrapers/jsearch.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/jsearch-search.json', import.meta.url), 'utf8')) as { data: JSearchJob[] };

const EXPECTED = [
  {
    title: 'Data Analyst', company: 'Acme Analytics', location: 'Lagos, Nigeria',
    description: 'Acme Analytics is hiring a Data Analyst.\n\nYou will build dashboards with SQL and Power BI.',
    source: 'linkedin', url: 'https://www.linkedin.com/jobs/view/4012345678/', companyDomain: 'acme-analytics.com',
  },
  {
    title: 'Backend Engineer', company: 'Paystack', location: 'Lagos, Nigeria',
    description: 'We are looking for a backend engineer with Node.js and PostgreSQL experience.',
    source: 'indeed', url: 'https://ng.indeed.com/viewjob?jk=0123456789abcdef', companyDomain: null,
  },
  {
    title: 'Product Analyst', company: 'Remote First Ltd', location: 'Remote',
    description: 'A fully remote product analyst role.',
    source: 'linkedin', url: 'https://www.linkedin.com/jobs/view/4099999999/', companyDomain: 'remotefirst.io',
  },
];

function make(over: Partial<JSearchScraperDeps> = {}) {
  const search = vi.fn<JSearchClient['search']>().mockImplementation(async () => fixture.data);
  const quota = {
    consume: vi.fn<() => Promise<boolean>>().mockImplementation(async () => true),
    refund: vi.fn<() => Promise<void>>().mockImplementation(async () => undefined),
  };
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const deps: JSearchScraperDeps = {
    client: { search },
    quota,
    loadProfiles: vi.fn<JSearchScraperDeps['loadProfiles']>().mockImplementation(async () => [{ desired_roles: ['Data Analyst'], location: 'Lagos' }]),
    log,
    ...over,
  };
  return { deps, search, quota, log, scraper: createJSearchScraper(deps) };
}

describe('publisherSource', () => {
  it.each([
    ['LinkedIn', 'linkedin'],
    [' linkedin ', 'linkedin'],
    ['Indeed', 'indeed'],
    ['Indeed Nigeria', 'indeed'],
    ['Glassdoor', null],
    ['LinkedInish Jobs', null],
    [undefined, null],
  ])('reads %j as %j', (publisher, expected) => {
    expect(publisherSource(publisher)).toBe(expected);
  });
});

describe('parseJSearchJob', () => {
  it('keeps only LinkedIn and Indeed jobs with a canonical job link of that site', () => {
    expect(fixture.data.map(parseJSearchJob).filter(Boolean)).toEqual(EXPECTED);
  });
});

describe('buildJSearchQueries', () => {
  it('builds one query per role and place, most shared first, capped', () => {
    const queries = buildJSearchQueries([
      { desired_roles: ['Backend Engineer'], location: 'Abuja' },
      { desired_roles: ['Data Analyst', 'backend  engineer'], location: 'Abuja' },
      { desired_roles: ['Data Analyst'], location: 'Lagos' },
    ], 2);
    expect(queries).toEqual([
      { query: 'backend engineer in Abuja, Nigeria', remote: false },
      { query: 'data analyst in Abuja, Nigeria', remote: false },
    ]);
  });

  it('asks for remote jobs and defaults to Nigeria', () => {
    expect(buildJSearchQueries([
      { desired_roles: ['Designer'], location: 'Remote' },
      { desired_roles: ['Nurse'], location: null },
    ], 5)).toEqual([
      { query: 'designer remote', remote: true },
      { query: 'nurse in Nigeria', remote: false },
    ]);
  });

  it('skips blank roles and uses at most JSEARCH_MAX_QUERIES by default', () => {
    expect(JSEARCH_MAX_QUERIES).toBe(2);
    expect(buildJSearchQueries([{ desired_roles: [' ', 'A1', 'B2', 'C3'], location: 'Lagos' }])).toHaveLength(2);
  });
});

describe('createJSearchScraper', () => {
  it('is the jsearch source and declares no detail delay', () => {
    const { scraper } = make();
    expect(scraper.source).toBe('jsearch');
    expect(scraper.detailDelayMs).toBeUndefined();
  });

  it('lists the filtered jobs as stubs, spending one quota unit per request', async () => {
    const { scraper, search, quota } = make();
    const stubs = await scraper.list();
    expect(stubs).toEqual(EXPECTED.map(({ companyDomain: _d, ...stub }) => stub));
    expect(search).toHaveBeenCalledWith({ query: 'data analyst in Lagos, Nigeria', remote: false });
    expect(quota.consume).toHaveBeenCalledTimes(1);
    expect(quota.refund).not.toHaveBeenCalled();
  });

  it('returns the full job from detail() without another request', async () => {
    const { scraper, search } = make();
    const [first] = await scraper.list();
    expect(await scraper.detail(first!)).toEqual(EXPECTED[0]);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('collapses the same job found by two queries', async () => {
    const { scraper, search, quota } = make({
      loadProfiles: vi.fn<JSearchScraperDeps['loadProfiles']>().mockImplementation(async () => [{ desired_roles: ['Data Analyst', 'Backend Engineer'], location: 'Lagos' }]),
    });
    expect(await scraper.list()).toHaveLength(3);
    expect(search).toHaveBeenCalledTimes(2);
    expect(quota.consume).toHaveBeenCalledTimes(2);
  });

  it('makes no request and lists nothing without an API key', async () => {
    const { scraper, deps, quota } = make({ client: null });
    expect(await scraper.list()).toEqual([]);
    expect(deps.loadProfiles).not.toHaveBeenCalled();
    expect(quota.consume).not.toHaveBeenCalled();
  });

  it('returns an empty list and logs once at the monthly limit', async () => {
    const { scraper, search, quota, log } = make({
      loadProfiles: vi.fn<JSearchScraperDeps['loadProfiles']>().mockImplementation(async () => [{ desired_roles: ['Data Analyst', 'Backend Engineer'], location: 'Lagos' }]),
    });
    quota.consume.mockImplementation(async () => false);
    expect(await scraper.list()).toEqual([]);
    expect(search).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  const TWO = () => vi.fn<JSearchScraperDeps['loadProfiles']>().mockImplementation(async () => [{ desired_roles: ['Data Analyst', 'Backend Engineer'], location: 'Lagos' }]);

  it('does not refund a malformed answer (the request was sent) and rethrows the typed error', async () => {
    const { scraper, search, quota } = make();
    search.mockImplementation(async () => {
      throw new JSearchError('malformed');
    });
    await expect(scraper.list()).rejects.toMatchObject({ name: 'JSearchError', kind: 'malformed' });
    expect(quota.refund).not.toHaveBeenCalled();
  });

  it('refunds only a request that never reached RapidAPI, and rethrows when nothing succeeded', async () => {
    const { scraper, search, quota } = make();
    search.mockImplementation(async () => {
      throw new JSearchError('failed', 'Could not reach JSearch', true);
    });
    await expect(scraper.list()).rejects.toMatchObject({ kind: 'failed' });
    expect(quota.refund).toHaveBeenCalledTimes(1);
  });

  it('refunds a request answered with a missing endpoint (404), which returns no jobs', async () => {
    const { scraper, search, quota } = make();
    search.mockImplementation(async () => {
      throw new JSearchError('failed', 'JSearch answered 404', false, undefined, 404, true);
    });
    await expect(scraper.list()).rejects.toMatchObject({ kind: 'failed', endpointMissing: true });
    expect(quota.refund).toHaveBeenCalled();
  });

  it.each([['timeout'], ['rate_limited'], ['failed']] as const)('does not refund a %s that was sent', async (kind) => {
    const { scraper, search, quota } = make();
    search.mockImplementation(async () => {
      throw new JSearchError(kind);
    });
    await expect(scraper.list()).rejects.toMatchObject({ kind });
    expect(quota.refund).not.toHaveBeenCalled();
  });

  it('keeps the results of earlier queries when a later one fails', async () => {
    const { scraper, search, log } = make({ loadProfiles: TWO() });
    search.mockImplementationOnce(async () => fixture.data).mockImplementationOnce(async () => {
      throw new JSearchError('timeout');
    });
    expect(await scraper.list()).toHaveLength(3);
    expect(search).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalled();
  });

  it('carries on to the next query after a failure and keeps its results', async () => {
    const { scraper, search } = make({ loadProfiles: TWO() });
    search.mockImplementationOnce(async () => {
      throw new JSearchError('failed');
    }).mockImplementationOnce(async () => fixture.data);
    expect(await scraper.list()).toHaveLength(3);
  });

  it('rethrows when every query failed', async () => {
    const { scraper, search } = make({ loadProfiles: TWO() });
    search.mockImplementation(async () => {
      throw new JSearchError('timeout');
    });
    await expect(scraper.list()).rejects.toMatchObject({ kind: 'timeout' });
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('rethrows an auth error immediately, even after earlier results', async () => {
    const first = make({ loadProfiles: TWO() });
    first.search.mockImplementationOnce(async () => fixture.data).mockImplementationOnce(async () => {
      throw new JSearchError('auth');
    });
    await expect(first.scraper.list()).rejects.toMatchObject({ kind: 'auth' });
    const second = make({ loadProfiles: TWO() });
    second.search.mockImplementation(async () => {
      throw new JSearchError('auth');
    });
    await expect(second.scraper.list()).rejects.toMatchObject({ kind: 'auth' });
    expect(second.search).toHaveBeenCalledTimes(1);
  });
});
