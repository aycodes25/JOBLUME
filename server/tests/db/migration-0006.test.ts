import { readFileSync } from 'node:fs';
import { JOB_SOURCES } from '@joblume/shared';
import { describe, expect, it } from 'vitest';
import { SCRAPE_SOURCES } from '../../src/scrapers/index.js';

const sql = readFileSync(new URL('../../../supabase/migrations/0006_workingnomads.sql', import.meta.url), 'utf8');
const allowedIn = (constraint: string) => {
  const m = sql.match(new RegExp(String.raw`add constraint ${constraint}\s+check \(source in \(([^)]*)\)\)`));
  expect(m).not.toBeNull();
  return [...m![1]!.matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
};

describe('migration 0006_workingnomads.sql', () => {
  it('lets the jobs table accept every shared job source', () => {
    expect(allowedIn('jobs_source_check')).toEqual(JOB_SOURCES.filter((s) => s !== 'jsearch'));
  });

  it('lets scan_runs accept every scheduled source', () => {
    expect([...allowedIn('scan_runs_source_check')].sort()).toEqual([...JOB_SOURCES.filter((s) => s !== 'linkedin' && s !== 'indeed' && s !== 'jsearch'), 'jsearch', 'linkedin', 'indeed'].sort());
    for (const source of SCRAPE_SOURCES) expect(allowedIn('scan_runs_source_check')).toContain(source);
  });
});
