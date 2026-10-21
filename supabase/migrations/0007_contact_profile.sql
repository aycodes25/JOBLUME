-- JobLume schema v7: contact details for the browser extension (Phase 8)
-- All columns are nullable. Writes still go only through the server API (profiles are server-write-only).

alter table public.profiles
  add column phone text
    check (phone is null or phone ~ '^[0-9 +()-]{7,20}$'),
  add column city text
    check (city is null or char_length(city) between 1 and 80),
  add column linkedin_url text
    check (linkedin_url is null or (linkedin_url ~* '^https://' and char_length(linkedin_url) <= 300)),
  add column github_url text
    check (github_url is null or (github_url ~* '^https://' and char_length(github_url) <= 300)),
  add column portfolio_url text
    check (portfolio_url is null or (portfolio_url ~* '^https://' and char_length(portfolio_url) <= 300));

-- The full name lives on users.full_name (created in 0001). Cap it for rows written from now on.
alter table public.users
  add constraint users_full_name_length
  check (full_name is null or char_length(full_name) between 1 and 120) not valid;

-- Keep profiles server-write-only (unchanged from 0001; repeated so this file is safe to read on its own).
revoke update on public.profiles from anon, authenticated;
