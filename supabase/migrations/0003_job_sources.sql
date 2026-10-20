-- JobLume schema v3: LinkedIn and Indeed job sources, pasted job links

-- 0001 already allowed linkedin and indeed; restate the check so the allowed list is explicit.
alter table public.jobs drop constraint if exists jobs_source_check;
alter table public.jobs
  add constraint jobs_source_check
  check (source in ('linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive'));

-- One row per (user, canonical job link) the user pasted. Written by the server only.
create table public.job_fetches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  url text not null,
  status text not null default 'queued' check (status in ('queued', 'done', 'failed')),
  reason text check (reason in ('blocked', 'login_required', 'not_found', 'unparseable')),
  job_id uuid references public.jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, url)
);
create index job_fetches_user_created_idx on public.job_fetches (user_id, created_at desc);

alter table public.job_fetches enable row level security;
create policy job_fetches_select_own on public.job_fetches for select to authenticated using (user_id = auth.uid());
-- Server-write-only: clients may read their own rows, nothing else.
revoke insert, update, delete on public.job_fetches from anon, authenticated;
