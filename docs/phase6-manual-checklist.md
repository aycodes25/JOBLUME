# Phase 6 manual checklist (job discovery and speed)

The automated tests use fakes only. This checklist runs the real worker, the real job boards and your real Supabase project. You do not need to be technical: tick each box as you go and note anything that looks different.

## Before starting (do these in order)
- [ ] **Update the database first.** Open your Supabase project, go to the SQL editor, paste the whole of `supabase/migrations/0004_discovery.sql` and run it. It must finish without errors. Do this BEFORE you start or restart the worker, otherwise the new code will fail on missing columns.
- [ ] In Table editor check: `scan_runs` exists and shows "RLS enabled" with no policies; `jobs` has a `posted_at` column; `profiles` has `notify_new_matches`; `applications` has `notified_at`.
- [ ] Optional: add `SCRAPE_EVERY_MINUTES=120` to `.env` (120 is the default). A value under 30 must stop the server with a message naming `SCRAPE_EVERY_MINUTES`.
- [ ] Run `npm install` and then `npm run dev:server`. The worker log says `worker started; job boards every SCRAPE_EVERY_MINUTES (Remotive every 6 hours), JSearch daily`.
- [ ] Note: the API and worker now restart by themselves when you save `.env` (nodemon watches it), so you no longer need to stop and start them after changing a setting.

## Scans and the Last scan card
- [ ] Within a few minutes each source logs `scrape finished` with `listed`, `newCount`, `fetched`, `inserted` and `rejected`. RemoteOK may take up to a minute; Himalayas up to a minute per search.
- [ ] In Supabase, `scan_runs` has one row per finished scan, with `status` `ok`, or `failed` and a short `error`.
- [ ] **See the Last scan card:** open the web app and go to the Queue page. The "Last scan" card lists every source with "N min ago, listed, new, added, skipped (by title, by location)" and shows "Worker running". The phone's Queue tab shows the same card.
- [ ] Stop the worker (Ctrl+C). After about 5 minutes the card shows "Worker not running" and the warning text. Start it again: "Worker running" returns within a minute.
- [ ] A source that fails shows a red "failed: HTTP 403 ..." line and the next scan tries again. **Honest note:** MyJobMag answered 403 to some of the browser identities (user agents) the worker rotates through when tested from the planner's PC, so some MyJobMag scans may fail. That is expected; it will show on the Last scan card and a later scan may succeed. It is not a bug in the card.
- [ ] `curl -H "Authorization: Bearer <token>" http://localhost:4000/scan/status` returns `worker_alive`, `worker_last_seen` and `runs`. Without a token it returns 401.

## Scan speed limits to be aware of
- Job boards are scanned every `SCRAPE_EVERY_MINUTES` (default 120).
- Remotive stays at every 6 hours, because its feed terms allow only a few requests a day.
- JSearch (LinkedIn and Indeed) needs your own RapidAPI key in `.env` (`JSEARCH_API_KEY`) and runs once a day within `JSEARCH_MONTHLY_LIMIT`. With no key it is simply skipped.

## More jobs
- [ ] New jobs from `remoteok`, `weworkremotely`, `himalayas` and `arbeitnow` appear in the `jobs` table with their own page as `url` and a `posted_at`. MyJobMag and Jobberman jobs also have `posted_at`.
- [ ] Source names are shown on job cards and the link goes to the board's own page (required by RemoteOK, Remotive, Himalayas, We Work Remotely and Arbeitnow).
- [ ] With your location set to Remote, "Full Stack Developer", "Software Engineer" or "Backend Developer" style titles (including "Software Developer" and "Fullstack Engineer") now produce queue entries; titles with "Intern" or "Unpaid" do not.
- [ ] A MyJobMag scan reads three listing pages (up to 60 new jobs per scan).

## Freshness
- [ ] Cards show "Posted 3 hours ago" when the board gave a time, or "Found 3 hours ago" when it did not.
- [ ] Inside Pending, Ready and Skipped the newest posting is first, on the web and on the phone. The Tracker board is unchanged.

## New-match email
- [ ] **Enable it:** connect Gmail first (Settings, Gmail section). Then in Settings tick "Email me about new matches" (off by default) and save; reload and it stays ticked.
- [ ] With Gmail connected and a pending application at or above your auto-apply threshold created in the last 24 hours, within 15 minutes one email arrives in your own inbox: subject "JobLume: N new matches to review", job titles, companies and scores, a link to the web queue, and no CV or cover letter text.
- [ ] No second email arrives within the hour, and none when nothing new matched. Unticking the box stops all emails.
- [ ] With Gmail disconnected, no email is sent and the worker log shows no error for it.

## Known limits / not in this phase
Reply detection (needs the restricted `gmail.readonly` scope and Google verification), saved-answers bank, several CV versions, interview prep, company career-page watchlists (Greenhouse/Lever), bulk approve, daily AI cost cap, push notifications on the phone, 24/7 deployment, Meta Careers (client-rendered site, mostly US/UK roles; revisit if wanted), Indeed/LinkedIn page fetching (blocked; use JSearch).
