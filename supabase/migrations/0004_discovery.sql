-- JobLume schema v4: job discovery and speed (more sources, scan history, posted dates, new-match alerts)

-- Four more feeds. The check keeps every earlier source.
alter table public.jobs drop constraint if exists jobs_source_check;
alter table public.jobs
  add constraint jobs_source_check
  check (source in ('linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive', 'remoteok', 'weworkremotely', 'himalayas', 'arbeitnow'));

-- When the source says the job was posted. Null when the source does not say; screens then fall back to created_at.
alter table public.jobs add column posted_at timestamptz;

-- Opt-in email digest of new matches (off by default), and a marker so one application is mentioned once.
alter table public.profiles add column notify_new_matches boolean not null default false;
alter table public.applications add column notified_at timestamptz;
create index applications_unnotified_idx on public.applications (user_id, created_at)
  where notified_at is null and status = 'pending_review';

-- One row per finished scan of one source, written by the worker only. The API reads it with the service role.
create table public.scan_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive', 'remoteok', 'weworkremotely', 'himalayas', 'arbeitnow', 'jsearch')),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  status text not null check (status in ('ok', 'failed')),
  error text,
  listed int not null default 0 check (listed >= 0),
  new_count int not null default 0 check (new_count >= 0),
  inserted int not null default 0 check (inserted >= 0),
  rejected_title int not null default 0 check (rejected_title >= 0),
  rejected_location int not null default 0 check (rejected_location >= 0)
);
create index scan_runs_source_started_idx on public.scan_runs (source, started_at desc);

alter table public.scan_runs enable row level security;
-- Server-write-only and no client policy: clients never touch this table directly.
revoke all on public.scan_runs from anon, authenticated;
