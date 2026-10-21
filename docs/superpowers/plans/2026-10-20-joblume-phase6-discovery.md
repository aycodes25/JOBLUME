# Joblume Phase 6: Job Discovery and Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find more of the right jobs, faster, and show the user what each scan found: smarter title pre-filter, more listing pages, four more verified job feeds, scan history and worker status on the queue screens, "posted X ago" with newest-first ordering, and an opt-in new-match email digest.

**Architecture:** The worker keeps its BullMQ scrape queue; every scan now ends by writing one `scan_runs` row (counts of listed, new, inserted and pre-filter rejections by reason) and the worker reports a Redis heartbeat every minute. The API exposes both through `GET /scan/status`; web and mobile render it as a "Last scan" card. New feeds are plain `Scraper` implementations behind the existing interface (fixtures plus fakes only in tests). A repeating `alerts` job emails each opted-in user one digest to their own Gmail address through the existing `gmail.send` path.

**Tech Stack:** TypeScript, Node 20+, Express, BullMQ + Upstash Redis (ioredis), Supabase (Postgres + RLS), cheerio, Vitest v5 (server, web, packages/shared), Next.js + React Testing Library (web), Expo + Jest 30 + React Native Testing Library 14 (mobile), zod.

## Global Constraints

Copied from `docs/superpowers/specs/2026-10-20-joblume-phase6-discovery-design.md`. Every task includes these.

- **Scan interval:** job boards every 2 hours (env `SCRAPE_EVERY_MINUTES`, default 120, minimum 30). JSearch stays daily.
- **Smarter prefilter:** score a job title against the desired roles and skills instead of "all words must match". Normalise words (lowercase; split on non-alphanumerics keeping `+` and `#`; collapse "full stack" to "fullstack", "node.js"/"nodejs" to "node", "front end"/"frontend", "back end"/"backend"). A role matches a title when ANY holds: (a) all role words appear (old rule); (b) at least 60 percent of the role's words appear AND the title contains a core role noun (engineer, developer, programmer, architect, dev); (c) a profile skill appears in the title AND the title contains a core role noun. Titles containing a blocklist word (intern, internship, unpaid, volunteer) are rejected unless a desired role contains that word. Location rules are unchanged except: when the preference is `Remote`, any job flagged remote or with a worldwide/anywhere/Africa/Nigeria/EMEA location passes. Each rejection returns a reason code (`title`, `location`, `no_roles`) so scan runs can count them. The AI score still decides what is shown; the cap of 30 tailor jobs per user catch-up stays.
- **More pages:** MyJobMag and Jobberman read pages 1 to 3 of their listing; per-run new-job caps raised to 60.
- **More sources:** only feeds verified at build time with a real request. Each gets a scraper behind the existing `Scraper` interface and fixture tests. A source that cannot be verified or whose terms forbid use is left out and reported. Attribution links required by a feed's terms are kept in the stored job URL.
- **Scan status:** a `scan_runs` table written by the worker (source, started/finished, listed, new, inserted, and prefilter rejected counts by reason `title` / `location`), `GET /scan/status` (latest run per source, plus the worker heartbeat), and a "Last scan" card on the web queue page and the mobile queue screen.
- **Freshness:** show "posted X ago" using the source's posted time when available (`jobs.posted_at`, nullable, falls back to `created_at`); the queue sorts newest first within each segment.
- **New-match email alert (opt-in):** when tailoring creates new `pending_review` applications scoring at or above the user's threshold, send the user ONE digest email to their own connected Gmail address (the existing `gmail.send` scope, no new permission), at most one per hour and only if there is something new, with a link to the web app. A Settings checkbox `notify_new_matches` (default off). It never contains CV text.
- **Worker heartbeat:** the worker writes a timestamp every minute; `GET /scan/status` reports `worker_alive` (seen within 5 minutes).
- **Safety:** No change to sending rules. The alert email goes only to the user's own Gmail address, uses the existing send lock/cap-free path (it is not an application) and never fires without the checkbox. All new tables are server-write-only with owner read where relevant. New fetches use the existing polite fetch helper (user-agent rotation, delays, timeouts); no logins, no evasion of blocks.
- **Deferred (do not build):** reply detection, saved-answers bank, several CV versions, interview prep, company career-page watchlists, bulk approve, daily AI cost cap, push notifications on the phone, 24/7 deployment, Meta Careers, Indeed/LinkedIn page fetching (use JSearch).
- **Mobile:** this branch carries the SDK-58 mobile code, but the app targets Expo SDK 57 (branch `chore/mobile-sdk-57` is not merged). Keep every mobile change SDK-agnostic: only the existing `react-native`, `@testing-library/react-native` and app-internal modules, no new native modules, no new dependencies.

## Conventions every task follows

- Run commands from the repo root `C:\Users\Hp\Documents\JOBLUME` in Git Bash (the commands below are bash). `npm run build:shared` must be re-run whenever `packages/shared/src` changes; the server's `pretest` and `pretypecheck` do it for you, a bare `npx vitest run` does not.
- **Vitest v5 quirks (server, web, packages/shared):** type spies with their function type, `vi.fn<FnType>()`, and use `.mockImplementation(async () => value)`; never return a value from `beforeEach` (Vitest treats a returned function as a teardown); a `Response` body can be read once, so a fetch fake that answers several calls must build a fresh `Response` each time: `mockImplementation(async () => json(...))`, never `mockResolvedValue(json(...))`.
- **Jest 30 + React Native Testing Library 14 (mobile):** `render`, `fireEvent.*`, `screen.findBy*` are asynchronous: `await render(...)`, `await fireEvent.press(...)`. Use `getByRole('button', { name })`, `getByText` and `toBeOnTheScreen()`.
- **Line endings:** files in the working tree use CRLF (git `autocrlf`); new files may be LF. When you edit with the Edit tool, copy single lines or short multi-line anchors exactly.
- **Backslashes and escapes in code must stay literal.** Regular expressions such as `/\bfull[\s-]*stack\b/g`, `/"datePosted"\s*:\s*"([^"]+)"/` and `/^\d{4}-\d{2}.../` carry real backslashes. If you generate a file through a shell heredoc, a JavaScript template literal or any tool that processes escapes, the backslashes can be silently dropped (`\d` becomes `d`). Write such files with the Write/Edit tools, then grep the result (`grep -n 'NAIVE_ISO_TIME' server/src/domain/jobs.ts`) to confirm the backslashes are there. The same applies to the apostrophe escape in test names: avoid apostrophes inside single-quoted test titles.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (a blank line, then the trailer).

## Feed verification (real requests, 2026-10-20)

Every candidate was fetched with `curl` and its real shape inspected. All four responded with HTTP 200 and usable data, so all four are **included**. The fixtures in Tasks 6 and 7 are trimmed copies of those real responses (real field names; descriptions shortened; stray non-ASCII characters replaced by ASCII so the files are portable). The parsers were also run against the full live responses: RemoteOK 99 jobs, Arbeitnow 23 remote jobs of 300, We Work Remotely 77 + 25 + 75 + 6 + 6 jobs across its five feeds, Himalayas 20 per search, every job accepted by `normaliseJob` and every job carrying a posted time.

| Source | Endpoint (verified) | Shape | Terms and attribution | Posted-time field | Notes |
|---|---|---|---|---|---|
| RemoteOK | `https://remoteok.com/api` | JSON array. Element 0 is `{last_updated, legal}` (the terms), the rest are jobs: `slug, id, epoch, date, company, position, tags[], description (HTML), location, apply_url, url, salary_min, salary_max, logo, company_logo` | "link back (with follow) to the URL on Remote OK and mention Remote OK as a source", or API access is suspended. | `epoch` (seconds) and `date` (ISO with zone) | About 100 jobs. Slow: 26 seconds to download with compression (the tests use a 60 second timeout). `location` is empty for worldwide jobs. Every description ends with an anti-spam line ("Please mention the word **X** and tag ... when applying"); the parser strips it so the AI never sees it. Source name shown to users: "RemoteOK". |
| We Work Remotely | `https://weworkremotely.com/remote-jobs.rss` plus `/categories/remote-programming-jobs.rss`, `remote-full-stack-programming-jobs.rss`, `remote-back-end-programming-jobs.rss`, `remote-front-end-programming-jobs.rss` | RSS 2.0. `item`: `title` ("Company: Job title"), `region`, `country`, `state`, `skills`, `category`, `type`, `description` (HTML, entity-escaped), `pubDate`, `expires_at`, `guid`, `link` | No terms text in the feed or `robots.txt` (only account and admin paths are disallowed). The job's own weworkremotely.com page is kept as the link and the source is named. | `pubDate` (RFC 822) | Feed `ttl` is 60 minutes. The all-jobs feed has 78 items (77 of them in the "Company: title" form); the four category feeds add jobs the main feed lacks (147 distinct jobs over the five). `region` is "Anywhere in the World" for 72 of 78 jobs, else "USA Only", "North America Only" or a state. |
| Himalayas | `https://himalayas.app/jobs/api/search?q=<role>&country=NG&sort=recent` | JSON object `{comments, updatedAt, offset, limit, totalCount, jobs[]}`. Job: `title, excerpt, companyName, companySlug, companyLogo, employmentType, minSalary, maxSalary, salaryPeriod, seniority[], currency, locationRestrictions[], timezoneRestrictions[], categories[], parentCategories[], description (HTML), pubDate (epoch seconds), expiryDate, applicationLink, guid` | "link back to the URL found on Himalayas AND mention Himalayas as the original source. Please do not submit Himalayas jobs to other job boards or aggregators." (API terms.) No key needed. | `pubDate` (epoch seconds) | 20 jobs a page (max). The plain browse feed `https://himalayas.app/jobs/api` is cached and fast but 18 of its 20 jobs are locked to one country, so the search with `country=NG` (open to Nigeria, including worldwide jobs with `locationRestrictions: []`) is used instead. Search time varies from 2 to 48 seconds (the tests use 60 seconds). `applicationLink` is the job's Himalayas page and is the stored link. |
| Arbeitnow | `https://www.arbeitnow.com/api/job-board-api` | JSON `{data[], links, meta}`. Job: `slug, company_name, title, description (HTML), remote (boolean), url, tags[], job_types[], location, created_at (epoch seconds)`. 300 jobs a page, `?page=N` for more | `meta.terms`: "free public API ... please do not abuse. I would appreciate linking back to the site." Header `X-RateLimit-Limit: 50`. | `created_at` (epoch seconds) | Mostly on-site jobs in Germany. Only the 23 of 300 flagged `remote: true` are kept. The feed is rebuilt hourly. |

**Not included:** none. All four candidates passed. (Meta Careers, Indeed and LinkedIn page fetching stay deferred as the spec says.)

**Remotive** (already in the app) says in its own response: "we advise max. 4 times a day" and "excessive requests will be blocked". A 2 hour board interval would be 12 calls a day, so Remotive keeps its own 6 hour schedule (see Decisions).

