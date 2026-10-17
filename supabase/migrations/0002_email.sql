-- JobLume schema v2: Gmail connection, email finding, follow-ups

alter table public.users
  add column gmail_email text,
  add column gmail_connected_at timestamptz;

alter table public.profiles
  add column base_cv_filename text;

alter table public.applications
  add column email_source text check (email_source in ('hunter', 'guess', 'manual')),
  add column email_candidates jsonb not null default '[]'::jsonb;

alter table public.email_logs
  add column to_email text,
  add column subject text,
  add column gmail_thread_id text,
  add column rfc_message_id text,
  add column status text not null default 'sent' check (status in ('sent', 'failed')),
  add column error text;

create index applications_followup_idx on public.applications (follow_up_at) where status = 'applied';

-- One follow-up draft per application in this phase.
create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications (id) on delete cascade,
  subject text not null,
  body text not null,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'sent', 'dismissed', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index follow_ups_status_idx on public.follow_ups (status);

-- Shared per-company cache of Hunter results (public company information, server only).
create table public.company_contacts (
  id uuid primary key default gen_random_uuid(),
  company_key text not null unique,
  domain text,
  contacts jsonb not null default '[]'::jsonb,
  pattern text,
  fetched_at timestamptz not null default now()
);

alter table public.follow_ups enable row level security;
alter table public.company_contacts enable row level security;

create policy follow_ups_select_own on public.follow_ups for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid()));

-- Server-write-only: clients may read their own follow-ups and sent-mail log, nothing else.
revoke insert, update, delete on public.follow_ups from anon, authenticated;
revoke all on public.company_contacts from anon, authenticated;
revoke insert, update, delete on public.email_logs from anon, authenticated;
