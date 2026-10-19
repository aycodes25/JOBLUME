import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../../supabase/migrations/0003_job_sources.sql', import.meta.url), 'utf8');

describe('migration 0003_job_sources.sql', () => {
  it('keeps linkedin and indeed in the jobs source check', () => {
    expect(sql).toMatch(/drop constraint if exists jobs_source_check/);
    expect(sql).toMatch(/add constraint jobs_source_check\s+check \(source in \('linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive'\)\)/);
  });

  it('creates job_fetches with one row per user and link', () => {
    expect(sql).toMatch(/create table public\.job_fetches/);
    expect(sql).toMatch(/user_id uuid not null references public\.users \(id\) on delete cascade/);
    expect(sql).toMatch(/url text not null/);
    expect(sql).toMatch(/status text not null default 'queued' check \(status in \('queued', 'done', 'failed'\)\)/);
    expect(sql).toMatch(/reason text check \(reason in \('blocked', 'login_required', 'not_found', 'unparseable'\)\)/);
    expect(sql).toMatch(/job_id uuid references public\.jobs \(id\) on delete set null/);
    expect(sql).toMatch(/created_at timestamptz not null default now\(\)/);
    expect(sql).toMatch(/updated_at timestamptz not null default now\(\)/);
    expect(sql).toMatch(/unique \(user_id, url\)/);
    expect(sql).toMatch(/create index job_fetches_user_created_idx on public\.job_fetches \(user_id, created_at desc\)/);
  });

  it('is server-write-only and readable only by its owner', () => {
    expect(sql).toMatch(/alter table public\.job_fetches enable row level security/);
    expect(sql).toMatch(/create policy job_fetches_select_own on public\.job_fetches for select to authenticated using \(user_id = auth\.uid\(\)\)/);
    expect(sql).toMatch(/revoke insert, update, delete on public\.job_fetches from anon, authenticated/);
  });
});
