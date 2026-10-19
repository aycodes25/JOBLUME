# Phase 4 manual checklist

Run this against your real services. The automated tests use saved pages and fakes; only this checklist touches JSearch, LinkedIn, Indeed and the real database. Never test with your own LinkedIn or Indeed login: JobLume never signs in. Fetching these pages may breach the sites' terms and can get your worker host's IP blocked, so use a few links, not many.

## Setup
- [ ] Apply `supabase/migrations/0003_job_sources.sql` in the Supabase SQL editor (once; repeating it fails with "already exists"). Then run `select count(*) from public.job_fetches;` and see `0`.
- [ ] On the worker machine run `npm run browsers:install -w server` (on Linux: `npx -w server playwright install --with-deps chromium`).
- [ ] Optionally set `JSEARCH_API_KEY` (and `JSEARCH_MONTHLY_LIMIT`) in `.env`, then run `npm run dev`.

## JSearch
- [ ] With a key: the worker log shows `worker started` with `jsearch: true`, then `scrape finished` with `source: "jsearch"`.
- [ ] New rows in `jobs` have `source` `linkedin` or `indeed`, their `url` is a clean `https://www.linkedin.com/jobs/view/<id>/` or `https://<country>.indeed.com/viewjob?jk=<key>` link, and no Glassdoor or other publisher rows appear.
- [ ] In Upstash, the key `jsearch:<YYYY-MM>` counts the requests (at most 2 a day).
- [ ] With `JSEARCH_MONTHLY_LIMIT=1` and a restart, the next run logs "JSearch monthly limit reached" once and adds nothing.
- [ ] Without a key: the log shows `jsearch: false`, and no JSearch request is made.

## Paste a job link
- [ ] Paste a real LinkedIn job link that includes tracking parameters (`?trk=...`). The box clears, you see "We are reading the job now", and the list shows LinkedIn with "Reading the job…".
- [ ] Within a minute or two the row shows "Job added", and a few minutes later the application appears in Pending with the LinkedIn badge.
- [ ] Repeat with an Indeed job link (for example from ng.indeed.com).
- [ ] Paste the same link again: you see "We already have this job".
- [ ] Paste a Glassdoor link, a LinkedIn profile link and some plain text: each shows "That is not a LinkedIn or Indeed job link" and nothing is added to the list.
- [ ] Paste a LinkedIn job that has been closed: the row ends with "This job is no longer available".
- [ ] Add 11 links within an hour: the 11th shows "You are doing that too often".
- [ ] In Supabase, `job_fetches` rows have `status` `done` or `failed` with a `reason`, and failed links added no row to `jobs`.

## Applying stays manual
- [ ] Open a LinkedIn or Indeed application and click Approve & Apply: you get the job link, the tailored CV PDF and the cover letter copy button. Nothing is sent or submitted for you.
- [ ] Turn on Auto mode in Settings with a low threshold: LinkedIn and Indeed applications stay in Pending and are never sent automatically (the worker log shows `source_not_allowed`).

## Security
- [ ] Signed in as a second user, `GET /jobs/fetches` shows only that user's links.
- [ ] With the anon key and a user token, an `insert` into `job_fetches` through the Supabase REST API is refused.
- [ ] The worker logs never show the JSearch key.
