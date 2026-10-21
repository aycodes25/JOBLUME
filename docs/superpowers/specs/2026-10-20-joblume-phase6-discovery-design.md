# Joblume Phase 6: finding more of the right jobs, faster

## 1. Why
Observed: only 1 job reached the queue in a day. Causes found in code: (a) the title pre-filter requires every word of a desired role to be in the job title (`server/src/domain/prefilter.ts`); (b) only the first page of MyJobMag and Jobberman is read, 25 new jobs per run; (c) boards are polled every 6 hours; (d) the user cannot see what a scan found or discarded; (e) only four sources are scanned. Indeed and LinkedIn block page fetching, so they stay on JSearch (user has no key yet).

## 2. Scope (this phase)
1. **Scan interval:** job boards every 2 hours (env `SCRAPE_EVERY_MINUTES`, default 120, minimum 30). JSearch stays daily.
2. **Smarter prefilter:** score a job title against the desired roles and skills instead of "all words must match" (section 3).
3. **More pages:** MyJobMag and Jobberman read pages 1 to 3 of their listing; per-run new-job caps raised to 60.
4. **More sources:** only feeds verified at build time with a real request (candidates: RemoteOK JSON API, We Work Remotely RSS, Himalayas jobs API, Arbeitnow API). Each gets a scraper behind the existing `Scraper` interface and fixture tests. A source that cannot be verified or whose terms forbid use is left out and reported. Attribution links required by a feed's terms are kept in the stored job URL.
5. **Scan status:** a `scan_runs` table written by the worker (source, started/finished, listed, new, inserted, and prefilter rejected counts by reason `title` / `location`), `GET /scan/status` (latest run per source, plus the worker heartbeat), and a "Last scan" card on the web queue page and the mobile queue screen.
6. **Freshness:** show "posted X ago" using the source's posted time when available (`jobs.posted_at`, nullable, falls back to `created_at`); the queue sorts newest first within each segment.
7. **New-match email alert (opt-in):** when tailoring creates new `pending_review` applications scoring at or above the user's threshold, send the user ONE digest email to their own connected Gmail address (the existing `gmail.send` scope, no new permission), at most one per hour and only if there is something new, with a link to the web app. A Settings checkbox `notify_new_matches` (default off). It never contains CV text.
8. **Worker heartbeat:** the worker writes a timestamp every minute; `GET /scan/status` reports `worker_alive` (seen within 5 minutes).

## 3. Prefilter (replaces the all-words rule)
Normalise words (lowercase; split on non-alphanumerics keeping `+` and `#`; collapse "full stack" to "fullstack", "node.js"/"nodejs" to "node", "front end"/"frontend", "back end"/"backend"). A role matches a title when ANY holds: (a) all role words appear (old rule); (b) at least 60 percent of the role's words appear AND the title contains a core role noun (engineer, developer, programmer, architect, dev); (c) a profile skill appears in the title AND the title contains a core role noun. Titles containing a blocklist word (intern, internship, unpaid, volunteer) are rejected unless a desired role contains that word. Location rules are unchanged except: when the preference is `Remote`, any job flagged remote or with a worldwide/anywhere/Africa/Nigeria/EMEA location passes. Each rejection returns a reason code (`title`, `location`, `no_roles`) so scan runs can count them. The AI score still decides what is shown; the cap of 30 tailor jobs per user catch-up stays.

## 4. Safety
No change to sending rules. The alert email goes only to the user's own Gmail address, uses the existing send lock/cap-free path (it is not an application) and never fires without the checkbox. All new tables are server-write-only with owner read where relevant. New fetches use the existing polite fetch helper (user-agent rotation, delays, timeouts); no logins, no evasion of blocks.

## 5. Deferred (not in this phase)
Reply detection (needs the restricted `gmail.readonly` scope and Google verification), saved-answers bank, several CV versions, interview prep, company career-page watchlists (Greenhouse/Lever), bulk approve, daily AI cost cap, push notifications on the phone, 24/7 deployment, Meta Careers (client-rendered site, mostly US/UK roles; revisit if wanted), Indeed/LinkedIn page fetching (blocked; use JSearch).

## 6. Testing
Fixtures for every feed; prefilter table tests covering the user's real roles ("Full Stack Developer", "JavaScript Developer", "Software Engineer", "Backend Developer") against realistic titles; scan_runs repo and route tests with user/worker scoping; alert digest tests (opt-in, throttle, only new, own address, no CV text); web and mobile card tests.
