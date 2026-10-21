-- JobLume schema v6: Working Nomads as a job source

alter table public.jobs drop constraint if exists jobs_source_check;
alter table public.jobs
  add constraint jobs_source_check
  check (source in ('linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive', 'remoteok', 'weworkremotely', 'himalayas', 'arbeitnow', 'workingnomads'));

alter table public.scan_runs drop constraint if exists scan_runs_source_check;
alter table public.scan_runs
  add constraint scan_runs_source_check
  check (source in ('linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive', 'remoteok', 'weworkremotely', 'himalayas', 'arbeitnow', 'workingnomads', 'jsearch'));
