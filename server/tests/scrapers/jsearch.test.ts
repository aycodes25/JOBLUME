import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { JSearchError, type JSearchClient, type JSearchJob } from '../../src/scrapers/jsearch-client.js';
import {
  AGGREGATOR_HOSTS, buildJSearchQueries, createJSearchScraper, isAggregatorHost, JSEARCH_MAX_QUERIES, parseJSearchJob, publisherSource, type JSearchScraperDeps,
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

const base = {
  job_title: 'Full Stack Developer', employer_name: 'Acme', job_description: 'Build things.',
  job_is_remote: true, employer_website: 'https://acme.com', job_posted_at_datetime_utc: '2026-10-01T00:00:00.000Z',
};
const GLASSDOOR_DIRECT = { ...base, job_publisher: 'Glassdoor', job_apply_link: 'https://www.glassdoor.com/job-listing/1', apply_options: [
  { publisher: 'Glassdoor', apply_link: 'https://www.glassdoor.com/job-listing/1', is_direct: false },
  { publisher: 'Acme', apply_link: 'https://careers.acme.com/jobs/42', is_direct: true },
] };

describe('AGGREGATOR_HOSTS / isAggregatorHost', () => {
  it('lists the known aggregators', () => {
    expect(AGGREGATOR_HOSTS).toEqual([
      'jobleads.com', 'jobright.ai', 'glassdoor.com', 'ziprecruiter.com', 'jooble.org', 'adzuna.*', 'talent.com', 'careerjet.*', 'neuvoo.*', 'learn4good.com', 'bebee.com',
    ]);
  });

  it.each([
    'www.jobleads.com', 'jobright.ai', 'www.glassdoor.com', 'www.ziprecruiter.com', 'jooble.org', 'uk.jooble.org', 'www.adzuna.co.uk', 'adzuna.com',
    'talent.com', 'www.careerjet.com.ng', 'neuvoo.ca', 'www.learn4good.com', 'bebee.com',
  ])('treats %s as an aggregator', (host) => {
    expect(isAggregatorHost(host)).toBe(true);
  });

  it.each(['careers.acme.com', 'acme.com', 'notjobleads.com', 'boards.greenhouse.io', 'talentful.com'])('does not treat %s as an aggregator', (host) => {
    expect(isAggregatorHost(host)).toBe(false);
  });
});

describe('parseJSearchJob by category', () => {
  const kept = (raw: JSearchJob) => {
    const job = parseJSearchJob(raw);
    return job ? { source: job.source, url: job.url } : null;
  };

  it.each<[string, JSearchJob, { source: string; url: string } | null]>([
    ['LinkedIn kept', { ...base, job_publisher: 'LinkedIn', job_apply_link: 'https://www.linkedin.com/jobs/view/4012345678/' }, { source: 'linkedin', url: 'https://www.linkedin.com/jobs/view/4012345678/' }],
    ['Indeed kept', { ...base, job_publisher: 'Indeed', job_apply_link: 'https://ng.indeed.com/viewjob?jk=0123456789abcdef' }, { source: 'indeed', url: 'https://ng.indeed.com/viewjob?jk=0123456789abcdef' }],
    ['JobLeads with only an aggregator link dropped', { ...base, job_publisher: 'JobLeads', job_apply_link: 'https://www.jobleads.com/job/1', job_apply_is_direct: true, apply_options: [{ apply_link: 'https://www.jobleads.com/job/1', is_direct: true }] }, null],
    ['Glassdoor with a direct apply option kept as jsearch', GLASSDOOR_DIRECT, { source: 'jsearch', url: 'https://careers.acme.com/jobs/42' }],
    ['direct job_apply_link used when no option is direct', { ...base, job_publisher: 'Jobright', job_apply_link: 'https://acme.com/apply/9', job_apply_is_direct: true }, { source: 'jsearch', url: 'https://acme.com/apply/9' }],
    ['job_apply_link not marked direct dropped', { ...base, job_publisher: 'Jobright', job_apply_link: 'https://acme.com/apply/9', job_apply_is_direct: false }, null],
    ['direct link on http dropped', { ...base, job_publisher: 'Glassdoor', apply_options: [{ apply_link: 'http://acme.com/apply', is_direct: true }] }, null],
    ['malformed apply_options ignored', { ...base, job_publisher: 'Glassdoor', job_apply_link: 'https://www.glassdoor.com/x', apply_options: [null, 'x', 5, {}, { apply_link: 42, is_direct: true }, { apply_link: 'not a url', is_direct: true }] }, null],
    ['apply_options not an array ignored', { ...base, job_publisher: 'Glassdoor', apply_options: { apply_link: 'https://acme.com/a', is_direct: true } }, null],
    ['is_direct as a string is not true', { ...base, job_publisher: 'Glassdoor', apply_options: [{ apply_link: 'https://acme.com/a', is_direct: 'true' }] }, null],
    ['other publisher with a linkedin-host direct link not double counted', { ...base, job_publisher: 'Glassdoor', apply_options: [{ apply_link: 'https://www.linkedin.com/jobs/view/4055555555/', is_direct: true }] }, null],
    ['other publisher with an indeed-host direct link dropped', { ...base, job_publisher: 'Glassdoor', apply_options: [{ apply_link: 'https://ng.indeed.com/viewjob?jk=abc', is_direct: true }] }, null],
    ['a later direct option is used when the first is an aggregator', { ...base, job_publisher: 'Glassdoor', apply_options: [{ apply_link: 'https://www.ziprecruiter.com/c/1', is_direct: true }, { apply_link: 'https://acme.com/jobs/7', is_direct: true }] }, { source: 'jsearch', url: 'https://acme.com/jobs/7' }],
    ['missing publisher with a direct link kept', { ...base, apply_options: [{ apply_link: 'https://acme.com/jobs/8', is_direct: true }] }, { source: 'jsearch', url: 'https://acme.com/jobs/8' }],
  ])('%s', (_name, raw, expected) => {
    expect(kept(raw)).toEqual(expected);
  });

  it('builds the jsearch job from the job fields and never records the publisher', () => {
    expect(parseJSearchJob(GLASSDOOR_DIRECT)).toEqual({
      title: 'Full Stack Developer', company: 'Acme', location: 'Remote', description: 'Build things.',
      source: 'jsearch', url: 'https://careers.acme.com/jobs/42', companyDomain: 'acme.com', postedAt: '2026-10-01T00:00:00.000Z',
    });
  });

  it('uses city, state and country for a non-remote direct job', () => {
    const job = parseJSearchJob({ ...GLASSDOOR_DIRECT, job_is_remote: false, job_city: 'Lagos', job_state: 'Lagos', job_country: 'NG' });
    expect(job?.location).toBe('Lagos, Nigeria');
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
