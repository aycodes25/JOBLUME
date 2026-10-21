import { describe, expect, it } from 'vitest';
import { JOB_FETCH_REASONS, JOB_FETCH_STATUSES, JOB_SOURCES, LINK_SOURCES } from '../src/index.js';

describe('job sources', () => {
  it('lists every source the jobs table accepts', () => {
    expect(JOB_SOURCES).toEqual(['linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive', 'remoteok', 'weworkremotely', 'himalayas', 'arbeitnow']);
  });

  it('marks LinkedIn and Indeed as the link sources', () => {
    expect(LINK_SOURCES).toEqual(['linkedin', 'indeed']);
    for (const s of LINK_SOURCES) expect(JOB_SOURCES).toContain(s);
  });

  it('has the fetch statuses and the four failure reasons', () => {
    expect(JOB_FETCH_STATUSES).toEqual(['queued', 'done', 'failed']);
    expect(JOB_FETCH_REASONS).toEqual(['blocked', 'login_required', 'not_found', 'unparseable']);
  });
});