**Listing pagination (verified with the live pages and the existing parsers):**
- MyJobMag: `https://www.myjobmag.com/jobs`, then `https://www.myjobmag.com/jobs/page/2`, `/jobs/page/3` (the page's own `rel="next"` link). Each page held 35 jobs and `parseMyJobMagList` parsed all 35 on pages 1, 2 and 3. (`/jobs/2` is a different page and has no jobs.)
- Jobberman: `https://www.jobberman.com/jobs`, then `https://www.jobberman.com/jobs?page=2`, `?page=3`. Each page held 16 jobs and `parseJobbermanList` parsed all 16 on pages 1, 2 and 3.

**Posted-date fields for `jobs.posted_at`:** RemoteOK `epoch`; WWR `pubDate`; Himalayas `pubDate`; Arbeitnow `created_at`; Remotive `publication_date` (ISO with no zone, read as UTC); JSearch `job_posted_at_datetime_utc`; MyJobMag and Jobberman: the job's detail page JSON-LD `datePosted` (the MyJobMag listing only shows "17 October" with no year, and its JSON-LD is not valid JSON, so the value is read with a pattern).

**A finding to watch (not changed by this plan):** from this PC today `https://www.myjobmag.com/jobs` answered **403** to the two Chrome user agents in `USER_AGENTS` and **200** to the Safari and Firefox ones, so roughly 2 in 5 MyJobMag scans may fail while the worker rotates user agents at random. Jobberman answered 200 to all five. The plan does not work around the block ("no evasion of blocks"); instead the new scan history makes each failure visible on the Last scan card. Decide separately whether to change the user-agent list.

## Decisions that resolve spec ambiguities

1. **Core-noun synonyms.** "Software Engineer" and "Software Developer" must match. The spec's 60 percent rule would not (1 of 2 words), so `developer`, `programmer` and `dev` are treated as the same word as `engineer` when comparing a title with a role. `architect` stays separate. The core-noun test uses the same words (`engineer`, `architect` after merging).
2. **Remotive interval.** The spec says "job boards every 2 hours", but Remotive asks for at most 4 requests a day. Remotive stays at 6 hours; every other board uses `SCRAPE_EVERY_MINUTES`; JSearch stays daily.
3. **`SCRAPE_EVERY_MINUTES` below 30** makes the worker refuse to start with a clear message (like every other bad environment value) rather than silently raising it.
4. **Heartbeat storage.** A Redis key `worker:heartbeat` (ISO time, expires after 600 seconds), not a table: no migration, no database writes every minute. About 1,440 Redis commands a day.
5. **Prefilter counts.** For each NEW, de-duplicated job a scan asks every user with a CV and roles whether the job would pass. Passing for anyone counts nothing. Otherwise it counts once: as `location` when the title fitted at least one user, else as `title`. Users with no roles are ignored; with no users nothing is counted.
6. **Newest first** replaces the old score-first order inside the three queue segments (Pending, Ready, Skipped), on web and mobile, by `job.posted_at ?? application.created_at`; ties go to the better score. The Tracker board keeps its score order.
7. **Label.** With a source posted time the card says "Posted 3 hours ago"; without one it says "Found 3 hours ago" (from the application's `created_at`), so it never claims a posted time it does not have.
8. **"The user's threshold"** for the digest is `profiles.auto_threshold` (the only threshold in the profile).
9. **Digest trigger.** Instead of hooking into tailoring, a repeating `alerts` job runs every 15 minutes and sends each opted-in user at most one digest an hour, of their `pending_review` applications at or above their threshold created in the last 24 hours that were not mentioned before (`applications.notified_at`). This batches a whole scan's results into one email and survives worker restarts.
10. **`scan_runs` is not per user.** It describes the shared scrapers, so the API returns the same status to any signed-in user; clients have no direct access to the table.
11. **Himalayas queries** come from the users' desired roles (most shared first, at most 3, fallback `developer` and `engineer`), because the feed is too large to read without a search.
12. **Arbeitnow** keeps only `remote: true` jobs.

## Known risks

- **Upstash free tier (Redis commands):** this phase adds one heartbeat command a minute and one more idle BullMQ worker (`alerts`) polling at the existing slow `drainDelay`. If the monthly allowance is tight, raise `HEARTBEAT_EVERY_MS` (keeping it under 5 minutes) or the alert scheduler's 15 minute period.
- **Slow feeds:** RemoteOK (about 26 s) and some Himalayas searches (up to about 48 s) take long; their scrapers pass a 60 second timeout. A timeout shows as a failed scan on the Last scan card and the next run tries again.
- **Digest only reaches users with Gmail connected** and the box ticked; there is no other email path.

## File map

| Area | Create | Modify |
|---|---|---|
| Database | `supabase/migrations/0004_discovery.sql` | |
| Shared | | `packages/shared/src/{job-sources,profile,api-types}.ts` |
| Server domain | | `server/src/domain/{prefilter,jobs}.ts` |
| Server scrapers | `server/src/scrapers/{pages,remoteok,arbeitnow,weworkremotely,himalayas}.ts` | `server/src/scrapers/{index,myjobmag,jobberman,remotive,jsearch,jsearch-client}.ts`, `server/src/lib/{env,http}.ts` |
| Server scan visibility | `server/src/services/scan/{runs,heartbeat,service}.ts`, `server/src/api/routes/scan.ts` | `server/src/worker/{scrape,match,repos,index}.ts`, `server/src/api/{app,deps,index,repos}.ts`, `server/src/services/jobs/repo.ts` |
| Server alerts | `server/src/services/alerts/{digest,repo,throttle}.ts` | `server/src/queues.ts`, `server/src/worker/index.ts` |
| Web | `web/src/lib/scan.ts`, `web/src/components/jobs/LastScanCard.tsx` | `web/src/lib/{format,applications,profile-form}.ts`, `web/src/components/applications/ApplicationCard.tsx`, `web/src/components/profile/SettingsForm.tsx`, `web/src/lib/api/endpoints.ts`, `web/src/hooks/api.ts`, `web/src/app/(app)/queue/page.tsx` |
| Mobile | `mobile/src/lib/scan.ts`, `mobile/src/components/queue/LastScanCard.tsx` | `mobile/src/lib/{format,applications,profile-form}.ts`, `mobile/src/components/applications/ApplicationCard.tsx`, `mobile/src/components/profile/SettingsForm.tsx`, `mobile/src/components/queue/QueueScreen.tsx`, `mobile/src/lib/api/endpoints.ts`, `mobile/src/hooks/api.ts` |
| Docs | `docs/phase6-manual-checklist.md` | `README.md`, `.env.example` |

---

### Task 1: Migration 0004, shared types, row types and source names

**Files:**
- Create: `supabase/migrations/0004_discovery.sql`
- Create: `server/tests/db/migration-0004.test.ts`
- Modify: `packages/shared/src/job-sources.ts`, `packages/shared/src/profile.ts`, `packages/shared/src/api-types.ts`
- Modify: `packages/shared/tests/job-sources.test.ts`, `packages/shared/tests/profile.test.ts`
- Modify: `server/src/db/types.ts`
- Modify (add one field to existing literals): `server/tests/api/app.test.ts`, `server/tests/worker/match-user-job.test.ts`, `server/tests/worker/match.test.ts`, `server/tests/worker/tailor.test.ts`
- Modify: `web/src/lib/format.ts`, `mobile/src/lib/format.ts`, `web/tests/lib/format.test.ts`, `mobile/tests/lib/format.test.ts`, `mobile/tests/fixtures.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - SQL: `jobs.posted_at timestamptz` (nullable); `profiles.notify_new_matches boolean not null default false`; `applications.notified_at timestamptz`; table `scan_runs(id, source, started_at, finished_at, status 'ok'|'failed', error, listed, new_count, inserted, rejected_title, rejected_location)`, RLS on, all client access revoked; `jobs_source_check` accepting `remoteok`, `weworkremotely`, `himalayas`, `arbeitnow`.
  - `@joblume/shared`: `JOB_SOURCES` now `['linkedin','indeed','jobberman','myjobmag','remotive','remoteok','weworkremotely','himalayas','arbeitnow']`; `Profile.notify_new_matches: boolean`; `profilePatchSchema` accepts `notify_new_matches: boolean`; `JobSummary.posted_at?: string | null`; `interface ScanRun { source: string; started_at: string; finished_at: string; status: 'ok' | 'failed'; error: string | null; listed: number; new_count: number; inserted: number; rejected_title: number; rejected_location: number }`; `interface ScanStatus { worker_alive: boolean; worker_last_seen: string | null; runs: ScanRun[] }`.
  - Server: `JobRow.posted_at?: string | null`; `ProfileRow.notify_new_matches: boolean`.
  - Web and mobile: `sourceLabel('remoteok' | 'weworkremotely' | 'himalayas' | 'arbeitnow' | 'jsearch')` returns `'RemoteOK'`, `'We Work Remotely'`, `'Himalayas'`, `'Arbeitnow'`, `'JSearch (LinkedIn, Indeed)'`.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/db/migration-0004.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { JOB_SOURCES } from '@joblume/shared';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../../supabase/migrations/0004_discovery.sql', import.meta.url), 'utf8');

describe('migration 0004_discovery.sql', () => {
  it('lets the jobs table accept every shared job source', () => {
    const check = sql.match(/add constraint jobs_source_check\s+check \(source in \(([^)]*)\)\)/);
    expect(check).not.toBeNull();
    const allowed = [...check![1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(allowed).toEqual([...JOB_SOURCES]);
  });

  it('adds the nullable posted_at, the opt-in flag (default off) and the notified marker', () => {
    expect(sql).toMatch(/alter table public\.jobs add column posted_at timestamptz;/);
    expect(sql).toMatch(/alter table public\.profiles add column notify_new_matches boolean not null default false;/);
    expect(sql).toMatch(/alter table public\.applications add column notified_at timestamptz;/);
  });

  it('creates scan_runs with the counts the Last scan card shows', () => {
    expect(sql).toMatch(/create table public\.scan_runs/);
    expect(sql).toMatch(/started_at timestamptz not null/);
    expect(sql).toMatch(/finished_at timestamptz not null/);
    expect(sql).toMatch(/status text not null check \(status in \('ok', 'failed'\)\)/);
    for (const column of ['listed', 'new_count', 'inserted', 'rejected_title', 'rejected_location']) {
      expect(sql).toMatch(new RegExp(`${column} int not null default 0`));
    }
    expect(sql).toMatch(/create index scan_runs_source_started_idx on public\.scan_runs \(source, started_at desc\)/);
  });

  it('allows jsearch as a scan_runs source', () => {
    expect(sql).toMatch(/create table public\.scan_runs[\s\S]*'jsearch'/);
  });

  it('keeps scan_runs server-write-only with no client access at all', () => {
    expect(sql).toMatch(/alter table public\.scan_runs enable row level security/);
    expect(sql).toMatch(/revoke all on public\.scan_runs from anon, authenticated/);
    expect(sql).not.toMatch(/create policy [a-z_]+ on public\.scan_runs/);
  });
});
```

In `packages/shared/tests/job-sources.test.ts` replace the line

```ts
    expect(JOB_SOURCES).toEqual(['linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive']);
```

with

```ts
    expect(JOB_SOURCES).toEqual(['linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive', 'remoteok', 'weworkremotely', 'himalayas', 'arbeitnow']);
```

In `packages/shared/tests/profile.test.ts` insert this test just before the test named `accepts equal salary bounds and null location`:

```ts
  it('accepts the new-match email switch and rejects a non-boolean', () => {
    expect(profilePatchSchema.parse({ notify_new_matches: true })).toEqual({ notify_new_matches: true });
    expect(profilePatchSchema.safeParse({ notify_new_matches: 'yes' }).success).toBe(false);
  });

```

In BOTH `web/tests/lib/format.test.ts` and `mobile/tests/lib/format.test.ts`, replace the line `    expect(sourceLabel('somewhere')).toBe('somewhere');` with:

```ts
    expect(sourceLabel('remoteok')).toBe('RemoteOK');
    expect(sourceLabel('weworkremotely')).toBe('We Work Remotely');
    expect(sourceLabel('himalayas')).toBe('Himalayas');
    expect(sourceLabel('arbeitnow')).toBe('Arbeitnow');
    expect(sourceLabel('jsearch')).toBe('JSearch (LinkedIn, Indeed)');
    expect(sourceLabel('somewhere')).toBe('somewhere');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx vitest run tests/db/migration-0004.test.ts`
Expected: FAIL (`ENOENT ... 0004_discovery.sql`).

Run: `cd packages/shared && npx vitest run`
Expected: FAIL in `job-sources.test.ts` (list differs) and `profile.test.ts` (`notify_new_matches` is an unrecognized key).

Run: `cd web && npx vitest run tests/lib/format.test.ts`
Expected: FAIL (`expected 'remoteok' to be 'RemoteOK'`).

- [ ] **Step 3: Write the implementation**

Create `supabase/migrations/0004_discovery.sql`:

```sql
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
```

In `packages/shared/src/job-sources.ts` replace the first line with:

```ts
export const JOB_SOURCES = ['linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive', 'remoteok', 'weworkremotely', 'himalayas', 'arbeitnow'] as const;
```

In `packages/shared/src/profile.ts` add one line after `auto_followup: z.boolean(),`:

```ts
    notify_new_matches: z.boolean(),
```

In `packages/shared/src/api-types.ts`:

1. In `interface Profile`, add `notify_new_matches: boolean;` between `auto_followup: boolean;` and `updated_at: string;`.
2. In `interface JobSummary`, add after `company_domain: string | null;`:

```ts
  /** When the source says the job was posted (ISO time). Missing or null: use the application's created_at. */
  posted_at?: string | null;
```

3. Append to the end of the file:

```ts

/** One finished scan of one source, as listed by GET /scan/status. */
export interface ScanRun {
  /** A job board name ('myjobmag', 'remoteok', ...) or 'jsearch'. */
  source: string;
  started_at: string;
  finished_at: string;
  status: 'ok' | 'failed';
  /** A short reason when status is 'failed'. */
  error: string | null;
  listed: number;
  new_count: number;
  inserted: number;
  /** New jobs no user's roles matched on the title. */
  rejected_title: number;
  /** New jobs whose title matched somebody but whose place did not. */
  rejected_location: number;
}

/** GET /scan/status: the latest run per source and whether the worker has reported in lately. */
export interface ScanStatus {
  worker_alive: boolean;
  worker_last_seen: string | null;
  runs: ScanRun[];
}
```

In `server/src/db/types.ts`: in `interface JobRow` add after `dedupe_key: string;`:

```ts
  /** When the source says the job was posted; null or absent when it does not. */
  posted_at?: string | null;
```

and in `interface ProfileRow` add `notify_new_matches: boolean;` between `auto_followup: boolean;` and `updated_at: string;`.

Add the new field to the four existing `ProfileRow` literals in server tests (each has `auto_followup: false,`):

```bash
cd server && sed -i "s/auto_followup: false,/auto_followup: false, notify_new_matches: false,/" tests/api/app.test.ts tests/worker/match-user-job.test.ts tests/worker/match.test.ts tests/worker/tailor.test.ts && cd ..
```

In BOTH `web/src/lib/format.ts` and `mobile/src/lib/format.ts` replace

```ts
  indeed: 'Indeed',
};
```

with

```ts
  indeed: 'Indeed',
  remoteok: 'RemoteOK',
  weworkremotely: 'We Work Remotely',
  himalayas: 'Himalayas',
  arbeitnow: 'Arbeitnow',
  jsearch: 'JSearch (LinkedIn, Indeed)',
};
```

In `mobile/tests/fixtures.ts`, in the `profile` builder, add `  notify_new_matches: false,` on the line after `  auto_followup: false,`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run build:shared
cd packages/shared && npx vitest run && cd ..
cd server && npx tsc -p tsconfig.json && npx vitest run && cd ..
cd web && npx vitest run tests/lib/format.test.ts && cd ..
cd mobile && npx tsc --noEmit -p tsconfig.json && npx jest tests/lib/format.test.ts && cd ..
```

Expected: shared `Tests  108 passed`, server `Test Files  75 passed` and no type errors, web format `Tests  6 passed`, mobile format `Tests:       6 passed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_discovery.sql server/tests/db/migration-0004.test.ts packages/shared server/src/db/types.ts server/tests web/src/lib/format.ts web/tests/lib/format.test.ts mobile/src/lib/format.ts mobile/tests
git commit -m "feat(db): migration 0004 for scan runs, posted dates, new sources and match alerts" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Smarter title pre-filter with reason codes

**Files:**
- Modify (replace whole file): `server/src/domain/prefilter.ts`
- Modify (replace whole file): `server/tests/domain/prefilter.test.ts`
- Modify: `server/src/worker/match.ts`, `server/src/worker/repos.ts`
- Create: `server/tests/worker/match-skills.test.ts`

**Interfaces:**
- Consumes: `JobSource` from `server/src/domain/jobs.ts` (now includes the four new sources from Task 1).
- Produces (all exported from `server/src/domain/prefilter.ts`):
  - `interface MatchJob { title: string; location: string; source: JobSource }`
  - `interface MatchProfile { desired_roles: string[]; location: 'Lagos' | 'Abuja' | 'Remote' | null; skills?: string[] }`
  - `type PrefilterReason = 'no_roles' | 'title' | 'location'`
  - `type PrefilterResult = { ok: true } | { ok: false; reason: PrefilterReason }`
  - `words(text: string): string[]`
  - `prefilterJob(job: MatchJob, profile: MatchProfile): PrefilterResult`
  - `matchesProfile(job: MatchJob, profile: MatchProfile): boolean` (same name and meaning as before)
  - `server/src/worker/match.ts`: `type MatchCandidate = Pick<ProfileRow, 'user_id' | 'desired_roles' | 'location'> & { skills?: string[] }`
  - `createWorkerRepos(db).loadCandidates()` now also returns each profile's `skills`.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `server/tests/domain/prefilter.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { matchesProfile, prefilterJob, words, type MatchProfile } from '../../src/domain/prefilter.js';

const profile = { desired_roles: ['backend engineer'], location: 'Lagos' as const };

describe('words', () => {
  it('lowercases and splits on anything but letters, digits, + and #', () => {
    expect(words('C++/C# Developer (Remote)')).toEqual(['c++', 'c#', 'engineer', 'remote']);
  });

  it('joins common spellings so they compare equal', () => {
    expect(words('Full Stack Developer')).toEqual(['fullstack', 'engineer']);
    expect(words('Full-Stack Engineer')).toEqual(['fullstack', 'engineer']);
    expect(words('Fullstack Dev')).toEqual(['fullstack', 'engineer']);
    expect(words('Front End Engineer')).toEqual(['frontend', 'engineer']);
    expect(words('Back-end Programmer')).toEqual(['backend', 'engineer']);
    expect(words('Node.js Developer')).toEqual(['node', 'engineer']);
    expect(words('NodeJS Developer')).toEqual(['node', 'engineer']);
  });

  it('drops single letters', () => {
    expect(words('A Data Analyst')).toEqual(['data', 'analyst']);
  });
});

describe('matchesProfile', () => {
  it('passes when every role word is in the title', () => {
    expect(matchesProfile({ title: 'Senior Backend Engineer', location: 'Lagos', source: 'myjobmag' }, profile)).toBe(true);
  });

  it('fails when the title does not contain the role words', () => {
    expect(matchesProfile({ title: 'Marketing Manager', location: 'Lagos', source: 'myjobmag' }, profile)).toBe(false);
    expect(matchesProfile({ title: 'Frontend Engineer', location: 'Lagos', source: 'myjobmag' }, profile)).toBe(false);
  });

  it('fails when the user has no desired roles', () => {
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Lagos', source: 'myjobmag' }, { ...profile, desired_roles: [] })).toBe(false);
  });

  it('rejects a non-remote job in another city', () => {
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Abuja', source: 'myjobmag' }, profile)).toBe(false);
  });

  it('accepts Remotive and remote jobs for a Lagos user', () => {
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Worldwide', source: 'remotive' }, profile)).toBe(true);
    expect(matchesProfile({ title: 'Backend Engineer (Remote)', location: '', source: 'jobberman' }, profile)).toBe(true);
  });

  it('accepts a job with no location', () => {
    expect(matchesProfile({ title: 'Backend Engineer', location: '', source: 'myjobmag' }, profile)).toBe(true);
  });

  it('for a Remote user only accepts remote jobs', () => {
    const remoteUser = { ...profile, location: 'Remote' as const };
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Lagos', source: 'myjobmag' }, remoteUser)).toBe(false);
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Worldwide', source: 'remotive' }, remoteUser)).toBe(true);
  });

  it('with no location preference any location passes', () => {
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Kano', source: 'myjobmag' }, { ...profile, location: null })).toBe(true);
  });
});

describe('prefilterJob reason codes', () => {
  const job = { title: 'Backend Engineer', location: 'Lagos', source: 'myjobmag' as const };

  it('says ok when the job fits', () => {
    expect(prefilterJob(job, profile)).toEqual({ ok: true });
  });

  it('says no_roles when the user has no roles, or only roles with no usable words', () => {
    expect(prefilterJob(job, { ...profile, desired_roles: [] })).toEqual({ ok: false, reason: 'no_roles' });
    expect(prefilterJob(job, { ...profile, desired_roles: ['a', '!'] })).toEqual({ ok: false, reason: 'no_roles' });
  });

  it('says title when no role fits, even if the place would not fit either', () => {
    expect(prefilterJob({ ...job, title: 'Marketing Manager', location: 'Abuja' }, profile)).toEqual({ ok: false, reason: 'title' });
  });

  it('says location when the title fits but the place does not', () => {
    expect(prefilterJob({ ...job, location: 'Abuja' }, profile)).toEqual({ ok: false, reason: 'location' });
  });
});

// The roles one real user searches for, against titles that boards really post.
describe('real roles table', () => {
  const user: MatchProfile = {
    desired_roles: ['Full Stack Developer', 'JavaScript Developer', 'Software Engineer', 'Backend Developer'],
    skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'React Native'],
    location: 'Remote',
  };
  const remote = (title: string) => ({ title, location: 'Worldwide', source: 'remotive' as const });

  it.each([
    'Full Stack Developer',
    'Senior Full-Stack Engineer',
    'Fullstack Developer (React/Node)',
    'Full Stack Software Engineer',
    'JavaScript Developer',
    'JavaScript Engineer',
    'Senior JS/TypeScript Engineer',
    'Software Engineer',
    'Senior Software Engineer II',
    'Software Developer',
    'Staff Software Engineer, Platform',
    'Backend Developer',
    'Back End Engineer',
    'Senior Backend Engineer (Node.js)',
    'Sr. Backend Developer',
    'Node.js Developer',
    'React Developer',
    'React Native Engineer',
    'Frontend Developer - React',
    'Software Engineer (Remote)',
  ])('accepts "%s"', (title) => {
    expect(prefilterJob(remote(title), user)).toEqual({ ok: true });
  });

  it.each([
    'Marketing Manager',
    'Sales Executive',
    'Data Entry Clerk',
    'Civil Engineer',
    'Mechanical Engineer',
    'Customer Support Engineer',
    'Sales Engineer',
    'DevOps Engineer',
    'Frontend Developer',
    'Product Designer',
    'Account Manager',
    'Registered Nurse',
  ])('turns away "%s" on the title', (title) => {
    expect(prefilterJob(remote(title), user)).toEqual({ ok: false, reason: 'title' });
  });

  it.each([
    'Backend Developer Intern',
    'Software Engineering Internship Software Engineer',
    'Software Engineer (Unpaid)',
    'Volunteer Full Stack Developer',
    'Software Engineer - Intern',
  ])('turns away "%s" because of the blocklist', (title) => {
    expect(prefilterJob(remote(title), user)).toEqual({ ok: false, reason: 'title' });
  });

  it('lets a blocklist word through when a desired role contains it', () => {
    const internUser: MatchProfile = { desired_roles: ['Software Engineering Intern'], location: null };
    expect(prefilterJob({ title: 'Software Engineering Intern', location: '', source: 'myjobmag' }, internUser)).toEqual({ ok: true });
    expect(prefilterJob({ title: 'Software Engineer', location: '', source: 'myjobmag' }, internUser)).toEqual({ ok: false, reason: 'title' });
  });

  it('does not treat "International" as the blocked word "intern"', () => {
    expect(prefilterJob(remote('International Software Engineer'), user)).toEqual({ ok: true });
  });

  it('matches a longer role on 60 percent of its words plus a core noun', () => {
    const senior: MatchProfile = { desired_roles: ['Senior Backend Engineer'], location: null };
    expect(prefilterJob({ title: 'Backend Engineer', location: '', source: 'myjobmag' }, senior)).toEqual({ ok: true });
    expect(prefilterJob({ title: 'Senior Backend Analyst', location: '', source: 'myjobmag' }, senior)).toEqual({ ok: false, reason: 'title' });
  });

  it('needs the core noun for a skill match', () => {
    expect(prefilterJob(remote('React Designer'), user)).toEqual({ ok: false, reason: 'title' });
    expect(prefilterJob(remote('React Architect'), user)).toEqual({ ok: true });
  });
});

describe('real roles table, places', () => {
  const lagos: MatchProfile = { desired_roles: ['Software Engineer'], skills: ['React'], location: 'Lagos' };
  const remote: MatchProfile = { ...lagos, location: 'Remote' };
  const job = (location: string, source: 'myjobmag' | 'remoteok' | 'weworkremotely' | 'himalayas' | 'arbeitnow') => ({ title: 'Software Engineer', location, source });

  it('a Lagos user keeps Lagos jobs and any remote job, and drops other cities', () => {
    expect(prefilterJob(job('Lagos', 'myjobmag'), lagos)).toEqual({ ok: true });
    expect(prefilterJob(job('Lagos, Nigeria', 'myjobmag'), lagos)).toEqual({ ok: true });
    expect(prefilterJob(job('Remote, Germany', 'arbeitnow'), lagos)).toEqual({ ok: true });
    expect(prefilterJob(job('Abuja', 'myjobmag'), lagos)).toEqual({ ok: false, reason: 'location' });
    expect(prefilterJob(job('Port Harcourt', 'myjobmag'), lagos)).toEqual({ ok: false, reason: 'location' });
  });

  it('a Remote user keeps remote, worldwide, anywhere, Africa, Nigeria and EMEA places', () => {
    for (const place of ['Remote', 'Worldwide', 'Anywhere in the World', 'Africa', 'Nigeria', 'EMEA', 'Lagos, Nigeria']) {
      expect(prefilterJob(job(place, 'myjobmag'), remote)).toEqual({ ok: true });
    }
    expect(prefilterJob(job('Abuja', 'myjobmag'), remote)).toEqual({ ok: false, reason: 'location' });
  });

  it('remote boards keep open regions and drop region-locked jobs for every preference', () => {
    for (const source of ['remoteok', 'weworkremotely', 'himalayas'] as const) {
      for (const preference of [lagos, remote]) {
        expect(prefilterJob(job('Anywhere in the World', source), preference)).toEqual({ ok: true });
        expect(prefilterJob(job('India, Nigeria, Philippines', source), preference)).toEqual({ ok: true });
        expect(prefilterJob(job('Worldwide', source), preference)).toEqual({ ok: true });
        expect(prefilterJob(job('', source), preference)).toEqual({ ok: true });
        expect(prefilterJob(job('USA Only', source), preference)).toEqual({ ok: false, reason: 'location' });
        expect(prefilterJob(job('North America Only', source), preference)).toEqual({ ok: false, reason: 'location' });
        expect(prefilterJob(job('Copenhagen', source), preference)).toEqual({ ok: false, reason: 'location' });
      }
    }
  });

  it('a null preference keeps every place', () => {
    expect(prefilterJob(job('USA Only', 'remoteok'), { ...lagos, location: null })).toEqual({ ok: true });
  });
});

describe('Remotive eligibility', () => {
  const rem = (location: string) => ({ title: 'Backend Engineer', location, source: 'remotive' as const });
  const lagos = { desired_roles: ['backend engineer'], location: 'Lagos' as const };
  const remote = { desired_roles: ['backend engineer'], location: 'Remote' as const };

  it('rejects region-locked Remotive jobs for Lagos and Remote users', () => {
    for (const loc of ['USA Only', 'Europe']) {
      expect(matchesProfile(rem(loc), lagos)).toBe(false);
      expect(matchesProfile(rem(loc), remote)).toBe(false);
    }
  });

  it('accepts open or Africa-friendly Remotive jobs', () => {
    for (const loc of ['Worldwide', 'Africa', 'Remote', 'EMEA', '']) {
      expect(matchesProfile(rem(loc), lagos)).toBe(true);
      expect(matchesProfile(rem(loc), remote)).toBe(true);
    }
  });

  it('a null location preference passes any Remotive location', () => {
    expect(matchesProfile(rem('USA Only'), { desired_roles: ['backend engineer'], location: null })).toBe(true);
  });
});
```

Create `server/tests/worker/match-skills.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { JobRow } from '../../src/db/types.js';
import type { Db } from '../../src/lib/supabase.js';
import { matchJob, type MatchCandidate, type MatchDeps } from '../../src/worker/match.js';
import { createWorkerRepos } from '../../src/worker/repos.js';

const job = (title: string): JobRow => ({
  id: 'j1', title, company: 'Acme', location: 'Worldwide', description: 'd', source: 'remoteok',
  url: 'https://remoteOK.com/remote-jobs/1', company_domain: null, dedupe_key: 'acme|x', created_at: '2026-10-20T00:00:00Z',
});

function deps(candidates: MatchCandidate[], title: string): MatchDeps {
  return {
    loadJob: vi.fn<MatchDeps['loadJob']>().mockImplementation(async () => job(title)),
    loadCandidates: vi.fn<MatchDeps['loadCandidates']>().mockImplementation(async () => candidates),
    loadProfile: vi.fn(),
    loadRecentJobs: vi.fn(),
    existingJobIds: vi.fn(),
    enqueueTailor: vi.fn<MatchDeps['enqueueTailor']>().mockImplementation(async () => undefined),
  };
}

describe('matchJob with skills', () => {
  const dev: MatchCandidate = { user_id: 'u1', desired_roles: ['Software Engineer'], location: 'Remote', skills: ['React', 'Node.js'] };

  it('queues a title that fits no role but names a skill plus a core role noun', async () => {
    const d = deps([dev], 'React Developer');
    expect(await matchJob('j1', d)).toBe(1);
    expect(d.enqueueTailor).toHaveBeenCalledWith('u1', 'j1');
  });

  it('does not queue a title with a skill but no core role noun', async () => {
    const d = deps([dev], 'React Designer');
    expect(await matchJob('j1', d)).toBe(0);
  });

  it('works for a candidate whose skills were not loaded', async () => {
    const d = deps([{ user_id: 'u2', desired_roles: ['Software Engineer'], location: 'Remote' }], 'Software Developer');
    expect(await matchJob('j1', d)).toBe(1);
  });
});

describe('worker repo loadCandidates', () => {
  it('reads the skills along with the roles, and drops profiles with no roles', async () => {
    const calls: unknown[][] = [];
    const rows = [
      { user_id: 'u1', desired_roles: ['Software Engineer'], location: 'Remote', skills: ['React'] },
      { user_id: 'u2', desired_roles: [], location: 'Lagos', skills: [] },
    ];
    const chain: object = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
        return (...args: unknown[]) => (calls.push([String(prop), ...args]), chain);
      },
    });
    const db = { from: (table: string) => (calls.push(['from', table]), chain) } as unknown as Db;
    expect(await createWorkerRepos(db).loadCandidates()).toEqual([rows[0]]);
    expect(calls[1]).toEqual(['select', 'user_id, desired_roles, location, skills']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx vitest run tests/domain/prefilter.test.ts tests/worker/match-skills.test.ts`
Expected: FAIL (`words` and `prefilterJob` are not exported; `loadCandidates` selects without `skills`).

- [ ] **Step 3: Write the implementation**

Replace the whole of `server/src/domain/prefilter.ts` with:

```ts
import type { JobSource } from './jobs.js';

export interface MatchJob {
  title: string;
  location: string;
  source: JobSource;
}

export interface MatchProfile {
  desired_roles: string[];
  location: 'Lagos' | 'Abuja' | 'Remote' | null;
  /** The user's skills; a skill in the title plus a core role noun is enough for a match. */
  skills?: string[];
}

/** Why a job was turned away: the user has no usable roles, the title does not fit them, or the place does not fit. */
export type PrefilterReason = 'no_roles' | 'title' | 'location';
export type PrefilterResult = { ok: true } | { ok: false; reason: PrefilterReason };

// "Full stack" and "fullstack" must compare equal, so common spellings are joined before the title is split into words.
const PHRASES: Array<[RegExp, string]> = [
  [/\bfull[\s-]*stack\b/g, 'fullstack'],
  [/\bfront[\s-]*end\b/g, 'frontend'],
  [/\bback[\s-]*end\b/g, 'backend'],
  [/\bnode\.js\b|\bnodejs\b/g, 'node'],
];

// "Software Engineer" and "Software Developer" are the same job, so these nouns count as one word.
const SYNONYMS: Record<string, string> = { developer: 'engineer', programmer: 'engineer', dev: 'engineer' };

/** The nouns that make a title a hands-on technical role (after SYNONYMS: developer, programmer and dev are "engineer"). */
const CORE_NOUNS = new Set(['engineer', 'architect']);

const BLOCKLIST = ['intern', 'internship', 'unpaid', 'volunteer'];

const ROLE_SHARE = 0.6;

/** Lowercase words of a title, role or skill: split on anything but letters, digits, "+" and "#". */
export function words(text: string): string[] {
  let t = text.toLowerCase();
  for (const [pattern, joined] of PHRASES) t = t.replace(pattern, ` ${joined} `);
  return t
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w.length > 1)
    .map((w) => SYNONYMS[w] ?? w);
}

function titleMatches(title: string, roleWordLists: string[][], skills: string[]): boolean {
  const titleWords = new Set(words(title));

  // intern, unpaid and similar titles are turned away unless the user is looking for exactly that.
  for (const blocked of BLOCKLIST) {
    if (titleWords.has(blocked) && !roleWordLists.some((role) => role.includes(blocked))) return false;
  }

  const hasCoreNoun = [...titleWords].some((w) => CORE_NOUNS.has(w));
  const roleFits = roleWordLists.some((role) => {
    const found = role.filter((w) => titleWords.has(w)).length;
    return found === role.length || (hasCoreNoun && found / role.length >= ROLE_SHARE);
  });
  if (roleFits) return true;

  if (!hasCoreNoun) return false;
  return skills.some((skill) => {
    const skillWords = words(skill);
    return skillWords.length > 0 && skillWords.every((w) => titleWords.has(w));
  });
}

// Boards that only list remote work. Their location is the region the employer hires from.
const REMOTE_BOARDS = new Set<JobSource>(['remotive', 'remoteok', 'weworkremotely', 'himalayas']);
const OPEN_REGION = /worldwide|anywhere|global|africa|emea|nigeria|^remote$/i;
const SAYS_REMOTE = /remote|work from home|anywhere/i;

function locationMatches(job: MatchJob, preference: MatchProfile['location']): boolean {
  if (preference === null) return true;
  const place = job.location.trim();
  if (REMOTE_BOARDS.has(job.source)) {
    // Skip region-locked jobs (for example "USA Only") before spending AI calls.
    return place === '' || OPEN_REGION.test(place);
  }
  if (SAYS_REMOTE.test(`${job.title} ${job.location}`)) return true;
  if (preference === 'Remote') return OPEN_REGION.test(place);
  if (place === '') return true;
  return place.toLowerCase().includes(preference.toLowerCase());
}

/** Cheap, free check run before spending an AI call. Says why a job was turned away. */
export function prefilterJob(job: MatchJob, profile: MatchProfile): PrefilterResult {
  const roleWordLists = profile.desired_roles.map(words).filter((role) => role.length > 0);
  if (roleWordLists.length === 0) return { ok: false, reason: 'no_roles' };
  if (!titleMatches(job.title, roleWordLists, profile.skills ?? [])) return { ok: false, reason: 'title' };
  if (!locationMatches(job, profile.location)) return { ok: false, reason: 'location' };
  return { ok: true };
}

export function matchesProfile(job: MatchJob, profile: MatchProfile): boolean {
  return prefilterJob(job, profile).ok;
}
```

In `server/src/worker/match.ts` replace

```ts
export type MatchCandidate = Pick<ProfileRow, 'user_id' | 'desired_roles' | 'location'>;
```

with

```ts
export type MatchCandidate = Pick<ProfileRow, 'user_id' | 'desired_roles' | 'location'> & { skills?: string[] };
```

In `server/src/worker/repos.ts`, inside `loadCandidates`, replace `.select('user_id, desired_roles, location')` with `.select('user_id, desired_roles, location, skills')`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx tsc -p tsconfig.json && npx vitest run tests/domain tests/worker`
Expected: no type errors; `Test Files  ... passed`, no failures (the prefilter file reports `Tests  63 passed`).

- [ ] **Step 5: Commit**

```bash
git add server/src/domain/prefilter.ts server/tests/domain/prefilter.test.ts server/src/worker/match.ts server/src/worker/repos.ts server/tests/worker/match-skills.test.ts
git commit -m "feat(server): score titles against roles and skills with reason codes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Posted time from every source (`jobs.posted_at`) on the server

**Files:**
- Modify: `server/src/domain/jobs.ts`, `server/src/services/jobs/repo.ts`
- Modify: `server/src/api/deps.ts`, `server/src/api/repos.ts`
- Modify: `server/src/scrapers/remotive.ts`, `server/src/scrapers/myjobmag.ts`, `server/src/scrapers/jobberman.ts`, `server/src/scrapers/jsearch-client.ts`, `server/src/scrapers/jsearch.ts`
- Create: `server/tests/domain/posted-at.test.ts`, `server/tests/scrapers/posted-at.test.ts`

**Interfaces:**
- Consumes: `jobs.posted_at` column (Task 1).
- Produces:
  - `parsePostedAt(value: unknown, now?: Date): string | null` in `server/src/domain/jobs.ts`: epoch seconds or milliseconds, ISO strings (no zone means UTC) or RFC 822 dates become an ISO string; anything unreadable, before 2000, or more than a day ahead is `null`.
  - `JobStub.postedAt?: string | null`, `NormalisedJob.postedAt?: string | null`; `normaliseJob({... postedAt?: unknown})` adds `postedAt` only when readable.
  - `insertJobs` writes `posted_at`; API applications carry `job.posted_at` (`ApplicationWithJob.job.posted_at?: string | null`).
  - Remotive, MyJobMag (detail), Jobberman (detail) and JSearch fill `postedAt`.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/domain/posted-at.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normaliseJob, parsePostedAt } from '../../src/domain/jobs.js';

const NOW = new Date('2026-10-20T12:00:00.000Z');

describe('parsePostedAt', () => {
  it('reads epoch seconds and epoch milliseconds', () => {
    expect(parsePostedAt(1792425604, NOW)).toBe('2026-10-19T16:00:04.000Z');
    expect(parsePostedAt(1792425604000, NOW)).toBe('2026-10-19T16:00:04.000Z');
  });

  it('reads ISO strings with a zone, converting to UTC', () => {
    expect(parsePostedAt('2026-10-19T16:00:04+00:00', NOW)).toBe('2026-10-19T16:00:04.000Z');
    expect(parsePostedAt('2026-10-17T09:04:44+01:00', NOW)).toBe('2026-10-17T08:04:44.000Z');
    expect(parsePostedAt('2026-10-16T00:00:00.000000Z', NOW)).toBe('2026-10-16T00:00:00.000Z');
  });

  it('reads an ISO string with no zone as UTC (Remotive sends it that way)', () => {
    expect(parsePostedAt('2026-10-14T20:33:44', NOW)).toBe('2026-10-14T20:33:44.000Z');
  });

  it('reads an RFC 822 date (RSS pubDate)', () => {
    expect(parsePostedAt('Tue, 20 Oct 2026 18:10:55 +0000', new Date('2026-10-20T19:00:00Z'))).toBe('2026-10-20T18:10:55.000Z');
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['an empty string', '  '],
    ['text', 'yesterday'],
    ['NaN', Number.NaN],
    ['a date before 2000', '1999-12-31T00:00:00Z'],
    ['a date more than a day ahead', '2026-10-22T12:00:00Z'],
    ['an object', {}],
  ])('returns null for %s', (_name, value) => {
    expect(parsePostedAt(value, NOW)).toBeNull();
  });

  it('allows a little clock difference (up to a day ahead)', () => {
    expect(parsePostedAt('2026-10-21T10:00:00Z', NOW)).toBe('2026-10-21T10:00:00.000Z');
  });
});

describe('normaliseJob postedAt', () => {
  const base = {
    title: 'Data Analyst', company: 'Acme', location: 'Lagos', description: 'Do things.',
    source: 'remoteok' as const, url: 'https://remoteok.com/remote-jobs/1',
  };

  it('keeps a readable posted time as an ISO string', () => {
    expect(normaliseJob({ ...base, postedAt: '2026-10-19T16:00:04+00:00' })?.postedAt).toBe('2026-10-19T16:00:04.000Z');
  });

  it('leaves postedAt out when the time is missing or unreadable', () => {
    expect(normaliseJob(base)).not.toHaveProperty('postedAt');
    expect(normaliseJob({ ...base, postedAt: 'soon' })).not.toHaveProperty('postedAt');
  });
});
```

Create `server/tests/scrapers/posted-at.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { JobStub, NormalisedJob } from '../../src/domain/jobs.js';
import type { Db } from '../../src/lib/supabase.js';
import { parseJobbermanDetail } from '../../src/scrapers/jobberman.js';
import { parseJSearchJob } from '../../src/scrapers/jsearch.js';
import { createMyJobMagScraper, parseMyJobMagDetail } from '../../src/scrapers/myjobmag.js';
import { createRemotiveScraper, parseRemotive } from '../../src/scrapers/remotive.js';
import { insertJobs } from '../../src/services/jobs/repo.js';

const read = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

describe('posted time from each source', () => {
  it('Remotive: publication_date has no zone and is read as UTC', () => {
    const [first] = parseRemotive(read('remotive.json'));
    expect(first!.postedAt).toBe('2026-10-14T20:33:44.000Z');
  });

  it('Remotive: detail() keeps the posted time', async () => {
    const scraper = createRemotiveScraper(vi.fn().mockResolvedValue(read('remotive.json')));
    const [stub] = await scraper.list();
    expect((await scraper.detail(stub!)).postedAt).toBe('2026-10-14T20:33:44.000Z');
  });

  it('MyJobMag: reads datePosted from the detail page even though its JSON-LD is not valid JSON', () => {
    expect(parseMyJobMagDetail(read('myjobmag-detail.html')).postedAt).toBe('2026-10-17T08:04:44.000Z');
  });

  it('MyJobMag: no datePosted means no postedAt', () => {
    expect(parseMyJobMagDetail('<div class="job-details"><p>Hello</p></div>')).not.toHaveProperty('postedAt');
  });

  it('MyJobMag: detail() passes the posted time on', async () => {
    const stub: JobStub = { title: 'QA', company: 'Viju', location: '', url: 'https://www.myjobmag.com/job/qa', source: 'myjobmag' };
    const job = await createMyJobMagScraper(vi.fn().mockResolvedValue(read('myjobmag-detail.html'))).detail(stub);
    expect(job.postedAt).toBe('2026-10-17T08:04:44.000Z');
  });

  it('Jobberman: reads datePosted from the JobPosting JSON-LD', () => {
    expect(parseJobbermanDetail(read('jobberman-detail.html')).postedAt).toBe('2026-10-16T00:00:00.000Z');
  });

  it('Jobberman: a JobPosting without datePosted gives no postedAt', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', description: '<p>x</p>' })}</script>`;
    expect(parseJobbermanDetail(html)).not.toHaveProperty('postedAt');
  });

  it('JSearch: job_posted_at_datetime_utc becomes postedAt', () => {
    const job = parseJSearchJob({
      job_publisher: 'LinkedIn', job_title: 'Data Analyst', employer_name: 'Acme', job_description: 'Do data.',
      job_apply_link: 'https://www.linkedin.com/jobs/view/4012345678/', job_posted_at_datetime_utc: '2026-10-19T08:30:00.000Z',
    });
    expect(job?.postedAt).toBe('2026-10-19T08:30:00.000Z');
  });
});

type Result = { data?: unknown; error?: unknown };

/** A Supabase stand-in: records every chained call; each awaited query takes the next queued result. */
function fakeDb(results: Result[] = []) {
  const calls: unknown[][] = [];
  const chain: object = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') {
        const next = results.shift() ?? {};
        return (resolve: (v: unknown) => void) => resolve({ data: next.data ?? null, error: next.error ?? null });
      }
      return (...args: unknown[]) => {
        calls.push([String(prop), ...args]);
        return chain;
      };
    },
  });
  return { db: { from: (table: string) => (calls.push(['from', table]), chain) } as unknown as Db, calls };
}

