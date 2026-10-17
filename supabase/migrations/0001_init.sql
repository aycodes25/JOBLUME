create extension if not exists pgcrypto;

-- ---------- tables ----------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  gmail_refresh_token_enc text,           -- AES-256-GCM payload, written by the server only (Phase 3)
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  base_cv_text text,
  base_cv_url text,                        -- storage path inside bucket "cvs"
  skills jsonb not null default '[]'::jsonb,
  years_experience int check (years_experience between 0 and 60),
  desired_roles text[] not null default '{}',
  location text check (location in ('Lagos', 'Abuja', 'Remote')),
  salary_min int check (salary_min >= 0),
  salary_max int check (salary_max >= 0),
  apply_mode text not null default 'manual' check (apply_mode in ('manual', 'auto')),
  auto_threshold int not null default 80 check (auto_threshold between 0 and 100),
  daily_cap int not null default 20 check (daily_cap between 1 and 20),
  auto_followup boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company text not null,
  location text not null default '',
  description text not null default '',
  source text not null check (source in ('linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive')),
  url text not null,
  company_domain text,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);
create index jobs_url_idx on public.jobs (url);
create index jobs_created_at_idx on public.jobs (created_at desc);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  tailored_cv_text text,
  tailored_cv_url text,                    -- storage path inside bucket "cvs"
  cover_letter_text text,
  match_score int check (match_score between 0 and 100),
  missing_keywords text[] not null default '{}',
  hiring_manager_email text,
  email_confidence int check (email_confidence between 0 and 100),
  apply_method text check (apply_method in ('email', 'assisted', 'auto')),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'applied', 'interviewing', 'rejected', 'offer', 'skipped')),
  applied_at timestamptz,
  follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, job_id)
);
create index applications_user_status_idx on public.applications (user_id, status);

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  type text not null check (type in ('application', 'follow_up')),
  sent_at timestamptz not null default now(),
  gmail_message_id text
);

-- ---------- helpers ----------
create function public.applications_applied_today(uid uuid)
returns int language sql stable as $$
  select count(*)::int from public.applications
  where user_id = uid and applied_at >= date_trunc('day', now() at time zone 'utc');
$$;

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'full_name');
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- row level security ----------
alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.email_logs enable row level security;

-- users: own row, and never expose the encrypted Gmail token to clients
revoke all on public.users from anon, authenticated;
grant select (id, email, full_name, created_at) on public.users to authenticated;
grant update (full_name) on public.users to authenticated;
create policy users_select_own on public.users for select to authenticated using (id = auth.uid());
create policy users_update_own on public.users for update to authenticated using (id = auth.uid());

create policy profiles_select_own on public.profiles for select to authenticated using (user_id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (user_id = auth.uid());

create policy jobs_select_all on public.jobs for select to authenticated using (true);

create policy applications_select_own on public.applications for select to authenticated using (user_id = auth.uid());
create policy applications_update_own on public.applications for update to authenticated using (user_id = auth.uid());

create policy email_logs_select_own on public.email_logs for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid()));

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('cvs', 'cvs', false, 5242880)
on conflict (id) do nothing;

create policy cvs_select_own on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
