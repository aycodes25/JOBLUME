-- JobLume schema v8: jobs found through JSearch that link straight to the employer's application page

alter table public.jobs drop constraint if exists jobs_source_check;
alter table public.jobs
  add constraint jobs_source_check
  check (source in ('linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive', 'remoteok', 'weworkremotely', 'himalayas', 'arbeitnow', 'workingnomads', 'jsearch'));