describe('insertJobs and posted_at', () => {
  const job = (over: Partial<NormalisedJob> = {}): NormalisedJob => ({
    title: 'Data Analyst', company: 'Acme', location: 'Lagos', description: 'd', source: 'remoteok',
    url: 'https://remoteok.com/remote-jobs/1', companyDomain: null, ...over,
  });

  it('stores the posted time, and null when the source gave none', async () => {
    const { db, calls } = fakeDb([{ data: [{ id: 'j1' }, { id: 'j2' }] }]);
    await insertJobs(db, [job({ postedAt: '2026-10-19T16:00:04.000Z' }), job({ title: 'Other', url: 'https://remoteok.com/remote-jobs/2' })]);
    const upsert = calls.find((c) => c[0] === 'upsert')!;
    const rows = upsert[1] as Array<{ posted_at: string | null }>;
    expect(rows.map((r) => r.posted_at)).toEqual(['2026-10-19T16:00:04.000Z', null]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx vitest run tests/domain/posted-at.test.ts tests/scrapers/posted-at.test.ts`
Expected: FAIL (`parsePostedAt is not a function`, `postedAt` undefined).

- [ ] **Step 3: Write the implementation**

In `server/src/domain/jobs.ts`:

1. In `interface JobStub`, add after `description?: string;`:

```ts
  /** When the source says it was posted (ISO time); absent when the source does not say. */
  postedAt?: string | null;
```

2. In `interface NormalisedJob`, add after `companyDomain: string | null;`:

```ts
  postedAt?: string | null;
```

3. Insert this block just above the comment `/** Validates and tidies a job from an outside source.`:

```ts
const NAIVE_ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const ONE_DAY_MS = 86_400_000;

/**
 * An ISO time from what a source sends as its posted time: epoch seconds or milliseconds, an ISO string
 * (a string with no zone is read as UTC), or an RFC 822 date. Null for anything unreadable, before 2000,
 * or more than a day in the future.
 */
export function parsePostedAt(value: unknown, now: Date = new Date()): string | null {
  let ms: number;
  if (typeof value === 'number' && Number.isFinite(value)) {
    ms = value < 1e11 ? value * 1000 : value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    const text = value.trim();
    ms = Date.parse(NAIVE_ISO_TIME.test(text) ? `${text}Z` : text);
  } else {
    return null;
  }
  if (!Number.isFinite(ms) || ms < Date.UTC(2000, 0, 1) || ms > now.getTime() + ONE_DAY_MS) return null;
  return new Date(ms).toISOString();
}
```

4. In the `normaliseJob` parameter type add `postedAt?: unknown;` after `companyDomain?: string | null;`, and replace its last line (`return { title, company, location, description, source: input.source, url: input.url, companyDomain: input.companyDomain ?? null };`) with:

```ts
  const postedAt = parsePostedAt(input.postedAt);
  return {
    title, company, location, description, source: input.source, url: input.url, companyDomain: input.companyDomain ?? null,
    ...(postedAt ? { postedAt } : {}),
  };
```

In `server/src/services/jobs/repo.ts`, in `insertJobs`, add a line after `dedupe_key: dedupeKey(j.company, j.title),`:

```ts
    posted_at: j.postedAt ?? null,
```

In `server/src/api/deps.ts`, in `ApplicationWithJob`, change the `job` type to end `company_domain: string | null; posted_at?: string | null } | null;`. In `server/src/api/repos.ts` change `APP_SELECT` to:

```ts
const APP_SELECT = '*, job:jobs(title, company, location, source, url, company_domain, posted_at)';
```

In `server/src/scrapers/remotive.ts`:

1. Change the first import to `import { parsePostedAt, type JobStub } from '../domain/jobs.js';`.
2. In `interface RemotiveJob` add `publication_date?: string;` after `description?: string;`.
3. In `parseRemotive`, add `postedAt: parsePostedAt(j.publication_date),` after the `description: htmlToText(j.description ?? ''),` line.
4. In `detail`, add `postedAt: stub.postedAt ?? null,` after `companyDomain: null,`.

In `server/src/scrapers/myjobmag.ts` (use the Edit tool: the pattern has backslashes):

1. Change the import to `import { parsePostedAt, type JobStub } from '../domain/jobs.js';`.
2. Replace the line `export function parseMyJobMagDetail(html: string): { description: string; location: string } {` with:

```ts
// The page's JSON-LD block is not always valid JSON (raw control characters), so the posted time is read with a pattern.
const DATE_POSTED = /"datePosted"\s*:\s*"([^"]+)"/;

export function parseMyJobMagDetail(html: string): { description: string; location: string; postedAt?: string } {
```

3. Replace `  return { description, location };` with:

```ts
  const postedAt = parsePostedAt(DATE_POSTED.exec(html)?.[1]);
  return { description, location, ...(postedAt ? { postedAt } : {}) };
```

4. In `createMyJobMagScraper().detail`, change the first line to `const { description, location, postedAt } = parseMyJobMagDetail(await fetchText(stub.url));` and add `postedAt: postedAt ?? null,` after `companyDomain: null,`.

In `server/src/scrapers/jobberman.ts`:

1. Change the import to `import { parsePostedAt, type JobStub } from '../domain/jobs.js';`.
2. Replace the signature and first two lines of `parseJobbermanDetail` so it reads:

```ts
export function parseJobbermanDetail(html: string): { description: string; postedAt?: string } {
  const $ = cheerio.load(html);
  let description = '';
  let postedAt: string | null = null;
```

3. In the JSON-LD cast add `datePosted?: string` to the node type (`{ '@type'?: string; description?: string; datePosted?: string }`), and replace `if (posting?.description) description = htmlToText(posting.description);` with:

```ts
      if (posting?.description) {
        description = htmlToText(posting.description);
        postedAt = parsePostedAt(posting.datePosted);
      }
```

4. Replace `  return { description };` with `  return { description, ...(postedAt ? { postedAt } : {}) };`.
5. In `detail`, change to `const { description, postedAt } = parseJobbermanDetail(await fetchText(stub.url));` and add `postedAt: postedAt ?? null,` after `companyDomain: null,`.

In `server/src/scrapers/jsearch-client.ts`, add `  job_posted_at_datetime_utc?: unknown;` after `job_is_remote?: unknown;` in `JSearchJob`. In `server/src/scrapers/jsearch.ts`: add `    postedAt: raw.job_posted_at_datetime_utc,` after the `companyDomain: domainFromWebsite(raw.employer_website),` line in `parseJSearchJob`, and change the `list()` mapping line to:

```ts
      return [...found.values()].map(({ title, company, location, url, source, description, postedAt }) => ({ title, company, location, url, source, description, postedAt }));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `grep -n 'NAIVE_ISO_TIME' server/src/domain/jobs.ts` (the regex line must contain `\d`), then `cd server && npx tsc -p tsconfig.json && npx vitest run`
Expected: no type errors; all server test files pass (`Test Files  78 passed`).

- [ ] **Step 5: Commit**

```bash
git add server/src server/tests
git commit -m "feat(server): keep the posted time of each job (jobs.posted_at)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 4: Scan history, pre-filter counts, worker heartbeat and `GET /scan/status`

**Files:**
- Create: `server/src/services/scan/runs.ts`, `server/src/services/scan/heartbeat.ts`, `server/src/services/scan/service.ts`, `server/src/api/routes/scan.ts`
- Modify (replace whole file): `server/src/worker/scrape.ts`
- Modify: `server/src/api/deps.ts`, `server/src/api/app.ts`, `server/src/api/index.ts`, `server/tests/helpers/deps.ts`, `server/src/worker/index.ts`
- Modify (replace whole file): `server/tests/worker/scrape.test.ts`
- Create: `server/tests/services/scan.test.ts`, `server/tests/api/scan.test.ts`

**Interfaces:**
- Consumes: `prefilterJob` and `PrefilterResult` (Task 2); `MatchCandidate` (Task 2); `ScanRun`, `ScanStatus` from `@joblume/shared` and the `scan_runs` table (Task 1).
- Produces:
  - `server/src/services/scan/runs.ts`: `interface ScanRunInput { source: string; started_at: string; finished_at: string; status: 'ok' | 'failed'; error: string | null; listed: number; new_count: number; inserted: number; rejected_title: number; rejected_location: number }`; `interface ScanRunsRepo { record(run: ScanRunInput): Promise<void>; latestPerSource(): Promise<ScanRun[]> }`; `createScanRunsRepo(db: Db, now?: () => Date): ScanRunsRepo`; `KEEP_DAYS = 14`.
  - `server/src/services/scan/heartbeat.ts`: `interface Heartbeat { beat(): Promise<void>; lastSeen(): Promise<Date | null> }`; `createHeartbeat(redis: Pick<Redis, 'set' | 'get'>, now?: () => Date): Heartbeat`; `WORKER_ALIVE_MS = 300_000`; `HEARTBEAT_EVERY_MS = 60_000`.
  - `server/src/services/scan/service.ts`: `createScanService({ runs, heartbeat, now? }): ScanService`; `ScanService` (in `server/src/api/deps.ts`) is `{ status(): Promise<ScanStatus> }` and `AppDeps.scan: ScanService`.
  - `GET /scan/status` (auth required) returns `ScanStatus`.
  - `server/src/worker/scrape.ts`: `ScrapeDeps` gains `loadCandidates(): Promise<MatchCandidate[]>`; `interface ScrapeResult { listed; newCount; fetched; inserted; rejected: { title: number; location: number } }`; `countRejections(jobs, candidates)`; `runScrape(d): Promise<ScrapeResult>`; `interface RecordedScrapeDeps extends ScrapeDeps { recordRun(run: ScanRunInput): Promise<void>; now(): Date }`; `runRecordedScrape(d: RecordedScrapeDeps): Promise<ScrapeResult>`.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `server/tests/worker/scrape.test.ts` with:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { JobStub, NormalisedJob } from '../../src/domain/jobs.js';
import type { Scraper } from '../../src/scrapers/types.js';
import type { ScanRunInput } from '../../src/services/scan/runs.js';
import type { MatchCandidate } from '../../src/worker/match.js';
import { countRejections, runRecordedScrape, runScrape, type RecordedScrapeDeps, type ScrapeDeps } from '../../src/worker/scrape.js';

const stub = (n: number): JobStub => ({
  title: `Role ${n}`, company: `Co ${n}`, location: 'Lagos', url: `https://x/${n}`, source: 'myjobmag',
});
const full = (s: JobStub): NormalisedJob => ({ ...s, description: 'd', companyDomain: null });
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** A user who wants "Role" jobs in Lagos: titles "Role 1", "Role 2" ... fit, other titles and other cities do not. */
const lagosUser: MatchCandidate = { user_id: 'u1', desired_roles: ['role'], location: 'Lagos' };

function makeDeps(over: Partial<ScrapeDeps> & { stubs?: JobStub[]; detail?: Scraper['detail'] } = {}) {
  const { stubs: givenStubs, detail, ...rest } = over;
  const stubs = givenStubs ?? [stub(1), stub(2), stub(3)];
  const scraper: Scraper = {
    source: 'myjobmag',
    detailDelayMs: [1000, 3000],
    list: vi.fn<Scraper['list']>().mockImplementation(async () => stubs),
    detail: detail ?? vi.fn(async (s: JobStub) => full(s)),
  };
  const deps: ScrapeDeps = {
    scraper,
    maxNew: 25,
    findSeenUrls: vi.fn<ScrapeDeps['findSeenUrls']>().mockImplementation(async () => new Set<string>()),
    insertJobs: vi.fn(async (jobs: NormalisedJob[]) => jobs.map((j) => `id-${j.url}`)),
    enqueueMatch: vi.fn<ScrapeDeps['enqueueMatch']>().mockImplementation(async () => undefined),
    loadCandidates: vi.fn<ScrapeDeps['loadCandidates']>().mockImplementation(async () => [lagosUser]),
    sleep: vi.fn<ScrapeDeps['sleep']>().mockImplementation(async () => undefined),
    log,
    ...rest,
  };
  return deps;
}

describe('runScrape', () => {
  it('fetches details only for unseen urls, inserts them and enqueues a match per new job', async () => {
    const deps = makeDeps({ findSeenUrls: vi.fn<ScrapeDeps['findSeenUrls']>().mockImplementation(async () => new Set(['https://x/2'])) });
    const result = await runScrape(deps);
    expect(deps.scraper.detail).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ listed: 3, newCount: 2, fetched: 2, inserted: 2 });
    expect(deps.enqueueMatch).toHaveBeenCalledWith('id-https://x/1');
    expect(deps.enqueueMatch).toHaveBeenCalledWith('id-https://x/3');
  });

  it('respects maxNew', async () => {
    const deps = makeDeps({ maxNew: 1 });
    expect(await runScrape(deps)).toMatchObject({ newCount: 1, fetched: 1 });
  });

  it('sleeps between detail calls but not before the first', async () => {
    const deps = makeDeps();
    await runScrape(deps);
    expect(deps.sleep).toHaveBeenCalledTimes(2);
    const [ms] = vi.mocked(deps.sleep).mock.calls[0] as [number];
    expect(ms).toBeGreaterThanOrEqual(1000);
    expect(ms).toBeLessThan(3000);
  });

  it('does not sleep when the scraper declares no delay', async () => {
    const deps = makeDeps();
    delete deps.scraper.detailDelayMs;
    await runScrape(deps);
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it('keeps going when one detail request fails', async () => {
    const detail = vi.fn(async (s: JobStub) => {
      if (s.url === 'https://x/2') throw new Error('boom');
      return full(s);
    });
    const deps = makeDeps({ detail });
    expect(await runScrape(deps)).toMatchObject({ listed: 3, newCount: 3, fetched: 2, inserted: 2 });
    expect(log.warn).toHaveBeenCalled();
  });

  it('collapses same company+title duplicates before inserting', async () => {
    const dup = { ...stub(1), url: 'https://x/9' };
    const deps = makeDeps({ stubs: [stub(1), dup] });
    await runScrape(deps);
    expect(vi.mocked(deps.insertJobs).mock.calls[0]![0]).toHaveLength(1);
  });

  it('does nothing when nothing is new', async () => {
    const deps = makeDeps({ findSeenUrls: vi.fn<ScrapeDeps['findSeenUrls']>().mockImplementation(async () => new Set(['https://x/1', 'https://x/2', 'https://x/3'])) });
    expect(await runScrape(deps)).toEqual({ listed: 3, newCount: 0, fetched: 0, inserted: 0, rejected: { title: 0, location: 0 } });
    expect(deps.enqueueMatch).not.toHaveBeenCalled();
  });

  it('keeps enqueueing matches when one enqueue fails', async () => {
    const enqueueMatch = vi.fn(async (id: string) => {
      if (id === 'id-https://x/1') throw new Error('redis down');
    });
    const deps = makeDeps({ stubs: [stub(1), stub(2)], enqueueMatch });
    await expect(runScrape(deps)).resolves.toMatchObject({ listed: 2, fetched: 2, inserted: 2 });
    expect(enqueueMatch).toHaveBeenCalledWith('id-https://x/2');
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'id-https://x/1' }), 'enqueue match failed');
  });

  it('counts new jobs the title and place checks turn away, by reason', async () => {
    const stubs: JobStub[] = [
      stub(1),
      { ...stub(2), title: 'Marketing Manager' },
      { ...stub(3), title: 'Sales Rep' },
      { ...stub(4), location: 'Abuja' },
    ];
    const deps = makeDeps({ stubs });
    expect(await runScrape(deps)).toMatchObject({ fetched: 4, rejected: { title: 2, location: 1 } });
  });

  it('still scrapes and inserts when the candidates cannot be loaded', async () => {
    const deps = makeDeps({ loadCandidates: vi.fn<ScrapeDeps['loadCandidates']>().mockImplementation(async () => { throw new Error('db down'); }) });
    expect(await runScrape(deps)).toMatchObject({ inserted: 3, rejected: { title: 0, location: 0 } });
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ source: 'myjobmag' }), 'could not count prefilter rejections');
  });
});

describe('countRejections', () => {
  const job = (title: string, location: string) => ({ title, location, source: 'myjobmag' as const });
  const abujaUser: MatchCandidate = { user_id: 'u2', desired_roles: ['nurse'], location: 'Abuja' };

  it('counts nothing when there are no candidates', () => {
    expect(countRejections([job('Anything', 'Lagos')], [])).toEqual({ title: 0, location: 0 });
  });

  it('does not count a job any one user would accept', () => {
    expect(countRejections([job('Nurse', 'Abuja'), job('Role 1', 'Lagos')], [lagosUser, abujaUser])).toEqual({ title: 0, location: 0 });
  });

  it('counts a job as location when its title fits somebody, and as title otherwise', () => {
    expect(countRejections([job('Role 1', 'Kano'), job('Welder', 'Lagos')], [lagosUser, abujaUser])).toEqual({ title: 1, location: 1 });
  });

  it('skips users without roles', () => {
    const noRoles: MatchCandidate = { user_id: 'u3', desired_roles: [], location: 'Lagos' };
    expect(countRejections([job('Welder', 'Lagos')], [noRoles])).toEqual({ title: 0, location: 0 });
  });
});

describe('runRecordedScrape', () => {
  function recorded(over: Partial<RecordedScrapeDeps> = {}) {
    const runs: ScanRunInput[] = [];
    const times = ['2026-10-20T10:00:00.000Z', '2026-10-20T10:00:09.000Z'];
    const deps: RecordedScrapeDeps = {
      ...makeDeps(),
      recordRun: vi.fn<RecordedScrapeDeps['recordRun']>().mockImplementation(async (run) => void runs.push(run)),
      now: vi.fn(() => new Date(times.shift() ?? '2026-10-20T10:00:09.000Z')),
      ...over,
    };
    return { deps, runs };
  }

  it('records an ok run with the counts and both times', async () => {
    const { deps, runs } = recorded();
    vi.mocked(deps.scraper.list).mockImplementation(async () => [stub(1), { ...stub(2), title: 'Welder' }]);
    await runRecordedScrape(deps);
    expect(runs).toEqual([
      {
        source: 'myjobmag', started_at: '2026-10-20T10:00:00.000Z', finished_at: '2026-10-20T10:00:09.000Z', status: 'ok', error: null,
        listed: 2, new_count: 2, inserted: 2, rejected_title: 1, rejected_location: 0,
      },
    ]);
  });

  it('records a failed run with the reason, then rethrows the error', async () => {
    const { deps, runs } = recorded();
    vi.mocked(deps.scraper.list).mockImplementation(async () => { throw new Error('HTTP 403 for https://www.myjobmag.com/jobs'); });
    await expect(runRecordedScrape(deps)).rejects.toThrow('HTTP 403');
    expect(runs).toEqual([
      {
        source: 'myjobmag', started_at: '2026-10-20T10:00:00.000Z', finished_at: '2026-10-20T10:00:09.000Z', status: 'failed',
        error: 'HTTP 403 for https://www.myjobmag.com/jobs', listed: 0, new_count: 0, inserted: 0, rejected_title: 0, rejected_location: 0,
      },
    ]);
  });

  it('does not fail the scan when the run cannot be recorded', async () => {
    const { deps } = recorded({ recordRun: vi.fn<RecordedScrapeDeps['recordRun']>().mockImplementation(async () => { throw new Error('db down'); }) });
    await expect(runRecordedScrape(deps)).resolves.toMatchObject({ inserted: 3 });
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ source: 'myjobmag' }), 'could not record the scan run');
  });
});
```

Create `server/tests/services/scan.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../../src/lib/supabase.js';
import { createHeartbeat, WORKER_ALIVE_MS } from '../../src/services/scan/heartbeat.js';
import { createScanRunsRepo, KEEP_DAYS, type ScanRunInput } from '../../src/services/scan/runs.js';
import { createScanService } from '../../src/services/scan/service.js';

type Result = { data?: unknown; error?: unknown };

/** A Supabase stand-in: records every chained call; each awaited query takes the next queued result. */
function fakeDb(results: Result[] = []) {
  const calls: unknown[][] = [];
  const chain: object = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') {
        const next = results.shift() ?? {};
        return (resolve: (v: unknown) => void) => resolve({ data: next.data ?? null, error: next.error ?? null });
      }
      return (...args: unknown[]) => {
        calls.push([String(prop), ...args]);
        return chain;
      };
    },
  });
  return { db: { from: (table: string) => (calls.push(['from', table]), chain) } as unknown as Db, calls };
}

const NOW = new Date('2026-10-20T12:00:00.000Z');
const run = (over: Partial<ScanRunInput> = {}): ScanRunInput => ({
  source: 'myjobmag', started_at: '2026-10-20T11:00:00.000Z', finished_at: '2026-10-20T11:02:00.000Z', status: 'ok', error: null,
  listed: 35, new_count: 6, inserted: 6, rejected_title: 3, rejected_location: 1, ...over,
});

describe('createScanRunsRepo', () => {
  it('inserts the run, then deletes rows older than the keep window', async () => {
    const { db, calls } = fakeDb();
    await createScanRunsRepo(db, () => NOW).record(run());
    const cutoff = new Date(NOW.getTime() - KEEP_DAYS * 86_400_000).toISOString();
    expect(calls).toEqual([
      ['from', 'scan_runs'],
      ['insert', run()],
      ['from', 'scan_runs'],
      ['delete'],
      ['lt', 'started_at', cutoff],
    ]);
  });

  it('shortens a long error to 200 characters', async () => {
    const { db, calls } = fakeDb();
    await createScanRunsRepo(db, () => NOW).record(run({ status: 'failed', error: 'x'.repeat(500) }));
    expect((calls[1]![1] as ScanRunInput).error).toHaveLength(200);
  });

  it('throws when the insert fails, without trying to delete', async () => {
    const { db, calls } = fakeDb([{ error: { message: 'down' } }]);
    await expect(createScanRunsRepo(db, () => NOW).record(run())).rejects.toEqual({ message: 'down' });
    expect(calls.some((c) => c[0] === 'delete')).toBe(false);
  });

  it('does not fail when only the clean-up fails', async () => {
    const { db } = fakeDb([{}, { error: { message: 'delete failed' } }]);
    await expect(createScanRunsRepo(db, () => NOW).record(run())).resolves.toBeUndefined();
  });

  it('lists the newest run of each source', async () => {
    const rows = [
      run({ source: 'remoteok', started_at: '2026-10-20T11:30:00.000Z' }),
      run({ source: 'myjobmag', started_at: '2026-10-20T11:00:00.000Z' }),
      run({ source: 'remoteok', started_at: '2026-10-20T09:30:00.000Z' }),
      run({ source: 'myjobmag', started_at: '2026-10-20T09:00:00.000Z', status: 'failed', error: 'HTTP 403' }),
    ];
    const { db, calls } = fakeDb([{ data: rows }]);
    const latest = await createScanRunsRepo(db).latestPerSource();
    expect(latest.map((r) => [r.source, r.started_at])).toEqual([
      ['remoteok', '2026-10-20T11:30:00.000Z'],
      ['myjobmag', '2026-10-20T11:00:00.000Z'],
    ]);
    expect(calls).toEqual([
      ['from', 'scan_runs'],
      ['select', 'source, started_at, finished_at, status, error, listed, new_count, inserted, rejected_title, rejected_location'],
      ['order', 'started_at', { ascending: false }],
      ['limit', 200],
    ]);
  });

  it('returns an empty list before any scan, and throws a database error', async () => {
    expect(await createScanRunsRepo(fakeDb([{ data: [] }]).db).latestPerSource()).toEqual([]);
    await expect(createScanRunsRepo(fakeDb([{ error: { message: 'down' } }]).db).latestPerSource()).rejects.toEqual({ message: 'down' });
  });
});

describe('createHeartbeat', () => {
  function fakeRedis() {
    const store = new Map<string, string>();
    return {
      store,
      set: vi.fn(async (key: string, value: string, ..._rest: unknown[]) => (store.set(key, value), 'OK' as const)),
      get: vi.fn(async (key: string) => store.get(key) ?? null),
    };
  }

  it('beat() stores the time with an expiry; lastSeen() reads it back', async () => {
    const redis = fakeRedis();
    const heartbeat = createHeartbeat(redis as never, () => NOW);
    await heartbeat.beat();
    expect(redis.set).toHaveBeenCalledWith('worker:heartbeat', NOW.toISOString(), 'EX', 600);
    expect(await heartbeat.lastSeen()).toEqual(NOW);
  });

  it('lastSeen() is null when nothing was stored or the value is not a date', async () => {
    const redis = fakeRedis();
    const heartbeat = createHeartbeat(redis as never);
    expect(await heartbeat.lastSeen()).toBeNull();
    redis.store.set('worker:heartbeat', 'garbage');
    expect(await heartbeat.lastSeen()).toBeNull();
  });
});

describe('createScanService', () => {
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
  const make = (seen: Date | null, runs = [run()]) =>
    createScanService({
      runs: { latestPerSource: vi.fn<() => Promise<typeof runs>>().mockImplementation(async () => runs) },
      heartbeat: { lastSeen: vi.fn<() => Promise<Date | null>>().mockImplementation(async () => seen) },
      now: () => NOW,
    });

  it('reports the worker alive when it was seen within 5 minutes, with the runs', async () => {
    expect(WORKER_ALIVE_MS).toBe(5 * 60_000);
    expect(await make(minutesAgo(1)).status()).toEqual({ worker_alive: true, worker_last_seen: minutesAgo(1).toISOString(), runs: [run()] });
    expect((await make(minutesAgo(5)).status()).worker_alive).toBe(true);
  });

  it('reports the worker not alive when it was last seen over 5 minutes ago or never', async () => {
    expect((await make(minutesAgo(6)).status()).worker_alive).toBe(false);
    expect(await make(null, []).status()).toEqual({ worker_alive: false, worker_last_seen: null, runs: [] });
  });
});
```

Create `server/tests/api/scan.test.ts`:

```ts
import type { ScanStatus } from '@joblume/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { makeDeps } from '../helpers/deps.js';

const status: ScanStatus = {
  worker_alive: true,
  worker_last_seen: '2026-10-20T11:59:00.000Z',
  runs: [
    {
      source: 'myjobmag', started_at: '2026-10-20T11:00:00.000Z', finished_at: '2026-10-20T11:02:00.000Z', status: 'ok', error: null,
      listed: 35, new_count: 6, inserted: 6, rejected_title: 3, rejected_location: 1,
    },
  ],
};

