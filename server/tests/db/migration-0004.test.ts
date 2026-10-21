import { readFileSync } from 'node:fs';
import { JOB_SOURCES } from '@joblume/shared';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../../supabase/migrations/0004_discovery.sql', import.meta.url), 'utf8');

describe('migration 0004_discovery.sql', () => {
  it('lets the jobs table accept every shared job source known at that migration', () => {
    const check = sql.match(/add constraint jobs_source_check\s+check \(source in \(([^)]*)\)\)/);
    expect(check).not.toBeNull();
    const allowed = [...check![1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(allowed).toEqual(JOB_SOURCES.filter((s) => s !== 'workingnomads'));
  });

  it('adds the nullable posted_at, the opt-in flag (default off) and the notified marker', () => {
    expect(sql).toMatch(/alter table public\.jobs add column posted_at timestamptz;/);
    expect(sql).toMatch(/alter table public\.profiles add column notify_new_matches boolean not null default false;/);
    expect(sql).toMatch(/alter table public\.applications add column notified_at timestamptz;/);
  });

  it('creates scan_runs with the counts the Last scan card shows', () => {
    expect(sql).toMatch(/create table public\.scan_runs/);
    expect(sql).toMatch(/started_at timestamptz not null/);
    expect(sql).toMatch(/finished_at timestamptz not null/);
    expect(sql).toMatch(/status text not null check \(status in \('ok', 'failed'\)\)/);
    for (const column of ['listed', 'new_count', 'inserted', 'rejected_title', 'rejected_location']) {
      expect(sql).toMatch(new RegExp(`${column} int not null default 0`));
    }
    expect(sql).toMatch(/create index scan_runs_source_started_idx on public\.scan_runs \(source, started_at desc\)/);
  });

  it('allows jsearch as a scan_runs source', () => {
    expect(sql).toMatch(/create table public\.scan_runs[\s\S]*'jsearch'/);
  });

  it('keeps scan_runs server-write-only with no client access at all', () => {
    expect(sql).toMatch(/alter table public\.scan_runs enable row level security/);
    expect(sql).toMatch(/revoke all on public\.scan_runs from anon, authenticated/);
    expect(sql).not.toMatch(/create policy [a-z_]+ on public\.scan_runs/);
  });
});