describe('GET /scan/status', () => {
  it('returns the scan status to a signed-in user', async () => {
    const d = makeDeps({ scan: { status: vi.fn<() => Promise<ScanStatus>>().mockImplementation(async () => status) } });
    const res = await request(createApp(d)).get('/scan/status').set('authorization', 'Bearer good');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(status);
    expect(d.scan.status).toHaveBeenCalledTimes(1);
  });

  it('refuses a request with no token or a bad token, without reading anything', async () => {
    const d = makeDeps();
    expect((await request(createApp(d)).get('/scan/status')).status).toBe(401);
    expect((await request(createApp(d)).get('/scan/status').set('authorization', 'Bearer bad')).status).toBe(401);
    expect(d.scan.status).not.toHaveBeenCalled();
  });

  it('is read-only: other methods are not routed', async () => {
    const d = makeDeps();
    const res = await request(createApp(d)).post('/scan/status').set('authorization', 'Bearer good').send({});
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx vitest run tests/worker/scrape.test.ts tests/services/scan.test.ts tests/api/scan.test.ts`
Expected: FAIL (`Cannot find module '../../src/services/scan/runs.js'`, and `countRejections` / `runRecordedScrape` are not exported).

- [ ] **Step 3: Write the implementation**

Create `server/src/services/scan/runs.ts`:

```ts
import type { ScanRun } from '@joblume/shared';
import type { Db } from '../../lib/supabase.js';

/** One finished scan of one source, as the worker records it. Counts are over the jobs found NEW in that scan. */
export interface ScanRunInput {
  source: string;
  started_at: string;
  finished_at: string;
  status: 'ok' | 'failed';
  error: string | null;
  listed: number;
  new_count: number;
  inserted: number;
  rejected_title: number;
  rejected_location: number;
}

export interface ScanRunsRepo {
  record(run: ScanRunInput): Promise<void>;
  /** The most recent run of each source, newest first. */
  latestPerSource(): Promise<ScanRun[]>;
}

const COLUMNS = 'source, started_at, finished_at, status, error, listed, new_count, inserted, rejected_title, rejected_location';
/** Old rows are deleted as new ones arrive, so the table stays small. */
export const KEEP_DAYS = 14;
/** Enough recent rows to contain every source at least once, even when one source runs far more often. */
const READ_LIMIT = 200;
const MAX_ERROR_LENGTH = 200;

/** scan_runs is server-write-only: this service-role repo is its only writer and reader. */
export function createScanRunsRepo(db: Db, now: () => Date = () => new Date()): ScanRunsRepo {
  return {
    async record(run) {
      const row = { ...run, error: run.error === null ? null : run.error.slice(0, MAX_ERROR_LENGTH) };
      const { error } = await db.from('scan_runs').insert(row);
      if (error) throw error;
      // Best effort: failing to tidy up must never turn a recorded scan into a failure.
      const cutoff = new Date(now().getTime() - KEEP_DAYS * 86_400_000).toISOString();
      await db.from('scan_runs').delete().lt('started_at', cutoff);
    },
    async latestPerSource() {
      const { data, error } = await db.from('scan_runs').select(COLUMNS).order('started_at', { ascending: false }).limit(READ_LIMIT);
      if (error) throw error;
      const seen = new Set<string>();
      const latest: ScanRun[] = [];
      for (const row of (data ?? []) as ScanRun[]) {
        if (seen.has(row.source)) continue;
        seen.add(row.source);
        latest.push(row);
      }
      return latest;
    },
  };
}
```

Create `server/src/services/scan/heartbeat.ts`:

```ts
import type { Redis } from 'ioredis';

const KEY = 'worker:heartbeat';
/** The key expires on its own, so a dead worker's time never lingers for long. */
const KEY_TTL_SECONDS = 600;

/** The worker reports in every minute; the API calls it alive when the last report is at most this old. */
export const WORKER_ALIVE_MS = 5 * 60_000;
export const HEARTBEAT_EVERY_MS = 60_000;

export interface Heartbeat {
  /** Called by the worker: remember that it is running now. */
  beat(): Promise<void>;
  /** Called by the API: when the worker last reported, or null if it never has (or the report expired). */
  lastSeen(): Promise<Date | null>;
}

/** Kept in Redis (not the database): one tiny key, no table, no migration. */
export function createHeartbeat(redis: Pick<Redis, 'set' | 'get'>, now: () => Date = () => new Date()): Heartbeat {
  return {
    async beat() {
      await redis.set(KEY, now().toISOString(), 'EX', KEY_TTL_SECONDS);
    },
    async lastSeen() {
      const value = await redis.get(KEY);
      if (!value) return null;
      const seen = new Date(value);
      return Number.isNaN(seen.getTime()) ? null : seen;
    },
  };
}
```

Create `server/src/services/scan/service.ts`:

```ts
import type { ScanService } from '../../api/deps.js';
import { WORKER_ALIVE_MS, type Heartbeat } from './heartbeat.js';
import type { ScanRunsRepo } from './runs.js';

export interface ScanServiceDeps {
  runs: Pick<ScanRunsRepo, 'latestPerSource'>;
  heartbeat: Pick<Heartbeat, 'lastSeen'>;
  now?: () => Date;
}

export function createScanService(d: ScanServiceDeps): ScanService {
  const now = d.now ?? (() => new Date());
  return {
    async status() {
      const [runs, seen] = await Promise.all([d.runs.latestPerSource(), d.heartbeat.lastSeen()]);
      return {
        worker_alive: seen !== null && now().getTime() - seen.getTime() <= WORKER_ALIVE_MS,
        worker_last_seen: seen ? seen.toISOString() : null,
        runs,
      };
    },
  };
}
```

Create `server/src/api/routes/scan.ts`:

```ts
import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

/** Mounted after requireAuth: any signed-in user may read the shared scan status. */
export function scanRoutes(d: Pick<AppDeps, 'scan'>) {
  const router = Router();

  router.get('/status', asyncHandler(async (_req, res) => {
    res.json(await d.scan.status());
  }));

  return router;
}
```

Replace the whole of `server/src/worker/scrape.ts` with:

```ts
import { dedupeJobs, type NormalisedJob } from '../domain/jobs.js';
import { prefilterJob } from '../domain/prefilter.js';
import type { Logger } from '../lib/logger.js';
import { randomBetween } from '../lib/http.js';
import type { Scraper } from '../scrapers/types.js';
import type { ScanRunInput } from '../services/scan/runs.js';
import type { MatchCandidate } from './match.js';

export interface ScrapeDeps {
  scraper: Scraper;
  maxNew: number;
  findSeenUrls(urls: string[]): Promise<Set<string>>;
  insertJobs(jobs: NormalisedJob[]): Promise<string[]>;
  enqueueMatch(jobId: string): Promise<void>;
  /** Profiles that could receive these jobs; used only to count how many new jobs the title and place checks turn away. */
  loadCandidates(): Promise<MatchCandidate[]>;
  sleep(ms: number): Promise<void>;
  log: Logger;
}

export interface ScrapeResult {
  /** Jobs the source listed. */
  listed: number;
  /** Listed jobs not stored before (capped at maxNew). */
  newCount: number;
  /** New jobs whose details were read. */
  fetched: number;
  /** Jobs actually added to the database. */
  inserted: number;
  /** New jobs that no user's roles fit on the title, or that fit on the title for somebody but not the place. */
  rejected: { title: number; location: number };
}

/**
 * How many of these jobs no candidate would accept, by reason. A job counts once: as "location" when its title fits
 * at least one user (only the place was wrong), otherwise as "title". With no candidates nothing is counted.
 */
export function countRejections(jobs: Array<Pick<NormalisedJob, 'title' | 'location' | 'source'>>, candidates: MatchCandidate[]): ScrapeResult['rejected'] {
  const rejected = { title: 0, location: 0 };
  if (candidates.length === 0) return rejected;
  for (const job of jobs) {
    const reasons = candidates.map((c) => prefilterJob(job, c));
    if (reasons.some((r) => r.ok)) continue;
    const failed = reasons.flatMap((r) => (r.ok || r.reason === 'no_roles' ? [] : [r.reason]));
    if (failed.includes('location')) rejected.location++;
    else if (failed.includes('title')) rejected.title++;
  }
  return rejected;
}

export async function runScrape(d: ScrapeDeps): Promise<ScrapeResult> {
  const stubs = await d.scraper.list();
  const seen = await d.findSeenUrls(stubs.map((s) => s.url));
  const fresh = stubs.filter((s) => !seen.has(s.url)).slice(0, d.maxNew);

  const jobs: NormalisedJob[] = [];
  for (const [i, stub] of fresh.entries()) {
    const delay = d.scraper.detailDelayMs;
    if (i > 0 && delay) await d.sleep(randomBetween(delay[0], delay[1]));
    try {
      jobs.push(await d.scraper.detail(stub));
    } catch (err) {
      d.log.warn({ err, url: stub.url, source: d.scraper.source }, 'detail fetch failed, skipping job');
    }
  }

  const unique = dedupeJobs(jobs);
  const ids = await d.insertJobs(unique);
  for (const id of ids) {
    try {
      await d.enqueueMatch(id);
    } catch (err) {
      d.log.warn({ err, jobId: id }, 'enqueue match failed');
    }
  }

  let rejected = { title: 0, location: 0 };
  try {
    rejected = countRejections(unique, await d.loadCandidates());
  } catch (err) {
    // The counts are only for the Last scan card: never fail a scan over them.
    d.log.warn({ err, source: d.scraper.source }, 'could not count prefilter rejections');
  }

  const result: ScrapeResult = { listed: stubs.length, newCount: fresh.length, fetched: jobs.length, inserted: ids.length, rejected };
  d.log.info({ source: d.scraper.source, ...result }, 'scrape finished');
  return result;
}

export interface RecordedScrapeDeps extends ScrapeDeps {
  recordRun(run: ScanRunInput): Promise<void>;
  now(): Date;
}

/** runScrape, then one scan_runs row: 'ok' with the counts, or 'failed' with a short reason (the error is still thrown). */
export async function runRecordedScrape(d: RecordedScrapeDeps): Promise<ScrapeResult> {
  const startedAt = d.now();
  const zero = { listed: 0, new_count: 0, inserted: 0, rejected_title: 0, rejected_location: 0 };
  const save = async (run: ScanRunInput) => {
    try {
      await d.recordRun(run);
    } catch (err) {
      d.log.warn({ err, source: d.scraper.source }, 'could not record the scan run');
    }
  };
  try {
    const result = await runScrape(d);
    await save({
      source: d.scraper.source, started_at: startedAt.toISOString(), finished_at: d.now().toISOString(), status: 'ok', error: null,
      listed: result.listed, new_count: result.newCount, inserted: result.inserted,
      rejected_title: result.rejected.title, rejected_location: result.rejected.location,
    });
    return result;
  } catch (err) {
    await save({
      source: d.scraper.source, started_at: startedAt.toISOString(), finished_at: d.now().toISOString(), status: 'failed',
      error: err instanceof Error ? err.message : 'Scan failed', ...zero,
    });
    throw err;
  }
}
```

In `server/src/api/deps.ts`:

1. Add `ScanStatus` to the `@joblume/shared` type import on the second line (`import type { AddJobLinkResult, Analytics, FollowUp, FollowUpWithJob, GmailReturnTarget, GmailStatus, JobFetch, JobLink, ScanStatus } from '@joblume/shared';`).
2. Insert above `export interface JobLinksService {`:

```ts
export interface ScanService {
  status(): Promise<ScanStatus>;
}

```

3. In `AppDeps`, add `scan: ScanService;` between `jobs: JobsService;` and `jobLinks: JobLinksService;`.

In `server/src/api/app.ts` add `import { scanRoutes } from './routes/scan.js';` after the `profileRoutes` import and `  app.use('/scan', scanRoutes(d));` after the `app.use('/jobs', jobRoutes(d));` line.

In `server/tests/helpers/deps.ts` add `    scan: { status: vi.fn() },` after the `jobs:` line.

In `server/src/api/index.ts` add these imports after the `createJobsService` import:

```ts
import { createHeartbeat } from '../services/scan/heartbeat.js';
import { createScanRunsRepo } from '../services/scan/runs.js';
import { createScanService } from '../services/scan/service.js';
```

and add this line after `jobs: createJobsService(queues),`:

```ts
  scan: createScanService({ runs: createScanRunsRepo(db), heartbeat: createHeartbeat(redis) }),
```

In `server/src/worker/index.ts` make these edits:

1. Replace `import { runScrape } from './scrape.js';` with `import { runRecordedScrape } from './scrape.js';`.
2. After the `import { createJobFetchesRepo } from '../services/jobs/fetches-repo.js';` line add:

```ts
import { createHeartbeat, HEARTBEAT_EVERY_MS } from '../services/scan/heartbeat.js';
import { createScanRunsRepo } from '../services/scan/runs.js';
```

3. After `const repos = createWorkerRepos(db);` add `  const scanRuns = createScanRunsRepo(db);`.
4. In the scrape worker, replace `return await runScrape({` with `return await runRecordedScrape({`, and insert these three lines directly above the `          sleep,` line of that same call (the `sleep,` that follows the `enqueueMatch` property):

```ts
          loadCandidates: repos.loadCandidates,
          recordRun: (run) => scanRuns.record(run),
          now: () => new Date(),
```

5. Directly above `const shutdown = async (signal: string) => {` insert, and add `clearInterval(heartbeatTimer);` as the second line inside `shutdown` (right after the `logger.info({ signal }, 'shutting down');` line):

```ts
  // Tell the API this worker is alive: once now, then every minute (a missed beat is only logged).
  const heartbeat = createHeartbeat(createRedis(env.UPSTASH_REDIS_URL));
  const beat = () => heartbeat.beat().catch((err) => logger.warn({ err }, 'worker heartbeat failed'));
  void beat();
  const heartbeatTimer = setInterval(() => void beat(), HEARTBEAT_EVERY_MS);

```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx tsc -p tsconfig.json && npx vitest run`
Expected: no type errors; all server test files pass (`Test Files  80 passed`).

- [ ] **Step 5: Commit**

```bash
git add server/src server/tests
git commit -m "feat(server): record every scan, count pre-filter rejections, report the worker heartbeat" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Scan interval, three listing pages and raised caps

**Files:**
- Modify: `server/src/lib/env.ts`, `server/src/scrapers/index.ts` (replace whole file), `server/src/scrapers/myjobmag.ts`, `server/src/scrapers/jobberman.ts`, `server/src/worker/index.ts`
- Create: `server/src/scrapers/pages.ts`
- Create: `server/tests/lib/env-scrape.test.ts`, `server/tests/scrapers/pages.test.ts`
- Modify (replace whole file): `server/tests/scrapers/registry.test.ts`

**Interfaces:**
- Consumes: `FetchText`, `randomBetween`, `sleep` from `server/src/lib/http.ts`; `JobStub`.
- Produces:
  - `env.SCRAPE_EVERY_MINUTES: number` (integer, at least 30, default 120).
  - `server/src/scrapers/pages.ts`: `defaultPagePause(): Promise<void>`; `listPages({ fetchText, pageUrl, parse, pages, pause? }): Promise<JobStub[]>`.
  - `scrapeIntervalMs(source: ScrapeSource, boardMinutes: number): number` replaces `SCRAPE_EVERY_MS` in `server/src/scrapers/index.ts`.
  - `createMyJobMagScraper(fetchText, opts?: { pages?: number; pause?: () => Promise<void> })` and `createJobbermanScraper(...)` with the same options; `MYJOBMAG_PAGES = 3`, `JOBBERMAN_PAGES = 3`.
  - `SCRAPE_LIMITS.myjobmag = 60`, `SCRAPE_LIMITS.jobberman = 60`.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/lib/env-scrape.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/lib/env.js';

const valid = {
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  GEMINI_API_KEY: 'g',
  GEMINI_MODEL: 'gemini-2.5-flash',
  UPSTASH_REDIS_URL: 'rediss://default:pw@host.upstash.io:6379',
  ENCRYPTION_KEY: 'a'.repeat(64),
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('loadEnv: SCRAPE_EVERY_MINUTES', () => {
  it('defaults to every 120 minutes', () => {
    expect(loadEnv(valid).SCRAPE_EVERY_MINUTES).toBe(120);
  });

  it('reads a custom interval and treats blank as unset', () => {
    expect(loadEnv({ ...valid, SCRAPE_EVERY_MINUTES: '45' }).SCRAPE_EVERY_MINUTES).toBe(45);
    expect(loadEnv({ ...valid, SCRAPE_EVERY_MINUTES: '30' }).SCRAPE_EVERY_MINUTES).toBe(30);
    expect(loadEnv({ ...valid, SCRAPE_EVERY_MINUTES: '' }).SCRAPE_EVERY_MINUTES).toBe(120);
  });

  it('refuses an interval under 30 minutes, a fraction, or text', () => {
    for (const bad of ['29', '5', '0', '-60', '60.5', 'often']) {
      expect(() => loadEnv({ ...valid, SCRAPE_EVERY_MINUTES: bad })).toThrowError(/SCRAPE_EVERY_MINUTES/);
    }
  });
});
```

Create `server/tests/scrapers/pages.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { JobStub } from '../../src/domain/jobs.js';
import { createJobbermanScraper, JOBBERMAN_PAGES } from '../../src/scrapers/jobberman.js';
import { createMyJobMagScraper, MYJOBMAG_PAGES } from '../../src/scrapers/myjobmag.js';
import { listPages } from '../../src/scrapers/pages.js';

const stub = (n: number): JobStub => ({ title: `Role ${n}`, company: 'Co', location: '', url: `https://x/${n}`, source: 'myjobmag' });
const pageOf = (...ns: number[]) => ns.map(String).join(',');
const parse = (html: string): JobStub[] => (html === '' ? [] : html.split(',').map((n) => stub(Number(n))));

function run(pages: Record<number, string | Error>, count = 3) {
  const fetchText = vi.fn(async (url: string) => {
    const page = Number(new URL(url).searchParams.get('page') ?? 1);
    const body = pages[page];
    if (body instanceof Error) throw body;
    return body ?? '';
  });
  const pause = vi.fn<() => Promise<void>>().mockImplementation(async () => undefined);
  const promise = listPages({ fetchText, pageUrl: (p) => `https://example.com/jobs?page=${p}`, parse, pages: count, pause });
  return { fetchText, pause, promise };
}

describe('listPages', () => {
  it('reads each page in turn, joins the jobs and waits between pages', async () => {
    const { fetchText, pause, promise } = run({ 1: pageOf(1, 2), 2: pageOf(3), 3: pageOf(4, 5) });
    expect((await promise).map((s) => s.url)).toEqual(['https://x/1', 'https://x/2', 'https://x/3', 'https://x/4', 'https://x/5']);
    expect(fetchText.mock.calls.map((c) => c[0])).toEqual([
      'https://example.com/jobs?page=1', 'https://example.com/jobs?page=2', 'https://example.com/jobs?page=3',
    ]);
    expect(pause).toHaveBeenCalledTimes(2);
  });

  it('keeps a job that appears on two pages once', async () => {
    const { promise } = run({ 1: pageOf(1, 2), 2: pageOf(2, 3), 3: pageOf(3) });
    expect((await promise).map((s) => s.url)).toEqual(['https://x/1', 'https://x/2', 'https://x/3']);
  });

  it('throws when page 1 fails, because nothing was read', async () => {
    const { promise } = run({ 1: new Error('HTTP 403') });
    await expect(promise).rejects.toThrow('HTTP 403');
  });

  it('keeps earlier pages and stops when a later page fails', async () => {
    const { fetchText, promise } = run({ 1: pageOf(1, 2), 2: new Error('timeout'), 3: pageOf(9) });
    expect((await promise).map((s) => s.url)).toEqual(['https://x/1', 'https://x/2']);
    expect(fetchText).toHaveBeenCalledTimes(2);
  });

  it('stops at the first empty page (past the last page)', async () => {
    const { fetchText, promise } = run({ 1: pageOf(1), 2: '', 3: pageOf(9) });
    expect((await promise).map((s) => s.url)).toEqual(['https://x/1']);
    expect(fetchText).toHaveBeenCalledTimes(2);
  });

  it('page 1 empty is an empty list, not an error', async () => {
    const { promise } = run({ 1: '' });
    expect(await promise).toEqual([]);
  });
});

const myJobMagCard = (n: number) =>
  `<li class="job-list-li"><ul><li class="mag-b"><h2><a href="/job/role-${n}-acme">Role ${n} at Acme</a></h2></li></ul></li>`;
const jobbermanCard = (n: number) =>
  `<div data-cy="listing-cards-components"><div><a href="https://www.jobberman.com/listings/role-${n}" data-cy="listing-title-link" title="Role ${n}"></a></div><p>Acme</p></div>`;

describe('MyJobMag pages', () => {
  it('reads /jobs, /jobs/page/2 and /jobs/page/3', async () => {
    expect(MYJOBMAG_PAGES).toBe(3);
    const fetchText = vi.fn(async (url: string) => myJobMagCard(url.endsWith('/page/2') ? 2 : url.endsWith('/page/3') ? 3 : 1));
    const stubs = await createMyJobMagScraper(fetchText, { pause: async () => undefined }).list();
    expect(fetchText.mock.calls.map((c) => c[0])).toEqual([
      'https://www.myjobmag.com/jobs', 'https://www.myjobmag.com/jobs/page/2', 'https://www.myjobmag.com/jobs/page/3',
    ]);
    expect(stubs.map((s) => s.url)).toEqual([
      'https://www.myjobmag.com/job/role-1-acme', 'https://www.myjobmag.com/job/role-2-acme', 'https://www.myjobmag.com/job/role-3-acme',
    ]);
  });

  it('can be told to read fewer pages', async () => {
    const fetchText = vi.fn(async () => myJobMagCard(1));
    await createMyJobMagScraper(fetchText, { pages: 1 }).list();
    expect(fetchText).toHaveBeenCalledTimes(1);
  });
});

describe('Jobberman pages', () => {
  it('reads /jobs, /jobs?page=2 and /jobs?page=3', async () => {
    expect(JOBBERMAN_PAGES).toBe(3);
    const fetchText = vi.fn(async (url: string) => jobbermanCard(url.endsWith('page=2') ? 2 : url.endsWith('page=3') ? 3 : 1));
    const stubs = await createJobbermanScraper(fetchText, { pause: async () => undefined }).list();
    expect(fetchText.mock.calls.map((c) => c[0])).toEqual([
      'https://www.jobberman.com/jobs', 'https://www.jobberman.com/jobs?page=2', 'https://www.jobberman.com/jobs?page=3',
    ]);
    expect(stubs.map((s) => s.url)).toEqual([
      'https://www.jobberman.com/listings/role-1', 'https://www.jobberman.com/listings/role-2', 'https://www.jobberman.com/listings/role-3',
    ]);
  });
});
```

Replace the whole of `server/tests/scrapers/registry.test.ts` with:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createScrapers, SCRAPE_LIMITS, SCRAPE_SOURCES, scrapeIntervalMs } from '../../src/scrapers/index.js';
import type { Scraper } from '../../src/scrapers/types.js';

describe('scraper registry', () => {
  it('lists the sources in the order the scheduler starts them', () => {
    expect(SCRAPE_SOURCES).toEqual(['remotive', 'myjobmag', 'jobberman', 'jsearch']);
  });

  it('caps MyJobMag and Jobberman at 60 new jobs a run, and keeps the other limits', () => {
    expect(SCRAPE_LIMITS.myjobmag).toBe(60);
    expect(SCRAPE_LIMITS.jobberman).toBe(60);
    expect(SCRAPE_LIMITS.remotive).toBe(100);
    expect(SCRAPE_LIMITS.jsearch).toBe(50);
  });

  it('runs job boards at the configured interval, JSearch daily and Remotive 4 times a day', () => {
    expect(scrapeIntervalMs('myjobmag', 120)).toBe(2 * 60 * 60 * 1000);
    expect(scrapeIntervalMs('jobberman', 30)).toBe(30 * 60 * 1000);
    expect(scrapeIntervalMs('jsearch', 120)).toBe(24 * 60 * 60 * 1000);
    expect(scrapeIntervalMs('remotive', 30)).toBe(6 * 60 * 60 * 1000);
  });

  it('uses the JSearch scraper it is given', () => {
    const jsearch: Scraper = { source: 'jsearch', list: vi.fn(), detail: vi.fn() };
    expect(createScrapers(vi.fn(), { jsearch }).jsearch).toBe(jsearch);
  });

  it('falls back to an inert JSearch scraper that lists nothing', async () => {
    expect(await createScrapers(vi.fn()).jsearch.list()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx vitest run tests/lib/env-scrape.test.ts tests/scrapers/pages.test.ts tests/scrapers/registry.test.ts`
Expected: FAIL (`SCRAPE_EVERY_MINUTES` is undefined; `Cannot find module '../../src/scrapers/pages.js'`; `scrapeIntervalMs` is not exported).

- [ ] **Step 3: Write the implementation**

In `server/src/lib/env.ts` add after the `JSEARCH_MONTHLY_LIMIT` line:

```ts
  /** How often the job boards are scanned. At least 30, so the boards are never hit more than twice an hour. */
  SCRAPE_EVERY_MINUTES: z.preprocess(blankToUndefined, z.coerce.number().int().min(30).default(120)),
```

Create `server/src/scrapers/pages.ts`:

```ts
import type { JobStub } from '../domain/jobs.js';
import { randomBetween, sleep, type FetchText } from '../lib/http.js';

/** A short random wait between two listing pages of the same site, so the requests are not a burst. */
export const defaultPagePause = (): Promise<void> => sleep(randomBetween(1000, 3000));

/**
 * Reads listing pages 1..pages one after another and joins the jobs (a job seen twice is kept once).
 * Page 1 failing is an error, because then nothing was read. A later page failing or coming back empty
 * (past the last page) just stops: the earlier pages are still worth having.
 */
export async function listPages(opts: {
  fetchText: FetchText;
  pageUrl(page: number): string;
  parse(html: string): JobStub[];
  pages: number;
  pause?: () => Promise<void>;
}): Promise<JobStub[]> {
  const pause = opts.pause ?? defaultPagePause;
  const seen = new Set<string>();
  const out: JobStub[] = [];
  for (let page = 1; page <= opts.pages; page++) {
    if (page > 1) await pause();
    let stubs: JobStub[];
    try {
      stubs = opts.parse(await opts.fetchText(opts.pageUrl(page)));
    } catch (err) {
      if (page === 1) throw err;
      break;
    }
    if (stubs.length === 0) break;
    for (const stub of stubs) {
      if (seen.has(stub.url)) continue;
      seen.add(stub.url);
      out.push(stub);
    }
  }
  return out;
}
```

Replace the whole of `server/src/scrapers/index.ts` with:

```ts
import type { FetchText } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { createJobbermanScraper } from './jobberman.js';
import { createJSearchScraper } from './jsearch.js';
import { createMyJobMagScraper } from './myjobmag.js';
import { createRemotiveScraper } from './remotive.js';
import type { Scraper } from './types.js';

export const SCRAPE_SOURCES = ['remotive', 'myjobmag', 'jobberman', 'jsearch'] as const;
export type ScrapeSource = (typeof SCRAPE_SOURCES)[number];

/** Max NEW jobs processed per run, to keep detail requests polite. */
export const SCRAPE_LIMITS: Record<ScrapeSource, number> = {
  remotive: 100,
  myjobmag: 60,
  jobberman: 60,
  jsearch: 50,
};

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How often the scheduler runs a source. Job boards use SCRAPE_EVERY_MINUTES. Two sources keep their own pace:
 * JSearch is daily to stay inside its small monthly quota, and Remotive asks callers to fetch at most 4 times a day.
 */
export function scrapeIntervalMs(source: ScrapeSource, boardMinutes: number): number {
  if (source === 'jsearch') return ONE_DAY_MS;
  if (source === 'remotive') return SIX_HOURS_MS;
  return boardMinutes * 60_000;
}

const inertJSearch = () =>
  createJSearchScraper({
    client: null,
    quota: { consume: async () => false, refund: async () => undefined },
    loadProfiles: async () => [],
    log: logger,
  });

export function createScrapers(fetchText: FetchText, extra: { jsearch?: Scraper } = {}): Record<ScrapeSource, Scraper> {
  return {
    remotive: createRemotiveScraper(fetchText),
    myjobmag: createMyJobMagScraper(fetchText),
    jobberman: createJobbermanScraper(fetchText),
    jsearch: extra.jsearch ?? inertJSearch(),
  };
}
```

In `server/src/scrapers/myjobmag.ts`:

1. Add `import { listPages } from './pages.js';` before the `import type { Scraper } from './types.js';` line.
2. Replace the line `export function createMyJobMagScraper(fetchText: FetchText): Scraper {` with:

```ts
/** Listing pages read per scan: /jobs, then /jobs/page/2 and /jobs/page/3 (35 jobs each). */
export const MYJOBMAG_PAGES = 3;
const pageUrl = (page: number) => (page === 1 ? LIST_URL : `${LIST_URL}/page/${page}`);

export function createMyJobMagScraper(fetchText: FetchText, opts: { pages?: number; pause?: () => Promise<void> } = {}): Scraper {
```

3. Replace `      return parseMyJobMagList(await fetchText(LIST_URL));` with:

```ts
      return listPages({ fetchText, pageUrl, parse: parseMyJobMagList, pages: opts.pages ?? MYJOBMAG_PAGES, pause: opts.pause });
```

In `server/src/scrapers/jobberman.ts`:

1. Add `import { listPages } from './pages.js';` before the `import type { Scraper } from './types.js';` line.
2. Replace the line `export function createJobbermanScraper(fetchText: FetchText): Scraper {` with:

```ts
/** Listing pages read per scan: /jobs, then /jobs?page=2 and /jobs?page=3 (16 jobs each). */
export const JOBBERMAN_PAGES = 3;
const pageUrl = (page: number) => (page === 1 ? LIST_URL : `${LIST_URL}?page=${page}`);

export function createJobbermanScraper(fetchText: FetchText, opts: { pages?: number; pause?: () => Promise<void> } = {}): Scraper {
```

3. Replace `      return parseJobbermanList(await fetchText(LIST_URL));` with:

```ts
      return listPages({ fetchText, pageUrl, parse: parseJobbermanList, pages: opts.pages ?? JOBBERMAN_PAGES, pause: opts.pause });
```

In `server/src/worker/index.ts`:

1. Replace the import line `import { SCRAPE_EVERY_MS, SCRAPE_LIMITS, SCRAPE_SOURCES, createScrapers } from '../scrapers/index.js';` with `import { SCRAPE_LIMITS, SCRAPE_SOURCES, createScrapers, scrapeIntervalMs } from '../scrapers/index.js';`.
2. Replace `{ every: SCRAPE_EVERY_MS[source] }` with `{ every: scrapeIntervalMs(source, env.SCRAPE_EVERY_MINUTES) }`.
3. Replace the `logger.info({ sources: SCRAPE_SOURCES, jsearch: jsearchClient !== null }, 'worker started; job boards every 6 hours, JSearch daily');` line with:

```ts
  logger.info(
    { sources: SCRAPE_SOURCES, jsearch: jsearchClient !== null, boardMinutes: env.SCRAPE_EVERY_MINUTES },
    'worker started; job boards every SCRAPE_EVERY_MINUTES (Remotive every 6 hours), JSearch daily',
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx tsc -p tsconfig.json && npx vitest run`
Expected: no type errors; all server test files pass (`Test Files  82 passed`).

- [ ] **Step 5: Commit**

```bash
git add server/src server/tests
git commit -m "feat(server): scan boards every SCRAPE_EVERY_MINUTES, read three listing pages, cap 60 new jobs" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 6: RemoteOK and Arbeitnow feeds

**Files:**
- Create: `server/src/scrapers/remoteok.ts`, `server/src/scrapers/arbeitnow.ts`
- Create: `server/tests/fixtures/remoteok.json`, `server/tests/fixtures/arbeitnow.json`
- Create: `server/tests/scrapers/remoteok.test.ts`, `server/tests/scrapers/arbeitnow.test.ts`
- Modify: `server/src/lib/http.ts`, `server/src/scrapers/index.ts`, `server/tests/scrapers/registry.test.ts`

**Interfaces:**
- Consumes: `normaliseJob`, `parsePostedAt`, `JobStub` (Task 3); `htmlToText`; `FetchText`; `Scraper`; `ScrapeSource` registry (Task 5).
- Produces:
  - `FetchText` in `server/src/lib/http.ts` becomes `(url: string, opts?: { timeoutMs?: number }) => Promise<string>` (the real `fetchText` already accepts it).
  - `parseRemoteOk(json: string): JobStub[]`, `createRemoteOkScraper(fetchText): Scraper` (source `'remoteok'`).
  - `parseArbeitnow(json: string): JobStub[]`, `createArbeitnowScraper(fetchText): Scraper` (source `'arbeitnow'`).
  - `SCRAPE_SOURCES` gains `'remoteok'` and `'arbeitnow'` (before `'jsearch'`), each with limit 60 and the board interval.
  - Both scrapers' `detail()` makes no request (the list already holds the description) and runs `normaliseJob`; it throws `unusable RemoteOK job: <url>` / `unusable Arbeitnow job: <url>` when the job fails validation (the scan skips that job).

- [ ] **Step 1: Write the failing tests and fixtures**

Create `server/tests/fixtures/remoteok.json` (a trimmed real response: the terms notice, then three jobs; the descriptions are cut short and non-ASCII characters replaced with ASCII):

```json
[
  {
    "last_updated": 1792483205,
    "legal": "API Terms of Service: Please link back (with follow, and without nofollow!) to the URL on Remote OK and mention Remote OK as a source, so we get traffic back from your site. If you do not we'll have to suspend API access.\n\nPlease don't use the Remote OK logo without written permission as it's a registered trademark, please DO use our name Remote OK though."
  },
  {
    "slug": "remote-senior-software-engineer-sothebys-1137545",
    "id": "1137545",
    "epoch": 1792350002,
    "date": "2026-10-18T19:00:02+00:00",
    "company": "Sothebys",
    "company_logo": "",
    "position": "Senior Software Engineer",
    "tags": [
      "golang",
      "dev",
      "senior",
      "sales",
      "engineer"
    ],
    "description": "Remote - Established in 1744, Sothebys promotes access and ownership of exceptional art and luxury objects through auctions, private sales and",
    "location": "",
    "apply_url": "https://remoteOK.com/remote-jobs/remote-senior-software-engineer-sothebys-1137545",
    "salary_min": 0,
    "salary_max": 0,
    "logo": "",
    "url": "https://remoteOK.com/remote-jobs/remote-senior-software-engineer-sothebys-1137545"
  },
  {
    "slug": "remote-senior-backend-engineer-rain-1137544",
    "id": "1137544",
    "epoch": 1792346401,
    "date": "2026-10-18T18:00:01+00:00",
    "company": "Rain",
    "company_logo": "",
    "position": "Senior Backend Engineer",
    "tags": [
      "golang",
      "finance",
      "mobile",
      "senior",
      "medical"
    ],
    "description": "Remote - Rain is the world's first AI Financial Health Platform, serving 3.5 million employees at leading organizations like McDonald's, Marriott,",
    "location": "",
    "apply_url": "https://remoteOK.com/remote-jobs/remote-senior-backend-engineer-rain-1137544",
    "salary_min": 0,
    "salary_max": 0,
    "logo": "",
    "url": "https://remoteOK.com/remote-jobs/remote-senior-backend-engineer-rain-1137544"
  },
  {
    "slug": "remote-key-account-manager-danish-market-native-speaker-copenhagen-packmatic-gmbh-1137541",
    "id": "1137541",
    "epoch": 1792224042,
    "date": "2026-10-17T08:00:42+00:00",
    "company": "Packmatic GmbH",
    "company_logo": "",
    "position": "Key Account Manager Danish Market Native Speaker Copenhagen",
    "tags": [
      "exec",
      "saas",
      "technical",
      "marketing",
      "travel"
    ],
    "description": "Packmatic is the leading digital platform for packaging procurement. We connect companies with a Europe-wide network of packaging suppliers - fast,",
    "location": "Copenhagen",
    "apply_url": "https://remoteOK.com/remote-jobs/remote-key-account-manager-danish-market-native-speaker-copenhagen-packmatic-gmbh-1137541",
    "salary_min": 0,
    "salary_max": 0,
    "logo": "",
    "url": "https://remoteOK.com/remote-jobs/remote-key-account-manager-danish-market-native-speaker-copenhagen-packmatic-gmbh-1137541"
  }
]
```

Create `server/tests/fixtures/arbeitnow.json` (a trimmed real response: one on-site job and two remote jobs):

```json
{
  "data": [
    {
      "slug": "projektmanagerin-social-creator-marketing-intermediate-dortmund-383496",
      "company_name": "likeyaa GmbH",
      "title": "Projektmanager:in Social & Creator Marketing (Intermediate) (w/m/d)",
      "description": "Social Media ist voll von Content. Aber nur ein Teil davon bewegt wirklich etwas. Genau daran arbeiten wir jeden Tag. Mit Strategien, Creator:innen",
      "remote": false,
      "url": "https://www.arbeitnow.com/jobs/companies/likeyaa-gmbh/projektmanagerin-social-creator-marketing-intermediate-dortmund-383496",
      "tags": [
        "Marketing and Communication"
      ],
      "job_types": [
        "Unbefristeter arbeitsvertrag",
        "berufserfahren"
      ],
      "location": "Dortmund",
      "created_at": 1792522843
    },
    {
      "slug": "remote-full-stack-engineer-elevenmusic-401054",
      "company_name": "ElevenLabs",
      "title": "Full-Stack Engineer - ElevenMusic",
      "description": "About ElevenLabs ElevenLabs is an AI research and product company transforming how we interact with technology. We launched in January 2023 with the",
      "remote": true,
      "url": "https://www.arbeitnow.com/jobs/companies/elevenlabs/remote-full-stack-engineer-elevenmusic-401054",
      "tags": [
        "Engineering & Product"
      ],
      "job_types": [
        "Full Time"
      ],
      "location": "Remote",
      "created_at": 1792518041
    },
    {
      "slug": "remote-mobile-engineer-elevenmusic-390337",
      "company_name": "ElevenLabs",
      "title": "Mobile Engineer - ElevenMusic",
      "description": "About ElevenLabs ElevenLabs is an AI research and product company transforming how we interact with technology. We launched in January 2023 with the",
      "remote": true,
      "url": "https://www.arbeitnow.com/jobs/companies/elevenlabs/remote-mobile-engineer-elevenmusic-390337",
      "tags": [
        "Engineering & Product"
      ],
      "job_types": [
        "Full Time"
      ],
      "location": "Remote",
      "created_at": 1792518041
    }
  ],
  "links": {
    "first": "https://www.arbeitnow.com/api/job-board-api?page=1",
    "last": null,
    "prev": null,
    "next": "https://www.arbeitnow.com/api/job-board-api?page=2"
  },
  "meta": {
    "current_page": 1,
    "per_page": 300,
    "terms": "This is a free public API for jobs, please do not abuse. I would appreciate linking back to the site. By using the API, you agree to the terms of service present on Arbeitnow.com",
    "info": "Jobs are updated every hour and order by the `created_at` timestamp. Use `?page=` to paginate. Read more information here: https://www.arbeitnow.com/blog/job-board-api"
  }
}
```

Create `server/tests/scrapers/remoteok.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createRemoteOkScraper, parseRemoteOk } from '../../src/scrapers/remoteok.js';

const fixture = readFileSync(new URL('../fixtures/remoteok.json', import.meta.url), 'utf8');

describe('parseRemoteOk', () => {
  it('maps the live API shape to stubs and skips the terms notice at the start', () => {
    const stubs = parseRemoteOk(fixture);
    expect(stubs).toHaveLength(3);
    expect(stubs[0]).toEqual({
      title: 'Senior Software Engineer',
      company: 'Sothebys',
      location: 'Remote',
      url: 'https://remoteOK.com/remote-jobs/remote-senior-software-engineer-sothebys-1137545',
      source: 'remoteok',
      description: expect.stringContaining('Established in 1744'),
      postedAt: '2026-10-18T19:00:02.000Z',
    });
  });

  it('keeps a named place as the location, and falls back to "Remote" when it is empty', () => {
    const [first, , third] = parseRemoteOk(fixture);
    expect(first!.location).toBe('Remote');
    expect(third!.location).toBe('Copenhagen');
  });

  it('keeps RemoteOK\'s own job page as the link (the terms ask for a link back)', () => {
    for (const stub of parseRemoteOk(fixture)) expect(stub.url).toMatch(/^https:\/\/remoteOK\.com\/remote-jobs\//);
  });

  it('strips the "mention the word" instruction RemoteOK adds to descriptions', () => {
    const json = JSON.stringify([
      { legal: 'terms' },
      {
        url: 'https://remoteOK.com/remote-jobs/x-1', position: 'Backend Engineer', company: 'Acme', epoch: 1792350002,
        description: '<p>Build APIs.</p><br/><br/>Please mention the word **MERITORIOUS** and tag RMTAyLjkxLjEwNC43OQ== when applying to show you read the job post completely (#RMTAyLjkxLjEwNC43OQ==). This is a beta feature to avoid spam applicants.',
      },
    ]);
    const [stub] = parseRemoteOk(json);
    expect(stub!.description).toBe('Build APIs.');
  });

  it('skips entries missing a title, company or link, and tolerates a non-array body', () => {
    const json = JSON.stringify([{ legal: 'x' }, { position: 'T', company: 'C' }, { url: 'u', company: 'C' }, { url: 'u', position: 'T' }]);
    expect(parseRemoteOk(json)).toEqual([]);
    expect(parseRemoteOk('{"error":"nope"}')).toEqual([]);
  });
});

describe('createRemoteOkScraper', () => {
  it('lists the feed with a long timeout, and builds the detail without another request', async () => {
    const fetchText = vi.fn().mockResolvedValue(fixture);
    const scraper = createRemoteOkScraper(fetchText);
    const [stub] = await scraper.list();
    expect(fetchText).toHaveBeenCalledWith('https://remoteok.com/api', { timeoutMs: 60_000 });
    const job = await scraper.detail(stub!);
    expect(job).toMatchObject({ source: 'remoteok', url: stub!.url, companyDomain: null, postedAt: '2026-10-18T19:00:02.000Z' });
    expect(job.description.length).toBeGreaterThan(20);
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(scraper.detailDelayMs).toBeUndefined();
  });

  it('detail() refuses a job with no description', async () => {
    const scraper = createRemoteOkScraper(vi.fn());
    await expect(
      scraper.detail({ title: 'T', company: 'C', location: 'Remote', url: 'https://remoteOK.com/remote-jobs/x', source: 'remoteok', description: '' }),
    ).rejects.toThrow('unusable RemoteOK job');
  });
});
```

Create `server/tests/scrapers/arbeitnow.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createArbeitnowScraper, parseArbeitnow } from '../../src/scrapers/arbeitnow.js';

const fixture = readFileSync(new URL('../fixtures/arbeitnow.json', import.meta.url), 'utf8');

describe('parseArbeitnow', () => {
  it('keeps only the remote jobs of the live API shape (the first fixture job is on-site in Dortmund)', () => {
    const stubs = parseArbeitnow(fixture);
    expect(stubs).toHaveLength(2);
    expect(stubs[0]).toEqual({
      title: 'Full-Stack Engineer - ElevenMusic',
      company: 'ElevenLabs',
      location: 'Remote',
      url: 'https://www.arbeitnow.com/jobs/companies/elevenlabs/remote-full-stack-engineer-elevenmusic-401054',
      source: 'arbeitnow',
      description: expect.stringContaining('About ElevenLabs'),
      postedAt: '2026-10-20T17:40:41.000Z',
    });
  });

  it('makes the location say remote and keeps the place', () => {
    const job = (location: string) =>
      JSON.stringify({ data: [{ url: 'https://www.arbeitnow.com/jobs/x', title: 'Dev', company_name: 'Acme', description: '<p>d</p>', remote: true, location, created_at: 1792518041 }] });
    expect(parseArbeitnow(job('Berlin'))[0]!.location).toBe('Remote, Berlin');
    expect(parseArbeitnow(job('Remote'))[0]!.location).toBe('Remote');
    expect(parseArbeitnow(job('Remote (Germany)'))[0]!.location).toBe('Remote (Germany)');
    expect(parseArbeitnow(job(''))[0]!.location).toBe('Remote');
  });

  it('skips entries missing a link, title or company, and tolerates a body with no data', () => {
    const json = JSON.stringify({ data: [{ remote: true, title: 'T', company_name: 'C' }, { remote: true, url: 'u', company_name: 'C' }, { remote: true, url: 'u', title: 'T' }] });
    expect(parseArbeitnow(json)).toEqual([]);
    expect(parseArbeitnow('{}')).toEqual([]);
  });
});

describe('createArbeitnowScraper', () => {
  it('lists the first page of the feed and builds the detail without another request', async () => {
    const fetchText = vi.fn().mockResolvedValue(fixture);
    const scraper = createArbeitnowScraper(fetchText);
    const [stub] = await scraper.list();
    expect(fetchText).toHaveBeenCalledWith('https://www.arbeitnow.com/api/job-board-api', { timeoutMs: 60_000 });
    const job = await scraper.detail(stub!);
    expect(job).toMatchObject({ source: 'arbeitnow', url: stub!.url, companyDomain: null, postedAt: '2026-10-20T17:40:41.000Z' });
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(scraper.detailDelayMs).toBeUndefined();
  });
});
```

In `server/tests/scrapers/registry.test.ts` make these edits:

1. Replace `expect(SCRAPE_SOURCES).toEqual(['remotive', 'myjobmag', 'jobberman', 'jsearch']);` with `expect(SCRAPE_SOURCES).toEqual(['remotive', 'myjobmag', 'jobberman', 'remoteok', 'arbeitnow', 'jsearch']);`.
2. After `    expect(SCRAPE_LIMITS.remotive).toBe(100);` add:

```ts
    expect(SCRAPE_LIMITS.remoteok).toBe(60);
    expect(SCRAPE_LIMITS.arbeitnow).toBe(60);
```

3. After `    expect(scrapeIntervalMs('jobberman', 30)).toBe(30 * 60 * 1000);` add:

```ts
    expect(scrapeIntervalMs('remoteok', 120)).toBe(2 * 60 * 60 * 1000);
    expect(scrapeIntervalMs('arbeitnow', 90)).toBe(90 * 60 * 1000);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx vitest run tests/scrapers/remoteok.test.ts tests/scrapers/arbeitnow.test.ts tests/scrapers/registry.test.ts`
Expected: FAIL (`Cannot find module '../../src/scrapers/remoteok.js'`, registry list differs).

- [ ] **Step 3: Write the implementation**

In `server/src/lib/http.ts` replace the line `export type FetchText = (url: string) => Promise<string>;` with:

```ts
/** Fetches a page or feed as text. `timeoutMs` overrides the 30 second default for a feed that is slow to send. */
export type FetchText = (url: string, opts?: { timeoutMs?: number }) => Promise<string>;
```

Create `server/src/scrapers/remoteok.ts` (the regular expression has backslashes: use the Write tool, then `grep -n 'APPLY_TRAP' server/src/scrapers/remoteok.ts` and check `\s` and `\*` are present):

```ts
import { normaliseJob, parsePostedAt, type JobStub } from '../domain/jobs.js';
import { htmlToText } from '../lib/html.js';
import type { FetchText } from '../lib/http.js';
import type { Scraper } from './types.js';

const API_URL = 'https://remoteok.com/api';
// The feed is one large file and the server can take 25 seconds or more to send it.
const TIMEOUT_MS = 60_000;

interface RemoteOkItem {
  url?: string;
  position?: string;
  company?: string;
  location?: string;
  description?: string;
  epoch?: number;
  date?: string;
}

// RemoteOK adds an anti-spam instruction ("mention the word ... when applying") to the end of every description.
// It is not part of the job, and the AI that writes the cover letter must never see it.
const APPLY_TRAP = /Please mention the word\s+\*\*[^*]*\*\*\s+and tag\s+\S+\s+when applying[\s\S]*$/i;

/**
 * The feed is a JSON array. Its first element is the terms notice, not a job. The terms require a follow link back to
 * RemoteOK and naming it as the source, so the job's own RemoteOK page is kept as the stored link and the board is
 * shown as "RemoteOK".
 */
export function parseRemoteOk(json: string): JobStub[] {
  const data = JSON.parse(json) as unknown;
  if (!Array.isArray(data)) return [];
  const stubs: JobStub[] = [];
  for (const item of data as RemoteOkItem[]) {
    if (!item || !item.position || !item.company || !item.url) continue;
    stubs.push({
      title: item.position.trim(),
      company: item.company.trim(),
      // An empty location means the employer hires anywhere. A named place (for example "Copenhagen") is a real limit.
      location: item.location?.trim() || 'Remote',
      url: item.url,
      source: 'remoteok',
      description: htmlToText((item.description ?? '').replace(APPLY_TRAP, '')),
      postedAt: parsePostedAt(item.epoch ?? item.date),
    });
  }
  return stubs;
}

export function createRemoteOkScraper(fetchText: FetchText): Scraper {
  return {
    source: 'remoteok',
    async list() {
      return parseRemoteOk(await fetchText(API_URL, { timeoutMs: TIMEOUT_MS }));
    },
    async detail(stub) {
      const job = normaliseJob({ ...stub, postedAt: stub.postedAt });
      if (!job) throw new Error(`unusable RemoteOK job: ${stub.url}`);
      return job;
    },
  };
}
```

Create `server/src/scrapers/arbeitnow.ts`:

```ts
import { normaliseJob, parsePostedAt, type JobStub } from '../domain/jobs.js';
import { htmlToText } from '../lib/html.js';
import type { FetchText } from '../lib/http.js';
import type { Scraper } from './types.js';

const API_URL = 'https://www.arbeitnow.com/api/job-board-api';
// The first page holds the 300 newest jobs, and the feed is rebuilt every hour.
const TIMEOUT_MS = 60_000;

interface ArbeitnowItem {
  url?: string;
  title?: string;
  company_name?: string;
  location?: string;
  description?: string;
  remote?: boolean;
  created_at?: number;
}

/**
 * Only the jobs Arbeitnow flags as remote are kept: the rest are on-site jobs in Germany. The terms ask for a link
 * back to Arbeitnow, so the job's own Arbeitnow page is kept as the stored link and the board is shown as "Arbeitnow".
 */
export function parseArbeitnow(json: string): JobStub[] {
  const data = JSON.parse(json) as { data?: ArbeitnowItem[] };
  const stubs: JobStub[] = [];
  for (const item of data.data ?? []) {
    if (item.remote !== true || !item.url || !item.title || !item.company_name) continue;
    const place = item.location?.trim() ?? '';
    stubs.push({
      title: item.title.trim(),
      company: item.company_name.trim(),
      location: /remote/i.test(place) ? place : place ? `Remote, ${place}` : 'Remote',
      url: item.url,
      source: 'arbeitnow',
      description: htmlToText(item.description ?? ''),
      postedAt: parsePostedAt(item.created_at),
    });
  }
  return stubs;
}

export function createArbeitnowScraper(fetchText: FetchText): Scraper {
  return {
    source: 'arbeitnow',
    async list() {
      return parseArbeitnow(await fetchText(API_URL, { timeoutMs: TIMEOUT_MS }));
    },
    async detail(stub) {
      const job = normaliseJob({ ...stub, postedAt: stub.postedAt });
      if (!job) throw new Error(`unusable Arbeitnow job: ${stub.url}`);
      return job;
    },
  };
}
```

In `server/src/scrapers/index.ts`:

1. Add `import { createArbeitnowScraper } from './arbeitnow.js';` before the `createJobbermanScraper` import and `import { createRemoteOkScraper } from './remoteok.js';` before the `createRemotiveScraper` import.
2. Replace the `SCRAPE_SOURCES` line with:

```ts
export const SCRAPE_SOURCES = ['remotive', 'myjobmag', 'jobberman', 'remoteok', 'arbeitnow', 'jsearch'] as const;
```

3. In `SCRAPE_LIMITS` add `  remoteok: 60,` and `  arbeitnow: 60,` between `jobberman: 60,` and `jsearch: 50,`.
4. In `createScrapers` add these two lines after `jobberman: createJobbermanScraper(fetchText),`:

```ts
    remoteok: createRemoteOkScraper(fetchText),
    arbeitnow: createArbeitnowScraper(fetchText),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx tsc -p tsconfig.json && npx vitest run`
Expected: no type errors; all server test files pass (`Test Files  84 passed`).

Optional live check (needs network, uses the real parser on the real feed, makes no database writes):

```bash
cd server
cat > live-remoteok.mts <<'EOF'
import { fetchText } from './src/lib/http.js';
import { parseRemoteOk } from './src/scrapers/remoteok.js';
const stubs = parseRemoteOk(await fetchText('https://remoteok.com/api', { timeoutMs: 60_000 }));
console.log(stubs.length, stubs[0]?.title, stubs[0]?.postedAt);
EOF
npx tsx live-remoteok.mts; rm live-remoteok.mts
```

Expected: about `99 <a job title> 2026-...Z`.

- [ ] **Step 5: Commit**

```bash
git add server/src server/tests
git commit -m "feat(server): scrape the RemoteOK and Arbeitnow feeds" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: We Work Remotely and Himalayas feeds

**Files:**
- Create: `server/src/scrapers/weworkremotely.ts`, `server/src/scrapers/himalayas.ts`
- Create: `server/tests/fixtures/weworkremotely.rss`, `server/tests/fixtures/himalayas.json`
- Create: `server/tests/scrapers/weworkremotely.test.ts`, `server/tests/scrapers/himalayas.test.ts`
- Modify: `server/src/scrapers/index.ts`, `server/src/worker/index.ts`, `server/tests/scrapers/registry.test.ts`

**Interfaces:**
- Consumes: `normaliseJob`, `parsePostedAt`, `JobStub`; `defaultPagePause` from `server/src/scrapers/pages.ts` (Task 5); `FetchText` with `timeoutMs` (Task 6); `MatchCandidate`/`repos.loadCandidates` (Task 2).
- Produces:
  - `WWR_FEEDS` (5 feed URLs), `parseWeWorkRemotely(xml: string): JobStub[]`, `createWeWorkRemotelyScraper(fetchText, opts?: { feeds?: readonly string[]; pause?: () => Promise<void> }): Scraper` (source `'weworkremotely'`). One failing feed is skipped; the scan fails only if every feed fails.
  - `HIMALAYAS_DEFAULT_QUERIES = ['developer', 'engineer']`, `HIMALAYAS_MAX_QUERIES = 3`, `buildHimalayasQueries(profiles: Array<{ desired_roles: string[] }>, max?: number): string[]`, `himalayasSearchUrl(query: string): string`, `parseHimalayas(json: string): JobStub[]`, `createHimalayasScraper(fetchText, opts?: { loadQueries?: () => Promise<string[]>; pause?: () => Promise<void> }): Scraper` (source `'himalayas'`).
  - `createScrapers(fetchText, extra: { jsearch?: Scraper; loadHimalayasQueries?: () => Promise<string[]> })`.
  - `SCRAPE_SOURCES` becomes `['remotive', 'myjobmag', 'jobberman', 'remoteok', 'weworkremotely', 'himalayas', 'arbeitnow', 'jsearch']`, limit 60 each for the two new ones.

- [ ] **Step 1: Write the failing tests and fixtures**

Create `server/tests/fixtures/weworkremotely.rss` (a trimmed real feed: three items, descriptions cut short, the real entity-escaped form kept):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss">
  <channel>
    <title>We Work Remotely: Remote jobs in design, programming, marketing and more</title>
    <link>https://weworkremotely.com/remote-jobs.rss</link>
    <description>We Work Remotely: Remote jobs in design, programming, marketing and more</description>
    <language>en-US</language>
    <ttl>60</ttl>
    <item>
      <title>Toptal: Senior Analytics Engineer / BI Lead - Channel Insights (iX360)</title>
      <region>North America Only</region>
      <country></country>
      <state></state>
      <skills></skills>
      <category>Full-Stack Programming</category>
      <type>Full-Time</type>
      <description>&lt;p&gt;Headquarters: Summary We are seeking an Analytics Engineer / BI Lead for Channel Insights to define the semantic layer, build dashboards, and present&lt;/p&gt;</description>
      <pubDate>Tue, 20 Oct 2026 18:10:55 +0000</pubDate>
      <expires_at>Thu, 19 Nov 2026 18:10:55 +0000</expires_at>
      <guid>https://weworkremotely.com/remote-jobs/toptal-senior-analytics-engineer-bi-lead-channel-insights-ix360</guid>
      <link>https://weworkremotely.com/remote-jobs/toptal-senior-analytics-engineer-bi-lead-channel-insights-ix360</link>
    </item>
    <item>
      <media:content url="https://wwr-pro.s3.amazonaws.com/logos/0171/6611/logo.gif" type="image/png"/>
      <title>Vertex Marketing Group: Distribution Engineer</title>
      <region>Anywhere in the World</region>
      <country></country>
      <state>Lemesos</state>
      <skills>Python, API, DevOps, Android, and iOS</skills>
      <category>Back-End Programming</category>
      <type>Full-Time</type>
      <description>&lt;p&gt;Headquarters: Bulgaria URL: https://vertexmg.com Scale our distribution by code: a fleet of real devices, iPhones first and Android too, plus&lt;/p&gt;</description>
      <pubDate>Tue, 20 Oct 2026 11:32:37 +0000</pubDate>
      <expires_at>Thu, 19 Nov 2026 11:32:37 +0000</expires_at>
      <guid>https://weworkremotely.com/remote-jobs/vertex-marketing-group-distribution-engineer</guid>
      <link>https://weworkremotely.com/remote-jobs/vertex-marketing-group-distribution-engineer</link>
    </item>
    <item>
      <media:content url="https://wwr-pro.s3.amazonaws.com/logos/0171/6608/logo.gif" type="image/png"/>
      <title>FIXD Automotive: Client Success Manager - Enterprise Accounts</title>
      <region>USA Only</region>
      <country></country>
      <state></state>
      <skills></skills>
      <category>Customer Support</category>
      <type>Full-Time</type>
      <description>&lt;p&gt;Headquarters: Atlanta, Georgia, United States URL: http://www.fixdapp.com About FIXD &amp;amp; AppraisalPRO: FIXD breaks car problems down into&lt;/p&gt;</description>
      <pubDate>Mon, 19 Oct 2026 19:48:25 +0000</pubDate>
      <expires_at>Wed, 18 Nov 2026 19:48:25 +0000</expires_at>
      <guid>https://weworkremotely.com/remote-jobs/fixd-automotive-client-success-manager-enterprise-accounts</guid>
      <link>https://weworkremotely.com/remote-jobs/fixd-automotive-client-success-manager-enterprise-accounts</link>
    </item>
  </channel>
</rss>
```

Create `server/tests/fixtures/himalayas.json` (a trimmed real search response, two jobs):

```json
{
  "comments": "Search results come 20 to a page. Pass ?page=2, ?page=3 and so on for more; there is no",
  "updatedAt": 1792516723,
  "offset": 0,
  "limit": 20,
  "totalCount": 658,
  "jobs": [
    {
      "title": "Software Engineer, AI Coding Tasks (Contract)",
      "excerpt": "We're looking for experienced software engineers to build AI coding tasks from a codebase they know",
      "companyName": "Askable",
      "companySlug": "askable",
      "companyLogo": "https://cdn-images.himalayas.app/y4eojs8toyo9ocht137iss4uee48",
      "employmentType": "Contractor",
      "minSalary": 100,
      "maxSalary": 100,
      "salaryPeriod": "hourly",
      "seniority": [
        "Mid-level"
      ],
      "currency": "USD",
      "locationRestrictions": [],
      "timezoneRestrictions": [
        -11,
        -10,
        -9.5
      ],
      "categories": [
        "Freelance-AI-Software-Engineer",
        "Contract-Software-Engineer"
      ],
      "parentCategories": [
        "Developer"
      ],
      "description": "We're looking for experienced software engineers to build AI coding tasks from a codebase they know well. US$1,000 per task, and you can do as many",
      "pubDate": 1792198336,
      "expiryDate": 1794790336,
      "applicationLink": "https://himalayas.app/companies/askable/jobs/software-engineer-ai-coding-tasks-contract?utm_source=api",
      "guid": "https://himalayas.app/companies/askable/jobs/software-engineer-ai-coding-tasks-contract"
    },
    {
      "title": "Software Engineer",
      "excerpt": "TrioComb Inc.  is a global talent agency dedicated to connecting top-tier international software",
      "companyName": "TrioComb",
      "companySlug": "triocomb",
      "companyLogo": "https://cdn-images.himalayas.app/hk4fc6zmelqiy0p7k80tc3qgkco8",
      "employmentType": "Contractor",
      "minSalary": 50000,
      "maxSalary": 80000,
      "salaryPeriod": "annual",
      "seniority": [
        "Mid-level"
      ],
      "currency": "USD",
      "locationRestrictions": [
        "India",
        "Nigeria",
        "Philippines",
        "Ukraine",
        "United States"
      ],
      "timezoneRestrictions": [
        -10,
        -9,
        -8
      ],
      "categories": [
        "Software-Engineer",
        "Full-Stack-Developer"
      ],
      "parentCategories": [
        "Developer"
      ],
      "description": "TrioComb Inc. is a global talent agency dedicated to connecting top-tier international software engineers with communities in the US who need",
      "pubDate": 1792455018,
      "expiryDate": 1797639017,
      "applicationLink": "https://himalayas.app/companies/triocomb/jobs/software-engineer-9339612818?utm_source=api",
      "guid": "https://himalayas.app/companies/triocomb/jobs/software-engineer-9339612818"
    }
  ]
}
```

Create `server/tests/scrapers/weworkremotely.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createWeWorkRemotelyScraper, parseWeWorkRemotely, WWR_FEEDS } from '../../src/scrapers/weworkremotely.js';

const fixture = readFileSync(new URL('../fixtures/weworkremotely.rss', import.meta.url), 'utf8');

const feedWith = (...items: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>${items.join('')}</channel></rss>`;
const item = (title: string, link: string, region = 'Anywhere in the World') =>
  `<item><title>${title}</title><region>${region}</region><description>&lt;p&gt;A role.&lt;/p&gt;</description><pubDate>Tue, 20 Oct 2026 11:32:37 +0000</pubDate><link>${link}</link><guid>${link}</guid></item>`;

describe('parseWeWorkRemotely', () => {
  it('maps the live RSS shape: company from the title prefix, region as the location', () => {
    const stubs = parseWeWorkRemotely(fixture);
    expect(stubs).toHaveLength(3);
    expect(stubs[1]).toEqual({
      title: 'Distribution Engineer',
      company: 'Vertex Marketing Group',
      location: 'Anywhere in the World',
      url: 'https://weworkremotely.com/remote-jobs/vertex-marketing-group-distribution-engineer',
      source: 'weworkremotely',
      description: expect.stringContaining('Scale our distribution by code'),
      postedAt: '2026-10-20T11:32:37.000Z',
    });
    expect(stubs.map((s) => s.location)).toEqual(['North America Only', 'Anywhere in the World', 'USA Only']);
  });

  it('keeps the colons inside a job title and splits on the first ": " only', () => {
    const [stub] = parseWeWorkRemotely(feedWith(item('Acme: Senior Engineer: Platform', 'https://weworkremotely.com/remote-jobs/acme-1')));
    expect(stub).toMatchObject({ company: 'Acme', title: 'Senior Engineer: Platform' });
  });

  it('decodes entities in the description and turns the HTML into text', () => {
    const [stub] = parseWeWorkRemotely(feedWith(item('Acme: Engineer', 'https://weworkremotely.com/remote-jobs/acme-2')));
    expect(stub!.description).toBe('A role.');
  });

  it('uses "Remote" when an item has no region, and the guid when it has no link', () => {
    const xml = feedWith('<item><title>Acme: Engineer</title><description>&lt;p&gt;x&lt;/p&gt;</description><guid>https://weworkremotely.com/remote-jobs/acme-3</guid></item>');
    expect(parseWeWorkRemotely(xml)[0]).toMatchObject({ location: 'Remote', url: 'https://weworkremotely.com/remote-jobs/acme-3' });
  });

  it('skips items with no "Company: " prefix or no link', () => {
    const xml = feedWith(item('No company prefix here', 'https://weworkremotely.com/remote-jobs/x'), item('Acme: Engineer', ''));
    expect(parseWeWorkRemotely(xml)).toEqual([]);
  });
});

describe('createWeWorkRemotelyScraper', () => {
  const pause = async () => undefined;

  it('reads every feed, keeps a job that is in two feeds once, and waits between feeds', async () => {
    const pauseSpy = vi.fn(pause);
    const feeds = ['https://example.com/a.rss', 'https://example.com/b.rss'];
    const fetchText = vi.fn(async (url: string) =>
      url.endsWith('a.rss')
        ? feedWith(item('Acme: One', 'https://weworkremotely.com/remote-jobs/one'), item('Acme: Two', 'https://weworkremotely.com/remote-jobs/two'))
        : feedWith(item('Acme: Two', 'https://weworkremotely.com/remote-jobs/two'), item('Acme: Three', 'https://weworkremotely.com/remote-jobs/three')),
    );
    const stubs = await createWeWorkRemotelyScraper(fetchText, { feeds, pause: pauseSpy }).list();
    expect(stubs.map((s) => s.title)).toEqual(['One', 'Two', 'Three']);
    expect(fetchText.mock.calls.map((c) => c[0])).toEqual(feeds);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it('uses the five WeWorkRemotely feeds by default', async () => {
    const fetchText = vi.fn(async (_url: string) => feedWith());
    await createWeWorkRemotelyScraper(fetchText, { pause }).list();
    expect(fetchText.mock.calls.map((c) => c[0])).toEqual([...WWR_FEEDS]);
    expect(WWR_FEEDS).toHaveLength(5);
    expect(WWR_FEEDS[0]).toBe('https://weworkremotely.com/remote-jobs.rss');
  });

  it('keeps going when one feed fails, and fails only when every feed fails', async () => {
    const some = vi.fn(async (url: string) => {
      if (url.endsWith('a.rss')) throw new Error('HTTP 500');
      return feedWith(item('Acme: One', 'https://weworkremotely.com/remote-jobs/one'));
    });
    const feeds = ['https://example.com/a.rss', 'https://example.com/b.rss'];
    expect(await createWeWorkRemotelyScraper(some, { feeds, pause }).list()).toHaveLength(1);

    const none = vi.fn(async () => { throw new Error('HTTP 500'); });
    await expect(createWeWorkRemotelyScraper(none, { feeds, pause }).list()).rejects.toThrow('HTTP 500');
  });

  it('detail() builds the job without another request and refuses an empty description', async () => {
    const fetchText = vi.fn(async () => fixture);
    const scraper = createWeWorkRemotelyScraper(fetchText, { feeds: ['https://example.com/a.rss'], pause });
    const [stub] = await scraper.list();
    const job = await scraper.detail(stub!);
    expect(job).toMatchObject({ source: 'weworkremotely', url: stub!.url, companyDomain: null, postedAt: '2026-10-20T18:10:55.000Z' });
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(scraper.detailDelayMs).toBeUndefined();
    await expect(scraper.detail({ ...stub!, description: '' })).rejects.toThrow('unusable We Work Remotely job');
  });
});
```

Create `server/tests/scrapers/himalayas.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { buildHimalayasQueries, createHimalayasScraper, himalayasSearchUrl, parseHimalayas } from '../../src/scrapers/himalayas.js';

const fixture = readFileSync(new URL('../fixtures/himalayas.json', import.meta.url), 'utf8');
const pause = async () => undefined;

describe('parseHimalayas', () => {
  it('maps the live API shape: no restrictions means Worldwide, countries are listed, applicationLink is the link', () => {
    const stubs = parseHimalayas(fixture);
    expect(stubs).toHaveLength(2);
    expect(stubs[0]).toEqual({
      title: 'Software Engineer, AI Coding Tasks (Contract)',
      company: 'Askable',
      location: 'Worldwide',
      url: 'https://himalayas.app/companies/askable/jobs/software-engineer-ai-coding-tasks-contract?utm_source=api',
      source: 'himalayas',
      description: expect.stringContaining('experienced software engineers'),
      postedAt: '2026-10-17T00:52:16.000Z',
    });
    expect(stubs[1]!.location).toBe('India, Nigeria, Philippines, Ukraine, United States');
  });

  it('skips entries missing a title, company or link, and tolerates a body with no jobs', () => {
    const json = JSON.stringify({ jobs: [{ companyName: 'C', applicationLink: 'u' }, { title: 'T', applicationLink: 'u' }, { title: 'T', companyName: 'C' }] });
    expect(parseHimalayas(json)).toEqual([]);
    expect(parseHimalayas('{}')).toEqual([]);
  });

  it('ignores restriction entries that are not text', () => {
    const json = JSON.stringify({ jobs: [{ title: 'T', companyName: 'C', applicationLink: 'https://himalayas.app/x', locationRestrictions: [null, 5, 'Kenya', ' '] }] });
    expect(parseHimalayas(json)[0]!.location).toBe('Kenya');
  });
});

describe('buildHimalayasQueries', () => {
  it('uses the users\' roles, most shared first, at most three', () => {
    const profiles = [
      { desired_roles: ['Full Stack Developer', 'Software Engineer'] },
      { desired_roles: ['software engineer', 'Backend Developer'] },
      { desired_roles: ['Data Analyst'] },
    ];
    expect(buildHimalayasQueries(profiles)).toEqual(['software engineer', 'full stack developer', 'backend developer']);
    expect(buildHimalayasQueries(profiles, 1)).toEqual(['software engineer']);
  });

  it('counts a role once per user and ignores one-letter roles', () => {
    expect(buildHimalayasQueries([{ desired_roles: ['Nurse', 'nurse', 'x'] }])).toEqual(['nurse']);
  });

  it('falls back to developer and engineer when nobody has a role', () => {
    expect(buildHimalayasQueries([])).toEqual(['developer', 'engineer']);
    expect(buildHimalayasQueries([{ desired_roles: [] }])).toEqual(['developer', 'engineer']);
  });
});

describe('himalayasSearchUrl', () => {
  it('searches recent jobs open to Nigeria', () => {
    expect(himalayasSearchUrl('full stack developer')).toBe('https://himalayas.app/jobs/api/search?q=full+stack+developer&country=NG&sort=recent');
  });
});

describe('createHimalayasScraper', () => {
  it('runs one search per query with a long timeout, keeps a job found twice once, and waits between searches', async () => {
    const pauseSpy = vi.fn(pause);
    const fetchText = vi.fn().mockImplementation(async () => fixture);
    const scraper = createHimalayasScraper(fetchText, { loadQueries: async () => ['developer', 'engineer'], pause: pauseSpy });
    const stubs = await scraper.list();
    expect(stubs).toHaveLength(2);
    expect(fetchText.mock.calls).toEqual([
      [himalayasSearchUrl('developer'), { timeoutMs: 60_000 }],
      [himalayasSearchUrl('engineer'), { timeoutMs: 60_000 }],
    ]);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it('searches developer and engineer when no query loader is given', async () => {
    const fetchText = vi.fn().mockImplementation(async () => fixture);
    await createHimalayasScraper(fetchText, { pause }).list();
    expect(fetchText).toHaveBeenCalledTimes(2);
  });

  it('keeps going when one search fails, and fails only when every search fails', async () => {
    const some = vi.fn(async (url: string) => {
      if (url.includes('q=developer')) throw new Error('timeout');
      return fixture;
    });
    const queries = async () => ['developer', 'engineer'];
    expect(await createHimalayasScraper(some, { loadQueries: queries, pause }).list()).toHaveLength(2);
    const none = vi.fn(async () => { throw new Error('timeout'); });
    await expect(createHimalayasScraper(none, { loadQueries: queries, pause }).list()).rejects.toThrow('timeout');
  });

  it('detail() builds the job without another request and refuses an empty description', async () => {
    const fetchText = vi.fn().mockImplementation(async () => fixture);
    const scraper = createHimalayasScraper(fetchText, { loadQueries: async () => ['developer'], pause });
    const [stub] = await scraper.list();
    const job = await scraper.detail(stub!);
    expect(job).toMatchObject({ source: 'himalayas', url: stub!.url, companyDomain: null, postedAt: '2026-10-17T00:52:16.000Z' });
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(scraper.detailDelayMs).toBeUndefined();
    await expect(scraper.detail({ ...stub!, description: '' })).rejects.toThrow('unusable Himalayas job');
  });
});
```

In `server/tests/scrapers/registry.test.ts`:

1. Replace the `SCRAPE_SOURCES` expectation with `expect(SCRAPE_SOURCES).toEqual(['remotive', 'myjobmag', 'jobberman', 'remoteok', 'weworkremotely', 'himalayas', 'arbeitnow', 'jsearch']);`.
2. Before `    expect(SCRAPE_LIMITS.arbeitnow).toBe(60);` add:

```ts
    expect(SCRAPE_LIMITS.weworkremotely).toBe(60);
    expect(SCRAPE_LIMITS.himalayas).toBe(60);
```

3. Before `    expect(scrapeIntervalMs('arbeitnow', 90)).toBe(90 * 60 * 1000);` add:

```ts
    expect(scrapeIntervalMs('weworkremotely', 60)).toBe(60 * 60 * 1000);
    expect(scrapeIntervalMs('himalayas', 120)).toBe(2 * 60 * 60 * 1000);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx vitest run tests/scrapers/weworkremotely.test.ts tests/scrapers/himalayas.test.ts tests/scrapers/registry.test.ts`
Expected: FAIL (`Cannot find module '../../src/scrapers/weworkremotely.js'` and `.../himalayas.js`).

- [ ] **Step 3: Write the implementation**

Create `server/src/scrapers/weworkremotely.ts`:

```ts
import * as cheerio from 'cheerio';
import { normaliseJob, parsePostedAt, type JobStub } from '../domain/jobs.js';
import { htmlToText } from '../lib/html.js';
import type { FetchText } from '../lib/http.js';
import { defaultPagePause } from './pages.js';
import type { Scraper } from './types.js';

/** The all-categories feed and the four programming feeds (the programming feeds list jobs the main feed does not). */
export const WWR_FEEDS = [
  'https://weworkremotely.com/remote-jobs.rss',
  'https://weworkremotely.com/categories/remote-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss',
] as const;

/**
 * One RSS feed to stubs. An item's title is "Company: Job title". Its region ("Anywhere in the World", "USA Only", ...)
 * becomes the location. The item's own weworkremotely.com page is kept as the stored link, and the board is shown as
 * "We Work Remotely".
 */
export function parseWeWorkRemotely(xml: string): JobStub[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const stubs: JobStub[] = [];
  $('item').each((_, el) => {
    const item = $(el);
    const heading = item.children('title').text().replace(/\s+/g, ' ').trim();
    const url = item.children('link').text().trim() || item.children('guid').text().trim();
    const split = heading.indexOf(': ');
    if (split <= 0 || !url) return;
    const company = heading.slice(0, split).trim();
    const title = heading.slice(split + 2).trim();
    if (!company || !title) return;
    stubs.push({
      title,
      company,
      location: item.children('region').text().trim() || 'Remote',
      url,
      source: 'weworkremotely',
      description: htmlToText(item.children('description').text()),
      postedAt: parsePostedAt(item.children('pubDate').text()),
    });
  });
  return stubs;
}

export function createWeWorkRemotelyScraper(
  fetchText: FetchText,
  opts: { feeds?: readonly string[]; pause?: () => Promise<void> } = {},
): Scraper {
  const feeds = opts.feeds ?? WWR_FEEDS;
  const pause = opts.pause ?? defaultPagePause;
  return {
    source: 'weworkremotely',
    async list() {
      const byUrl = new Map<string, JobStub>();
      let succeeded = 0;
      let lastError: unknown;
      for (const [i, feed] of feeds.entries()) {
        if (i > 0) await pause();
        try {
          for (const stub of parseWeWorkRemotely(await fetchText(feed))) if (!byUrl.has(stub.url)) byUrl.set(stub.url, stub);
          succeeded++;
        } catch (err) {
          lastError = err;
        }
      }
      // One feed down is fine; every feed down is a failed scan.
      if (succeeded === 0 && lastError !== undefined) throw lastError;
      return [...byUrl.values()];
    },
    async detail(stub) {
      const job = normaliseJob({ ...stub, postedAt: stub.postedAt });
      if (!job) throw new Error(`unusable We Work Remotely job: ${stub.url}`);
      return job;
    },
  };
}
```

Create `server/src/scrapers/himalayas.ts`:

```ts
import { normaliseJob, parsePostedAt, type JobStub } from '../domain/jobs.js';
import { htmlToText } from '../lib/html.js';
import type { FetchText } from '../lib/http.js';
import { defaultPagePause } from './pages.js';
import type { Scraper } from './types.js';

const SEARCH_URL = 'https://himalayas.app/jobs/api/search';
// The search is cached by Himalayas; an uncached query has been seen taking 45 seconds.
const TIMEOUT_MS = 60_000;

/** Searched when no user has a role yet. */
export const HIMALAYAS_DEFAULT_QUERIES = ['developer', 'engineer'] as const;
export const HIMALAYAS_MAX_QUERIES = 3;

interface HimalayasJob {
  title?: string;
  companyName?: string;
  locationRestrictions?: unknown;
  description?: string;
  pubDate?: number;
  applicationLink?: string;
}

/**
 * The search words: the desired roles of all users, most shared first, at most `max`. Falls back to developer and
 * engineer when nobody has a role. Each is searched for jobs open to Nigeria, so worldwide jobs are included.
 */
export function buildHimalayasQueries(profiles: Array<{ desired_roles: string[] }>, max: number = HIMALAYAS_MAX_QUERIES): string[] {
  const counts = new Map<string, { n: number; first: number }>();
  let order = 0;
  for (const p of profiles) {
    for (const raw of new Set(p.desired_roles.map((r) => r.replace(/\s+/g, ' ').trim().toLowerCase()))) {
      if (raw.length < 2) continue;
      const entry = counts.get(raw);
      if (entry) entry.n++;
      else counts.set(raw, { n: 1, first: order++ });
    }
  }
  const queries = [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first)
    .slice(0, max)
    .map(([role]) => role);
  return queries.length > 0 ? queries : [...HIMALAYAS_DEFAULT_QUERIES];
}

export const himalayasSearchUrl = (query: string): string =>
  `${SEARCH_URL}?${new URLSearchParams({ q: query, country: 'NG', sort: 'recent' }).toString()}`;

/**
 * One search response to stubs. No restrictions means open worldwide; otherwise the countries are the location.
 * The terms ask for a link back to Himalayas and naming it as the source, so the job's Himalayas page (its
 * applicationLink) is kept as the stored link and the board is shown as "Himalayas".
 */
export function parseHimalayas(json: string): JobStub[] {
  const data = JSON.parse(json) as { jobs?: HimalayasJob[] };
  const stubs: JobStub[] = [];
  for (const job of data.jobs ?? []) {
    if (!job.title || !job.companyName || !job.applicationLink) continue;
    const countries = Array.isArray(job.locationRestrictions)
      ? job.locationRestrictions.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
      : [];
    stubs.push({
      title: job.title.trim(),
      company: job.companyName.trim(),
      location: countries.length > 0 ? countries.join(', ') : 'Worldwide',
      url: job.applicationLink,
      source: 'himalayas',
      description: htmlToText(job.description ?? ''),
      postedAt: parsePostedAt(job.pubDate),
    });
  }
  return stubs;
}

export function createHimalayasScraper(
  fetchText: FetchText,
  opts: { loadQueries?: () => Promise<string[]>; pause?: () => Promise<void> } = {},
): Scraper {
  const pause = opts.pause ?? defaultPagePause;
  return {
    source: 'himalayas',
    async list() {
      const queries = opts.loadQueries ? await opts.loadQueries() : [...HIMALAYAS_DEFAULT_QUERIES];
      const byUrl = new Map<string, JobStub>();
      let succeeded = 0;
      let lastError: unknown;
      for (const [i, query] of queries.entries()) {
        if (i > 0) await pause();
        try {
          for (const stub of parseHimalayas(await fetchText(himalayasSearchUrl(query), { timeoutMs: TIMEOUT_MS }))) {
            if (!byUrl.has(stub.url)) byUrl.set(stub.url, stub);
          }
          succeeded++;
        } catch (err) {
          lastError = err;
        }
      }
      if (succeeded === 0 && lastError !== undefined) throw lastError;
      return [...byUrl.values()];
    },
    async detail(stub) {
      const job = normaliseJob({ ...stub, postedAt: stub.postedAt });
      if (!job) throw new Error(`unusable Himalayas job: ${stub.url}`);
      return job;
    },
  };
}
```

In `server/src/scrapers/index.ts`:

1. Add `import { createHimalayasScraper } from './himalayas.js';` before the `createJobbermanScraper` import, and `import { createWeWorkRemotelyScraper } from './weworkremotely.js';` after the `import type { Scraper } from './types.js';` line.
2. Replace the `SCRAPE_SOURCES` line with:

```ts
export const SCRAPE_SOURCES = ['remotive', 'myjobmag', 'jobberman', 'remoteok', 'weworkremotely', 'himalayas', 'arbeitnow', 'jsearch'] as const;
```

3. In `SCRAPE_LIMITS` replace `  remoteok: 60,\n  arbeitnow: 60,` with:

```ts
  remoteok: 60,
  weworkremotely: 60,
  himalayas: 60,
  arbeitnow: 60,
```

4. Replace the `createScrapers` signature line with:

```ts
export function createScrapers(
  fetchText: FetchText,
  extra: { jsearch?: Scraper; loadHimalayasQueries?: () => Promise<string[]> } = {},
): Record<ScrapeSource, Scraper> {
```

5. After `    remoteok: createRemoteOkScraper(fetchText),` add:

```ts
    weworkremotely: createWeWorkRemotelyScraper(fetchText),
    himalayas: createHimalayasScraper(fetchText, extra.loadHimalayasQueries ? { loadQueries: extra.loadHimalayasQueries } : {}),
```

In `server/src/worker/index.ts`:

1. Add `import { buildHimalayasQueries } from '../scrapers/himalayas.js';` before the `createJSearchScraper` import.
2. Replace `  const scrapers = createScrapers(fetchText, {` with:

```ts
  const scrapers = createScrapers(fetchText, {
    loadHimalayasQueries: async () => buildHimalayasQueries(await repos.loadCandidates()),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx tsc -p tsconfig.json && npx vitest run`
Expected: no type errors; all server test files pass (`Test Files  86 passed`).

- [ ] **Step 5: Commit**

```bash
git add server/src server/tests
git commit -m "feat(server): scrape We Work Remotely and Himalayas" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 8: New-match email digest (opt-in)

**Files:**
- Create: `server/src/services/alerts/digest.ts`, `server/src/services/alerts/repo.ts`, `server/src/services/alerts/throttle.ts`
- Modify: `server/src/queues.ts`, `server/src/worker/index.ts`
- Create: `server/tests/alerts/digest.test.ts`, `server/tests/alerts/repo.test.ts`, `server/tests/api/profile-notify.test.ts`

**Interfaces:**
- Consumes: `profiles.notify_new_matches`, `applications.notified_at` (Task 1); `profilePatchSchema.notify_new_matches` (Task 1, so `PUT /profile` already accepts it); `OutgoingEmail` and `buildRawMessage` (`server/src/services/gmail/mime.ts`); `sendGmailMessage({ accessToken, raw })` (`server/src/services/gmail/send.ts`); `gmailTokens.isConnected(userId)` and `gmailTokens.getAccessToken(userId): Promise<{ accessToken: string; email: string }>`; `logger`; the worker's `lockRedis`.
- Produces:
  - `server/src/services/alerts/digest.ts`: `interface DigestMatch { id: string; title: string; company: string; match_score: number }` (no CV or letter text), `DIGEST_WINDOW_HOURS = 24`, `MAX_LISTED = 10`, `interface AlertDeps`, `buildDigest(matches, threshold, webOrigin): { subject: string; text: string }`, `runAlertDigest(d: AlertDeps): Promise<{ sent: number; skipped: number; failed: number }>`.
  - `server/src/services/alerts/repo.ts`: `createAlertRepo(db)` with `loadSubscribers()`, `loadNewMatches(userId, minScore, since)`, `markNotified(applicationIds, at)`.
  - `server/src/services/alerts/throttle.ts`: `interface DigestThrottle { acquire(userId): Promise<boolean>; release(userId): Promise<void> }`, `createDigestThrottle(redis: Pick<Redis, 'set' | 'del'>)` (Redis key `alert:digest:<userId>`, 3600 seconds, `NX`).
  - `QUEUES.alerts = 'alerts'`, `type AlertsJobData = { kind: 'digest' }`, `createQueues(...).alerts`, and a repeating job `alert-digest` every 15 minutes handled in the worker.

Behaviour to keep in mind: the email goes from the user's own Gmail address to the same address (Gmail `gmail.send`, no new permission); it is not an application, so it does not touch the application send lock, daily cap or `email_logs`; it is never sent unless the box is ticked, Gmail is connected, and there is at least one new match at or above `profiles.auto_threshold` created in the last 24 hours that no earlier digest mentioned; it lists only job title, company and score, with a link to `${WEB_ORIGIN}/queue`.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/alerts/digest.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildDigest, DIGEST_WINDOW_HOURS, MAX_LISTED, runAlertDigest, type AlertDeps, type DigestMatch } from '../../src/services/alerts/digest.js';
import { createDigestThrottle } from '../../src/services/alerts/throttle.js';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const match = (n: number, over: Partial<DigestMatch> = {}): DigestMatch => ({ id: `a${n}`, title: `Backend Engineer ${n}`, company: `Acme ${n}`, match_score: 90 - n, ...over });
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** An in-memory stand-in for the one-hour throttle. */
function fakeThrottle() {
  const held = new Set<string>();
  return {
    held,
    acquire: vi.fn(async (userId: string) => (held.has(userId) ? false : (held.add(userId), true))),
    release: vi.fn(async (userId: string) => void held.delete(userId)),
  };
}

function make(over: Partial<AlertDeps> = {}) {
  const throttle = fakeThrottle();
  const sent: Array<{ accessToken: string; raw: string }> = [];
  const built: Array<{ from: string; to: string; subject: string; text: string }> = [];
  const deps: AlertDeps = {
    loadSubscribers: vi.fn<AlertDeps['loadSubscribers']>().mockImplementation(async () => [{ user_id: 'u1', auto_threshold: 80 }]),
    loadNewMatches: vi.fn<AlertDeps['loadNewMatches']>().mockImplementation(async () => [match(1), match(2)]),
    markNotified: vi.fn<AlertDeps['markNotified']>().mockImplementation(async () => undefined),
    isGmailConnected: vi.fn<AlertDeps['isGmailConnected']>().mockImplementation(async () => true),
    getAccessToken: vi.fn<AlertDeps['getAccessToken']>().mockImplementation(async () => ({ accessToken: 'TOKEN', email: 'me@gmail.com' })),
    buildRaw: vi.fn<AlertDeps['buildRaw']>().mockImplementation(async (email) => (built.push(email as never), 'RAW')),
    sendMessage: vi.fn<AlertDeps['sendMessage']>().mockImplementation(async (args) => void sent.push(args)),
    throttle,
    webOrigin: 'https://app.joblume.test/',
    now: () => NOW,
    log,
    ...over,
  };
  return { deps, throttle, sent, built };
}

describe('buildDigest', () => {
  it('lists each match with its score and links to the queue of the web app', () => {
    const { subject, text } = buildDigest([match(1), match(2)], 80, 'https://app.joblume.test/');
    expect(subject).toBe('JobLume: 2 new matches to review');
    expect(text).toContain('You have 2 new job matches at or above your 80% match score.');
    expect(text).toContain('- Backend Engineer 1 at Acme 1 (89% match)');
    expect(text).toContain('- Backend Engineer 2 at Acme 2 (88% match)');
    expect(text).toContain('Review them in JobLume: https://app.joblume.test/queue');
    expect(text).toContain('Switch it off there at any time.');
  });

  it('says "match" and "it" for a single match', () => {
    const { subject, text } = buildDigest([match(1)], 70, 'http://localhost:3000');
    expect(subject).toBe('JobLume: 1 new match to review');
    expect(text).toContain('You have 1 new job match at or above your 70% match score.');
    expect(text).toContain('Review it in JobLume: http://localhost:3000/queue');
  });

  it('lists at most ten and says how many more', () => {
    const many = Array.from({ length: MAX_LISTED + 3 }, (_, i) => match(i + 1));
    const { text } = buildDigest(many, 80, 'http://localhost:3000');
    expect(text.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(MAX_LISTED);
    expect(text).toContain('...and 3 more.');
  });

  it('flattens line breaks in a scraped title and cuts very long ones', () => {
    const { text } = buildDigest([match(1, { title: `Engineer\nBCC: x@y.z ${'a'.repeat(300)}` })], 80, 'http://localhost:3000');
    const line = text.split('\n').find((l) => l.startsWith('- '))!;
    expect(line).toContain('Engineer BCC: x@y.z');
    expect(line.length).toBeLessThan(200);
  });
});

describe('runAlertDigest', () => {
  it('sends one digest to the user\'s own Gmail address and marks the matches as notified', async () => {
    const { deps, sent, built } = make();
    expect(await runAlertDigest(deps)).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(sent).toEqual([{ accessToken: 'TOKEN', raw: 'RAW' }]);
    expect(built).toHaveLength(1);
    expect(built[0]!.from).toBe('me@gmail.com');
    expect(built[0]!.to).toBe('me@gmail.com');
    expect(built[0]!.subject).toBe('JobLume: 2 new matches to review');
    expect(deps.markNotified).toHaveBeenCalledWith(['a1', 'a2'], NOW);
  });

  it('asks only for matches at or above the user\'s threshold from the last day', async () => {
    const { deps } = make();
    await runAlertDigest(deps);
    const [userId, minScore, since] = vi.mocked(deps.loadNewMatches).mock.calls[0]!;
    expect(userId).toBe('u1');
    expect(minScore).toBe(80);
    expect(NOW.getTime() - since.getTime()).toBe(DIGEST_WINDOW_HOURS * 3_600_000);
  });

  it('sends nothing, and does not use up the hour, when there is nothing new', async () => {
    const { deps, throttle, sent } = make({ loadNewMatches: vi.fn<AlertDeps['loadNewMatches']>().mockImplementation(async () => []) });
    expect(await runAlertDigest(deps)).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(sent).toHaveLength(0);
    expect(throttle.acquire).not.toHaveBeenCalled();
    expect(deps.markNotified).not.toHaveBeenCalled();
  });

  it('sends nothing when nobody opted in', async () => {
    const { deps, sent } = make({ loadSubscribers: vi.fn<AlertDeps['loadSubscribers']>().mockImplementation(async () => []) });
    expect(await runAlertDigest(deps)).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(sent).toHaveLength(0);
    expect(deps.loadNewMatches).not.toHaveBeenCalled();
  });

  it('skips a user whose Gmail is not connected', async () => {
    const { deps, sent } = make({ isGmailConnected: vi.fn<AlertDeps['isGmailConnected']>().mockImplementation(async () => false) });
    expect(await runAlertDigest(deps)).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(sent).toHaveLength(0);
    expect(deps.loadNewMatches).not.toHaveBeenCalled();
  });

  it('sends at most one digest an hour: a second run right after sends nothing', async () => {
    const { deps, sent } = make();
    await runAlertDigest(deps);
    expect(await runAlertDigest(deps)).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(sent).toHaveLength(1);
  });

  it('gives the hour back when the send fails, so the next run tries again', async () => {
    let fail = true;
    const { deps, sent, throttle } = make({
      sendMessage: vi.fn<AlertDeps['sendMessage']>().mockImplementation(async (args) => {
        if (fail) throw new Error('Gmail down');
        sent.push(args);
      }),
    });
    expect(await runAlertDigest(deps)).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect(deps.markNotified).not.toHaveBeenCalled();
    expect(throttle.release).toHaveBeenCalledWith('u1');
    fail = false;
    expect(await runAlertDigest(deps)).toEqual({ sent: 1, skipped: 0, failed: 0 });
  });

  it('keeps the hour used when the email went out but marking failed', async () => {
    const { deps, throttle } = make({ markNotified: vi.fn<AlertDeps['markNotified']>().mockImplementation(async () => { throw new Error('db down'); }) });
    expect(await runAlertDigest(deps)).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(throttle.release).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }), 'digest sent but its matches could not be marked');
  });

  it('one user failing does not stop the next user', async () => {
    const getAccessToken = vi.fn<AlertDeps['getAccessToken']>().mockImplementation(async (userId) => {
      if (userId === 'u1') throw new Error('reconnect Gmail');
      return { accessToken: 'T2', email: 'two@gmail.com' };
    });
    const { deps, sent, built } = make({
      loadSubscribers: vi.fn<AlertDeps['loadSubscribers']>().mockImplementation(async () => [
        { user_id: 'u1', auto_threshold: 80 },
        { user_id: 'u2', auto_threshold: 60 },
      ]),
      getAccessToken,
    });
    expect(await runAlertDigest(deps)).toEqual({ sent: 1, skipped: 0, failed: 1 });
    expect(sent).toEqual([{ accessToken: 'T2', raw: 'RAW' }]);
    expect(built[0]!.to).toBe('two@gmail.com');
  });

  it('never puts CV or cover letter text in the email: the digest only ever receives titles, companies and scores', async () => {
    const leaky = { ...match(1), tailored_cv_text: 'SECRET CV TEXT', cover_letter_text: 'SECRET LETTER' } as DigestMatch;
    const { deps, built } = make({ loadNewMatches: vi.fn<AlertDeps['loadNewMatches']>().mockImplementation(async () => [leaky]) });
    await runAlertDigest(deps);
    expect(JSON.stringify(built)).not.toMatch(/SECRET/);
  });
});

describe('createDigestThrottle', () => {
  function fakeRedis() {
    const store = new Map<string, string>();
    return {
      store,
      set: vi.fn(async (key: string, value: string, ..._rest: unknown[]) => {
        if (store.has(key)) return null;
        store.set(key, value);
        return 'OK' as const;
      }),
      del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    };
  }

  it('lets the first acquire through for an hour per user, and refuses the second', async () => {
    const redis = fakeRedis();
    const throttle = createDigestThrottle(redis as never);
    expect(await throttle.acquire('u1')).toBe(true);
    expect(redis.set).toHaveBeenCalledWith('alert:digest:u1', '1', 'EX', 3600, 'NX');
    expect(await throttle.acquire('u1')).toBe(false);
    expect(await throttle.acquire('u2')).toBe(true);
  });

  it('release() makes the user eligible again', async () => {
    const throttle = createDigestThrottle(fakeRedis() as never);
    await throttle.acquire('u1');
    await throttle.release('u1');
    expect(await throttle.acquire('u1')).toBe(true);
  });
});
```

Create `server/tests/alerts/repo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Db } from '../../src/lib/supabase.js';
import { createAlertRepo } from '../../src/services/alerts/repo.js';

type Result = { data?: unknown; error?: unknown };

/** A Supabase stand-in: records every chained call; each awaited query takes the next queued result. */
function fakeDb(results: Result[] = []) {
  const calls: unknown[][] = [];
  const chain: object = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') {
        const next = results.shift() ?? {};
        return (resolve: (v: unknown) => void) => resolve({ data: next.data ?? null, error: next.error ?? null });
      }
      return (...args: unknown[]) => {
        calls.push([String(prop), ...args]);
        return chain;
      };
    },
  });
  return { db: { from: (table: string) => (calls.push(['from', table]), chain) } as unknown as Db, calls };
}

const SINCE = new Date('2026-10-19T12:00:00.000Z');

describe('createAlertRepo', () => {
  it('lists only the users who turned the digest on, with their thresholds', async () => {
    const { db, calls } = fakeDb([{ data: [{ user_id: 'u1', auto_threshold: 80 }] }]);
    expect(await createAlertRepo(db).loadSubscribers()).toEqual([{ user_id: 'u1', auto_threshold: 80 }]);
    expect(calls).toEqual([['from', 'profiles'], ['select', 'user_id, auto_threshold'], ['eq', 'notify_new_matches', true]]);
  });

  it('reads one user\'s new pending matches at or above the score, best first, and never selects CV or letter text', async () => {
    const rows = [{ id: 'a1', match_score: 92, job: { title: 'Backend Engineer', company: 'Acme' } }, { id: 'a2', match_score: 85, job: null }];
    const { db, calls } = fakeDb([{ data: rows }]);
    const matches = await createAlertRepo(db).loadNewMatches('u1', 80, SINCE);
    expect(matches).toEqual([
      { id: 'a1', title: 'Backend Engineer', company: 'Acme', match_score: 92 },
      { id: 'a2', title: 'Untitled role', company: 'Unknown company', match_score: 85 },
    ]);
    expect(calls).toEqual([
      ['from', 'applications'],
      ['select', 'id, match_score, job:jobs(title, company)'],
      ['eq', 'user_id', 'u1'],
      ['eq', 'status', 'pending_review'],
      ['is', 'notified_at', null],
      ['gte', 'match_score', 80],
      ['gte', 'created_at', SINCE.toISOString()],
      ['order', 'match_score', { ascending: false }],
      ['limit', 50],
    ]);
    const select = String(calls[1]![1]);
    expect(select).not.toMatch(/cv|letter|tailored/i);
  });

  it('marks the given applications as notified', async () => {
    const { db, calls } = fakeDb();
    await createAlertRepo(db).markNotified(['a1', 'a2'], SINCE);
    expect(calls).toEqual([['from', 'applications'], ['update', { notified_at: SINCE.toISOString() }], ['in', 'id', ['a1', 'a2']]]);
  });

  it('does nothing for an empty list, and throws database errors', async () => {
    const empty = fakeDb();
    await createAlertRepo(empty.db).markNotified([], SINCE);
    expect(empty.calls).toEqual([]);
    await expect(createAlertRepo(fakeDb([{ error: { message: 'down' } }]).db).loadSubscribers()).rejects.toEqual({ message: 'down' });
    await expect(createAlertRepo(fakeDb([{ error: { message: 'down' } }]).db).loadNewMatches('u1', 80, SINCE)).rejects.toEqual({ message: 'down' });
    await expect(createAlertRepo(fakeDb([{ error: { message: 'down' } }]).db).markNotified(['a1'], SINCE)).rejects.toEqual({ message: 'down' });
  });
});
```

Create `server/tests/api/profile-notify.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { makeDeps } from '../helpers/deps.js';

const profile = {
  user_id: 'u1', base_cv_text: null, base_cv_url: null, base_cv_filename: null, skills: [], years_experience: null, desired_roles: [],
  location: null, salary_min: null, salary_max: null, apply_mode: 'manual' as const, auto_threshold: 80, daily_cap: 20,
  auto_followup: false, notify_new_matches: false, updated_at: '',
};

function deps() {
  return makeDeps({
    profiles: { get: vi.fn(), update: vi.fn(async (_id, patch) => ({ ...profile, ...patch })) },
    jobs: { refresh: vi.fn(), rematch: vi.fn(async () => undefined) },
  });
}
const put = (app: ReturnType<typeof createApp>, body: object) => request(app).put('/profile').set('authorization', 'Bearer good').send(body);

describe('PUT /profile notify_new_matches', () => {
  it('saves the new-match email switch for the signed-in user only', async () => {
    const d = deps();
    const res = await put(createApp(d), { notify_new_matches: true });
    expect(res.status).toBe(200);
    expect(res.body.notify_new_matches).toBe(true);
    expect(d.profiles.update).toHaveBeenCalledWith('u1', { notify_new_matches: true });
  });

  it('rejects a value that is not true or false', async () => {
    const d = deps();
    const res = await put(createApp(d), { notify_new_matches: 'yes' });
    expect(res.status).toBe(400);
    expect(d.profiles.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx vitest run tests/alerts tests/api/profile-notify.test.ts`
Expected: FAIL for `tests/alerts/*` (`Cannot find module '../../src/services/alerts/digest.js'`). The `profile-notify` tests already pass because Task 1 added the field to the shared schema; that is intended, they pin the contract.

- [ ] **Step 3: Write the implementation**

Create `server/src/services/alerts/throttle.ts`:

```ts
import type { Redis } from 'ioredis';

const THROTTLE_SECONDS = 3600;

export interface DigestThrottle {
  /** True when this user has had no digest in the last hour (and records that one is being sent now). */
  acquire(userId: string): Promise<boolean>;
  /** Gives the hour back, used when the send failed so the next run can try again. */
  release(userId: string): Promise<void>;
}

const key = (userId: string) => `alert:digest:${userId}`;

/** At most one digest per user per hour, kept in Redis so it holds across worker restarts. */
export function createDigestThrottle(redis: Pick<Redis, 'set' | 'del'>): DigestThrottle {
  return {
    async acquire(userId) {
      return (await redis.set(key(userId), '1', 'EX', THROTTLE_SECONDS, 'NX')) === 'OK';
    },
    async release(userId) {
      await redis.del(key(userId));
    },
  };
}
```

Create `server/src/services/alerts/repo.ts`:

```ts
import type { Db } from '../../lib/supabase.js';
import type { DigestMatch } from './digest.js';

/** The most matches one digest reads; the email lists fewer. */
const READ_LIMIT = 50;

/**
 * Reads for the new-match digest. Only the job title, company and score are selected: the CV and cover letter
 * text are never read here, so they cannot end up in the email.
 */
export function createAlertRepo(db: Db) {
  return {
    /** Users who turned the digest on, with the score at or above which a match counts. */
    async loadSubscribers(): Promise<Array<{ user_id: string; auto_threshold: number }>> {
      const { data, error } = await db.from('profiles').select('user_id, auto_threshold').eq('notify_new_matches', true);
      if (error) throw error;
      return (data ?? []) as Array<{ user_id: string; auto_threshold: number }>;
    },

    /** The user's pending applications created since `since`, scoring at least `minScore`, not yet in a digest. Best first. */
    async loadNewMatches(userId: string, minScore: number, since: Date): Promise<DigestMatch[]> {
      const { data, error } = await db
        .from('applications')
        .select('id, match_score, job:jobs(title, company)')
        .eq('user_id', userId)
        .eq('status', 'pending_review')
        .is('notified_at', null)
        .gte('match_score', minScore)
        .gte('created_at', since.toISOString())
        .order('match_score', { ascending: false })
        .limit(READ_LIMIT);
      if (error) throw error;
      return ((data ?? []) as unknown as Array<{ id: string; match_score: number; job: { title: string; company: string } | null }>).map((row) => ({
        id: row.id,
        title: row.job?.title ?? 'Untitled role',
        company: row.job?.company ?? 'Unknown company',
        match_score: row.match_score,
      }));
    },

    async markNotified(applicationIds: string[], at: Date): Promise<void> {
      if (applicationIds.length === 0) return;
      const { error } = await db.from('applications').update({ notified_at: at.toISOString() }).in('id', applicationIds);
      if (error) throw error;
    },
  };
}
```

Create `server/src/services/alerts/digest.ts`:

```ts
import type { Logger } from '../../lib/logger.js';
import type { OutgoingEmail } from '../gmail/mime.js';
import type { DigestThrottle } from './throttle.js';

/** One new match as the digest sees it. There is deliberately no CV or cover letter text here. */
export interface DigestMatch {
  id: string;
  title: string;
  company: string;
  match_score: number;
}

/** Only matches made in the last day are mentioned, so switching the digest on does not bring up old ones. */
export const DIGEST_WINDOW_HOURS = 24;
/** The email lists at most this many matches and says how many more there are. */
export const MAX_LISTED = 10;
const MAX_FIELD_LENGTH = 120;

export interface AlertDeps {
  loadSubscribers(): Promise<Array<{ user_id: string; auto_threshold: number }>>;
  loadNewMatches(userId: string, minScore: number, since: Date): Promise<DigestMatch[]>;
  markNotified(applicationIds: string[], at: Date): Promise<void>;
  isGmailConnected(userId: string): Promise<boolean>;
  /** The user's own Gmail address and a token for it (the existing gmail.send permission). */
  getAccessToken(userId: string): Promise<{ accessToken: string; email: string }>;
  buildRaw(email: OutgoingEmail): Promise<string>;
  sendMessage(args: { accessToken: string; raw: string }): Promise<unknown>;
  throttle: DigestThrottle;
  /** The web app's address, for the link in the email. */
  webOrigin: string;
  now(): Date;
  log: Logger;
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD_LENGTH);

export function buildDigest(matches: DigestMatch[], threshold: number, webOrigin: string): { subject: string; text: string } {
  const count = matches.length;
  const listed = matches.slice(0, MAX_LISTED).map((m) => `- ${oneLine(m.title)} at ${oneLine(m.company)} (${m.match_score}% match)`);
  const more = count > MAX_LISTED ? [`...and ${count - MAX_LISTED} more.`] : [];
  const text = [
    `You have ${count} new job ${count === 1 ? 'match' : 'matches'} at or above your ${threshold}% match score.`,
    '',
    ...listed,
    ...more,
    '',
    `Review ${count === 1 ? 'it' : 'them'} in JobLume: ${webOrigin.replace(/\/+$/, '')}/queue`,
    '',
    'You get this email because "Email me about new matches" is switched on in your JobLume Settings. Switch it off there at any time.',
    '',
  ].join('\n');
  return { subject: `JobLume: ${count} new ${count === 1 ? 'match' : 'matches'} to review`, text };
}

/**
 * For every user who opted in: if they have new matches at or above their threshold, send ONE digest to their own
 * Gmail address. At most one per user per hour, and never when there is nothing new. A failure for one user does not stop the rest.
 */
export async function runAlertDigest(d: AlertDeps): Promise<{ sent: number; skipped: number; failed: number }> {
  const result = { sent: 0, skipped: 0, failed: 0 };
  const since = new Date(d.now().getTime() - DIGEST_WINDOW_HOURS * 3_600_000);

  for (const subscriber of await d.loadSubscribers()) {
    const userId = subscriber.user_id;
    let throttled = false;
    try {
      if (!(await d.isGmailConnected(userId))) {
        result.skipped++;
        continue;
      }
      const matches = await d.loadNewMatches(userId, subscriber.auto_threshold, since);
      if (matches.length === 0) {
        result.skipped++;
        continue;
      }
      if (!(await d.throttle.acquire(userId))) {
        result.skipped++;
        continue;
      }
      throttled = true;

      const { accessToken, email } = await d.getAccessToken(userId);
      const { subject, text } = buildDigest(matches, subscriber.auto_threshold, d.webOrigin);
      const raw = await d.buildRaw({ from: email, to: email, subject, text });
      await d.sendMessage({ accessToken, raw });
      result.sent++;
      // From here the email is out: the hour stays used even if the marker below fails.
      throttled = false;
      try {
        await d.markNotified(matches.map((m) => m.id), d.now());
      } catch (err) {
        d.log.error({ err, userId }, 'digest sent but its matches could not be marked');
      }
    } catch (err) {
      result.failed++;
      d.log.warn({ err, userId }, 'new-match digest failed');
      if (throttled) {
        try {
          await d.throttle.release(userId);
        } catch (releaseErr) {
          d.log.warn({ err: releaseErr, userId }, 'could not release the digest hour');
        }
      }
    }
  }
  return result;
}
```

In `server/src/queues.ts`:

1. Add `, alerts: 'alerts'` to the `QUEUES` object, so it ends `..., fetchJob: 'fetch-job', alerts: 'alerts' } as const;`.
2. Insert above `export type SendJobData =`:

```ts
/** The new-match email digest: one repeating job that looks at every user who opted in. */
export type AlertsJobData = { kind: 'digest' };
```

3. In `createQueues`, add after the `fetchJob:` line:

```ts
    // One attempt: a failed digest is simply tried again by the next scheduled run.
    alerts: new Queue<AlertsJobData>(QUEUES.alerts, { connection, defaultJobOptions: { ...BASE_JOB_OPTIONS, attempts: 1 } }),
```

In `server/src/worker/index.ts`:

1. In the `from '../queues.js'` import add `type AlertsJobData,` before `type FetchJobData,`.
2. Add these imports above the `import { findJobIdByUrl, findSeenUrls, insertJobs, saveJob } from '../services/jobs/repo.js';` line:

```ts
import { runAlertDigest } from '../services/alerts/digest.js';
import { createAlertRepo } from '../services/alerts/repo.js';
import { createDigestThrottle } from '../services/alerts/throttle.js';
import { buildRawMessage } from '../services/gmail/mime.js';
import { sendGmailMessage } from '../services/gmail/send.js';
```

3. Directly above `  const jobFetches = createJobFetchesRepo(db);` insert:

```ts
  const alertRepo = createAlertRepo(db);
  const digestThrottle = createDigestThrottle(lockRedis);
  const alertsWorker = new Worker<AlertsJobData>(
    QUEUES.alerts,
    async () =>
      runAlertDigest({
        ...alertRepo,
        isGmailConnected: (userId) => gmailTokens.isConnected(userId),
        getAccessToken: (userId) => gmailTokens.getAccessToken(userId),
        buildRaw: buildRawMessage,
        sendMessage: ({ accessToken, raw }) => sendGmailMessage({ accessToken, raw }),
        throttle: digestThrottle,
        webOrigin: env.WEB_ORIGIN,
        now: () => new Date(),
        log: logger,
      }),
    { connection: createRedis(env.UPSTASH_REDIS_URL), concurrency: 1, ...idleTuning },
  );

```

4. In the `for (const w of [scrapeWorker, ... fetchJobWorker]) {` line add `, alertsWorker` before the closing `]`.
5. Directly above `  await queues.followups.upsertJobScheduler('followup-scan',` add:

```ts
  // Look for new matches to email about every 15 minutes; each user still gets at most one email an hour.
  await queues.alerts.upsertJobScheduler('alert-digest', { every: 15 * 60 * 1000 }, { name: 'alerts', data: { kind: 'digest' } });
```

6. In `shutdown`, add `alertsWorker.close()` after `fetchJobWorker.close()` in the first `Promise.allSettled([...])`, and `queues.alerts.close()` after `queues.fetchJob.close()` in the second.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx tsc -p tsconfig.json && npx vitest run`
Expected: no type errors; all server test files pass (`Test Files  89 passed`).

- [ ] **Step 5: Commit**

```bash
git add server/src server/tests
git commit -m "feat(server): opt-in new-match email digest to the user's own Gmail address" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 9: Web: "Posted X ago", newest first, Last scan card, new-match email setting

**Files:**
- Create: `web/src/lib/scan.ts`, `web/src/components/jobs/LastScanCard.tsx`
- Modify: `web/src/lib/format.ts`, `web/src/lib/applications.ts`, `web/src/lib/profile-form.ts`, `web/src/components/applications/ApplicationCard.tsx`, `web/src/components/profile/SettingsForm.tsx`, `web/src/lib/api/endpoints.ts`, `web/src/hooks/api.ts`, `web/src/app/(app)/queue/page.tsx`
- Create: `web/tests/lib/scan.test.ts`, `web/tests/components/last-scan-card.test.tsx`, `web/tests/lib/api-endpoints-phase6.test.ts`
- Modify: `web/tests/lib/format.test.ts`, `web/tests/lib/applications.test.ts`, `web/tests/components/application-card.test.tsx`, `web/tests/components/settings-form.test.tsx`, `web/tests/lib/profile-form.test.ts`

**Interfaces:**
- Consumes: `ScanRun`, `ScanStatus`, `Profile.notify_new_matches`, `JobSummary.posted_at` (Task 1); `GET /scan/status` (Task 4); `PUT /profile` accepting `notify_new_matches` (Task 1); `formatRelative`, `sourceLabel` (existing in `web/src/lib/format.ts`).
- Produces:
  - `postedLabel(createdAt: string, postedAt: string | null | undefined, now?: Date): string` in `web/src/lib/format.ts`: `"Posted 3 hours ago"` with a posted time, else `"Found 3 hours ago"`, else `''`.
  - `postedKey(a)`, `sortNewest(items)` in `web/src/lib/applications.ts`; `splitQueue` now orders each tab newest first.
  - `describeScanRun(run: ScanRun, now?: Date): string`, `describeWorker(status, now?): string` in `web/src/lib/scan.ts`.
  - `LastScanCard({ status: ScanStatus | undefined; now?: Date })`.
  - `api.getScanStatus(): Promise<ScanStatus>`, `keys.scanStatus`, `useScanStatus()` (refetches every 60 seconds).
  - `SettingsValues.notifyNewMatches: boolean`; `buildSettingsPatch` includes `notify_new_matches`; `profileToSettingsValues` maps it.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/lib/scan.test.ts`:

```ts
import type { ScanRun } from '@joblume/shared';
import { describe, expect, it } from 'vitest';
import { describeScanRun, describeWorker } from '@/lib/scan';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const run = (over: Partial<ScanRun> = {}): ScanRun => ({
  source: 'myjobmag', started_at: '2026-10-20T11:46:00.000Z', finished_at: '2026-10-20T11:48:00.000Z', status: 'ok', error: null,
  listed: 35, new_count: 6, inserted: 6, rejected_title: 3, rejected_location: 1, ...over,
});

describe('describeScanRun', () => {
  it('lists what the scan found, added and skipped, by reason', () => {
    expect(describeScanRun(run(), NOW)).toBe('12 min ago · 35 listed · 6 new · 6 added · skipped 4 (3 by title, 1 by location)');
  });

  it('leaves out the skipped part when nothing was skipped', () => {
    expect(describeScanRun(run({ rejected_title: 0, rejected_location: 0 }), NOW)).toBe('12 min ago · 35 listed · 6 new · 6 added');
  });

  it('says why a scan failed', () => {
    expect(describeScanRun(run({ status: 'failed', error: 'HTTP 403 for https://www.myjobmag.com/jobs' }), NOW)).toBe(
      '12 min ago · failed: HTTP 403 for https://www.myjobmag.com/jobs',
    );
    expect(describeScanRun(run({ status: 'failed', error: null }), NOW)).toBe('12 min ago · failed: unknown error');
  });

  it('copes with a time it cannot read', () => {
    expect(describeScanRun(run({ finished_at: 'garbage' }), NOW)).toMatch(/^time unknown · 35 listed/);
  });
});

describe('describeWorker', () => {
  it('says the worker is running', () => {
    expect(describeWorker({ worker_alive: true, worker_last_seen: '2026-10-20T11:59:00.000Z' }, NOW)).toBe('Worker running');
  });

  it('says it is not running, with when it was last seen if known', () => {
    expect(describeWorker({ worker_alive: false, worker_last_seen: '2026-10-20T10:00:00.000Z' }, NOW)).toBe(
      'Worker not running (last seen 2 hours ago). New jobs are not being checked until it is started.',
    );
    expect(describeWorker({ worker_alive: false, worker_last_seen: null }, NOW)).toBe(
      'Worker not running. New jobs are not being checked until it is started.',
    );
  });
});
```

Create `web/tests/components/last-scan-card.test.tsx`:

```tsx
import type { ScanRun, ScanStatus } from '@joblume/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LastScanCard } from '@/components/jobs/LastScanCard';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const run = (over: Partial<ScanRun> = {}): ScanRun => ({
  source: 'myjobmag', started_at: '2026-10-20T11:46:00.000Z', finished_at: '2026-10-20T11:48:00.000Z', status: 'ok', error: null,
  listed: 35, new_count: 6, inserted: 6, rejected_title: 3, rejected_location: 1, ...over,
});
const status = (over: Partial<ScanStatus> = {}): ScanStatus => ({ worker_alive: true, worker_last_seen: '2026-10-20T11:59:00.000Z', runs: [run()], ...over });

describe('LastScanCard', () => {
  it('shows nothing until the status has loaded', () => {
    const { container } = render(<LastScanCard status={undefined} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows each source with its counts and the worker as running', () => {
    render(
      <LastScanCard
        now={NOW}
        status={status({ runs: [run(), run({ source: 'remoteok', listed: 99, new_count: 12, inserted: 12, rejected_title: 10, rejected_location: 0 })] })}
      />,
    );
    const card = screen.getByRole('region', { name: 'Last scan' });
    expect(within(card).getByText('Worker running')).toBeInTheDocument();
    expect(within(card).getByText('MyJobMag')).toBeInTheDocument();
    expect(within(card).getByText('12 min ago · 35 listed · 6 new · 6 added · skipped 4 (3 by title, 1 by location)')).toBeInTheDocument();
    expect(within(card).getByText('RemoteOK')).toBeInTheDocument();
    expect(within(card).getByText('12 min ago · 99 listed · 12 new · 12 added · skipped 10 (10 by title, 0 by location)')).toBeInTheDocument();
  });

  it('warns when the worker is not running', () => {
    render(<LastScanCard now={NOW} status={status({ worker_alive: false, worker_last_seen: null })} />);
    const card = screen.getByRole('region', { name: 'Last scan' });
    expect(within(card).getByText('Worker not running')).toBeInTheDocument();
    expect(within(card).getByText(/New jobs are not being checked until it is started/)).toBeInTheDocument();
  });

  it('shows a failed source with its reason', () => {
    render(<LastScanCard now={NOW} status={status({ runs: [run({ status: 'failed', error: 'HTTP 403 for https://www.myjobmag.com/jobs' })] })} />);
    expect(screen.getByText(/failed: HTTP 403 for https:\/\/www\.myjobmag\.com\/jobs/)).toBeInTheDocument();
  });

  it('says so when no scan has finished yet', () => {
    render(<LastScanCard now={NOW} status={status({ runs: [] })} />);
    expect(screen.getByText(/No scan has finished yet/)).toBeInTheDocument();
  });
});
```

Create `web/tests/lib/api-endpoints-phase6.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@/lib/api/client';
import { createApi } from '@/lib/api/endpoints';

describe('Phase 6 API calls', () => {
  it('getScanStatus reads /scan/status', async () => {
    const request = vi.fn().mockResolvedValue({ worker_alive: true, worker_last_seen: null, runs: [] });
    const api = createApi(request as unknown as ApiClient);
    await api.getScanStatus();
    expect(request).toHaveBeenLastCalledWith('/scan/status');
  });
});
```

In `web/tests/lib/format.test.ts` change the import to `import { COLUMN_LABELS, formatShortDate, postedLabel, sourceLabel } from '@/lib/format';` and append at the end of the file:

```ts

describe('postedLabel', () => {
  const now = new Date('2026-10-20T12:00:00.000Z');

  it('says "Posted" with the posted time from the source when there is one', () => {
    expect(postedLabel('2026-10-20T11:00:00.000Z', '2026-10-19T12:00:00.000Z', now)).toBe('Posted 1 day ago');
  });

  it('falls back to "Found" with when the application was created', () => {
    expect(postedLabel('2026-10-20T10:00:00.000Z', null, now)).toBe('Found 2 hours ago');
    expect(postedLabel('2026-10-20T10:00:00.000Z', undefined, now)).toBe('Found 2 hours ago');
    expect(postedLabel('2026-10-20T10:00:00.000Z', 'not a date', now)).toBe('Found 2 hours ago');
  });

  it('is empty when neither time can be read', () => {
    expect(postedLabel('garbage', null, now)).toBe('');
  });
});
```

In `web/tests/lib/applications.test.ts` change the import block to also import `postedKey` and `sortNewest`:

```ts
import {
  applyStatusLocal, buildTextPatch, groupByColumn, postedKey, previewText, queueTab, resolveDrop, scoreTone, sortByScore, sortNewest, splitQueue,
} from '@/lib/applications';
```

and append at the end of the file:

```ts

describe('sortNewest', () => {
  const posted = (posted_at: string | null) => ({ title: 'T', company: 'C', location: '', source: 'x', url: 'https://x', company_domain: null, posted_at });

  it('uses the posted time from the source when there is one, else the time the application was created', () => {
    expect(postedKey(app({ created_at: '2026-10-05T00:00:00.000Z', job: posted('2026-10-01T00:00:00.000Z') }))).toBe('2026-10-01T00:00:00.000Z');
    expect(postedKey(app({ created_at: '2026-10-05T00:00:00.000Z', job: posted(null) }))).toBe('2026-10-05T00:00:00.000Z');
    expect(postedKey(app({ created_at: '2026-10-05T00:00:00.000Z', job: null }))).toBe('2026-10-05T00:00:00.000Z');
  });

  it('puts the newest posting first even when a better match is older, without changing the input', () => {
    const input = [
      app({ id: 'old-best', match_score: 99, created_at: '2026-10-10T00:00:00.000Z', job: posted('2026-10-01T00:00:00.000Z') }),
      app({ id: 'fresh', match_score: 60, created_at: '2026-10-10T00:00:00.000Z', job: posted('2026-10-09T00:00:00.000Z') }),
      app({ id: 'no-date', match_score: 70, created_at: '2026-10-08T00:00:00.000Z', job: null }),
    ];
    const copy = [...input];
    expect(sortNewest(input).map((a) => a.id)).toEqual(['fresh', 'no-date', 'old-best']);
    expect(input).toEqual(copy);
  });

  it('compares times, not text, so different ISO spellings of one instant tie', () => {
    const items = [
      app({ id: 'a', match_score: 50, created_at: '2026-10-10T00:00:00.000Z', job: posted('2026-10-09T10:00:00+00:00') }),
      app({ id: 'b', match_score: 80, created_at: '2026-10-10T00:00:00.000Z', job: posted('2026-10-09T10:00:00.000Z') }),
    ];
    expect(sortNewest(items).map((a) => a.id)).toEqual(['b', 'a']);
  });

  it('splitQueue sorts each tab newest first', () => {
    const groups = splitQueue([
      app({ id: 'p-old', created_at: '2026-10-01T00:00:00.000Z', match_score: 95 }),
      app({ id: 'p-new', created_at: '2026-10-09T00:00:00.000Z', match_score: 55 }),
      app({ id: 'r-old', status: 'approved', created_at: '2026-10-02T00:00:00.000Z' }),
      app({ id: 'r-new', status: 'approved', created_at: '2026-10-08T00:00:00.000Z' }),
    ]);
    expect(groups.pending.map((a) => a.id)).toEqual(['p-new', 'p-old']);
    expect(groups.ready.map((a) => a.id)).toEqual(['r-new', 'r-old']);
  });
});
```

In `web/tests/components/application-card.test.tsx` insert, just above the test named `copes with a missing job and no score`:

```tsx
  it('shows when the source says the job was posted', () => {
    const posted = new Date(Date.now() - 3 * 3_600_000).toISOString();
    render(<ApplicationCard app={app({ job: { title: 'Data Analyst', company: 'Acme Ltd', location: 'Lagos', source: 'remoteok', url: 'https://example.com/job/1', company_domain: null, posted_at: posted } })} onOpen={() => {}} />);
    expect(screen.getByText('Posted 3 hours ago')).toBeInTheDocument();
  });

  it('falls back to when the application was found when the source gives no posted time', () => {
    const created = new Date(Date.now() - 2 * 86_400_000).toISOString();
    render(<ApplicationCard app={app({ created_at: created })} onOpen={() => {}} />);
    expect(screen.getByText('Found 2 days ago')).toBeInTheDocument();
  });

```

In `web/tests/components/settings-form.test.tsx`:

1. Replace the `initial` line with `const initial: SettingsValues = { applyMode: 'manual', autoThreshold: '80', dailyCap: '20', autoFollowup: false, notifyNewMatches: false };`.
2. In the test `submits changed settings`, replace the expectation with `expect(onSubmit).toHaveBeenCalledWith({ apply_mode: 'auto', auto_threshold: 80, daily_cap: 10, auto_followup: true, notify_new_matches: false });`.
3. Insert above the test `rejects a daily cap above 20`:

```tsx
  it('has the new-match email switch off by default and saves it when ticked', async () => {
    const { onSubmit, user } = setup();
    const box = screen.getByLabelText('Email me about new matches');
    expect(box).not.toBeChecked();
    expect(screen.getByText(/at most one email an hour/i)).toBeInTheDocument();
    expect(screen.getByText(/never includes your CV/i)).toBeInTheDocument();
    await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(onSubmit).toHaveBeenCalledWith({ apply_mode: 'manual', auto_threshold: 80, daily_cap: 20, auto_followup: false, notify_new_matches: true });
  });

```

In `web/tests/lib/profile-form.test.ts`:

1. In the `settings` builder add `notifyNewMatches: false, ` before `...over,` (the line becomes `applyMode: 'manual', autoThreshold: '80', dailyCap: '20', autoFollowup: false, notifyNewMatches: false, ...over,`).
2. In the test `builds a patch from valid values` change the call to `buildSettingsPatch(settings({ applyMode: 'auto', autoThreshold: '85', dailyCap: '10', autoFollowup: true, notifyNewMatches: true }))` and the patch to `{ apply_mode: 'auto', auto_threshold: 85, daily_cap: 10, auto_followup: true, notify_new_matches: true }`.
3. In the `profile to form values` block change the profile literal's `auto_followup: true, updated_at: '',` to `auto_followup: true, notify_new_matches: true, updated_at: '',` and the last expectation to `expect(profileToSettingsValues(profile)).toEqual({ applyMode: 'auto', autoThreshold: '90', dailyCap: '12', autoFollowup: true, notifyNewMatches: true });`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run`
Expected: FAIL: `Failed to resolve import "@/lib/scan"`, `postedLabel` and `sortNewest` are not exported, `getScanStatus is not a function`, the settings tests cannot find `Email me about new matches`.

- [ ] **Step 3: Write the implementation**

Append to `web/src/lib/format.ts`:

```ts

/** "Posted 3 hours ago" from the source's posted time, or "Found 3 hours ago" from when JobLume added it. '' when neither can be read. */
export function postedLabel(createdAt: string, postedAt: string | null | undefined, now: Date = new Date()): string {
  const posted = formatRelative(postedAt ?? null, now);
  if (posted) return `Posted ${posted}`;
  const found = formatRelative(createdAt, now);
  return found ? `Found ${found}` : '';
}
```

In `web/src/lib/applications.ts`, insert this block directly above `export function queueTab(status: ApplicationStatus): QueueTab | null {`:

```ts
/** When the source says the job was posted, else when the application was created. */
export const postedKey = (a: { created_at: string; job?: { posted_at?: string | null } | null }): string => a.job?.posted_at ?? a.created_at;

const timeOf = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** Newest posting first; a tie goes to the better match, then the newer application. Does not change the input. */
export function sortNewest<T extends { match_score: number | null; created_at: string; job?: { posted_at?: string | null } | null }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      timeOf(postedKey(b)) - timeOf(postedKey(a)) ||
      (b.match_score ?? -1) - (a.match_score ?? -1) ||
      timeOf(b.created_at) - timeOf(a.created_at),
  );
}

```

and in `splitQueue` replace `for (const app of sortByScore(apps)) {` with `for (const app of sortNewest(apps)) {` (only inside `splitQueue`; `groupByColumn` keeps `sortByScore`).

Create `web/src/lib/scan.ts`:

```ts
import type { ScanRun, ScanStatus } from '@joblume/shared';
import { formatRelative } from './format';

/** One line about one source's latest scan, without the source's name: "12 min ago · 35 listed · 6 new · 6 added · skipped 4 (3 by title, 1 by location)". */
export function describeScanRun(run: ScanRun, now: Date = new Date()): string {
  const when = formatRelative(run.finished_at, now) || 'time unknown';
  if (run.status === 'failed') return `${when} · failed: ${run.error ?? 'unknown error'}`;
  const parts = [when, `${run.listed} listed`, `${run.new_count} new`, `${run.inserted} added`];
  const skipped = run.rejected_title + run.rejected_location;
  if (skipped > 0) parts.push(`skipped ${skipped} (${run.rejected_title} by title, ${run.rejected_location} by location)`);
  return parts.join(' · ');
}

/** Whether the background worker is running, in plain words. */
export function describeWorker(status: Pick<ScanStatus, 'worker_alive' | 'worker_last_seen'>, now: Date = new Date()): string {
  if (status.worker_alive) return 'Worker running';
  const seen = formatRelative(status.worker_last_seen, now);
  return seen
    ? `Worker not running (last seen ${seen}). New jobs are not being checked until it is started.`
    : 'Worker not running. New jobs are not being checked until it is started.';
}
```

Create `web/src/components/jobs/LastScanCard.tsx`:

```tsx
import type { ScanStatus } from '@joblume/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { sourceLabel } from '@/lib/format';
import { describeScanRun, describeWorker } from '@/lib/scan';

export interface LastScanCardProps {
  status: ScanStatus | undefined;
  /** For tests: the time the card measures "ago" from. */
  now?: Date;
}

/** What the last scan of each job source found and discarded, and whether the worker is running. */
export function LastScanCard({ status, now }: LastScanCardProps) {
  if (!status) return null;
  return (
    <Card role="region" aria-label="Last scan">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Last scan</h2>
          <Badge variant={status.worker_alive ? 'success' : 'warning'}>{status.worker_alive ? 'Worker running' : 'Worker not running'}</Badge>
        </div>
        {!status.worker_alive && <p className="text-sm text-muted-foreground">{describeWorker(status, now)}</p>}
        {status.runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scan has finished yet. The first one starts when the worker starts.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {status.runs.map((run) => (
              <li key={run.source} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <span className="w-44 shrink-0 font-medium">{sourceLabel(run.source)}</span>
                <span className={run.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{describeScanRun(run, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

In `web/src/components/applications/ApplicationCard.tsx`: change the format import to `import { postedLabel, sourceLabel, STATUS_LABELS } from '@/lib/format';` and replace `  const posted = formatRelative(app.created_at);` with `  const posted = postedLabel(app.created_at, app.job?.posted_at);`.

In `web/src/lib/api/endpoints.ts`: add `ScanStatus,` after `ProfilePatch,` in the type import, and add after the `listJobFetches` line:

```ts
    getScanStatus: () => request<ScanStatus>('/scan/status'),
```

In `web/src/hooks/api.ts`: add `  scanStatus: ['scan-status'] as const,` after the `jobFetches` key, and insert above `export function useGmailStatus() {`:

```ts
export function useScanStatus() {
  return useQuery({
    queryKey: keys.scanStatus,
    queryFn: () => getApi().getScanStatus(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

```

In `web/src/app/(app)/queue/page.tsx`:

1. Add `import { LastScanCard } from '@/components/jobs/LastScanCard';` after the `AddJobLink` import.
2. Add `useScanStatus,` to the hooks import (after `useRefreshJobs,`).
3. In the `pending` entry of `EMPTY`, change the description to `'New jobs are checked about every 2 hours. Make sure your CV and roles are set in Settings, then check for new jobs.'`.
4. After `const jobFetches = useJobFetches();` add `  const scan = useScanStatus();`.
5. Directly above `<AddJobLink` add `      <LastScanCard status={scan.data} />` followed by a blank line.

In `web/src/lib/profile-form.ts`:

1. In `SettingsValues` add `  notifyNewMatches: boolean;` after `autoFollowup: boolean;`.
2. In `buildSettingsPatch`'s `profilePatchSchema.safeParse({...})` add `    notify_new_matches: values.notifyNewMatches,` after `auto_followup: values.autoFollowup,`.
3. In `profileToSettingsValues` add `    notifyNewMatches: profile.notify_new_matches,` after `autoFollowup: profile.auto_followup,`.

In `web/src/components/profile/SettingsForm.tsx`, insert directly above `      {serverError && (`:

```tsx
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={values.notifyNewMatches} onChange={(e) => set('notifyNewMatches', e.target.checked)} />
        Email me about new matches
      </label>
      <p className="text-xs text-muted-foreground">With this on, JobLume emails you at your connected Gmail address when new matches at or above your threshold are waiting. It sends at most one email an hour, lists job titles, companies and scores with a link to the app, and never includes your CV. Gmail must be connected.</p>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: no type errors; every web test file passes.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): posted time, newest first, Last scan card and new-match email setting" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 10: Mobile: "Posted X ago", newest first, Last scan card, new-match email setting

Keep this task SDK-agnostic (target is Expo SDK 57; this branch carries the SDK-58 code): only existing `react-native` components and the app's own `Card`, `Badge`, `Checkbox`; no new packages or native modules.

**Files:**
- Create: `mobile/src/lib/scan.ts`, `mobile/src/components/queue/LastScanCard.tsx`
- Modify: `mobile/src/lib/format.ts`, `mobile/src/lib/applications.ts`, `mobile/src/lib/profile-form.ts`, `mobile/src/components/applications/ApplicationCard.tsx`, `mobile/src/components/profile/SettingsForm.tsx`, `mobile/src/components/queue/QueueScreen.tsx`, `mobile/src/lib/api/endpoints.ts`, `mobile/src/hooks/api.ts`
- Create: `mobile/tests/lib/scan.test.ts`, `mobile/tests/components/last-scan-card.test.tsx`, `mobile/tests/lib/api-endpoints-phase6.test.ts`
- Modify: `mobile/tests/lib/format.test.ts`, `mobile/tests/lib/applications.test.ts`, `mobile/tests/lib/profile-form.test.ts`, `mobile/tests/components/queue-cards.test.tsx`, `mobile/tests/components/queue-screen.test.tsx`, `mobile/tests/components/refetch-errors.test.tsx`, `mobile/tests/components/settings.test.tsx`

**Interfaces:**
- Consumes: everything Task 9 produces on the server side (`GET /scan/status`, `ScanStatus`, `notify_new_matches`, `posted_at`); the mobile `Card`, `Badge`, `Checkbox`, `Message` components and `formatRelative`, `sourceLabel` in `mobile/src/lib/format.ts`.
- Produces (same names and meanings as the web versions): `postedLabel`, `postedKey`, `sortNewest`, `describeScanRun`, `describeWorker`, `api.getScanStatus`, `keys.scanStatus`, `useScanStatus()`, `LastScanCard({ status, now? })` in `mobile/src/components/queue/LastScanCard.tsx`, `SettingsValues.notifyNewMatches`.

- [ ] **Step 1: Write the failing tests**

Create `mobile/tests/lib/scan.test.ts`:

```ts
import type { ScanRun } from '@joblume/shared';
import { describeScanRun, describeWorker } from '@/lib/scan';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const run = (over: Partial<ScanRun> = {}): ScanRun => ({
  source: 'myjobmag', started_at: '2026-10-20T11:46:00.000Z', finished_at: '2026-10-20T11:48:00.000Z', status: 'ok', error: null,
  listed: 35, new_count: 6, inserted: 6, rejected_title: 3, rejected_location: 1, ...over,
});

describe('describeScanRun', () => {
  it('lists what the scan found, added and skipped, by reason', () => {
    expect(describeScanRun(run(), NOW)).toBe('12 min ago · 35 listed · 6 new · 6 added · skipped 4 (3 by title, 1 by location)');
  });

  it('leaves out the skipped part when nothing was skipped', () => {
    expect(describeScanRun(run({ rejected_title: 0, rejected_location: 0 }), NOW)).toBe('12 min ago · 35 listed · 6 new · 6 added');
  });

  it('says why a scan failed', () => {
    expect(describeScanRun(run({ status: 'failed', error: 'HTTP 403' }), NOW)).toBe('12 min ago · failed: HTTP 403');
    expect(describeScanRun(run({ status: 'failed', error: null }), NOW)).toBe('12 min ago · failed: unknown error');
  });

  it('copes with a time it cannot read', () => {
    expect(describeScanRun(run({ finished_at: 'garbage' }), NOW)).toMatch(/^time unknown · 35 listed/);
  });
});

describe('describeWorker', () => {
  it('says the worker is running', () => {
    expect(describeWorker({ worker_alive: true, worker_last_seen: '2026-10-20T11:59:00.000Z' }, NOW)).toBe('Worker running');
  });

  it('says it is not running, with when it was last seen if known', () => {
    expect(describeWorker({ worker_alive: false, worker_last_seen: '2026-10-20T10:00:00.000Z' }, NOW)).toBe(
      'Worker not running (last seen 2 hours ago). New jobs are not being checked until it is started.',
    );
    expect(describeWorker({ worker_alive: false, worker_last_seen: null }, NOW)).toBe(
      'Worker not running. New jobs are not being checked until it is started.',
    );
  });
});
```

Create `mobile/tests/components/last-scan-card.test.tsx`:

```tsx
import type { ScanRun, ScanStatus } from '@joblume/shared';
import { render, screen } from '@testing-library/react-native';
import { LastScanCard } from '@/components/queue/LastScanCard';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const run = (over: Partial<ScanRun> = {}): ScanRun => ({
  source: 'myjobmag', started_at: '2026-10-20T11:46:00.000Z', finished_at: '2026-10-20T11:48:00.000Z', status: 'ok', error: null,
  listed: 35, new_count: 6, inserted: 6, rejected_title: 3, rejected_location: 1, ...over,
});
const status = (over: Partial<ScanStatus> = {}): ScanStatus => ({ worker_alive: true, worker_last_seen: '2026-10-20T11:59:00.000Z', runs: [run()], ...over });

describe('LastScanCard', () => {
  it('shows nothing until the status has loaded', async () => {
    await render(<LastScanCard status={undefined} now={NOW} />);
    expect(screen.queryByText('Last scan')).toBeNull();
  });

  it('shows each source with its counts and the worker as running', async () => {
    await render(
      <LastScanCard
        now={NOW}
        status={status({ runs: [run(), run({ source: 'remoteok', listed: 99, new_count: 12, inserted: 12, rejected_title: 10, rejected_location: 0 })] })}
      />,
    );
    expect(screen.getByRole('header', { name: 'Last scan' })).toBeOnTheScreen();
    expect(screen.getByText('Worker running')).toBeOnTheScreen();
    expect(screen.getByText('MyJobMag')).toBeOnTheScreen();
    expect(screen.getByText('12 min ago · 35 listed · 6 new · 6 added · skipped 4 (3 by title, 1 by location)')).toBeOnTheScreen();
    expect(screen.getByText('RemoteOK')).toBeOnTheScreen();
    expect(screen.getByText('12 min ago · 99 listed · 12 new · 12 added · skipped 10 (10 by title, 0 by location)')).toBeOnTheScreen();
  });

  it('warns when the worker is not running', async () => {
    await render(<LastScanCard now={NOW} status={status({ worker_alive: false, worker_last_seen: null })} />);
    expect(screen.getByText('Worker not running')).toBeOnTheScreen();
    expect(screen.getByText(/New jobs are not being checked until it is started/)).toBeOnTheScreen();
  });

  it('shows a failed source with its reason', async () => {
    await render(<LastScanCard now={NOW} status={status({ runs: [run({ status: 'failed', error: 'HTTP 403 for https://www.myjobmag.com/jobs' })] })} />);
    expect(screen.getByText('12 min ago · failed: HTTP 403 for https://www.myjobmag.com/jobs')).toBeOnTheScreen();
  });

  it('says so when no scan has finished yet', async () => {
    await render(<LastScanCard now={NOW} status={status({ runs: [] })} />);
    expect(screen.getByText(/No scan has finished yet/)).toBeOnTheScreen();
  });
});
```

Create `mobile/tests/lib/api-endpoints-phase6.test.ts`:

```ts
import type { ApiClient } from '@/lib/api/client';
import { createApi } from '@/lib/api/endpoints';

describe('Phase 6 API calls (mobile)', () => {
  it('getScanStatus reads /scan/status', async () => {
    const request = jest.fn().mockResolvedValue({ worker_alive: true, worker_last_seen: null, runs: [] });
    await createApi(request as unknown as ApiClient).getScanStatus();
    expect(request).toHaveBeenLastCalledWith('/scan/status');
  });
});
```

In `mobile/tests/lib/format.test.ts` change the import to `import { COLUMN_LABELS, formatShortDate, postedLabel, sourceLabel } from '@/lib/format';` and append:

```ts

describe('postedLabel', () => {
  const now = new Date('2026-10-20T12:00:00.000Z');

  it('says "Posted" with the posted time from the source when there is one', () => {
    expect(postedLabel('2026-10-20T11:00:00.000Z', '2026-10-19T12:00:00.000Z', now)).toBe('Posted 1 day ago');
  });

  it('falls back to "Found" with when the application was created', () => {
    expect(postedLabel('2026-10-20T10:00:00.000Z', null, now)).toBe('Found 2 hours ago');
    expect(postedLabel('2026-10-20T10:00:00.000Z', undefined, now)).toBe('Found 2 hours ago');
    expect(postedLabel('2026-10-20T10:00:00.000Z', 'not a date', now)).toBe('Found 2 hours ago');
  });

  it('is empty when neither time can be read', () => {
    expect(postedLabel('garbage', null, now)).toBe('');
  });
});
```

In `mobile/tests/lib/applications.test.ts` change the import block to include `postedKey` and `sortNewest`:

```ts
import {
  applyStatusLocal, buildTextPatch, groupByColumn, postedKey, previewText, queueTab, resolveDrop, scoreTone, sortByScore, sortNewest, splitQueue,
} from '@/lib/applications';
```

and append:

```ts

describe('sortNewest', () => {
  const posted = (posted_at: string | null) => ({ title: 'T', company: 'C', location: '', source: 'x', url: 'https://x', company_domain: null, posted_at });

  it('uses the posted time from the source when there is one, else the time the application was created', () => {
    expect(postedKey(app({ created_at: '2026-10-05T00:00:00.000Z', job: posted('2026-10-01T00:00:00.000Z') }))).toBe('2026-10-01T00:00:00.000Z');
    expect(postedKey(app({ created_at: '2026-10-05T00:00:00.000Z', job: posted(null) }))).toBe('2026-10-05T00:00:00.000Z');
    expect(postedKey(app({ created_at: '2026-10-05T00:00:00.000Z', job: null }))).toBe('2026-10-05T00:00:00.000Z');
  });

  it('puts the newest posting first even when a better match is older, without changing the input', () => {
    const input = [
      app({ id: 'old-best', match_score: 99, created_at: '2026-10-10T00:00:00.000Z', job: posted('2026-10-01T00:00:00.000Z') }),
      app({ id: 'fresh', match_score: 60, created_at: '2026-10-10T00:00:00.000Z', job: posted('2026-10-09T00:00:00.000Z') }),
      app({ id: 'no-date', match_score: 70, created_at: '2026-10-08T00:00:00.000Z', job: null }),
    ];
    const copy = [...input];
    expect(sortNewest(input).map((a) => a.id)).toEqual(['fresh', 'no-date', 'old-best']);
    expect(input).toEqual(copy);
  });

  it('compares times, not text, so different ISO spellings of one instant tie', () => {
    const items = [
      app({ id: 'a', match_score: 50, created_at: '2026-10-10T00:00:00.000Z', job: posted('2026-10-09T10:00:00+00:00') }),
      app({ id: 'b', match_score: 80, created_at: '2026-10-10T00:00:00.000Z', job: posted('2026-10-09T10:00:00.000Z') }),
    ];
    expect(sortNewest(items).map((a) => a.id)).toEqual(['b', 'a']);
  });

  it('splitQueue sorts each tab newest first', () => {
    const groups = splitQueue([
      app({ id: 'p-old', created_at: '2026-10-01T00:00:00.000Z', match_score: 95 }),
      app({ id: 'p-new', created_at: '2026-10-09T00:00:00.000Z', match_score: 55 }),
      app({ id: 'r-old', status: 'approved', created_at: '2026-10-02T00:00:00.000Z' }),
      app({ id: 'r-new', status: 'approved', created_at: '2026-10-08T00:00:00.000Z' }),
    ]);
    expect(groups.pending.map((a) => a.id)).toEqual(['p-new', 'p-old']);
    expect(groups.ready.map((a) => a.id)).toEqual(['r-new', 'r-old']);
  });
});
```

In `mobile/tests/lib/profile-form.test.ts` make the same four edits as for the web file in Task 9 (the `settings` builder gets `notifyNewMatches: false`; the `builds a patch` test uses `notifyNewMatches: true` and expects `notify_new_matches: true`; the profile literal gets `notify_new_matches: true`; the last expectation gets `notifyNewMatches: true`).

In `mobile/tests/components/queue-cards.test.tsx`:

1. Replace `expect(screen.getByText('2 hours ago')).toBeOnTheScreen();` with `expect(screen.getByText('Found 2 hours ago')).toBeOnTheScreen();`.
2. Insert above the test `opens the application from Details`:

```tsx
  it('shows when the source says the job was posted', async () => {
    const job = { title: 'Data Analyst', company: 'Acme', location: 'Lagos', source: 'remoteok', url: 'https://example.com/j', company_domain: null, posted_at: '2026-10-18T09:00:00.000Z' };
    await render(<ApplicationCard app={app({ job })} onOpen={jest.fn()} now={new Date('2026-10-18T12:00:00.000Z')} />);
    expect(screen.getByText('Posted 3 hours ago')).toBeOnTheScreen();
    expect(screen.getByText('RemoteOK')).toBeOnTheScreen();
  });
```

In `mobile/tests/components/queue-screen.test.tsx`:

1. Add `import type { ScanStatus } from '@joblume/shared';` as the first line.
2. In the `jest.mock('@/hooks/api', ...)` list add `  useScanStatus: jest.fn(),` after `useRefreshJobs: jest.fn(),`.
3. Change `function setup() {` to `function setup(scanStatus?: ScanStatus) {` and, in it, add `  mockHooks.useScanStatus.mockReturnValue(ok(scanStatus));` after `mockHooks.useJobFetches.mockReturnValue(ok([]));`.
4. In the test `shows a retry state when the list cannot load` add `    mockHooks.useScanStatus.mockReturnValue(ok(undefined));` after its `useJobFetches` line.
5. Insert above the test `switches to the Ready segment and opens an application`:

```tsx
  it('shows the Last scan card when the status has loaded, and not before', async () => {
    await setup();
    expect(screen.queryByText('Last scan')).toBeNull();
  });

  it('shows what the last scan found and whether the worker is running', async () => {
    await setup({
      worker_alive: true,
      worker_last_seen: new Date().toISOString(),
      runs: [
        {
          source: 'myjobmag', started_at: new Date().toISOString(), finished_at: new Date().toISOString(), status: 'ok', error: null,
          listed: 35, new_count: 6, inserted: 6, rejected_title: 3, rejected_location: 1,
        },
      ],
    });
    expect(screen.getByText('Last scan')).toBeOnTheScreen();
    expect(screen.getByText('Worker running')).toBeOnTheScreen();
    expect(screen.getByText('MyJobMag')).toBeOnTheScreen();
    expect(screen.getByText(/35 listed · 6 new · 6 added · skipped 4/)).toBeOnTheScreen();
  });

```

In `mobile/tests/components/refetch-errors.test.tsx`: add `  useScanStatus: jest.fn(),` after `useRefreshJobs: jest.fn(),` in the mock, and add `  mockHooks.useScanStatus.mockReturnValue(ok(undefined));` after `mockHooks.useJobFetches.mockReturnValue(ok([]));` in `beforeEach`.

In `mobile/tests/components/settings.test.tsx`:

1. Replace the `initial` line with `  const initial = { applyMode: 'manual' as const, autoThreshold: '80', dailyCap: '10', autoFollowup: false, notifyNewMatches: false };`.
2. Replace the expectation in the first test with `expect(onSubmit).toHaveBeenCalledWith({ apply_mode: 'auto', auto_threshold: 90, daily_cap: 10, auto_followup: true, notify_new_matches: false });`.
3. Insert above the test `keeps the daily cap between 1 and 20`:

```tsx
  it('has the new-match email switch off by default and saves it when ticked', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<SettingsForm initial={initial} onSubmit={onSubmit} />);
    expect(screen.getByRole('checkbox', { name: 'Email me about new matches' })).not.toBeChecked();
    expect(screen.getByText(/at most one email an hour/i)).toBeOnTheScreen();
    expect(screen.getByText(/never includes your CV/i)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Email me about new matches' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save settings' }));
    expect(onSubmit).toHaveBeenCalledWith({ apply_mode: 'manual', auto_threshold: 80, daily_cap: 10, auto_followup: false, notify_new_matches: true });
  });

```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd mobile && npx jest`
Expected: FAIL (`Cannot find module '@/lib/scan'`, `@/components/queue/LastScanCard`, `postedLabel`/`sortNewest` not exported, `getScanStatus` not a function, no `Email me about new matches` checkbox).

- [ ] **Step 3: Write the implementation**

Append to `mobile/src/lib/format.ts`:

```ts

/** "Posted 3 hours ago" from the source's posted time, or "Found 3 hours ago" from when JobLume added it. '' when neither can be read. */
export function postedLabel(createdAt: string, postedAt: string | null | undefined, now: Date = new Date()): string {
  const posted = formatRelative(postedAt ?? null, now);
  if (posted) return `Posted ${posted}`;
  const found = formatRelative(createdAt, now);
  return found ? `Found ${found}` : '';
}
```

In `mobile/src/lib/applications.ts`, insert directly above `export function queueTab(status: ApplicationStatus): QueueTab | null {`:

```ts
/** When the source says the job was posted, else when the application was created. */
export const postedKey = (a: { created_at: string; job?: { posted_at?: string | null } | null }): string => a.job?.posted_at ?? a.created_at;

const timeOf = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** Newest posting first; a tie goes to the better match, then the newer application. Does not change the input. */
export function sortNewest<T extends { match_score: number | null; created_at: string; job?: { posted_at?: string | null } | null }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      timeOf(postedKey(b)) - timeOf(postedKey(a)) ||
      (b.match_score ?? -1) - (a.match_score ?? -1) ||
      timeOf(b.created_at) - timeOf(a.created_at),
  );
}

```

and in `splitQueue` replace `for (const app of sortByScore(apps)) {` with `for (const app of sortNewest(apps)) {` (not in `groupByColumn`).

Create `mobile/src/lib/scan.ts`:

```ts
import type { ScanRun, ScanStatus } from '@joblume/shared';
import { formatRelative } from './format';

/** One line about one source's latest scan, without the source's name: "12 min ago · 35 listed · 6 new · 6 added · skipped 4 (3 by title, 1 by location)". */
export function describeScanRun(run: ScanRun, now: Date = new Date()): string {
  const when = formatRelative(run.finished_at, now) || 'time unknown';
  if (run.status === 'failed') return `${when} · failed: ${run.error ?? 'unknown error'}`;
  const parts = [when, `${run.listed} listed`, `${run.new_count} new`, `${run.inserted} added`];
  const skipped = run.rejected_title + run.rejected_location;
  if (skipped > 0) parts.push(`skipped ${skipped} (${run.rejected_title} by title, ${run.rejected_location} by location)`);
  return parts.join(' · ');
}

/** Whether the background worker is running, in plain words. */
export function describeWorker(status: Pick<ScanStatus, 'worker_alive' | 'worker_last_seen'>, now: Date = new Date()): string {
  if (status.worker_alive) return 'Worker running';
  const seen = formatRelative(status.worker_last_seen, now);
  return seen
    ? `Worker not running (last seen ${seen}). New jobs are not being checked until it is started.`
    : 'Worker not running. New jobs are not being checked until it is started.';
}
```

Create `mobile/src/components/queue/LastScanCard.tsx`:

```tsx
import type { ScanStatus } from '@joblume/shared';
import { StyleSheet, Text, View } from 'react-native';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { sourceLabel } from '@/lib/format';
import { describeScanRun, describeWorker } from '@/lib/scan';
import { colors, font, space } from '@/theme';

export interface LastScanCardProps {
  status: ScanStatus | undefined;
  /** For tests: the time the card measures "ago" from. */
  now?: Date;
}

/** What the last scan of each job source found and discarded, and whether the worker is running. */
export function LastScanCard({ status, now }: LastScanCardProps) {
  if (!status) return null;
  return (
    <Card>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>
          Last scan
        </Text>
        <Badge label={status.worker_alive ? 'Worker running' : 'Worker not running'} tone={status.worker_alive ? 'success' : 'warning'} />
      </View>
      {!status.worker_alive ? <Text style={styles.muted}>{describeWorker(status, now)}</Text> : null}
      {status.runs.length === 0 ? (
        <Text style={styles.muted}>No scan has finished yet. The first one starts when the worker starts.</Text>
      ) : (
        status.runs.map((run) => (
          <View key={run.source} style={styles.run}>
            <Text style={styles.source}>{sourceLabel(run.source)}</Text>
            <Text style={run.status === 'failed' ? styles.failed : styles.muted}>{describeScanRun(run, now)}</Text>
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(2) },
  title: { fontSize: font.heading, fontWeight: '600', color: colors.text },
  run: { gap: 2 },
  source: { fontSize: font.small, fontWeight: '600', color: colors.text },
  muted: { fontSize: font.small, color: colors.muted },
  failed: { fontSize: font.small, color: colors.danger },
});
```

In `mobile/src/components/applications/ApplicationCard.tsx`: change the format import to `import { postedLabel, sourceLabel, STATUS_LABELS } from '@/lib/format';` and replace `  const posted = formatRelative(app.created_at, now);` with `  const posted = postedLabel(app.created_at, app.job?.posted_at, now);`.

In `mobile/src/lib/api/endpoints.ts`: add `  type ScanStatus,` after `  type ProfilePatch,` in the import, and after the `listJobFetches` line add:

```ts
    getScanStatus: () => request<ScanStatus>('/scan/status'),
```

In `mobile/src/hooks/api.ts`: add `  scanStatus: ['scan-status'] as const,` after the `jobFetches` key, and insert above `export function useGmailStatus() {`:

```ts
export function useScanStatus() {
  return useQuery({
    queryKey: keys.scanStatus,
    queryFn: () => getApi().getScanStatus(),
    refetchInterval: 60_000,
  });
}

```

In `mobile/src/components/queue/QueueScreen.tsx`:

1. Add `useScanStatus` to the `@/hooks/api` import list.
2. After `import { colors, font, radius, space } from '@/theme';` add `import { LastScanCard } from './LastScanCard';`.
3. In the `pending` entry of `EMPTY` change the description to `'New jobs are checked about every 2 hours. Make sure your CV and roles are set in Settings, then check for new jobs.'`.
4. After `const jobFetches = useJobFetches();` add `  const scan = useScanStatus();`.
5. In `onRefresh`, add `    void scan.refetch();` after `void jobFetches.refetch();`.
6. Directly above the `<Button label={refresh.isPending ? 'Checking…' : 'Check for new jobs'}` line add `      <LastScanCard status={scan.data} />` and a blank line.

In `mobile/src/lib/profile-form.ts` make the same three edits as the web file in Task 9 (`notifyNewMatches` in `SettingsValues`, `notify_new_matches` in `buildSettingsPatch`, mapping in `profileToSettingsValues`).

In `mobile/src/components/profile/SettingsForm.tsx`, insert directly above `      {serverError ? <Message kind="error" text={serverError} /> : null}`:

```tsx
      <Checkbox label="Email me about new matches" checked={values.notifyNewMatches} onChange={(v) => set('notifyNewMatches', v)} />
      <Text style={styles.hint}>
        With this on, JobLume emails you at your connected Gmail address when new matches at or above your threshold are waiting. It sends at most one
        email an hour, lists job titles, companies and scores with a link to the app, and never includes your CV. Gmail must be connected.
      </Text>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd mobile && npx tsc --noEmit -p tsconfig.json && npx jest`
Expected: no type errors; every Jest suite passes.

- [ ] **Step 5: Commit**

```bash
git add mobile
git commit -m "feat(mobile): posted time, newest first, Last scan card and new-match email setting" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Docs, checklist and final verification

**Files:**
- Create: `docs/phase6-manual-checklist.md`
- Modify: `README.md`, `.env.example`

**Interfaces:**
- Consumes: everything above.
- Produces: operator documentation; a green full test and type run.

- [ ] **Step 1: Document the setting**

In `.env.example`, insert directly above the line `# --- Later phases (not used yet) ---`:

```
# --- Job scanning ---
# How often the job boards are scanned, in minutes (at least 30, default 120). Remotive stays at every 6 hours and JSearch at daily.
SCRAPE_EVERY_MINUTES=120

```

In `README.md` replace the line `After the first run, the worker's scheduler keeps running every 6 hours. Deleting the Redis keys resets it.` with:

```
After the first run, the worker's scheduler scans the job boards every `SCRAPE_EVERY_MINUTES` minutes (default 120), Remotive every 6 hours (its own limit is 4 requests a day) and JSearch daily. Deleting the Redis keys resets it.
```

and add this section to `README.md` directly above `## Getting a test token (API only, without the web app)`:

```
## Job discovery (Phase 6)

- **Sources:** MyJobMag and Jobberman (pages 1 to 3), Remotive, RemoteOK, We Work Remotely, Himalayas, Arbeitnow, plus LinkedIn and Indeed through JSearch. Applying to a job is still always your own action.
- **Attribution:** RemoteOK, Remotive, Himalayas, We Work Remotely and Arbeitnow ask for a link back and naming the source. The stored job link is each board's own page and the source name is shown on every card; keep both visible if you change the UI. Do not republish these jobs to other job boards.
- **Last scan:** the queue shows what each source's last scan found, added and skipped (by title or place) and whether the worker is running (`GET /scan/status`).
- **New-match email:** Settings has "Email me about new matches" (off by default). It sends at most one email an hour to your own Gmail address, with job titles, companies, scores and a link, never your CV. Gmail must be connected.
- **Database:** apply `supabase/migrations/0004_discovery.sql` before starting the new server and worker.
- **Test it:** work through `docs/phase6-manual-checklist.md`.

```

In the README `Notes` list, replace `- Remotive jobs must keep their link back and source attribution when shown in the UI.` with `- Remotive, RemoteOK, We Work Remotely, Himalayas and Arbeitnow jobs must keep their link back and source attribution when shown in the UI.`.

Create `docs/phase6-manual-checklist.md`:

```markdown
# Phase 6 manual checklist (job discovery and speed)

The automated tests use fakes only. This checklist runs the real worker, the real boards and your real Supabase project.

## Before starting
- [ ] Open the Supabase SQL editor and run `supabase/migrations/0004_discovery.sql`. It must finish without errors. In Table editor, `scan_runs` exists and shows as "RLS enabled" with no policies; `jobs` has `posted_at`; `profiles` has `notify_new_matches`; `applications` has `notified_at`.
- [ ] Optional: add `SCRAPE_EVERY_MINUTES=120` to `.env` (the default). A value under 30 must stop the server with a message naming `SCRAPE_EVERY_MINUTES`.
- [ ] Run `npm install` and `npm run dev:server`. The worker log says `worker started; job boards every SCRAPE_EVERY_MINUTES (Remotive every 6 hours), JSearch daily`.

## Scans and the Last scan card
- [ ] Within a few minutes each source logs `scrape finished` with `listed`, `newCount`, `fetched`, `inserted` and `rejected`. RemoteOK may take up to a minute; Himalayas up to a minute per search.
- [ ] In Supabase, `scan_runs` has one row per finished scan, with `status` `ok`, or `failed` and a short `error`.
- [ ] Web queue page: a "Last scan" card lists every source with "N min ago, listed, new, added, skipped (by title, by location)" and shows "Worker running". The phone's Queue tab shows the same card.
- [ ] Stop the worker (Ctrl+C). After about 5 minutes the card shows "Worker not running" and the warning text. Start it again: "Worker running" returns within a minute.
- [ ] A source that fails (for example MyJobMag answering 403 to some browser identities) shows a red "failed: HTTP 403 ..." line and the next scan tries again. This is expected behaviour, not a bug in the card.
- [ ] `curl -H "Authorization: Bearer <token>" http://localhost:4000/scan/status` returns `worker_alive`, `worker_last_seen` and `runs`. Without a token it returns 401.

## More jobs
- [ ] New jobs from `remoteok`, `weworkremotely`, `himalayas` and `arbeitnow` appear in the `jobs` table with their own page as `url` and a `posted_at`. MyJobMag and Jobberman jobs also have `posted_at`.
- [ ] With your location set to Remote, "Full Stack Developer", "Software Engineer" or "Backend Developer" style titles (including "Software Developer" and "Fullstack Engineer") now produce queue entries; titles with "Intern" or "Unpaid" do not.
- [ ] A MyJobMag scan reads three listing pages (up to 60 new jobs per scan).

## Freshness
- [ ] Cards show "Posted 3 hours ago" when the board gave a time, or "Found 3 hours ago" when it did not.
- [ ] Inside Pending, Ready and Skipped the newest posting is first, on the web and on the phone. The Tracker board is unchanged.

## New-match email
- [ ] Settings shows "Email me about new matches", off. Tick it and save; reload and it stays ticked.
- [ ] With Gmail connected and a pending application at or above your auto-apply threshold created in the last 24 hours, within 15 minutes one email arrives in your own inbox: subject "JobLume: N new matches to review", job titles, companies and scores, a link to the web queue, and no CV or cover letter text.
- [ ] No second email arrives within the hour, and none when nothing new matched. Unticking the box stops all emails.
- [ ] With Gmail disconnected, no email is sent and the worker log shows no error for it.
```

- [ ] **Step 2: Run the full automated verification**

```bash
npm run typecheck
npm test
```

Expected: the root `typecheck` finishes with no errors in `packages/shared`, `server`, `web` and `mobile`; `npm test` passes in every workspace (no failing test files).

- [ ] **Step 3: Check the plan's requirements against the running system**

Work through `docs/phase6-manual-checklist.md` (needs your Supabase project, Redis, Gmail and network). Record anything that differs.

- [ ] **Step 4: Commit**

```bash
git add README.md .env.example docs/phase6-manual-checklist.md
git commit -m "docs: Phase 6 setup notes and manual checklist" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes (spec coverage)

| Spec item | Task |
|---|---|
| 1 Scan interval, `SCRAPE_EVERY_MINUTES` 120 / min 30, JSearch daily | 5 |
| 2 Smarter prefilter with reason codes | 2 (counted in 4) |
| 3 Pages 1 to 3, caps 60 | 5 |
| 4 Verified feeds with fixtures and attribution links | 6, 7 (verification table at the top) |
| 5 `scan_runs`, `GET /scan/status`, Last scan cards | 1, 4, 9, 10 |
| 6 `jobs.posted_at`, "posted X ago", newest first | 1, 3, 9, 10 |
| 7 Opt-in digest, hourly throttle, own Gmail, no CV text, Settings checkbox | 1, 8, 9, 10 |
| 8 Worker heartbeat and `worker_alive` | 4 |
| Safety: server-write-only tables, polite fetch, no evasion | 1, 4, 5, 6, 7 |
| Testing: fixtures, real-roles table, scan_runs repo and route tests, digest tests, web and mobile card tests | 2, 4, 6, 7, 8, 9, 10 |
