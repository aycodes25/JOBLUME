# JobLume Phase 4 (LinkedIn and Indeed job sources) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let LinkedIn and Indeed jobs enter the queue without scraping their search pages, through the JSearch API and through a job link the user pastes. Applying to these jobs stays manual.

**Architecture:** A new `jsearch` scraper plugs into the existing `Scraper`/`runScrape` pipeline. It uses a small JSearch HTTP client and a Redis monthly quota (the Hunter quota with a key prefix). A pasted link is checked and canonicalised by a shared `canonicalJobUrl` function, recorded in a new `job_fetches` table, and handled by a new `fetch-job` BullMQ queue. The worker opens that one page in a reused stealth Chromium and extracts the job with pure, fixture-tested extractors. It saves the job and queues matching for that user only. The API process never loads Playwright: the worker module loads it with a dynamic `import()`, and a test enforces this. The web queue page gets an "Add a job link" card with the recent fetch list.

**Tech Stack:** Existing stack: Node 20/Express/TypeScript 7, BullMQ and Upstash Redis, Supabase, zod 3, cheerio, Vitest 5, Next.js 16/React 19, React Testing Library, TanStack Query 5. New server dependencies: `playwright@^1.64.1`, `playwright-extra@^4.3.6`, `puppeteer-extra-plugin-stealth@^2.11.2`. These were checked during planning with `npm view` and a scratch install: playwright-extra's peers (`playwright`, `playwright-core`) and the stealth plugin's peers (`playwright-extra`, `puppeteer-extra`) are all optional `*` ranges. `chromium.use(StealthPlugin())` followed by `chromium.launch({ headless: true })` worked, and `navigator.webdriver` was `false` on the page. The dynamic-import launcher in Task 5 typechecks with the repo's TypeScript 7.0.2 (`module: NodeNext`). `playwright` has no install script, so `npm install` never downloads a browser.

## Global Constraints

- Discovery: JSearch API (RapidAPI), optional `JSEARCH_API_KEY`; skipped when absent.
- Paste a link: `POST /jobs/from-url` for LinkedIn/Indeed job URLs; a Playwright (stealth) fetch of that one page in the worker.
- Apply: Always manual for `linkedin` and `indeed`. Auto mode never sends them (existing source rule and send-time re-check stay). Nothing is ever submitted on those sites.
- Out of scope: Easy Apply auto-fill, logging in to LinkedIn/Indeed, crawling search pages, company pages.
- `server/src/scrapers/jsearch.ts` implements the existing `Scraper` interface (`source`, `list()`, `detail()`, optional `detailDelayMs`). `runScrape`, dedupe, match and tailor are unchanged.
- The JSearch scraper queries JSearch using the role/location preferences of the users (union, capped), keeps only results whose publisher is LinkedIn or Indeed, and tags `source` as `linkedin` or `indeed`. The description comes from the JSearch payload, so `detail()` makes no extra request.
- A monthly request counter in Redis (`JSEARCH_MONTHLY_LIMIT`, default 50, per calendar month) is consumed before each request and refunded if the request fails. At the limit the scraper returns an empty list and logs once.
- Errors (401/403/429/5xx/timeouts/malformed body) throw a typed `JSearchError`; a malformed 200 is never treated as "no jobs". The API key travels only in the request header and is never logged.
- `JobSource` gains `'linkedin' | 'indeed'` in shared types, the DB check constraint (migration `0003_job_sources.sql`) and the web labels.
- `POST /jobs/from-url` body `{ url }`, strict zod: https only, host allow-list (`linkedin.com`, `www.linkedin.com`, `indeed.com`, any `*.indeed.com`), path must look like a job page, max 2048 characters, canonicalised (tracking params stripped) before use. Per-user rate limit. Answers 202 `{ queued: true }`, or 200 `{ job_id }` if the canonical URL already exists as a job.
- A new `fetch-job` queue (job id derived from user id and canonical URL, attempts 2). The worker opens the page with Playwright (stealth plugin) in one reused browser, one page at a time, 30 s timeout, random 2 to 5 s delay, closing the page and context in `finally`. It extracts title, company, location, description with defensive selectors/JSON-LD, validates through the same normaliser as other scrapers, inserts the job (source `linkedin`/`indeed`) and enqueues matching for that user only.
- A blocked page, login wall or missing fields fails the job with a reason code (`blocked`, `login_required`, `not_found`, `unparseable`); nothing is inserted. Each request is recorded in a `job_fetches` table (user id, canonical URL, status `queued|done|failed`, reason, job id, timestamps; server-write-only, readable by its owner), exposed through `GET /jobs/fetches` (the signed-in user's 20 most recent). The queue page shows these.
- Playwright is a `server` dependency used only by the worker; the browser binary is installed on the worker host (documented). The API process never imports it. The test suite must never need the browser binary: every test fakes the browser, context and page.
- Web: an "Add a job link" input with an Add button (styled like the existing cards), success and failure messages in plain language, and a small list of the user's recent link fetches with their status. Source labels for `linkedin` and `indeed`. The Approve & Apply panel for these sources keeps the existing assisted flow.
- Testing: fixtures only (saved JSearch JSON, saved LinkedIn and Indeed HTML). Fakes for the HTTP client, Redis and the Playwright page. No live scraping in tests.
- Env: `JSEARCH_API_KEY` (optional), `JSEARCH_MONTHLY_LIMIT` (default 50).
- Repo rules: every query is scoped to the user from the verified token; request bodies use strict zod schemas; never read, print or commit the repo-root `.env` or `web/.env.local`; never commit anything under `.superpowers/`, `node_modules/`, `.next/`, `dist/`, `next-env.d.ts`, `tsconfig.tsbuildinfo` or the untracked `Joblume images/` folder.
- Vitest is v5: never return a value from a `beforeEach`/`afterEach` arrow (use block bodies); typed mocks use the single-generic `vi.fn<FnType>()` form; a `Response` body can be read only once, so fake `fetch` with `mockImplementation(async () => json(...))` (a new Response per call), never `mockResolvedValue(response)`.
- Code in this plan is exact. Backslashes and escapes in regexes and strings (for example `/\s+/g`, `/\\/g`, `'\n'`, `\.`) must be copied literally. Do not "fix" or double them.
- Commit messages end with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (exactly that model name).
- Shell commands use Git Bash syntax from the repo root. Workspace tests: `npm test -w server`, `npm test -w web`, `npm test -w @joblume/shared` (each `pretest` rebuilds the shared package first). Pass a file to run one test file, for example `npm test -w server -- tests/db/migration-0003.test.ts`.

## Decisions made while planning (spec ambiguities resolved)

1. `linkedin`/`indeed` were already allowed by the `jobs.source` check in `0001_init.sql`, by `JobSourceName` in `server/src/db/types.ts`, and by `sourceLabel` in `web/src/lib/format.ts` (with a test). Migration 0003 restates the check (drop if exists, then add) so the list is explicit. The shared package gains `JobSource` and the server type aliases it. The web labels stay as they are.
2. JSearch runs on a **daily** schedule (other sources stay every 6 hours) with at most **2 queries per run**, so the 50-a-month budget lasts most of the month. It is not part of the user's "Check for new jobs" refresh, which stays `myjobmag`/`jobberman` only. When `JSEARCH_API_KEY` is absent the scheduler is removed, and the inert scraper returns `[]` anyway.
3. "Logs once" means once per run: on the first refused `consume()` the scraper logs one warning, stops querying and returns what it has. When the very first request is refused, that is an empty list.
4. A JSearch result is kept only when its publisher is LinkedIn or Indeed **and** its `job_apply_link` (or one of its `apply_options`) canonicalises to a job URL of that same site. Stored URLs are canonical, so a pasted link and a JSearch result for the same job dedupe by URL.
5. A JSearch `auth` error (bad or unsubscribed key) is turned into BullMQ's `UnrecoverableError`, so the scrape job does not retry it. Other JSearch errors keep the normal retries. Each failed request is refunded.
6. "The same normaliser as other scrapers": a new `normaliseJob` in `server/src/domain/jobs.ts` (whitespace tidy, field caps, required title/company/description, http(s) URL) is used by both new sources. The existing three scrapers are not changed (YAGNI, and this avoids changing their behaviour).
7. "Enqueues matching for that user only": a new match job kind `{ kind: 'user-job', userId, jobId }` (`matchUserJob`). It requires the user's CV and no existing application, and it skips the title/location prefilter because the user chose this job. The 200 `{ job_id }` path queues the same match, so the user gets an application whether the job was new or already stored.
8. `job_fetches` has `unique (user_id, url)`. Pasting the same link again resets that row to `queued` (with a fresh `created_at`). The 200 path also records a `done` row, so the link shows in the list.
9. Page-load errors (navigation timeout, network error, HTTP 5xx) are retried once (attempts 2). On the final attempt they are recorded as `blocked`. A reason-coded failure is final straight away (`UnrecoverableError`) so the site is not hit again.
10. Rate limit: 10 links per hour per user. A body that fails the zod schema answers 400 `invalid_request`. A well-formed string that is not an allowed job link answers 400 `unsupported_job_link`, which the web turns into a plain-language message.
11. Canonical forms: LinkedIn is `https://www.linkedin.com/jobs/view/<digits>/`, also built from `currentJobId` on `/jobs/...` pages. Indeed is `https://<host>/viewjob?jk=<16 hex, lowercase>`. The Indeed country subdomain is kept (job keys are per country), and bare `indeed.com` becomes `www.indeed.com`. `https:` only, no credentials, no custom port.
12. When a pasted job's company and title match a job already stored (the existing `dedupe_key`), that stored job is used and no second job is inserted.
13. `createMonthlyQuota` gets an optional fourth `prefix` argument (default `'hunter'`, so existing callers and tests are unchanged). JSearch uses prefix `'jsearch'`.
14. `Scraper.source` widens to `JobSource | 'jsearch'`, so the registry test (`scrapers[source].source === source`) also holds for `jsearch`.

## File Structure

```
supabase/migrations/0003_job_sources.sql                  (new)  jobs.source check restated, job_fetches table
packages/shared/src/job-sources.ts                        (new)  JOB_SOURCES, JobSource, LINK_SOURCES, fetch status/reason types
packages/shared/src/job-links.ts                          (new)  canonicalJobUrl, MAX_JOB_LINK_LENGTH
packages/shared/src/api-types.ts  index.ts                (mod)  JobFetch, AddJobLinkResult, exports
server/src/db/types.ts  lib/env.ts                        (mod)  JobSourceName alias, JSEARCH_* env
server/src/services/email/quota.ts                        (mod)  optional key prefix
server/src/domain/jobs.ts                                 (mod)  normaliseJob, tidyLocation, domainFromWebsite
server/src/scrapers/jsearch-client.ts                     (new)  JSearch HTTP client + JSearchError
server/src/scrapers/jsearch.ts                            (new)  JSearch Scraper + query builder
server/src/scrapers/job-page.ts                           (new)  pure LinkedIn/Indeed page extractor
server/src/scrapers/types.ts  index.ts                    (mod)  'jsearch' source, registry, schedule
server/src/worker/browser.ts                              (new)  reused stealth Chromium page fetcher (only file naming playwright)
server/src/worker/fetch-job.ts                            (new)  runFetchJob + FetchJobError
server/src/worker/match.ts  index.ts                      (mod)  matchUserJob, JSearch + fetch-job wiring
server/src/queues.ts                                      (mod)  fetch-job queue, user-job match kind
server/src/services/jobs/repo.ts                          (mod)  findJobIdByUrl, saveJob
server/src/services/jobs/fetches-repo.ts                  (new)  job_fetches reads/writes
server/src/services/jobs/links.ts                         (new)  addFromUrl / listFetches service
server/src/api/routes/jobs.ts  deps.ts  index.ts          (mod)  POST /jobs/from-url, GET /jobs/fetches
server/tests/... (mirrors src)  server/tests/fixtures/{jsearch-search.json,linkedin-job.html,linkedin-expired.html,indeed-job.html,indeed-blocked.html}
web/src/lib/job-fetches.ts                                (new)  plain-language fetch text
web/src/components/jobs/AddJobLink.tsx                    (new)  Add a job link card + recent list
web/src/lib/api/endpoints.ts  errors.ts  hooks/api.ts  app/(app)/queue/page.tsx  (mod)
README.md  .env.example  docs/phase4-manual-checklist.md  (docs)
```

---

### Task 1: Migration 0003, shared job-source types, env

**Files:**
- Create: `supabase/migrations/0003_job_sources.sql`
- Create: `packages/shared/src/job-sources.ts`
- Modify: `packages/shared/src/api-types.ts`, `packages/shared/src/index.ts`
- Modify: `server/src/db/types.ts:1-4`, `server/src/lib/env.ts:23-24`
- Test: `server/tests/db/migration-0003.test.ts`, `packages/shared/tests/job-sources.test.ts`, `server/tests/lib/env-jsearch.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (`@joblume/shared`): `JOB_SOURCES` (readonly tuple), `type JobSource = 'linkedin' | 'indeed' | 'jobberman' | 'myjobmag' | 'remotive'`, `LINK_SOURCES = ['linkedin', 'indeed']`, `type LinkSource = 'linkedin' | 'indeed'`, `JOB_FETCH_STATUSES`, `type JobFetchStatus = 'queued' | 'done' | 'failed'`, `JOB_FETCH_REASONS`, `type JobFetchReason = 'blocked' | 'login_required' | 'not_found' | 'unparseable'`, `interface JobFetch { id: string; url: string; status: JobFetchStatus; reason: JobFetchReason | null; job_id: string | null; created_at: string; updated_at: string }`, `type AddJobLinkResult = { queued: true } | { job_id: string }`.
- Produces (server): `JobSourceName` is now an alias of shared `JobSource`; `Env` gains `JSEARCH_API_KEY?: string` and `JSEARCH_MONTHLY_LIMIT: number` (default 50).
- Produces (DB): table `public.job_fetches(id, user_id, url, status, reason, job_id, created_at, updated_at, unique (user_id, url))`.

- [ ] **Step 1: Write the failing migration test** in `server/tests/db/migration-0003.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../../supabase/migrations/0003_job_sources.sql', import.meta.url), 'utf8');

describe('migration 0003_job_sources.sql', () => {
  it('keeps linkedin and indeed in the jobs source check', () => {
    expect(sql).toMatch(/drop constraint if exists jobs_source_check/);
    expect(sql).toMatch(/add constraint jobs_source_check\s+check \(source in \('linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive'\)\)/);
  });

  it('creates job_fetches with one row per user and link', () => {
    expect(sql).toMatch(/create table public\.job_fetches/);
    expect(sql).toMatch(/user_id uuid not null references public\.users \(id\) on delete cascade/);
    expect(sql).toMatch(/url text not null/);
    expect(sql).toMatch(/status text not null default 'queued' check \(status in \('queued', 'done', 'failed'\)\)/);
    expect(sql).toMatch(/reason text check \(reason in \('blocked', 'login_required', 'not_found', 'unparseable'\)\)/);
    expect(sql).toMatch(/job_id uuid references public\.jobs \(id\) on delete set null/);
    expect(sql).toMatch(/created_at timestamptz not null default now\(\)/);
    expect(sql).toMatch(/updated_at timestamptz not null default now\(\)/);
    expect(sql).toMatch(/unique \(user_id, url\)/);
    expect(sql).toMatch(/create index job_fetches_user_created_idx on public\.job_fetches \(user_id, created_at desc\)/);
  });

  it('is server-write-only and readable only by its owner', () => {
    expect(sql).toMatch(/alter table public\.job_fetches enable row level security/);
    expect(sql).toMatch(/create policy job_fetches_select_own on public\.job_fetches for select to authenticated using \(user_id = auth\.uid\(\)\)/);
    expect(sql).toMatch(/revoke insert, update, delete on public\.job_fetches from anon, authenticated/);
  });
});
```

- [ ] **Step 2: Write the failing shared and env tests**

`packages/shared/tests/job-sources.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { JOB_FETCH_REASONS, JOB_FETCH_STATUSES, JOB_SOURCES, LINK_SOURCES } from '../src/index.js';

describe('job sources', () => {
  it('lists every source the jobs table accepts', () => {
    expect(JOB_SOURCES).toEqual(['linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive']);
  });

  it('marks LinkedIn and Indeed as the link sources', () => {
    expect(LINK_SOURCES).toEqual(['linkedin', 'indeed']);
    for (const s of LINK_SOURCES) expect(JOB_SOURCES).toContain(s);
  });

  it('has the fetch statuses and the four failure reasons', () => {
    expect(JOB_FETCH_STATUSES).toEqual(['queued', 'done', 'failed']);
    expect(JOB_FETCH_REASONS).toEqual(['blocked', 'login_required', 'not_found', 'unparseable']);
  });
});
```

`server/tests/lib/env-jsearch.test.ts`:

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

describe('loadEnv: JSearch', () => {
  it('leaves JSearch off by default with a monthly limit of 50', () => {
    const env = loadEnv(valid);
    expect(env.JSEARCH_API_KEY).toBeUndefined();
    expect(env.JSEARCH_MONTHLY_LIMIT).toBe(50);
  });

  it('reads the key and a custom limit', () => {
    const env = loadEnv({ ...valid, JSEARCH_API_KEY: 'rapid-key', JSEARCH_MONTHLY_LIMIT: '10' });
    expect(env.JSEARCH_API_KEY).toBe('rapid-key');
    expect(env.JSEARCH_MONTHLY_LIMIT).toBe(10);
  });

  it('treats blank values as unset', () => {
    const env = loadEnv({ ...valid, JSEARCH_API_KEY: '  ', JSEARCH_MONTHLY_LIMIT: '' });
    expect(env.JSEARCH_API_KEY).toBeUndefined();
    expect(env.JSEARCH_MONTHLY_LIMIT).toBe(50);
  });

  it('rejects a limit that is not a positive integer', () => {
    expect(() => loadEnv({ ...valid, JSEARCH_MONTHLY_LIMIT: '0' })).toThrowError(/JSEARCH_MONTHLY_LIMIT/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -w server -- tests/db/migration-0003.test.ts tests/lib/env-jsearch.test.ts`
Expected: FAIL. The migration test fails with `ENOENT: no such file or directory` for `0003_job_sources.sql`, and the env tests fail with `expected undefined to be 50`.

Run: `npm test -w @joblume/shared -- tests/job-sources.test.ts`
Expected: FAIL. `JOB_SOURCES` is undefined (`expected undefined to deeply equal [...]`).

- [ ] **Step 4: Write the migration** `supabase/migrations/0003_job_sources.sql`

```sql
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
```

- [ ] **Step 5: Add the shared types**

Create `packages/shared/src/job-sources.ts`:

```ts
export const JOB_SOURCES = ['linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive'] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

/** Sources whose jobs only arrive through JSearch or a pasted link. Applying to them is always manual. */
export const LINK_SOURCES = ['linkedin', 'indeed'] as const;
export type LinkSource = (typeof LINK_SOURCES)[number];

export const JOB_FETCH_STATUSES = ['queued', 'done', 'failed'] as const;
export type JobFetchStatus = (typeof JOB_FETCH_STATUSES)[number];

export const JOB_FETCH_REASONS = ['blocked', 'login_required', 'not_found', 'unparseable'] as const;
export type JobFetchReason = (typeof JOB_FETCH_REASONS)[number];
```

In `packages/shared/src/api-types.ts`, replace the first line

```ts
import type { ApplicationStatus } from './status.js';
```

with

```ts
import type { JobFetchReason, JobFetchStatus } from './job-sources.js';
import type { ApplicationStatus } from './status.js';
```

and append at the end of the file:

```ts

/** One job link the user pasted, as listed by GET /jobs/fetches. */
export interface JobFetch {
  id: string;
  url: string;
  status: JobFetchStatus;
  reason: JobFetchReason | null;
  job_id: string | null;
  created_at: string;
  updated_at: string;
}

/** POST /jobs/from-url: 202 { queued: true } for a new link, 200 { job_id } when the job is already stored. */
export type AddJobLinkResult = { queued: true } | { job_id: string };
```

In `packages/shared/src/index.ts`, append:

```ts
export * from './job-sources.js';
```

- [ ] **Step 6: Alias the server type and add the env vars**

In `server/src/db/types.ts`, replace lines 1-4

```ts
import type { ApplicationStatus, EmailCandidate } from '@joblume/shared';
export type { ApplicationStatus };

export type JobSourceName = 'linkedin' | 'indeed' | 'jobberman' | 'myjobmag' | 'remotive';
```

with

```ts
import type { ApplicationStatus, EmailCandidate, JobSource } from '@joblume/shared';
export type { ApplicationStatus };

export type JobSourceName = JobSource;
```

In `server/src/lib/env.ts`, replace

```ts
  HUNTER_MONTHLY_LIMIT: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(25)),
});
```

with

```ts
  HUNTER_MONTHLY_LIMIT: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(25)),
  JSEARCH_API_KEY: optionalString,
  JSEARCH_MONTHLY_LIMIT: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(50)),
});
```

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npm test -w @joblume/shared -- tests/job-sources.test.ts`
Expected: PASS (3 tests).

Run: `npm test -w server -- tests/db/migration-0003.test.ts tests/lib/env-jsearch.test.ts tests/api/shared-compat.test.ts`
Expected: PASS (all tests in the three files).

Run: `npm run typecheck -w server`
Expected: exits 0 with no errors.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0003_job_sources.sql packages/shared/src/job-sources.ts packages/shared/src/api-types.ts packages/shared/src/index.ts packages/shared/tests/job-sources.test.ts server/src/db/types.ts server/src/lib/env.ts server/tests/db/migration-0003.test.ts server/tests/lib/env-jsearch.test.ts
git commit -m "$(cat <<'EOF'
feat(db): job_fetches table, shared job-source types and JSearch env

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Job link allow-list and canonicalisation (shared)

**Files:**
- Create: `packages/shared/src/job-links.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/tests/job-links.test.ts`

**Interfaces:**
- Consumes: `type LinkSource` from Task 1 (`./job-sources.js`).
- Produces (`@joblume/shared`): `MAX_JOB_LINK_LENGTH = 2048`, `interface JobLink { url: string; source: LinkSource }`, `canonicalJobUrl(raw: unknown): JobLink | null`. Used by the JSearch scraper (Task 4), the API route (Task 7) and the web form (Task 8).

- [ ] **Step 1: Write the failing test** in `packages/shared/tests/job-links.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { canonicalJobUrl, MAX_JOB_LINK_LENGTH } from '../src/index.js';

describe('canonicalJobUrl: LinkedIn', () => {
  const canonical = 'https://www.linkedin.com/jobs/view/4012345678/';
  it.each([
    ['the canonical form', 'https://www.linkedin.com/jobs/view/4012345678/'],
    ['no trailing slash', 'https://www.linkedin.com/jobs/view/4012345678'],
    ['the bare host, a slug and tracking params', 'https://linkedin.com/jobs/view/data-analyst-at-acme-4012345678?trk=public_jobs&refId=abc%3D%3D'],
    ['tracking params and a fragment', 'https://www.linkedin.com/jobs/view/4012345678/?trackingId=x#top'],
    ['a search page with a selected job', 'https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=data'],
    ['a collection page with a selected job', 'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678'],
    ['spaces and upper case in the host', '  https://WWW.LinkedIn.com/jobs/view/4012345678/  '],
  ])('accepts %s', (_name, input) => {
    expect(canonicalJobUrl(input)).toEqual({ url: canonical, source: 'linkedin' });
  });
});

describe('canonicalJobUrl: Indeed', () => {
  it.each([
    ['https://ng.indeed.com/viewjob?jk=0123456789abcdef&from=serp', 'https://ng.indeed.com/viewjob?jk=0123456789abcdef'],
    ['https://indeed.com/viewjob?jk=0123456789ABCDEF', 'https://www.indeed.com/viewjob?jk=0123456789abcdef'],
    ['https://www.indeed.com/rc/clk?jk=0123456789abcdef&fccid=x&vjs=3', 'https://www.indeed.com/viewjob?jk=0123456789abcdef'],
    ['https://uk.indeed.com/m/viewjob?jk=0123456789abcdef', 'https://uk.indeed.com/viewjob?jk=0123456789abcdef'],
    ['https://www.indeed.com/jobs?q=analyst&l=Lagos&vjk=0123456789abcdef', 'https://www.indeed.com/viewjob?jk=0123456789abcdef'],
    ['https://www.indeed.com/q-data-analyst-jobs.html?vjk=0123456789abcdef', 'https://www.indeed.com/viewjob?jk=0123456789abcdef'],
  ])('canonicalises %s', (input, expected) => {
    expect(canonicalJobUrl(input)).toEqual({ url: expected, source: 'indeed' });
  });
});

describe('canonicalJobUrl: refused', () => {
  it.each([
    ['http (not https)', 'http://www.linkedin.com/jobs/view/4012345678/'],
    ['another job site', 'https://www.glassdoor.com/job-listing/123'],
    ['a look-alike host', 'https://evil-indeed.com/viewjob?jk=0123456789abcdef'],
    ['a host that only starts with the name', 'https://indeed.com.evil.io/viewjob?jk=0123456789abcdef'],
    ['a LinkedIn look-alike', 'https://linkedin.com.evil.io/jobs/view/4012345678/'],
    ['a LinkedIn subdomain that is not allowed', 'https://ng.linkedin.com/jobs/view/4012345678/'],
    ['a LinkedIn profile', 'https://www.linkedin.com/in/ada-lovelace/'],
    ['a LinkedIn company page', 'https://www.linkedin.com/company/acme/jobs/'],
    ['a LinkedIn search without a selected job', 'https://www.linkedin.com/jobs/search/?keywords=data'],
    ['an Indeed search without a selected job', 'https://www.indeed.com/jobs?q=analyst'],
    ['an Indeed company page', 'https://www.indeed.com/cmp/Acme/jobs?jk=0123456789abcdef'],
    ['a malformed Indeed job key', 'https://www.indeed.com/viewjob?jk=nothex'],
    ['credentials in the URL', 'https://user:pw@www.linkedin.com/jobs/view/4012345678/'],
    ['a custom port', 'https://www.linkedin.com:8443/jobs/view/4012345678/'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['text that is not a URL', 'linkedin job 4012345678'],
    ['an empty string', '   '],
  ])('refuses %s', (_name, input) => {
    expect(canonicalJobUrl(input)).toBeNull();
  });

  it.each([undefined, null, 42, {}, ['https://www.linkedin.com/jobs/view/4012345678/']])('refuses the non-string %j', (input) => {
    expect(canonicalJobUrl(input)).toBeNull();
  });

  it('refuses links longer than 2048 characters', () => {
    expect(MAX_JOB_LINK_LENGTH).toBe(2048);
    const long = `https://www.linkedin.com/jobs/view/4012345678/?pad=${'a'.repeat(MAX_JOB_LINK_LENGTH)}`;
    expect(canonicalJobUrl(long)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @joblume/shared -- tests/job-links.test.ts`
Expected: FAIL with `canonicalJobUrl is not a function`.

- [ ] **Step 3: Implement** `packages/shared/src/job-links.ts`

```ts
import type { LinkSource } from './job-sources.js';

export const MAX_JOB_LINK_LENGTH = 2048;

/** A LinkedIn or Indeed job page in its canonical form (tracking parameters removed). */
export interface JobLink {
  url: string;
  source: LinkSource;
}

const LINKEDIN_HOSTS = new Set(['linkedin.com', 'www.linkedin.com']);
const isIndeedHost = (host: string) => host === 'indeed.com' || host.endsWith('.indeed.com');

// /jobs/view/4012345678 or /jobs/view/data-analyst-at-acme-4012345678
const LINKEDIN_VIEW = /^\/jobs\/view\/(?:[^/]*-)?(\d{5,})\/?$/;
const LINKEDIN_JOBS = /^\/jobs(?:\/|$)/;
const LINKEDIN_ID = /^\d{5,}$/;

const INDEED_JOB_PATH = /^\/(?:m\/)?(?:viewjob|rc\/clk|jobs|q-[a-z0-9-]+-jobs\.html)\/?$/i;
const INDEED_KEY = /^[0-9a-f]{16}$/i;

function linkedIn(u: URL): JobLink | null {
  const view = LINKEDIN_VIEW.exec(u.pathname);
  const id = view?.[1] ?? (LINKEDIN_JOBS.test(u.pathname) ? u.searchParams.get('currentJobId') : null);
  if (!id || !LINKEDIN_ID.test(id)) return null;
  return { url: `https://www.linkedin.com/jobs/view/${id}/`, source: 'linkedin' };
}

function indeed(u: URL, host: string): JobLink | null {
  if (!INDEED_JOB_PATH.test(u.pathname)) return null;
  const key = u.searchParams.get('jk') ?? u.searchParams.get('vjk');
  if (!key || !INDEED_KEY.test(key)) return null;
  const canonicalHost = host === 'indeed.com' ? 'www.indeed.com' : host;
  return { url: `https://${canonicalHost}/viewjob?jk=${key.toLowerCase()}`, source: 'indeed' };
}

/** Returns the canonical job link for a LinkedIn or Indeed job page, or null for anything else. */
export function canonicalJobUrl(raw: unknown): JobLink | null {
  if (typeof raw !== 'string') return null;
  const input = raw.trim();
  if (input === '' || input.length > MAX_JOB_LINK_LENGTH) return null;
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.port !== '') return null;
  const host = u.hostname.toLowerCase();
  if (LINKEDIN_HOSTS.has(host)) return linkedIn(u);
  if (isIndeedHost(host)) return indeed(u, host);
  return null;
}
```

In `packages/shared/src/index.ts`, append:

```ts
export * from './job-links.js';
```

- [ ] **Step 4: Run the tests**

Run: `npm test -w @joblume/shared`
Expected: PASS (all shared tests, including the new LinkedIn, Indeed and refused cases).

Run: `npm run typecheck -w @joblume/shared`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/job-links.ts packages/shared/src/index.ts packages/shared/tests/job-links.test.ts
git commit -m "$(cat <<'EOF'
feat(shared): LinkedIn/Indeed job link allow-list and canonical form

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: JSearch client and a prefixed monthly quota

**Files:**
- Create: `server/src/scrapers/jsearch-client.ts`
- Modify: `server/src/services/email/quota.ts`
- Test: `server/tests/scrapers/jsearch-client.test.ts`, `server/tests/email/quota-prefix.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `JSEARCH_HOST = 'jsearch.p.rapidapi.com'`; `interface JSearchQuery { query: string; remote: boolean }`; `interface JSearchJob` (raw JSearch item, all fields `unknown`: `job_id, employer_name, employer_website, job_publisher, job_title, job_description, job_apply_link, job_city, job_state, job_country, job_is_remote, apply_options`); `class JSearchError extends Error { kind: 'auth' | 'rate_limited' | 'timeout' | 'failed' | 'malformed' }`; `createJSearchClient(cfg: { apiKey: string; timeoutMs?: number }, fetchImpl?: typeof fetch): { search(q: JSearchQuery): Promise<JSearchJob[]> }`; `type JSearchClient`.
- Produces: `createMonthlyQuota(redis, limit, now?, prefix = 'hunter')`, which counts under the key `${prefix}:YYYY-MM`.

- [ ] **Step 1: Write the failing client test** in `server/tests/scrapers/jsearch-client.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import { createJSearchClient, JSearchError } from '../../src/scrapers/jsearch-client.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok = { status: 'OK', request_id: 'r1', data: [{ job_id: 'a', job_title: 'Data Analyst' }] };
const onsite = { query: 'data analyst in Lagos, Nigeria', remote: false };

function client(impl: () => Promise<Response>) {
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(impl);
  return { fetchImpl, api: createJSearchClient({ apiKey: 'SECRET-KEY' }, fetchImpl) };
}

describe('createJSearchClient.search', () => {
  it('searches Nigeria for an on-site query and sends the key only in headers', async () => {
    const { fetchImpl, api } = client(async () => json(ok));
    expect(await api.search(onsite)).toEqual(ok.data);
    const [url, init] = fetchImpl.mock.calls[0]!;
    const u = new URL(String(url));
    expect(u.origin + u.pathname).toBe('https://jsearch.p.rapidapi.com/search');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      query: 'data analyst in Lagos, Nigeria', page: '1', num_pages: '1', date_posted: 'week', country: 'ng',
    });
    expect(String(url)).not.toContain('SECRET-KEY');
    expect(init?.headers).toEqual({ 'x-rapidapi-key': 'SECRET-KEY', 'x-rapidapi-host': 'jsearch.p.rapidapi.com' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('asks for remote jobs without a country', async () => {
    const { fetchImpl, api } = client(async () => json(ok));
    await api.search({ query: 'designer remote', remote: true });
    const u = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(Object.fromEntries(u.searchParams)).toEqual({
      query: 'designer remote', page: '1', num_pages: '1', date_posted: 'week', work_from_home: 'true',
    });
  });

  it('returns an empty list when JSearch really found nothing', async () => {
    const { api } = client(async () => json({ status: 'OK', data: [] }));
    expect(await api.search(onsite)).toEqual([]);
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate_limited'],
    [500, 'failed'],
    [503, 'failed'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    const { api } = client(async () => json({ message: 'nope' }, status));
    await expect(api.search(onsite)).rejects.toMatchObject({ name: 'JSearchError', kind });
  });

  it('maps a timeout to timeout', async () => {
    const { api } = client(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    await expect(api.search(onsite)).rejects.toMatchObject({ name: 'JSearchError', kind: 'timeout' });
  });

  it('maps a network failure to failed and never puts the key in the error', async () => {
    const { api } = client(async () => {
      throw new TypeError('fetch failed for SECRET-KEY');
    });
    const err = await api.search(onsite).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JSearchError);
    expect((err as JSearchError).kind).toBe('failed');
    expect((err as JSearchError).message).not.toContain('SECRET-KEY');
    expect(JSON.stringify(err)).not.toContain('SECRET-KEY');
  });

  it.each([
    ['a body that is not JSON', () => new Response('<html>oops</html>', { status: 200 })],
    ['an empty object', () => json({})],
    ['data that is not a list', () => json({ status: 'OK', data: {} })],
    ['null data', () => json({ status: 'OK', data: null })],
    ['a bare list', () => json([])],
  ])('treats a 200 with %s as malformed, never as no jobs', async (_name, make) => {
    const { api } = client(async () => make());
    await expect(api.search(onsite)).rejects.toMatchObject({ name: 'JSearchError', kind: 'malformed' });
  });

  it('treats a 200 whose status is not OK as failed', async () => {
    const { api } = client(async () => json({ status: 'ERROR', data: [] }));
    await expect(api.search(onsite)).rejects.toMatchObject({ kind: 'failed' });
  });
});
```

- [ ] **Step 2: Write the failing quota test** in `server/tests/email/quota-prefix.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { createMonthlyQuota } from '../../src/services/email/quota.js';

function fakeRedis() {
  const store = new Map<string, number>();
  const expires = new Map<string, number>();
  return {
    store, expires,
    async incr(key: string) { const n = (store.get(key) ?? 0) + 1; store.set(key, n); return n; },
    async decr(key: string) { const n = (store.get(key) ?? 0) - 1; store.set(key, n); return n; },
    async expire(key: string, seconds: number) { expires.set(key, seconds); return 1; },
  };
}

const now = () => new Date('2026-10-18T10:00:00Z');

describe('createMonthlyQuota with a key prefix', () => {
  it('counts JSearch calls under their own monthly key, apart from Hunter', async () => {
    const redis = fakeRedis();
    const jsearch = createMonthlyQuota(redis, 1, now, 'jsearch');
    const hunter = createMonthlyQuota(redis, 1, now);
    expect(await jsearch.consume()).toBe(true);
    expect(await jsearch.consume()).toBe(false);
    expect(await hunter.consume()).toBe(true);
    expect(redis.store.get('jsearch:2026-10')).toBe(2);
    expect(redis.store.get('hunter:2026-10')).toBe(1);
    expect(redis.expires.get('jsearch:2026-10')).toBe(40 * 86_400);
  });

  it('refunds against the prefixed key', async () => {
    const redis = fakeRedis();
    const jsearch = createMonthlyQuota(redis, 1, now, 'jsearch');
    expect(await jsearch.consume()).toBe(true);
    await jsearch.refund();
    expect(redis.store.get('jsearch:2026-10')).toBe(0);
    expect(await jsearch.consume()).toBe(true);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test -w server -- tests/scrapers/jsearch-client.test.ts tests/email/quota-prefix.test.ts`
Expected: FAIL. The client file fails with `Failed to load url ../../src/scrapers/jsearch-client.js`, and the quota test fails with `expected undefined to be 2` (the prefix is ignored).

- [ ] **Step 4: Implement the client** `server/src/scrapers/jsearch-client.ts`

```ts
export const JSEARCH_HOST = 'jsearch.p.rapidapi.com';

export interface JSearchQuery {
  query: string;
  remote: boolean;
}

/** One raw JSearch result. Every field is untrusted, so it is typed unknown and checked when parsed. */
export interface JSearchJob {
  job_id?: unknown;
  employer_name?: unknown;
  employer_website?: unknown;
  job_publisher?: unknown;
  job_title?: unknown;
  job_description?: unknown;
  job_apply_link?: unknown;
  job_city?: unknown;
  job_state?: unknown;
  job_country?: unknown;
  job_is_remote?: unknown;
  apply_options?: unknown;
}

export class JSearchError extends Error {
  constructor(
    public readonly kind: 'auth' | 'rate_limited' | 'timeout' | 'failed' | 'malformed',
    message?: string,
  ) {
    super(message ?? kind);
    this.name = 'JSearchError';
  }
}

export function createJSearchClient(cfg: { apiKey: string; timeoutMs?: number }, fetchImpl: typeof fetch = fetch) {
  const timeoutMs = cfg.timeoutMs ?? 20_000;
  return {
    async search(q: JSearchQuery): Promise<JSearchJob[]> {
      const params = new URLSearchParams({ query: q.query, page: '1', num_pages: '1', date_posted: 'week' });
      if (q.remote) params.set('work_from_home', 'true');
      else params.set('country', 'ng');

      let res: Response;
      try {
        // The key goes only in a header: never in the URL, an error message or a log line.
        res = await fetchImpl(`https://${JSEARCH_HOST}/search?${params.toString()}`, {
          headers: { 'x-rapidapi-key': cfg.apiKey, 'x-rapidapi-host': JSEARCH_HOST },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const name = (err as { name?: unknown } | null)?.name;
        if (name === 'TimeoutError' || name === 'AbortError') throw new JSearchError('timeout', 'JSearch did not answer in time');
        throw new JSearchError('failed', 'Could not reach JSearch');
      }
      if (res.status === 401 || res.status === 403) throw new JSearchError('auth', `JSearch refused the key (${res.status})`);
      if (res.status === 429) throw new JSearchError('rate_limited', 'JSearch rate limit reached');
      if (!res.ok) throw new JSearchError('failed', `JSearch answered ${res.status}`);

      const body = (await res.json().catch(() => null)) as { status?: unknown; data?: unknown } | null;
      // A 200 without a job list is not a real answer: fail so it is never read as "no jobs".
      if (!body || typeof body !== 'object' || !Array.isArray(body.data)) throw new JSearchError('malformed', 'JSearch sent no job list');
      if (body.status !== undefined && body.status !== 'OK') throw new JSearchError('failed', 'JSearch reported an error');
      return body.data as JSearchJob[];
    },
  };
}

export type JSearchClient = ReturnType<typeof createJSearchClient>;
```

- [ ] **Step 5: Add the quota prefix** by replacing all of `server/src/services/email/quota.ts` with

```ts
import type { Redis } from 'ioredis';

/** A calendar-month call budget kept in Redis (Hunter's and JSearch's small free tiers). The prefix names the counter. */
export function createMonthlyQuota(
  redis: Pick<Redis, 'incr' | 'decr' | 'expire'>,
  limit: number,
  now: () => Date = () => new Date(),
  prefix = 'hunter',
) {
  const monthKey = () => `${prefix}:${now().toISOString().slice(0, 7)}`;
  return {
    async refund(): Promise<void> {
      await redis.decr(monthKey());
    },
    async consume(): Promise<boolean> {
      const key = monthKey();
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 40 * 86_400);
      return count <= limit;
    },
  };
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test -w server -- tests/scrapers/jsearch-client.test.ts tests/email/quota-prefix.test.ts tests/email/quota.test.ts`
Expected: PASS (all tests, including the unchanged Hunter quota tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/scrapers/jsearch-client.ts server/src/services/email/quota.ts server/tests/scrapers/jsearch-client.test.ts server/tests/email/quota-prefix.test.ts
git commit -m "$(cat <<'EOF'
feat(server): JSearch client with typed errors and a prefixed monthly quota

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Job normaliser, JSearch scraper, registration and schedule

**Files:**
- Modify: `server/src/domain/jobs.ts` (append), `server/src/scrapers/types.ts`, `server/src/scrapers/index.ts`, `server/src/worker/index.ts`
- Create: `server/src/scrapers/jsearch.ts`, `server/tests/fixtures/jsearch-search.json`
- Test: `server/tests/domain/normalise-job.test.ts`, `server/tests/scrapers/jsearch.test.ts`, `server/tests/scrapers/registry.test.ts`

**Interfaces:**
- Consumes: `canonicalJobUrl`, `LinkSource`, `safeHttpUrl` from `@joblume/shared` (Tasks 1-2); `JSearchClient`, `JSearchJob`, `JSearchQuery`, `JSearchError`, `createJSearchClient` (Task 3); `createMonthlyQuota(redis, limit, now, 'jsearch')` (Task 3).
- Produces (`domain/jobs.ts`): `JOB_FIELD_LIMITS = { title: 300, company: 200, location: 200, description: 50_000 }`; `normaliseJob(input: { title?: unknown; company?: unknown; location?: unknown; description?: unknown; source: JobSource; url: string; companyDomain?: string | null }): NormalisedJob | null`; `tidyLocation(parts: unknown[]): string`; `domainFromWebsite(raw: unknown): string | null`.
- Produces (`scrapers/jsearch.ts`): `JSEARCH_MAX_QUERIES = 2`; `interface QueryProfile { desired_roles: string[]; location: 'Lagos' | 'Abuja' | 'Remote' | null }`; `buildJSearchQueries(profiles: QueryProfile[], max?: number): JSearchQuery[]`; `publisherSource(publisher: unknown): LinkSource | null`; `parseJSearchJob(raw: JSearchJob): NormalisedJob | null`; `interface JSearchScraperDeps { client: Pick<JSearchClient, 'search'> | null; quota: { consume(): Promise<boolean>; refund(): Promise<void> }; loadProfiles(): Promise<QueryProfile[]>; log: Logger; maxQueries?: number }`; `createJSearchScraper(d: JSearchScraperDeps): Scraper`.
- Produces (`scrapers/index.ts`): `SCRAPE_SOURCES = ['remotive', 'myjobmag', 'jobberman', 'jsearch']`, `SCRAPE_LIMITS.jsearch = 50`, `SCRAPE_EVERY_MS: Record<ScrapeSource, number>`, `createScrapers(fetchText, extra?: { jsearch?: Scraper })`. `Scraper.source` becomes `JobSource | 'jsearch'`.

- [ ] **Step 1: Write the failing normaliser test** in `server/tests/domain/normalise-job.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { domainFromWebsite, JOB_FIELD_LIMITS, normaliseJob, tidyLocation } from '../../src/domain/jobs.js';

const base = {
  title: '  Data   Analyst ',
  company: ' Acme\nAnalytics ',
  location: ' Lagos ',
  description: '  Line one.\r\n\r\n\r\n\r\nLine two.  ',
  source: 'linkedin' as const,
  url: 'https://www.linkedin.com/jobs/view/4012345678/',
};

describe('normaliseJob', () => {
  it('tidies whitespace and keeps the source and url', () => {
    expect(normaliseJob(base)).toEqual({
      title: 'Data Analyst', company: 'Acme Analytics', location: 'Lagos', description: 'Line one.\n\nLine two.',
      source: 'linkedin', url: base.url, companyDomain: null,
    });
  });

  it.each([
    ['the title is blank', { title: '   ' }],
    ['the company is missing', { company: undefined }],
    ['the description is empty', { description: '' }],
    ['the title is not text', { title: 42 }],
  ])('returns null when %s', (_name, over) => {
    expect(normaliseJob({ ...base, ...over })).toBeNull();
  });

  it('returns null for a url that is not http(s)', () => {
    expect(normaliseJob({ ...base, url: 'javascript:alert(1)' })).toBeNull();
  });

  it('allows an empty location and keeps a company domain', () => {
    expect(normaliseJob({ ...base, location: undefined, companyDomain: 'acme.com' })).toMatchObject({ location: '', companyDomain: 'acme.com' });
  });

  it('caps every field', () => {
    const job = normaliseJob({ ...base, title: 'a'.repeat(1000), company: 'b'.repeat(1000), location: 'c'.repeat(1000), description: 'd'.repeat(60_000) });
    expect(job?.title).toHaveLength(JOB_FIELD_LIMITS.title);
    expect(job?.company).toHaveLength(JOB_FIELD_LIMITS.company);
    expect(job?.location).toHaveLength(JOB_FIELD_LIMITS.location);
    expect(job?.description).toHaveLength(JOB_FIELD_LIMITS.description);
  });
});

describe('tidyLocation', () => {
  it('joins the parts, drops blanks and repeats, and names Nigeria', () => {
    expect(tidyLocation(['Lagos', 'lagos', null, ' ', 'NG'])).toBe('Lagos, Nigeria');
    expect(tidyLocation(['Abuja', 'FCT', 'Nigeria'])).toBe('Abuja, FCT, Nigeria');
    expect(tidyLocation([])).toBe('');
  });
});

describe('domainFromWebsite', () => {
  it.each([
    ['https://www.acme.com/careers', 'acme.com'],
    ['http://Jobs.Acme.co.uk', 'jobs.acme.co.uk'],
    ['https://www.linkedin.com/company/acme', null],
    ['https://ng.indeed.com/cmp/acme', null],
    ['not a url', null],
    [null, null],
    [42, null],
  ])('reads %j as %j', (input, expected) => {
    expect(domainFromWebsite(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Create the fixture** `server/tests/fixtures/jsearch-search.json`

```json
{
  "status": "OK",
  "request_id": "fixture-1",
  "parameters": { "query": "data analyst in lagos, nigeria", "page": 1, "num_pages": 1, "date_posted": "week", "country": "ng" },
  "data": [
    {
      "job_id": "li-1",
      "employer_name": "Acme Analytics",
      "employer_website": "https://www.acme-analytics.com/careers",
      "job_publisher": "LinkedIn",
      "job_title": "Data Analyst",
      "job_apply_link": "https://www.linkedin.com/jobs/view/data-analyst-at-acme-analytics-4012345678?trk=public_jobs&refId=abc",
      "job_description": "Acme Analytics is hiring a Data Analyst.\n\nYou will build dashboards with SQL and Power BI.",
      "job_is_remote": false,
      "job_city": "Lagos",
      "job_state": "Lagos",
      "job_country": "NG",
      "apply_options": [{ "publisher": "LinkedIn", "apply_link": "https://www.linkedin.com/jobs/view/4012345678", "is_direct": false }]
    },
    {
      "job_id": "in-1",
      "employer_name": "Paystack",
      "employer_website": null,
      "job_publisher": "Indeed",
      "job_title": "Backend Engineer",
      "job_apply_link": "https://ng.indeed.com/viewjob?jk=0123456789abcdef&utm_source=jsearch",
      "job_description": "We are looking for a backend engineer with Node.js and PostgreSQL experience.",
      "job_is_remote": false,
      "job_city": "Lagos",
      "job_state": null,
      "job_country": "NG",
      "apply_options": []
    },
    {
      "job_id": "gd-1",
      "employer_name": "Globex",
      "job_publisher": "Glassdoor",
      "job_title": "Data Analyst",
      "job_apply_link": "https://www.glassdoor.com/job-listing/123",
      "job_description": "A Glassdoor job that must be dropped.",
      "job_is_remote": false,
      "job_city": "Lagos",
      "job_country": "NG"
    },
    {
      "job_id": "li-2",
      "employer_name": "Remote First Ltd",
      "employer_website": "https://remotefirst.io",
      "job_publisher": "LinkedIn",
      "job_title": "Product Analyst",
      "job_apply_link": "https://remotefirst.io/apply/77",
      "job_description": "A fully remote product analyst role.",
      "job_is_remote": true,
      "job_city": null,
      "job_country": "NG",
      "apply_options": [
        { "publisher": "Company site", "apply_link": "https://remotefirst.io/apply/77" },
        { "publisher": "LinkedIn", "apply_link": "https://www.linkedin.com/jobs/view/4099999999/?trackingId=xyz" }
      ]
    },
    {
      "job_id": "li-3",
      "employer_name": "",
      "job_publisher": "LinkedIn",
      "job_title": "Mystery Role",
      "job_apply_link": "https://www.linkedin.com/jobs/view/4011111111",
      "job_description": "No employer name, so it is dropped.",
      "job_is_remote": false
    },
    {
      "job_id": "in-2",
      "employer_name": "Initech",
      "job_publisher": "Indeed",
      "job_title": "Support Specialist",
      "job_apply_link": "https://initech.example/jobs/1",
      "job_description": "An Indeed listing without an Indeed job link, so it is dropped.",
      "job_is_remote": false,
      "apply_options": []
    }
  ]
}
```

- [ ] **Step 3: Write the failing scraper and registry tests**

`server/tests/scrapers/jsearch.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { JSearchError, type JSearchClient, type JSearchJob } from '../../src/scrapers/jsearch-client.js';
import {
  buildJSearchQueries, createJSearchScraper, JSEARCH_MAX_QUERIES, parseJSearchJob, publisherSource, type JSearchScraperDeps,
} from '../../src/scrapers/jsearch.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/jsearch-search.json', import.meta.url), 'utf8')) as { data: JSearchJob[] };

const EXPECTED = [
  {
    title: 'Data Analyst', company: 'Acme Analytics', location: 'Lagos, Nigeria',
    description: 'Acme Analytics is hiring a Data Analyst.\n\nYou will build dashboards with SQL and Power BI.',
    source: 'linkedin', url: 'https://www.linkedin.com/jobs/view/4012345678/', companyDomain: 'acme-analytics.com',
  },
  {
    title: 'Backend Engineer', company: 'Paystack', location: 'Lagos, Nigeria',
    description: 'We are looking for a backend engineer with Node.js and PostgreSQL experience.',
    source: 'indeed', url: 'https://ng.indeed.com/viewjob?jk=0123456789abcdef', companyDomain: null,
  },
  {
    title: 'Product Analyst', company: 'Remote First Ltd', location: 'Remote',
    description: 'A fully remote product analyst role.',
    source: 'linkedin', url: 'https://www.linkedin.com/jobs/view/4099999999/', companyDomain: 'remotefirst.io',
  },
];

function make(over: Partial<JSearchScraperDeps> = {}) {
  const search = vi.fn<JSearchClient['search']>().mockImplementation(async () => fixture.data);
  const quota = {
    consume: vi.fn<() => Promise<boolean>>().mockImplementation(async () => true),
    refund: vi.fn<() => Promise<void>>().mockImplementation(async () => undefined),
  };
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const deps: JSearchScraperDeps = {
    client: { search },
    quota,
    loadProfiles: vi.fn<JSearchScraperDeps['loadProfiles']>().mockImplementation(async () => [{ desired_roles: ['Data Analyst'], location: 'Lagos' }]),
    log,
    ...over,
  };
  return { deps, search, quota, log, scraper: createJSearchScraper(deps) };
}

describe('publisherSource', () => {
  it.each([
    ['LinkedIn', 'linkedin'],
    [' linkedin ', 'linkedin'],
    ['Indeed', 'indeed'],
    ['Indeed Nigeria', 'indeed'],
    ['Glassdoor', null],
    ['LinkedInish Jobs', null],
    [undefined, null],
  ])('reads %j as %j', (publisher, expected) => {
    expect(publisherSource(publisher)).toBe(expected);
  });
});

describe('parseJSearchJob', () => {
  it('keeps only LinkedIn and Indeed jobs with a canonical job link of that site', () => {
    expect(fixture.data.map(parseJSearchJob).filter(Boolean)).toEqual(EXPECTED);
  });
});

describe('buildJSearchQueries', () => {
  it('builds one query per role and place, most shared first, capped', () => {
    const queries = buildJSearchQueries([
      { desired_roles: ['Backend Engineer'], location: 'Abuja' },
      { desired_roles: ['Data Analyst', 'backend  engineer'], location: 'Abuja' },
      { desired_roles: ['Data Analyst'], location: 'Lagos' },
    ], 2);
    expect(queries).toEqual([
      { query: 'backend engineer in Abuja, Nigeria', remote: false },
      { query: 'data analyst in Abuja, Nigeria', remote: false },
    ]);
  });

  it('asks for remote jobs and defaults to Nigeria', () => {
    expect(buildJSearchQueries([
      { desired_roles: ['Designer'], location: 'Remote' },
      { desired_roles: ['Nurse'], location: null },
    ], 5)).toEqual([
      { query: 'designer remote', remote: true },
      { query: 'nurse in Nigeria', remote: false },
    ]);
  });

  it('skips blank roles and uses at most JSEARCH_MAX_QUERIES by default', () => {
    expect(JSEARCH_MAX_QUERIES).toBe(2);
    expect(buildJSearchQueries([{ desired_roles: [' ', 'A1', 'B2', 'C3'], location: 'Lagos' }])).toHaveLength(2);
  });
});

describe('createJSearchScraper', () => {
  it('is the jsearch source and declares no detail delay', () => {
    const { scraper } = make();
    expect(scraper.source).toBe('jsearch');
    expect(scraper.detailDelayMs).toBeUndefined();
  });

  it('lists the filtered jobs as stubs, spending one quota unit per request', async () => {
    const { scraper, search, quota } = make();
    const stubs = await scraper.list();
    expect(stubs).toEqual(EXPECTED.map(({ companyDomain: _d, ...stub }) => stub));
    expect(search).toHaveBeenCalledWith({ query: 'data analyst in Lagos, Nigeria', remote: false });
    expect(quota.consume).toHaveBeenCalledTimes(1);
    expect(quota.refund).not.toHaveBeenCalled();
  });

  it('returns the full job from detail() without another request', async () => {
    const { scraper, search } = make();
    const [first] = await scraper.list();
    expect(await scraper.detail(first!)).toEqual(EXPECTED[0]);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('collapses the same job found by two queries', async () => {
    const { scraper, search, quota } = make({
      loadProfiles: vi.fn<JSearchScraperDeps['loadProfiles']>().mockImplementation(async () => [{ desired_roles: ['Data Analyst', 'Backend Engineer'], location: 'Lagos' }]),
    });
    expect(await scraper.list()).toHaveLength(3);
    expect(search).toHaveBeenCalledTimes(2);
    expect(quota.consume).toHaveBeenCalledTimes(2);
  });

  it('makes no request and lists nothing without an API key', async () => {
    const { scraper, deps, quota } = make({ client: null });
    expect(await scraper.list()).toEqual([]);
    expect(deps.loadProfiles).not.toHaveBeenCalled();
    expect(quota.consume).not.toHaveBeenCalled();
  });

  it('returns an empty list and logs once at the monthly limit', async () => {
    const { scraper, search, quota, log } = make({
      loadProfiles: vi.fn<JSearchScraperDeps['loadProfiles']>().mockImplementation(async () => [{ desired_roles: ['Data Analyst', 'Backend Engineer'], location: 'Lagos' }]),
    });
    quota.consume.mockImplementation(async () => false);
    expect(await scraper.list()).toEqual([]);
    expect(search).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('refunds a failed request and rethrows the typed error', async () => {
    const { scraper, search, quota } = make();
    search.mockImplementation(async () => {
      throw new JSearchError('malformed');
    });
    await expect(scraper.list()).rejects.toMatchObject({ name: 'JSearchError', kind: 'malformed' });
    expect(quota.refund).toHaveBeenCalledTimes(1);
  });
});
```

`server/tests/scrapers/registry.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createScrapers, SCRAPE_EVERY_MS, SCRAPE_LIMITS, SCRAPE_SOURCES } from '../../src/scrapers/index.js';
import type { Scraper } from '../../src/scrapers/types.js';

describe('scraper registry', () => {
  it('includes jsearch with its own limit and a daily schedule', () => {
    expect(SCRAPE_SOURCES).toEqual(['remotive', 'myjobmag', 'jobberman', 'jsearch']);
    expect(SCRAPE_LIMITS.jsearch).toBe(50);
    expect(SCRAPE_EVERY_MS.jsearch).toBe(24 * 60 * 60 * 1000);
    for (const s of ['remotive', 'myjobmag', 'jobberman'] as const) expect(SCRAPE_EVERY_MS[s]).toBe(6 * 60 * 60 * 1000);
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

- [ ] **Step 4: Run them to verify they fail**

Run: `npm test -w server -- tests/domain/normalise-job.test.ts tests/scrapers/jsearch.test.ts tests/scrapers/registry.test.ts`
Expected: FAIL. `normaliseJob is not a function`, `Failed to load url ../../src/scrapers/jsearch.js`, and the registry test fails with `expected [ 'remotive', 'myjobmag', 'jobberman' ] to deeply equal [...]`.

- [ ] **Step 5: Add the normaliser** to `server/src/domain/jobs.ts`

Replace the first line

```ts
import type { JobSourceName } from '../db/types.js';
```

with

```ts
import { safeHttpUrl } from '@joblume/shared';
import type { JobSourceName } from '../db/types.js';
```

and append at the end of the file:

```ts

export const JOB_FIELD_LIMITS = { title: 300, company: 200, location: 200, description: 50_000 } as const;

const oneLine = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

const tidyText = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, max)
    : '';

/** Validates and tidies a job from an outside source. Returns null when the title, company, description or link is unusable. */
export function normaliseJob(input: {
  title?: unknown;
  company?: unknown;
  location?: unknown;
  description?: unknown;
  source: JobSource;
  url: string;
  companyDomain?: string | null;
}): NormalisedJob | null {
  const title = oneLine(input.title, JOB_FIELD_LIMITS.title);
  const company = oneLine(input.company, JOB_FIELD_LIMITS.company);
  const location = oneLine(input.location, JOB_FIELD_LIMITS.location);
  const description = tidyText(input.description, JOB_FIELD_LIMITS.description);
  if (!title || !company || !description || !safeHttpUrl(input.url)) return null;
  return { title, company, location, description, source: input.source, url: input.url, companyDomain: input.companyDomain ?? null };
}

const COUNTRY_NAMES: Record<string, string> = { NG: 'Nigeria' };

/** "Lagos, Lagos, NG" becomes "Lagos, Nigeria": blanks and repeats dropped, country codes named. */
export function tidyLocation(parts: unknown[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (typeof part !== 'string') continue;
    const clean = part.replace(/\s+/g, ' ').trim();
    const named = COUNTRY_NAMES[clean] ?? clean;
    if (!named || seen.has(named.toLowerCase())) continue;
    seen.add(named.toLowerCase());
    out.push(named);
  }
  return out.join(', ');
}

// Job-board hosts are never the employer's own domain.
const PORTAL_HOSTS = ['linkedin.com', 'indeed.com'];

/** The employer's domain from its website link (without "www."), or null for a missing, invalid or job-board link. */
export function domainFromWebsite(raw: unknown): string | null {
  const url = safeHttpUrl(raw);
  if (!url) return null;
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  if (!host.includes('.') || PORTAL_HOSTS.some((p) => host === p || host.endsWith(`.${p}`))) return null;
  return host;
}
```

- [ ] **Step 6: Implement the scraper** `server/src/scrapers/jsearch.ts`

```ts
import { canonicalJobUrl, type LinkSource } from '@joblume/shared';
import { domainFromWebsite, normaliseJob, tidyLocation, type JobStub, type NormalisedJob } from '../domain/jobs.js';
import type { Logger } from '../lib/logger.js';
import type { JSearchClient, JSearchJob, JSearchQuery } from './jsearch-client.js';
import type { Scraper } from './types.js';

/** Requests per run. The scheduler runs JSearch daily, so 2 a run keeps the 50-a-month budget lasting most of the month. */
export const JSEARCH_MAX_QUERIES = 2;

export interface QueryProfile {
  desired_roles: string[];
  location: 'Lagos' | 'Abuja' | 'Remote' | null;
}

const PLACE: Record<'Lagos' | 'Abuja', string> = { Lagos: 'Lagos, Nigeria', Abuja: 'Abuja, Nigeria' };

/** The union of every user's role and place, most shared first, capped. */
export function buildJSearchQueries(profiles: QueryProfile[], max: number = JSEARCH_MAX_QUERIES): JSearchQuery[] {
  const counts = new Map<string, { q: JSearchQuery; n: number; first: number }>();
  let order = 0;
  for (const p of profiles) {
    for (const rawRole of p.desired_roles) {
      const role = rawRole.replace(/\s+/g, ' ').trim().toLowerCase();
      if (role.length < 2) continue;
      const q: JSearchQuery =
        p.location === 'Remote'
          ? { query: `${role} remote`, remote: true }
          : { query: `${role} in ${p.location ? PLACE[p.location] : 'Nigeria'}`, remote: false };
      const key = `${q.remote}|${q.query}`;
      const entry = counts.get(key);
      if (entry) entry.n++;
      else counts.set(key, { q, n: 1, first: order++ });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.first - b.first)
    .slice(0, max)
    .map((e) => e.q);
}

export function publisherSource(publisher: unknown): LinkSource | null {
  if (typeof publisher !== 'string') return null;
  const p = publisher.trim().toLowerCase();
  if (p === 'linkedin' || p.startsWith('linkedin ')) return 'linkedin';
  if (p === 'indeed' || p.startsWith('indeed ')) return 'indeed';
  return null;
}

/** The first link (apply link, then apply options) that is a canonical job page on the publisher's own site. */
function jobLinkFor(raw: JSearchJob, source: LinkSource): string | null {
  const options = Array.isArray(raw.apply_options) ? (raw.apply_options as Array<{ apply_link?: unknown } | null>) : [];
  for (const candidate of [raw.job_apply_link, ...options.map((o) => o?.apply_link)]) {
    const link = canonicalJobUrl(candidate);
    if (link && link.source === source) return link.url;
  }
  return null;
}

export function parseJSearchJob(raw: JSearchJob): NormalisedJob | null {
  const source = publisherSource(raw.job_publisher);
  if (!source) return null;
  const url = jobLinkFor(raw, source);
  if (!url) return null;
  return normaliseJob({
    title: raw.job_title,
    company: raw.employer_name,
    location: raw.job_is_remote === true ? 'Remote' : tidyLocation([raw.job_city, raw.job_state, raw.job_country]),
    description: raw.job_description,
    source,
    url,
    companyDomain: domainFromWebsite(raw.employer_website),
  });
}

export interface JSearchScraperDeps {
  /** Null when JSEARCH_API_KEY is not set: the scraper then lists nothing. */
  client: Pick<JSearchClient, 'search'> | null;
  quota: { consume(): Promise<boolean>; refund(): Promise<void> };
  loadProfiles(): Promise<QueryProfile[]>;
  log: Logger;
  maxQueries?: number;
}

export function createJSearchScraper(d: JSearchScraperDeps): Scraper {
  // list() keeps the full jobs so detail() needs no extra request.
  const found = new Map<string, NormalisedJob>();
  return {
    source: 'jsearch',
    async list(): Promise<JobStub[]> {
      found.clear();
      if (!d.client) return [];
      const queries = buildJSearchQueries(await d.loadProfiles(), d.maxQueries ?? JSEARCH_MAX_QUERIES);
      for (const q of queries) {
        if (!(await d.quota.consume())) {
          d.log.warn({ source: 'jsearch' }, 'JSearch monthly limit reached; skipping until next month');
          break;
        }
        let results: JSearchJob[];
        try {
          results = await d.client.search(q);
        } catch (err) {
          // A failed request did not use the budget.
          try {
            await d.quota.refund();
          } catch (refundErr) {
            d.log.warn({ err: refundErr }, 'jsearch quota refund failed');
          }
          throw err;
        }
        for (const raw of results) {
          const job = parseJSearchJob(raw);
          if (job && !found.has(job.url)) found.set(job.url, job);
        }
      }
      return [...found.values()].map(({ title, company, location, url, source, description }) => ({ title, company, location, url, source, description }));
    },
    async detail(stub) {
      return (
        found.get(stub.url) ?? {
          title: stub.title, company: stub.company, location: stub.location, description: stub.description ?? '',
          source: stub.source, url: stub.url, companyDomain: null,
        }
      );
    },
  };
}
```

- [ ] **Step 7: Widen the scraper source and register JSearch**

Replace all of `server/src/scrapers/types.ts` with:

```ts
import type { JobSource, JobStub, NormalisedJob } from '../domain/jobs.js';

export interface Scraper {
  /** The board it reads. 'jsearch' lists LinkedIn and Indeed jobs, each tagged with its own JobSource. */
  source: JobSource | 'jsearch';
  /** Cheap: one listing request. */
  list(): Promise<JobStub[]>;
  /** May cost one request per job. Only called for stubs not already stored. */
  detail(stub: JobStub): Promise<NormalisedJob>;
  /** Random delay range between detail calls. Omit when detail() makes no request. */
  detailDelayMs?: [min: number, max: number];
}
```

Replace all of `server/src/scrapers/index.ts` with:

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
  myjobmag: 25,
  jobberman: 25,
  jsearch: 50,
};

const SIX_HOURS = 6 * 60 * 60 * 1000;

/** How often the scheduler runs each source. JSearch is daily to stay inside its small monthly quota. */
export const SCRAPE_EVERY_MS: Record<ScrapeSource, number> = {
  remotive: SIX_HOURS,
  myjobmag: SIX_HOURS,
  jobberman: SIX_HOURS,
  jsearch: 24 * 60 * 60 * 1000,
};

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

- [ ] **Step 8: Wire JSearch into the worker** (`server/src/worker/index.ts`)

1. Replace `import { DelayedError, Worker } from 'bullmq';` with:

```ts
import { DelayedError, UnrecoverableError, Worker } from 'bullmq';
```

2. Replace `import { SCRAPE_LIMITS, SCRAPE_SOURCES, createScrapers } from '../scrapers/index.js';` with:

```ts
import { SCRAPE_EVERY_MS, SCRAPE_LIMITS, SCRAPE_SOURCES, createScrapers } from '../scrapers/index.js';
import { createJSearchClient, JSearchError } from '../scrapers/jsearch-client.js';
import { createJSearchScraper } from '../scrapers/jsearch.js';
```

3. Delete the line `const SIX_HOURS = 6 * 60 * 60 * 1000;` and the blank line after it.

4. Replace `  const scrapers = createScrapers(fetchText);` with:

```ts
  const jsearchClient = env.JSEARCH_API_KEY ? createJSearchClient({ apiKey: env.JSEARCH_API_KEY }) : null;
  const scrapers = createScrapers(fetchText, {
    jsearch: createJSearchScraper({
      client: jsearchClient,
      quota: createMonthlyQuota(createRedis(env.UPSTASH_REDIS_URL), env.JSEARCH_MONTHLY_LIMIT, undefined, 'jsearch'),
      loadProfiles: repos.loadCandidates,
      log: logger,
    }),
  });
```

5. Replace the scrape worker processor

```ts
    async (job) => {
      const { source } = job.data;
      return runScrape({
        scraper: scrapers[source],
        maxNew: SCRAPE_LIMITS[source],
        findSeenUrls: (urls) => findSeenUrls(db, urls),
        insertJobs: (jobs) => insertJobs(db, jobs),
        enqueueMatch: async (jobId) => {
          await queues.match.add('match', { kind: 'job', jobId }, { jobId: `match-job-${jobId}` });
        },
        sleep,
        log: logger,
      });
    },
```

with

```ts
    async (job) => {
      const { source } = job.data;
      try {
        return await runScrape({
          scraper: scrapers[source],
          maxNew: SCRAPE_LIMITS[source],
          findSeenUrls: (urls) => findSeenUrls(db, urls),
          insertJobs: (jobs) => insertJobs(db, jobs),
          enqueueMatch: async (jobId) => {
            await queues.match.add('match', { kind: 'job', jobId }, { jobId: `match-job-${jobId}` });
          },
          sleep,
          log: logger,
        });
      } catch (err) {
        // A rejected or unsubscribed JSearch key will not fix itself: do not spend retries on it.
        if (err instanceof JSearchError && err.kind === 'auth') throw new UnrecoverableError('JSearch rejected the API key');
        throw err;
      }
    },
```

6. Replace

```ts
  for (const source of SCRAPE_SOURCES) {
    // upsertJobScheduler enqueues the first run immediately, so no separate boot job is needed
    await queues.scrape.upsertJobScheduler(`scrape-${source}`, { every: SIX_HOURS }, { name: 'scrape', data: { source } });
  }
```

with

```ts
  for (const source of SCRAPE_SOURCES) {
    if (source === 'jsearch' && !jsearchClient) {
      // No key: make sure a schedule left by an earlier run does not keep firing.
      await queues.scrape.removeJobScheduler('scrape-jsearch');
      continue;
    }
    // upsertJobScheduler enqueues the first run immediately, so no separate boot job is needed
    await queues.scrape.upsertJobScheduler(`scrape-${source}`, { every: SCRAPE_EVERY_MS[source] }, { name: 'scrape', data: { source } });
  }
```

7. Replace `  logger.info({ sources: SCRAPE_SOURCES }, 'worker started; scraping every 6 hours');` with:

```ts
  logger.info({ sources: SCRAPE_SOURCES, jsearch: jsearchClient !== null }, 'worker started; job boards every 6 hours, JSearch daily');
```

- [ ] **Step 9: Run the tests and the typecheck**

Run: `npm test -w server -- tests/domain tests/scrapers tests/worker/scrape.test.ts tests/services/jobs-service.test.ts`
Expected: PASS. This covers the new normaliser, JSearch and registry tests, plus the existing scraper tests (the `createScrapers` registry test in `jobberman.test.ts` now also checks `jsearch`), runScrape, and the refresh test, which still scrapes only myjobmag and jobberman.

Run: `npm run typecheck -w server`
Expected: exits 0.

- [ ] **Step 10: Commit**

```bash
git add server/src/domain/jobs.ts server/src/scrapers/jsearch.ts server/src/scrapers/types.ts server/src/scrapers/index.ts server/src/worker/index.ts server/tests/fixtures/jsearch-search.json server/tests/domain/normalise-job.test.ts server/tests/scrapers/jsearch.test.ts server/tests/scrapers/registry.test.ts
git commit -m "$(cat <<'EOF'
feat(server): JSearch scraper for LinkedIn and Indeed jobs, scheduled daily

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Job page extractors and the stealth page fetcher

**Files:**
- Create: `server/src/scrapers/job-page.ts`, `server/src/worker/browser.ts`
- Create fixtures: `server/tests/fixtures/linkedin-job.html`, `server/tests/fixtures/linkedin-expired.html`, `server/tests/fixtures/indeed-job.html`, `server/tests/fixtures/indeed-blocked.html`
- Modify: `server/package.json` (dependencies and a `browsers:install` script), `package-lock.json`
- Test: `server/tests/scrapers/job-page.test.ts`, `server/tests/worker/browser.test.ts`, `server/tests/worker/no-playwright-in-api.test.ts`

**Interfaces:**
- Consumes: `normaliseJob`, `tidyLocation`, `domainFromWebsite`, `NormalisedJob` (Task 4); `htmlToText` (existing `server/src/lib/html.ts`); `JobFetchReason`, `LinkSource` (Task 1).
- Produces (`scrapers/job-page.ts`): `interface FetchedPage { status: number | null; finalUrl: string; html: string }`; `type ExtractResult = { ok: true; job: NormalisedJob } | { ok: false; reason: JobFetchReason }`; `extractJobPage(page: FetchedPage, input: { url: string; source: LinkSource }): ExtractResult`.
- Produces (`worker/browser.ts`): `PAGE_TIMEOUT_MS = 30_000`; structural `PageLike`, `ContextLike`, `BrowserLike`; `interface PageFetcher { fetchPage(url: string): Promise<FetchedPage>; close(): Promise<void> }`; `createPageFetcher(d: { launch(): Promise<BrowserLike>; userAgent(): string; timeoutMs?: number }): PageFetcher`; `launchStealthChromium(): Promise<BrowserLike>`.

- [ ] **Step 1: Install the browser dependencies** (they are only loaded by the worker at runtime)

Run: `npm install -w server playwright@^1.64.1 playwright-extra@^4.3.6 puppeteer-extra-plugin-stealth@^2.11.2`
Expected: `added N packages` with no `ERESOLVE` error. `server/package.json` gains the three dependencies. No browser is downloaded, because `playwright` has no install script.

Then in `server/package.json` replace

```json
    "test:watch": "vitest"
```

with

```json
    "test:watch": "vitest",
    "browsers:install": "playwright install chromium"
```

(The worker host runs `npm run browsers:install -w server` once. On Linux, use `npx -w server playwright install --with-deps chromium` to also get the system libraries. Tests never need it.)

- [ ] **Step 2: Create the HTML fixtures**

`server/tests/fixtures/linkedin-job.html` (a LinkedIn guest job page with JSON-LD, the top card, and the sign-in modal LinkedIn always includes):

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Acme Analytics hiring Data Analyst in Lagos, Lagos State, Nigeria | LinkedIn</title>
<script type="application/ld+json">{"@context":"http://schema.org","@type":"JobPosting","datePosted":"2026-10-10T08:00:00.000Z","title":"Data Analyst","description":"&lt;p&gt;Acme Analytics is hiring a &lt;strong&gt;Data Analyst&lt;/strong&gt; to join our Lagos team.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;SQL and Python&lt;/li&gt;&lt;li&gt;Dashboards in Power BI&lt;/li&gt;&lt;/ul&gt;","employmentType":"FULL_TIME","hiringOrganization":{"@type":"Organization","name":"Acme Analytics","sameAs":"https://www.linkedin.com/company/acme-analytics","logo":"https://media.licdn.com/x.png"},"jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Lagos","addressRegion":"Lagos State","addressCountry":"NG"}}}</script>
</head>
<body>
<section class="top-card-layout">
<h1 class="top-card-layout__title topcard__title">Data Analyst</h1>
<span class="topcard__flavor"><a class="topcard__org-name-link" href="https://www.linkedin.com/company/acme-analytics">Acme Analytics</a></span>
<span class="topcard__flavor topcard__flavor--bullet">Lagos, Lagos State, Nigeria</span>
</section>
<div class="description__text"><div class="show-more-less-html__markup"><p>Acme Analytics is hiring a <strong>Data Analyst</strong>.</p></div></div>
<div class="modal"><form action="https://www.linkedin.com/uas/login-submit"><input name="session_key"></form></div>
</body>
</html>
```

`server/tests/fixtures/linkedin-expired.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>LinkedIn</title></head>
<body>
<main><h1>This job is no longer available</h1><p>Search for more jobs on LinkedIn.</p></main>
<form action="https://www.linkedin.com/uas/login-submit"><input name="session_key"></form>
</body>
</html>
```

`server/tests/fixtures/indeed-job.html` (selectors only, no JSON-LD, like most Indeed pages):

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Backend Engineer - Lagos - Indeed.com</title></head>
<body>
<div class="jobsearch-JobComponent">
<h1 class="jobsearch-JobInfoHeader-title" data-testid="jobsearch-JobInfoHeader-title"><span>Backend Engineer</span><span class="css-1b6omqv"> - job post</span></h1>
<div data-testid="inlineHeader-companyName"><span><a href="https://ng.indeed.com/cmp/Paystack">Paystack</a></span></div>
<div data-testid="inlineHeader-companyLocation"><div>Lagos</div></div>
<div id="jobDescriptionText" class="jobsearch-jobDescriptionText"><p>We are looking for a backend engineer.</p><ul><li>Node.js and TypeScript</li><li>PostgreSQL</li></ul></div>
</div>
</body>
</html>
```

`server/tests/fixtures/indeed-blocked.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Security Check - Indeed.com</title></head>
<body>
<h1>Additional Verification Required</h1>
<div id="challenge-platform">Please verify you are human to continue.</div>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write the failing extractor test** in `server/tests/scrapers/job-page.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractJobPage, type FetchedPage } from '../../src/scrapers/job-page.js';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const LI = { url: 'https://www.linkedin.com/jobs/view/4012345678/', source: 'linkedin' as const };
const IN = { url: 'https://ng.indeed.com/viewjob?jk=0123456789abcdef', source: 'indeed' as const };
const page = (html: string, over: Partial<FetchedPage> = {}): FetchedPage => ({ status: 200, finalUrl: LI.url, html, ...over });

describe('extractJobPage: LinkedIn', () => {
  it('reads the JSON-LD posting, decoding its escaped HTML description', () => {
    const result = extractJobPage(page(fixture('linkedin-job.html')), LI);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job).toMatchObject({
      title: 'Data Analyst', company: 'Acme Analytics', location: 'Lagos, Lagos State, Nigeria',
      source: 'linkedin', url: LI.url, companyDomain: null,
    });
    expect(result.job.description).toContain('Acme Analytics is hiring a Data Analyst to join our Lagos team.');
    expect(result.job.description).toContain('SQL and Python');
    expect(result.job.description).not.toMatch(/<p>|&lt;/);
  });

  it('falls back to the top-card selectors when there is no JSON-LD', () => {
    const html = fixture('linkedin-job.html').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
    const result = extractJobPage(page(html), LI);
    expect(result).toEqual({
      ok: true,
      job: {
        title: 'Data Analyst', company: 'Acme Analytics', location: 'Lagos, Lagos State, Nigeria',
        description: 'Acme Analytics is hiring a Data Analyst.', source: 'linkedin', url: LI.url, companyDomain: null,
      },
    });
  });

  it('ignores a broken JSON-LD block and still reads the page', () => {
    const html = fixture('linkedin-job.html').replace('<head>', '<head><script type="application/ld+json">{not json</script>');
    expect(extractJobPage(page(html), LI)).toMatchObject({ ok: true, job: { title: 'Data Analyst' } });
  });
});

describe('extractJobPage: Indeed', () => {
  it('reads the header and description selectors and drops the hidden "job post" suffix', () => {
    const result = extractJobPage(page(fixture('indeed-job.html'), { finalUrl: IN.url }), IN);
    expect(result).toMatchObject({
      ok: true,
      job: { title: 'Backend Engineer', company: 'Paystack', location: 'Lagos', source: 'indeed', url: IN.url, companyDomain: null },
    });
    if (result.ok) expect(result.job.description).toBe('We are looking for a backend engineer.\n• Node.js and TypeScript\n• PostgreSQL');
  });
});

describe('extractJobPage: failure reasons', () => {
  it.each([
    ['a 404', page('<html></html>', { status: 404 }), 'not_found'],
    ['a 410', page('<html></html>', { status: 410 }), 'not_found'],
    ['a 401', page('<html></html>', { status: 401 }), 'login_required'],
    ['a 403', page('<html></html>', { status: 403 }), 'blocked'],
    ['a 429', page('<html></html>', { status: 429 }), 'blocked'],
    ['LinkedIn bot status 999', page('<html></html>', { status: 999 }), 'blocked'],
    ['a redirect to the LinkedIn authwall', page(fixture('linkedin-job.html'), { finalUrl: 'https://www.linkedin.com/authwall?trk=x' }), 'login_required'],
    ['a redirect to the LinkedIn login', page('<html></html>', { finalUrl: 'https://www.linkedin.com/login?session_redirect=x' }), 'login_required'],
    ['a redirect to the Indeed sign-in', page('<html></html>', { finalUrl: 'https://secure.indeed.com/auth?continue=x' }), 'login_required'],
    ['a sign-in form instead of a job', page('<html><body><form action="https://www.linkedin.com/uas/login-submit"><input name="session_key"></form></body></html>'), 'login_required'],
    ['an Indeed security check', page(fixture('indeed-blocked.html')), 'blocked'],
    ['a job that is no longer available', page(fixture('linkedin-expired.html')), 'not_found'],
    ['a page without the job fields', page('<html><body><h1>Data Analyst</h1><p>Some text</p></body></html>'), 'unparseable'],
  ])('reports %s as %s', (_name, input, reason) => {
    expect(extractJobPage(input, LI)).toEqual({ ok: false, reason });
  });
});
```

- [ ] **Step 4: Write the failing fetcher tests**

`server/tests/worker/browser.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createPageFetcher, PAGE_TIMEOUT_MS, type BrowserLike, type ContextLike, type PageLike } from '../../src/worker/browser.js';

function fakeBrowser(opts: { goto?: PageLike['goto']; connected?: () => boolean } = {}) {
  const events: string[] = [];
  const page: PageLike = {
    goto: opts.goto ?? vi.fn<PageLike['goto']>().mockImplementation(async () => ({ status: () => 200 })),
    content: vi.fn<PageLike['content']>().mockImplementation(async () => '<html>job</html>'),
    url: () => 'https://www.linkedin.com/jobs/view/4012345678/',
    close: vi.fn<PageLike['close']>().mockImplementation(async () => {
      events.push('page.close');
    }),
  };
  const context: ContextLike = {
    newPage: vi.fn<ContextLike['newPage']>().mockImplementation(async () => page),
    close: vi.fn<ContextLike['close']>().mockImplementation(async () => {
      events.push('context.close');
    }),
  };
  const browser: BrowserLike = {
    newContext: vi.fn<BrowserLike['newContext']>().mockImplementation(async () => {
      events.push('newContext');
      return context;
    }),
    isConnected: opts.connected ?? (() => true),
    close: vi.fn<BrowserLike['close']>().mockImplementation(async () => {
      events.push('browser.close');
    }),
  };
  return { browser, context, page, events };
}

const URL_1 = 'https://www.linkedin.com/jobs/view/4012345678/';

describe('createPageFetcher', () => {
  it('loads the page with a 30 s timeout and returns status, final URL and HTML', async () => {
    const f = fakeBrowser();
    const fetcher = createPageFetcher({ launch: async () => f.browser, userAgent: () => 'UA-1' });
    expect(PAGE_TIMEOUT_MS).toBe(30_000);
    expect(await fetcher.fetchPage(URL_1)).toEqual({ status: 200, finalUrl: URL_1, html: '<html>job</html>' });
    expect(f.page.goto).toHaveBeenCalledWith(URL_1, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    expect(f.browser.newContext).toHaveBeenCalledWith({ userAgent: 'UA-1', locale: 'en-GB', viewport: { width: 1366, height: 900 } });
    expect(f.events).toEqual(['newContext', 'page.close', 'context.close']);
  });

  it('reports an unknown status as null', async () => {
    const f = fakeBrowser({ goto: vi.fn<PageLike['goto']>().mockImplementation(async () => null) });
    const fetcher = createPageFetcher({ launch: async () => f.browser, userAgent: () => 'UA' });
    expect((await fetcher.fetchPage(URL_1)).status).toBeNull();
  });

  it('reuses one browser and launches again only after it disconnects', async () => {
    let connected = true;
    const f = fakeBrowser({ connected: () => connected });
    const launch = vi.fn<() => Promise<BrowserLike>>().mockImplementation(async () => f.browser);
    const fetcher = createPageFetcher({ launch, userAgent: () => 'UA' });
    await fetcher.fetchPage(URL_1);
    await fetcher.fetchPage(URL_1);
    expect(launch).toHaveBeenCalledTimes(1);
    connected = false;
    await fetcher.fetchPage(URL_1);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('launches again after a failed launch', async () => {
    const f = fakeBrowser();
    const launch = vi.fn<() => Promise<BrowserLike>>()
      .mockImplementationOnce(async () => {
        throw new Error('no browser');
      })
      .mockImplementation(async () => f.browser);
    const fetcher = createPageFetcher({ launch, userAgent: () => 'UA' });
    await expect(fetcher.fetchPage(URL_1)).rejects.toThrow('no browser');
    await expect(fetcher.fetchPage(URL_1)).resolves.toMatchObject({ status: 200 });
  });

  it('closes the page and context when navigation fails, and rethrows', async () => {
    const f = fakeBrowser({
      goto: vi.fn<PageLike['goto']>().mockImplementation(async () => {
        throw new Error('Timeout 30000ms exceeded');
      }),
    });
    const fetcher = createPageFetcher({ launch: async () => f.browser, userAgent: () => 'UA' });
    await expect(fetcher.fetchPage(URL_1)).rejects.toThrow('Timeout 30000ms exceeded');
    expect(f.events).toEqual(['newContext', 'page.close', 'context.close']);
  });

  it('treats a 5xx answer as a load failure and still closes everything', async () => {
    const f = fakeBrowser({ goto: vi.fn<PageLike['goto']>().mockImplementation(async () => ({ status: () => 503 })) });
    const fetcher = createPageFetcher({ launch: async () => f.browser, userAgent: () => 'UA' });
    await expect(fetcher.fetchPage(URL_1)).rejects.toThrow('503');
    expect(f.events).toEqual(['newContext', 'page.close', 'context.close']);
  });

  it('opens one page at a time', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const goto = vi.fn<PageLike['goto']>()
      .mockImplementationOnce(async () => {
        await gate;
        return { status: () => 200 };
      })
      .mockImplementation(async () => ({ status: () => 200 }));
    const f = fakeBrowser({ goto });
    const fetcher = createPageFetcher({ launch: async () => f.browser, userAgent: () => 'UA' });
    const first = fetcher.fetchPage(URL_1);
    const second = fetcher.fetchPage(URL_1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(f.browser.newContext).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(f.events).toEqual(['newContext', 'page.close', 'context.close', 'newContext', 'page.close', 'context.close']);
  });

  it('close() closes the browser once it was launched', async () => {
    const f = fakeBrowser();
    const fetcher = createPageFetcher({ launch: async () => f.browser, userAgent: () => 'UA' });
    await fetcher.close();
    expect(f.browser.close).not.toHaveBeenCalled();
    await fetcher.fetchPage(URL_1);
    await fetcher.close();
    expect(f.browser.close).toHaveBeenCalledTimes(1);
  });
});
```

`server/tests/worker/no-playwright-in-api.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = fileURLToPath(new URL('../../src/', import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

describe('Playwright stays in the worker', () => {
  it('is named only by src/worker/browser.ts', () => {
    const users = files(src)
      .filter((f) => readFileSync(f, 'utf8').includes('playwright'))
      .map((f) => f.slice(src.length).replace(/\\/g, '/'));
    expect(users).toEqual(['worker/browser.ts']);
  });

  it('is loaded lazily, so importing the module never needs a browser', () => {
    const code = readFileSync(join(src, 'worker', 'browser.ts'), 'utf8');
    expect(code).toContain("await import('playwright-extra')");
    expect(code).toContain("await import('puppeteer-extra-plugin-stealth')");
    expect(code).not.toMatch(/^import .*(playwright|puppeteer)/m);
  });
});
```

Note: the guard is case-sensitive. Never write the lowercase word `playwright` in any other `server/src` file, comments included. "Chromium" or "the browser" are fine.

- [ ] **Step 5: Run them to verify they fail**

Run: `npm test -w server -- tests/scrapers/job-page.test.ts tests/worker/browser.test.ts tests/worker/no-playwright-in-api.test.ts`
Expected: FAIL. `Failed to load url ../../src/scrapers/job-page.js` and `../../src/worker/browser.js`. The guard test fails with `expected [] to deeply equal [ 'worker/browser.ts' ]`.

- [ ] **Step 6: Implement the extractor** `server/src/scrapers/job-page.ts`

```ts
import * as cheerio from 'cheerio';
import type { JobFetchReason, LinkSource } from '@joblume/shared';
import { domainFromWebsite, normaliseJob, tidyLocation, type NormalisedJob } from '../domain/jobs.js';
import { htmlToText } from '../lib/html.js';

/** What the browser saw: the main document's HTTP status (null when unknown), the URL after redirects, and the HTML. */
export interface FetchedPage {
  status: number | null;
  finalUrl: string;
  html: string;
}

export type ExtractResult = { ok: true; job: NormalisedJob } | { ok: false; reason: JobFetchReason };

type Json = Record<string, unknown>;
type Doc = ReturnType<typeof cheerio.load>;

const BLOCKED_STATUS = new Set([403, 429, 999]); // LinkedIn answers 999 to traffic it thinks is automated
const LOGIN_PATH = /^\/(?:login|authwall|checkpoint|signup|uas\/login|account\/login|auth)(?:\/|$)/i;
// Only checked when no job could be read, so a word inside a real job page cannot cause a false failure.
const BLOCK_MARKERS = [/captcha/i, /verify you are human/i, /unusual (?:traffic|activity)/i, /security check/i, /<title>\s*just a moment/i, /challenge-platform|cf-challenge/i];
const GONE_MARKERS = [/no longer available/i, /this job has expired/i, /job has been removed/i, /page not found/i, /could not be found/i];
const LOGIN_MARKERS = /name="session_key"|id="login-email"|action="[^"]*(?:uas\/login|\/login|signin)[^"]*"/i;

const SELECTORS: Record<LinkSource, Record<'title' | 'company' | 'location' | 'description', string[]>> = {
  linkedin: {
    title: ['h1.top-card-layout__title', 'h1.topcard__title', 'h1'],
    company: ['a.topcard__org-name-link', '.topcard__org-name-link', 'span.topcard__flavor a'],
    location: ['span.topcard__flavor--bullet', '.topcard__flavor--bullet'],
    description: ['div.show-more-less-html__markup', 'div.description__text'],
  },
  indeed: {
    title: ['h1[data-testid="jobsearch-JobInfoHeader-title"]', 'h1.jobsearch-JobInfoHeader-title', 'h2.jobsearch-JobInfoHeader-title', 'h1'],
    company: ['[data-testid="inlineHeader-companyName"]', '[data-company-name="true"]', '.jobsearch-CompanyInfoContainer a'],
    location: ['[data-testid="inlineHeader-companyLocation"]', '[data-testid="job-location"]'],
    description: ['#jobDescriptionText', '.jobsearch-jobDescriptionText'],
  },
};

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
function hasType(node: Json, type: string): boolean {
  const t = node['@type'];
  return t === type || (Array.isArray(t) && t.includes(type));
}

function findJobPosting(value: unknown, depth = 0): Json | null {
  if (depth > 4) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isObj(value)) return null;
  if (hasType(value, 'JobPosting')) return value;
  return findJobPosting(value['@graph'], depth + 1);
}

function readJsonLd($: Doc): Json | null {
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const found = findJobPosting(JSON.parse($(el).contents().text()));
      if (found) return found;
    } catch {
      // A broken block is skipped; the selectors still get a chance.
    }
  }
  return null;
}

function ldCompany(ld: Json): { name: string; domain: string | null } {
  const org = ld.hiringOrganization;
  if (!isObj(org)) return { name: str(org), domain: null };
  return { name: str(org.name), domain: domainFromWebsite(org.sameAs) ?? domainFromWebsite(org.url) };
}

const placeName = (v: unknown) => (isObj(v) ? str(v.name) : str(v));

function ldLocation(ld: Json): string {
  if (str(ld.jobLocationType).toUpperCase() === 'TELECOMMUTE') return 'Remote';
  const places: unknown[] = Array.isArray(ld.jobLocation) ? ld.jobLocation : [ld.jobLocation];
  const place = places.find(isObj);
  const address = place && isObj(place.address) ? place.address : null;
  if (!address) return '';
  return tidyLocation([str(address.addressLocality), str(address.addressRegion), placeName(address.addressCountry)]);
}

function ldDescription(ld: Json): string {
  const raw = str(ld.description);
  // LinkedIn escapes the HTML inside JSON-LD ("&lt;p&gt;"): decode it once, then strip the tags.
  return htmlToText(/&lt;\/?[a-z]/i.test(raw) ? htmlToText(raw) : raw);
}

function firstText($: Doc, selectors: string[]): string {
  for (const s of selectors) {
    const text = $(s).first().text().replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return '';
}

function firstBlockText($: Doc, selectors: string[]): string {
  for (const s of selectors) {
    const el = $(s).first();
    if (!el.length) continue;
    const text = htmlToText(el.html() ?? '');
    if (text) return text;
  }
  return '';
}

const cleanTitle = (t: string) => t.replace(/\s*-\s*job post$/i, '').trim();

function isLoginUrl(finalUrl: string): boolean {
  try {
    const u = new URL(finalUrl);
    return LOGIN_PATH.test(u.pathname) || u.hostname.toLowerCase() === 'secure.indeed.com';
  } catch {
    return false;
  }
}

const fail = (reason: JobFetchReason): ExtractResult => ({ ok: false, reason });

/** Pure: turns one loaded LinkedIn or Indeed job page into a job, or a reason it cannot be used. */
export function extractJobPage(page: FetchedPage, input: { url: string; source: LinkSource }): ExtractResult {
  if (page.status === 404 || page.status === 410) return fail('not_found');
  if (page.status === 401 || isLoginUrl(page.finalUrl)) return fail('login_required');
  if (page.status !== null && BLOCKED_STATUS.has(page.status)) return fail('blocked');

  const $ = cheerio.load(page.html);
  const ld = readJsonLd($) ?? {};
  const sel = SELECTORS[input.source];
  const company = ldCompany(ld);
  const job = normaliseJob({
    title: str(ld.title) || cleanTitle(firstText($, sel.title)),
    company: company.name || firstText($, sel.company),
    location: ldLocation(ld) || firstText($, sel.location),
    description: ldDescription(ld) || firstBlockText($, sel.description),
    source: input.source,
    url: input.url,
    companyDomain: company.domain,
  });
  if (job) return { ok: true, job };

  if (BLOCK_MARKERS.some((re) => re.test(page.html))) return fail('blocked');
  if (GONE_MARKERS.some((re) => re.test(page.html))) return fail('not_found');
  if (LOGIN_MARKERS.test(page.html)) return fail('login_required');
  return fail('unparseable');
}
```

- [ ] **Step 7: Implement the fetcher** `server/src/worker/browser.ts`

```ts
import type { FetchedPage } from '../scrapers/job-page.js';

export const PAGE_TIMEOUT_MS = 30_000;

/** The few browser methods we use. Tests pass fakes; production passes a stealth Chromium. */
export interface PageLike {
  goto(url: string, opts: { waitUntil: 'domcontentloaded'; timeout: number }): Promise<{ status(): number } | null>;
  content(): Promise<string>;
  url(): string;
  close(): Promise<void>;
}

export interface ContextLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

export interface BrowserLike {
  newContext(opts: { userAgent: string; locale: string; viewport: { width: number; height: number } }): Promise<ContextLike>;
  isConnected(): boolean;
  close(): Promise<void>;
}

export interface PageFetcher {
  fetchPage(url: string): Promise<FetchedPage>;
  close(): Promise<void>;
}

/** One reused browser, one page at a time, a fresh context per page, everything closed in finally. */
export function createPageFetcher(d: { launch(): Promise<BrowserLike>; userAgent(): string; timeoutMs?: number }): PageFetcher {
  const timeout = d.timeoutMs ?? PAGE_TIMEOUT_MS;
  let browser: Promise<BrowserLike> | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  async function getBrowser(): Promise<BrowserLike> {
    if (browser) {
      const current = await browser.catch(() => null);
      if (current && current.isConnected()) return current;
    }
    browser = d.launch();
    return browser;
  }

  async function fetchOnce(url: string): Promise<FetchedPage> {
    const b = await getBrowser();
    const context = await b.newContext({ userAgent: d.userAgent(), locale: 'en-GB', viewport: { width: 1366, height: 900 } });
    let page: PageLike | null = null;
    try {
      page = await context.newPage();
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      const status = response ? response.status() : null;
      // A server error is temporary: throw so the queue retries it.
      if (status !== null && status >= 500) throw new Error(`The job site answered ${status}`);
      return { status, finalUrl: page.url(), html: await page.content() };
    } finally {
      if (page) await page.close().catch(() => undefined);
      await context.close().catch(() => undefined);
    }
  }

  return {
    fetchPage(url) {
      const run = queue.then(() => fetchOnce(url));
      queue = run.catch(() => undefined);
      return run;
    },
    async close() {
      const current = browser;
      browser = null;
      if (!current) return;
      const b = await current.catch(() => null);
      if (b) await b.close().catch(() => undefined);
    },
  };
}

let stealthApplied = false;

/** Loaded lazily so the API process and the test suite never load the browser packages. */
export async function launchStealthChromium(): Promise<BrowserLike> {
  const { chromium } = await import('playwright-extra');
  const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth');
  if (!stealthApplied) {
    chromium.use(StealthPlugin());
    stealthApplied = true;
  }
  return chromium.launch({ headless: true });
}
```

- [ ] **Step 8: Run the tests and the typecheck**

Run: `npm test -w server -- tests/scrapers/job-page.test.ts tests/worker/browser.test.ts tests/worker/no-playwright-in-api.test.ts`
Expected: PASS (all tests). No browser is launched.

Run: `npm run typecheck -w server`
Expected: exits 0. This was checked during planning with TypeScript 7.0.2 and NodeNext: the dynamic-import launcher returns a Playwright `Browser`, which is assignable to `BrowserLike`.

- [ ] **Step 9: Commit**

```bash
git add server/package.json package-lock.json server/src/scrapers/job-page.ts server/src/worker/browser.ts server/tests/fixtures/linkedin-job.html server/tests/fixtures/linkedin-expired.html server/tests/fixtures/indeed-job.html server/tests/fixtures/indeed-blocked.html server/tests/scrapers/job-page.test.ts server/tests/worker/browser.test.ts server/tests/worker/no-playwright-in-api.test.ts
git commit -m "$(cat <<'EOF'
feat(worker): LinkedIn/Indeed page extractors and a reused stealth browser fetcher

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: fetch-job queue, job_fetches repo, user-only matching and the worker

**Files:**
- Modify: `server/src/queues.ts`, `server/src/worker/match.ts`, `server/src/services/jobs/repo.ts`, `server/src/worker/index.ts`
- Create: `server/src/services/jobs/fetches-repo.ts`, `server/src/worker/fetch-job.ts`
- Test: `server/tests/queues-fetch-job.test.ts`, `server/tests/worker/match-user-job.test.ts`, `server/tests/services/job-repos.test.ts`, `server/tests/worker/fetch-job.test.ts`

**Interfaces:**
- Consumes: `LinkSource`, `JobFetch`, `JobFetchReason` (Task 1); `extractJobPage`, `FetchedPage` (Task 5); `createPageFetcher`, `launchStealthChromium` (Task 5); `UnrecoverableError` import (Task 4); `insertJobs`, `dedupeKey`, `NormalisedJob` (existing).
- Produces (`queues.ts`): `QUEUES.fetchJob = 'fetch-job'`; `type FetchJobData = { userId: string; url: string; source: LinkSource }`; `MatchJobData` gains `{ kind: 'user-job'; userId: string; jobId: string }`; `fetchJobJobId(userId: string, url: string): string`; `FETCH_JOB_OPTIONS` (attempts 2); `createQueues(...).fetchJob`; `enqueueFetchJob(queue: Pick<Queue<FetchJobData>, 'getJob' | 'add'>, data: FetchJobData): Promise<void>`.
- Produces (`worker/match.ts`): `matchUserJob(userId: string, jobId: string, d: MatchDeps): Promise<number>`.
- Produces (`services/jobs/repo.ts`): `findJobIdByUrl(db: Db, url: string): Promise<string | null>`, `saveJob(db: Db, job: NormalisedJob): Promise<string>`.
- Produces (`services/jobs/fetches-repo.ts`): `type JobFetchState = { status: 'queued' } | { status: 'done'; jobId: string } | { status: 'failed'; reason: JobFetchReason }`; `interface JobFetchesRepo { save(userId: string, url: string, state: JobFetchState): Promise<void>; listRecent(userId: string, limit: number): Promise<JobFetch[]> }`; `createJobFetchesRepo(db: Db, now?: () => Date): JobFetchesRepo`.
- Produces (`worker/fetch-job.ts`): `class FetchJobError extends Error { reason: JobFetchReason }`; `interface FetchJobDeps`; `runFetchJob(data: FetchJobData, d: FetchJobDeps): Promise<{ jobId: string }>`.

- [ ] **Step 1: Write the failing queue and match tests**

`server/tests/queues-fetch-job.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { enqueueFetchJob, FETCH_JOB_OPTIONS, fetchJobJobId, QUEUES, type FetchJobData } from '../src/queues.js';

const data: FetchJobData = { userId: 'u1', url: 'https://www.linkedin.com/jobs/view/4012345678/', source: 'linkedin' };

type Existing = { isFailed(): Promise<boolean>; isCompleted(): Promise<boolean>; remove(): Promise<void> };
function fakeQueue(existing?: Existing) {
  const getJob = vi.fn(async (_id: string) => existing as never);
  const add = vi.fn(async (..._a: unknown[]) => undefined as never);
  return { getJob, add };
}

describe('fetch-job queue', () => {
  it('is named fetch-job and tries twice', () => {
    expect(QUEUES.fetchJob).toBe('fetch-job');
    expect(FETCH_JOB_OPTIONS.attempts).toBe(2);
  });

  it('derives a stable id from the user and the canonical link, without a colon', () => {
    const id = fetchJobJobId('u1', data.url);
    expect(id).toBe(fetchJobJobId('u1', data.url));
    expect(id).toMatch(/^fetch-job-u1-[0-9a-f]{32}$/);
    expect(fetchJobJobId('u2', data.url)).not.toBe(id);
    expect(fetchJobJobId('u1', 'https://ng.indeed.com/viewjob?jk=0123456789abcdef')).not.toBe(id);
  });
});

describe('enqueueFetchJob', () => {
  const id = fetchJobJobId('u1', data.url);

  it('adds with the deterministic id', async () => {
    const q = fakeQueue();
    await enqueueFetchJob(q, data);
    expect(q.getJob).toHaveBeenCalledWith(id);
    expect(q.add).toHaveBeenCalledWith('fetch-job', data, { jobId: id });
  });

  it.each([
    ['failed', true, false],
    ['completed', false, true],
  ])('removes a %s job with the same id first, so the link can be fetched again', async (_n, failed, completed) => {
    const order: string[] = [];
    const q = fakeQueue({
      isFailed: async () => failed,
      isCompleted: async () => completed,
      remove: async () => {
        order.push('remove');
      },
    });
    q.add.mockImplementation(async () => {
      order.push('add');
      return undefined as never;
    });
    await enqueueFetchJob(q, data);
    expect(order).toEqual(['remove', 'add']);
  });

  it('leaves a waiting or running job alone', async () => {
    const remove = vi.fn(async () => undefined);
    const q = fakeQueue({ isFailed: async () => false, isCompleted: async () => false, remove });
    await enqueueFetchJob(q, data);
    expect(remove).not.toHaveBeenCalled();
    expect(q.add).toHaveBeenCalledTimes(1);
  });
});
```

`server/tests/worker/match-user-job.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { JobRow, ProfileRow } from '../../src/db/types.js';
import { matchUserJob, type MatchDeps } from '../../src/worker/match.js';

const job = (over: Partial<JobRow> = {}): JobRow => ({
  id: 'j1', title: 'Chief Happiness Officer', company: 'Acme', location: 'Paris', description: 'd', source: 'linkedin',
  url: 'https://www.linkedin.com/jobs/view/4012345678/', company_domain: null, dedupe_key: 'acme|chief happiness officer',
  created_at: '2026-10-18T00:00:00Z', ...over,
});
const profile = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  user_id: 'u1', base_cv_text: 'cv', base_cv_url: 'p', base_cv_filename: null, skills: [], years_experience: 3, desired_roles: ['backend engineer'],
  location: 'Lagos', salary_min: null, salary_max: null, apply_mode: 'manual', auto_threshold: 80, daily_cap: 20,
  auto_followup: false, updated_at: '', ...over,
});

function deps(over: Partial<MatchDeps> = {}): MatchDeps {
  return {
    loadJob: vi.fn<MatchDeps['loadJob']>().mockImplementation(async () => job()),
    loadCandidates: vi.fn<MatchDeps['loadCandidates']>().mockImplementation(async () => []),
    loadProfile: vi.fn<MatchDeps['loadProfile']>().mockImplementation(async () => profile()),
    loadRecentJobs: vi.fn<MatchDeps['loadRecentJobs']>().mockImplementation(async () => []),
    existingJobIds: vi.fn<MatchDeps['existingJobIds']>().mockImplementation(async () => new Set<string>()),
    enqueueTailor: vi.fn<MatchDeps['enqueueTailor']>().mockImplementation(async () => undefined),
    ...over,
  };
}

describe('matchUserJob', () => {
  it('queues tailoring for that user only, even when the title and place do not match their preferences', async () => {
    const d = deps();
    expect(await matchUserJob('u1', 'j1', d)).toBe(1);
    expect(d.enqueueTailor).toHaveBeenCalledWith('u1', 'j1');
    expect(d.enqueueTailor).toHaveBeenCalledTimes(1);
    expect(d.loadCandidates).not.toHaveBeenCalled();
    expect(d.existingJobIds).toHaveBeenCalledWith('u1', ['j1']);
  });

  it('does nothing when the user already has an application for the job', async () => {
    const d = deps({ existingJobIds: vi.fn<MatchDeps['existingJobIds']>().mockImplementation(async () => new Set(['j1'])) });
    expect(await matchUserJob('u1', 'j1', d)).toBe(0);
    expect(d.enqueueTailor).not.toHaveBeenCalled();
  });

  it.each([
    ['there is no profile', { loadProfile: vi.fn<MatchDeps['loadProfile']>().mockImplementation(async () => null) }],
    ['the user has no CV yet', { loadProfile: vi.fn<MatchDeps['loadProfile']>().mockImplementation(async () => profile({ base_cv_text: null })) }],
    ['the job is gone', { loadJob: vi.fn<MatchDeps['loadJob']>().mockImplementation(async () => null) }],
  ])('does nothing when %s', async (_n, over) => {
    const d = deps(over);
    expect(await matchUserJob('u1', 'j1', d)).toBe(0);
    expect(d.enqueueTailor).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the failing repo test** in `server/tests/services/job-repos.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { NormalisedJob } from '../../src/domain/jobs.js';
import type { Db } from '../../src/lib/supabase.js';
import { createJobFetchesRepo } from '../../src/services/jobs/fetches-repo.js';
import { findJobIdByUrl, saveJob } from '../../src/services/jobs/repo.js';

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
  const db = {
    from: (table: string) => {
      calls.push(['from', table]);
      return chain;
    },
  };
  return { db: db as unknown as Db, calls };
}

const NOW = new Date('2026-10-18T10:00:00.000Z');
const URL_1 = 'https://www.linkedin.com/jobs/view/4012345678/';
const job: NormalisedJob = {
  title: 'Data Analyst', company: 'Acme Analytics', location: 'Lagos', description: 'd', source: 'linkedin', url: URL_1, companyDomain: null,
};

describe('createJobFetchesRepo', () => {
  it('records a new request as queued with fresh timestamps, one row per user and link', async () => {
    const { db, calls } = fakeDb();
    await createJobFetchesRepo(db, () => NOW).save('u1', URL_1, { status: 'queued' });
    expect(calls).toEqual([
      ['from', 'job_fetches'],
      ['upsert', {
        user_id: 'u1', url: URL_1, status: 'queued', reason: null, job_id: null,
        updated_at: NOW.toISOString(), created_at: NOW.toISOString(),
      }, { onConflict: 'user_id,url' }],
    ]);
  });

  it('records done with the job id and failed with the reason, keeping created_at', async () => {
    const { db, calls } = fakeDb();
    const repo = createJobFetchesRepo(db, () => NOW);
    await repo.save('u1', URL_1, { status: 'done', jobId: 'j1' });
    await repo.save('u1', URL_1, { status: 'failed', reason: 'login_required' });
    expect(calls[1]).toEqual(['upsert', { user_id: 'u1', url: URL_1, status: 'done', reason: null, job_id: 'j1', updated_at: NOW.toISOString() }, { onConflict: 'user_id,url' }]);
    expect(calls[3]).toEqual(['upsert', { user_id: 'u1', url: URL_1, status: 'failed', reason: 'login_required', job_id: null, updated_at: NOW.toISOString() }, { onConflict: 'user_id,url' }]);
  });

  it('throws a database error', async () => {
    const { db } = fakeDb([{ error: { message: 'down' } }]);
    await expect(createJobFetchesRepo(db).save('u1', URL_1, { status: 'queued' })).rejects.toEqual({ message: 'down' });
  });

  it('lists the user\'s most recent rows only', async () => {
    const rows = [{ id: 'f1', url: URL_1, status: 'queued', reason: null, job_id: null, created_at: 'c', updated_at: 'u' }];
    const { db, calls } = fakeDb([{ data: rows }]);
    expect(await createJobFetchesRepo(db).listRecent('u1', 20)).toEqual(rows);
    expect(calls).toEqual([
      ['from', 'job_fetches'],
      ['select', 'id, url, status, reason, job_id, created_at, updated_at'],
      ['eq', 'user_id', 'u1'],
      ['order', 'created_at', { ascending: false }],
      ['limit', 20],
    ]);
  });
});

describe('findJobIdByUrl', () => {
  it('returns the stored job id for the canonical link', async () => {
    const { db, calls } = fakeDb([{ data: { id: 'j1' } }]);
    expect(await findJobIdByUrl(db, URL_1)).toBe('j1');
    expect(calls).toContainEqual(['eq', 'url', URL_1]);
  });

  it('returns null when no job has that link', async () => {
    const { db } = fakeDb([{ data: null }]);
    expect(await findJobIdByUrl(db, URL_1)).toBeNull();
  });
});

describe('saveJob', () => {
  it('returns the id of a newly inserted job', async () => {
    const { db } = fakeDb([{ data: [{ id: 'j-new' }] }]);
    expect(await saveJob(db, job)).toBe('j-new');
  });

  it('returns the stored job with the same company and title when the insert was skipped', async () => {
    const { db, calls } = fakeDb([{ data: [] }, { data: { id: 'j-old' } }]);
    expect(await saveJob(db, job)).toBe('j-old');
    expect(calls).toContainEqual(['eq', 'dedupe_key', 'acme analytics|data analyst']);
  });

  it('throws when the insert was skipped and nothing matches', async () => {
    const { db } = fakeDb([{ data: [] }, { data: null }]);
    await expect(saveJob(db, job)).rejects.toThrow('no matching job');
  });
});
```

- [ ] **Step 3: Write the failing worker test** in `server/tests/worker/fetch-job.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { FetchedPage } from '../../src/scrapers/job-page.js';
import { FetchJobError, runFetchJob, type FetchJobDeps } from '../../src/worker/fetch-job.js';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const LINK = { userId: 'u1', url: 'https://www.linkedin.com/jobs/view/4012345678/', source: 'linkedin' as const };
const page = (over: Partial<FetchedPage> = {}): FetchedPage => ({ status: 200, finalUrl: LINK.url, html: fixture('linkedin-job.html'), ...over });

function make(over: Partial<FetchJobDeps> = {}): FetchJobDeps {
  return {
    findJobIdByUrl: vi.fn<FetchJobDeps['findJobIdByUrl']>().mockImplementation(async () => null),
    fetchPage: vi.fn<FetchJobDeps['fetchPage']>().mockImplementation(async () => page()),
    saveJob: vi.fn<FetchJobDeps['saveJob']>().mockImplementation(async () => 'j-new'),
    saveFetch: vi.fn<FetchJobDeps['saveFetch']>().mockImplementation(async () => undefined),
    enqueueUserMatch: vi.fn<FetchJobDeps['enqueueUserMatch']>().mockImplementation(async () => undefined),
    sleep: vi.fn<FetchJobDeps['sleep']>().mockImplementation(async () => undefined),
    randomDelay: () => 3_210,
    isFinalAttempt: false,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...over,
  };
}

describe('runFetchJob: success', () => {
  it('waits, loads the page, saves the job, marks the link done and matches it for that user only', async () => {
    const d = make();
    expect(await runFetchJob(LINK, d)).toEqual({ jobId: 'j-new' });
    expect(d.sleep).toHaveBeenCalledWith(3_210);
    expect(vi.mocked(d.sleep).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(d.fetchPage).mock.invocationCallOrder[0]!);
    expect(d.fetchPage).toHaveBeenCalledWith(LINK.url);
    expect(d.saveJob).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Data Analyst', company: 'Acme Analytics', source: 'linkedin', url: LINK.url,
    }));
    expect(d.saveFetch).toHaveBeenCalledWith('u1', LINK.url, { status: 'done', jobId: 'j-new' });
    expect(d.enqueueUserMatch).toHaveBeenCalledWith('u1', 'j-new');
    expect(d.enqueueUserMatch).toHaveBeenCalledTimes(1);
  });

  it('saves an Indeed job with the indeed source', async () => {
    const url = 'https://ng.indeed.com/viewjob?jk=0123456789abcdef';
    const d = make({ fetchPage: vi.fn<FetchJobDeps['fetchPage']>().mockImplementation(async () => page({ finalUrl: url, html: fixture('indeed-job.html') })) });
    await runFetchJob({ userId: 'u1', url, source: 'indeed' }, d);
    expect(d.saveJob).toHaveBeenCalledWith(expect.objectContaining({ title: 'Backend Engineer', company: 'Paystack', source: 'indeed', url }));
  });

  it('skips the browser when the link is already a stored job', async () => {
    const d = make({ findJobIdByUrl: vi.fn<FetchJobDeps['findJobIdByUrl']>().mockImplementation(async () => 'j-old') });
    expect(await runFetchJob(LINK, d)).toEqual({ jobId: 'j-old' });
    expect(d.fetchPage).not.toHaveBeenCalled();
    expect(d.sleep).not.toHaveBeenCalled();
    expect(d.saveFetch).toHaveBeenCalledWith('u1', LINK.url, { status: 'done', jobId: 'j-old' });
    expect(d.enqueueUserMatch).toHaveBeenCalledWith('u1', 'j-old');
  });

  it('keeps everything scoped to the user who pasted the link', async () => {
    const d = make();
    await runFetchJob({ ...LINK, userId: 'u2' }, d);
    expect(d.saveFetch).toHaveBeenCalledWith('u2', LINK.url, { status: 'done', jobId: 'j-new' });
    expect(d.enqueueUserMatch).toHaveBeenCalledWith('u2', 'j-new');
    expect(vi.mocked(d.saveFetch).mock.calls.every((c) => c[0] === 'u2')).toBe(true);
  });
});

describe('runFetchJob: failures', () => {
  it.each([
    ['blocked', page({ status: 999, html: '' })],
    ['blocked', page({ html: fixture('indeed-blocked.html') })],
    ['login_required', page({ finalUrl: 'https://www.linkedin.com/authwall?trk=x' })],
    ['not_found', page({ html: fixture('linkedin-expired.html') })],
    ['unparseable', page({ html: '<html><body><h1>Data Analyst</h1></body></html>' })],
  ])('records %s, inserts nothing and fails with that reason', async (reason, loaded) => {
    const d = make({ fetchPage: vi.fn<FetchJobDeps['fetchPage']>().mockImplementation(async () => loaded) });
    const err = await runFetchJob(LINK, d).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchJobError);
    expect((err as FetchJobError).reason).toBe(reason);
    expect(d.saveFetch).toHaveBeenCalledWith('u1', LINK.url, { status: 'failed', reason });
    expect(d.saveJob).not.toHaveBeenCalled();
    expect(d.enqueueUserMatch).not.toHaveBeenCalled();
  });

  it('rethrows a page that did not load so the queue retries it, recording nothing yet', async () => {
    const boom = new Error('Timeout 30000ms exceeded');
    const d = make({ fetchPage: vi.fn<FetchJobDeps['fetchPage']>().mockImplementation(async () => { throw boom; }) });
    await expect(runFetchJob(LINK, d)).rejects.toBe(boom);
    expect(d.saveFetch).not.toHaveBeenCalled();
  });

  it('records blocked when the page still does not load on the last attempt', async () => {
    const d = make({
      isFinalAttempt: true,
      fetchPage: vi.fn<FetchJobDeps['fetchPage']>().mockImplementation(async () => { throw new Error('net::ERR_CONNECTION_RESET'); }),
    });
    await expect(runFetchJob(LINK, d)).rejects.toMatchObject({ name: 'FetchJobError', reason: 'blocked' });
    expect(d.saveFetch).toHaveBeenCalledWith('u1', LINK.url, { status: 'failed', reason: 'blocked' });
    expect(d.saveJob).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npm test -w server -- tests/queues-fetch-job.test.ts tests/worker/match-user-job.test.ts tests/services/job-repos.test.ts tests/worker/fetch-job.test.ts`
Expected: FAIL. `fetchJobJobId is not a function`, `matchUserJob is not a function`, `Failed to load url ../../src/services/jobs/fetches-repo.js` and `Failed to load url ../../src/worker/fetch-job.js`.

- [ ] **Step 5: Add the queue** (`server/src/queues.ts`)

Replace the first three lines

```ts
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { ScrapeSource } from './scrapers/index.js';
```

with

```ts
import { createHash } from 'node:crypto';
import type { LinkSource } from '@joblume/shared';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { ScrapeSource } from './scrapers/index.js';
```

Replace

```ts
export const QUEUES = { scrape: 'scrape', match: 'match', tailor: 'tailor', findEmail: 'find-email', followups: 'followups', send: 'send' } as const;
```

with

```ts
export const QUEUES = { scrape: 'scrape', match: 'match', tailor: 'tailor', findEmail: 'find-email', followups: 'followups', send: 'send', fetchJob: 'fetch-job' } as const;
```

Replace

```ts
export type MatchJobData = { kind: 'job'; jobId: string } | { kind: 'user'; userId: string };
```

with

```ts
export type MatchJobData =
  | { kind: 'job'; jobId: string }
  | { kind: 'user'; userId: string }
  | { kind: 'user-job'; userId: string; jobId: string };
/** A pasted job link, already canonicalised. */
export type FetchJobData = { userId: string; url: string; source: LinkSource };
```

Replace

```ts
export const sendJobId = (data: SendJobData) =>
  data.kind === 'application' ? `auto-send-${data.applicationId}` : `auto-followup-${data.followUpId}`;
```

with

```ts
export const sendJobId = (data: SendJobData) =>
  data.kind === 'application' ? `auto-send-${data.applicationId}` : `auto-followup-${data.followUpId}`;

/** A URL contains ":", which BullMQ forbids in ids, so the link is hashed. One fetch per (user, link). */
export const fetchJobJobId = (userId: string, url: string) =>
  `fetch-job-${userId}-${createHash('sha256').update(url).digest('hex').slice(0, 32)}`;
```

Replace

```ts
export function createQueues(connection: Redis) {
```

with

```ts
// One retry for a page that did not load; finished ids expire after an hour so the same link can be pasted again.
export const FETCH_JOB_OPTIONS = {
  ...BASE_JOB_OPTIONS,
  attempts: 2,
  backoff: { type: 'exponential' as const, delay: 60_000 },
  removeOnComplete: { age: 3_600, count: 1000 },
  removeOnFail: { age: 3_600 },
};

export function createQueues(connection: Redis) {
```

Replace

```ts
    send: new Queue<SendJobData>(QUEUES.send, { connection, defaultJobOptions: { ...BASE_JOB_OPTIONS, attempts: 1 } }),
  };
}
```

with

```ts
    send: new Queue<SendJobData>(QUEUES.send, { connection, defaultJobOptions: { ...BASE_JOB_OPTIONS, attempts: 1 } }),
    fetchJob: new Queue<FetchJobData>(QUEUES.fetchJob, { connection, defaultJobOptions: FETCH_JOB_OPTIONS }),
  };
}

/** Queue a page fetch. A finished (failed or completed) job with the same id is removed first so the link can be tried again. */
export async function enqueueFetchJob(queue: Pick<Queue<FetchJobData>, 'getJob' | 'add'>, data: FetchJobData): Promise<void> {
  const id = fetchJobJobId(data.userId, data.url);
  const existing = await queue.getJob(id);
  if (existing && ((await existing.isFailed()) || (await existing.isCompleted()))) await existing.remove();
  await queue.add('fetch-job', data, { jobId: id });
}
```

- [ ] **Step 6: Add user-only matching** by appending to `server/src/worker/match.ts`

```ts

/** The user pasted this job: queue tailoring for them alone. No prefilter, because they chose it. */
export async function matchUserJob(userId: string, jobId: string, d: MatchDeps): Promise<number> {
  const profile = await d.loadProfile(userId);
  if (!profile || !profile.base_cv_text) return 0;
  const job = await d.loadJob(jobId);
  if (!job) return 0;
  const done = await d.existingJobIds(userId, [job.id]);
  if (done.has(job.id)) return 0;
  await d.enqueueTailor(userId, job.id);
  return 1;
}
```

- [ ] **Step 7: Add the repos**

Append to `server/src/services/jobs/repo.ts`:

```ts

export async function findJobIdByUrl(db: Db, url: string): Promise<string | null> {
  const { data, error } = await db.from('jobs').select('id').eq('url', url).limit(1).maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

/** Inserts one job and returns its id; when the same company and title is already stored, returns that job's id. */
export async function saveJob(db: Db, job: NormalisedJob): Promise<string> {
  const [id] = await insertJobs(db, [job]);
  if (id) return id;
  const { data, error } = await db.from('jobs').select('id').eq('dedupe_key', dedupeKey(job.company, job.title)).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('job insert was skipped but no matching job was found');
  return (data as { id: string }).id;
}
```

Create `server/src/services/jobs/fetches-repo.ts`:

```ts
import type { JobFetch, JobFetchReason } from '@joblume/shared';
import type { Db } from '../../lib/supabase.js';

export type JobFetchState =
  | { status: 'queued' }
  | { status: 'done'; jobId: string }
  | { status: 'failed'; reason: JobFetchReason };

export interface JobFetchesRepo {
  save(userId: string, url: string, state: JobFetchState): Promise<void>;
  listRecent(userId: string, limit: number): Promise<JobFetch[]>;
}

const COLUMNS = 'id, url, status, reason, job_id, created_at, updated_at';

/** job_fetches is server-write-only: this service-role repo is the only writer. Every query is scoped to one user. */
export function createJobFetchesRepo(db: Db, now: () => Date = () => new Date()): JobFetchesRepo {
  return {
    async save(userId, url, state) {
      const at = now().toISOString();
      const row = {
        user_id: userId,
        url,
        status: state.status,
        reason: state.status === 'failed' ? state.reason : null,
        job_id: state.status === 'done' ? state.jobId : null,
        updated_at: at,
        // A new paste moves the link to the top of the recent list.
        ...(state.status === 'queued' ? { created_at: at } : {}),
      };
      const { error } = await db.from('job_fetches').upsert(row, { onConflict: 'user_id,url' });
      if (error) throw error;
    },
    async listRecent(userId, limit) {
      const { data, error } = await db
        .from('job_fetches')
        .select(COLUMNS)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as JobFetch[];
    },
  };
}
```

- [ ] **Step 8: Implement the job** `server/src/worker/fetch-job.ts`

```ts
import type { JobFetchReason } from '@joblume/shared';
import type { NormalisedJob } from '../domain/jobs.js';
import type { Logger } from '../lib/logger.js';
import type { FetchJobData } from '../queues.js';
import { extractJobPage, type FetchedPage } from '../scrapers/job-page.js';
import type { JobFetchState } from '../services/jobs/fetches-repo.js';

/** A page that loaded but cannot be used. Final: retrying would only hit the site again. */
export class FetchJobError extends Error {
  constructor(public readonly reason: JobFetchReason) {
    super(`job page could not be used: ${reason}`);
    this.name = 'FetchJobError';
  }
}

export interface FetchJobDeps {
  findJobIdByUrl(url: string): Promise<string | null>;
  fetchPage(url: string): Promise<FetchedPage>;
  saveJob(job: NormalisedJob): Promise<string>;
  saveFetch(userId: string, url: string, state: JobFetchState): Promise<void>;
  enqueueUserMatch(userId: string, jobId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  randomDelay(): number;
  /** True on the last queue attempt: a page that still does not load is then recorded as blocked. */
  isFinalAttempt: boolean;
  log: Logger;
}

export async function runFetchJob(data: FetchJobData, d: FetchJobDeps): Promise<{ jobId: string }> {
  const finish = async (jobId: string) => {
    await d.saveFetch(data.userId, data.url, { status: 'done', jobId });
    await d.enqueueUserMatch(data.userId, jobId);
    return { jobId };
  };
  const fail = async (reason: JobFetchReason): Promise<never> => {
    await d.saveFetch(data.userId, data.url, { status: 'failed', reason });
    d.log.info({ userId: data.userId, url: data.url, reason }, 'job link could not be used');
    throw new FetchJobError(reason);
  };

  const existing = await d.findJobIdByUrl(data.url);
  if (existing) return finish(existing);

  await d.sleep(d.randomDelay());
  let page: FetchedPage;
  try {
    page = await d.fetchPage(data.url);
  } catch (err) {
    d.log.warn({ err, userId: data.userId, url: data.url, finalAttempt: d.isFinalAttempt }, 'job page did not load');
    if (d.isFinalAttempt) return fail('blocked');
    throw err;
  }

  const result = extractJobPage(page, { url: data.url, source: data.source });
  if (!result.ok) return fail(result.reason);
  return finish(await d.saveJob(result.job));
}
```

- [ ] **Step 9: Wire the worker** (`server/src/worker/index.ts`)

1. Replace `import { fetchText, randomBetween, sleep } from '../lib/http.js';` with:

```ts
import { fetchText, pickUserAgent, randomBetween, sleep } from '../lib/http.js';
```

2. Replace

```ts
  type FindEmailJobData, type FollowUpsJobData, type MatchJobData, type ScrapeJobData, type SendJobData, type TailorJobData,
```

with

```ts
  type FetchJobData, type FindEmailJobData, type FollowUpsJobData, type MatchJobData, type ScrapeJobData, type SendJobData, type TailorJobData,
```

3. Replace `import { findSeenUrls, insertJobs } from '../services/jobs/repo.js';` with:

```ts
import { findJobIdByUrl, findSeenUrls, insertJobs, saveJob } from '../services/jobs/repo.js';
import { createJobFetchesRepo } from '../services/jobs/fetches-repo.js';
```

4. Replace `import { matchJob, matchUser } from './match.js';` with:

```ts
import { matchJob, matchUser, matchUserJob } from './match.js';
import { createPageFetcher, launchStealthChromium } from './browser.js';
import { FetchJobError, runFetchJob } from './fetch-job.js';
```

5. Replace the match worker processor line

```ts
    async (job) => (job.data.kind === 'job' ? matchJob(job.data.jobId, matchDeps) : matchUser(job.data.userId, matchDeps)),
```

with

```ts
    async (job) => {
      const data = job.data;
      if (data.kind === 'job') return matchJob(data.jobId, matchDeps);
      if (data.kind === 'user-job') return matchUserJob(data.userId, data.jobId, matchDeps);
      return matchUser(data.userId, matchDeps);
    },
```

6. Insert this block directly before the line `  for (const w of [scrapeWorker, matchWorker, tailorWorker, findEmailWorker, followUpsWorker, sendWorker]) {`:

```ts
  const jobFetches = createJobFetchesRepo(db);
  const pageFetcher = createPageFetcher({ launch: launchStealthChromium, userAgent: () => pickUserAgent() });
  const fetchJobWorker = new Worker<FetchJobData>(
    QUEUES.fetchJob,
    async (job) => {
      try {
        return await runFetchJob(job.data, {
          findJobIdByUrl: (url) => findJobIdByUrl(db, url),
          fetchPage: (url) => pageFetcher.fetchPage(url),
          saveJob: (j) => saveJob(db, j),
          saveFetch: (userId, url, state) => jobFetches.save(userId, url, state),
          enqueueUserMatch: async (userId, jobId) => {
            await queues.match.add('match', { kind: 'user-job', userId, jobId });
          },
          sleep,
          randomDelay: () => randomBetween(2_000, 5_000),
          isFinalAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
          log: logger,
        });
      } catch (err) {
        // Blocked, login wall, gone or unreadable is final: retrying would only hit the site again.
        if (err instanceof FetchJobError) throw new UnrecoverableError(err.reason);
        throw err;
      }
    },
    // One page at a time in one reused browser.
    { connection: createRedis(env.UPSTASH_REDIS_URL), concurrency: 1, ...idleTuning },
  );

```

7. Replace `  for (const w of [scrapeWorker, matchWorker, tailorWorker, findEmailWorker, followUpsWorker, sendWorker]) {` with:

```ts
  for (const w of [scrapeWorker, matchWorker, tailorWorker, findEmailWorker, followUpsWorker, sendWorker, fetchJobWorker]) {
```

8. Replace

```ts
    const closeAll = Promise.allSettled([scrapeWorker.close(), matchWorker.close(), tailorWorker.close(), findEmailWorker.close(), followUpsWorker.close(), sendWorker.close()]).then(() =>
      Promise.allSettled([queues.scrape.close(), queues.match.close(), queues.tailor.close(), queues.findEmail.close(), queues.followups.close(), queues.send.close()]),
    );
```

with

```ts
    const closeAll = Promise.allSettled([scrapeWorker.close(), matchWorker.close(), tailorWorker.close(), findEmailWorker.close(), followUpsWorker.close(), sendWorker.close(), fetchJobWorker.close()]).then(() =>
      Promise.allSettled([queues.scrape.close(), queues.match.close(), queues.tailor.close(), queues.findEmail.close(), queues.followups.close(), queues.send.close(), queues.fetchJob.close(), pageFetcher.close()]),
    );
```

- [ ] **Step 10: Run the tests and the typecheck**

Run: `npm test -w server -- tests/queues-fetch-job.test.ts tests/worker/match-user-job.test.ts tests/services/job-repos.test.ts tests/worker/fetch-job.test.ts tests/worker/match.test.ts tests/queues.test.ts tests/worker/no-playwright-in-api.test.ts`
Expected: PASS (all tests). The guard still passes because `worker/index.ts` only imports `./browser.js`.

Run: `npm run typecheck -w server`
Expected: exits 0.

- [ ] **Step 11: Commit**

```bash
git add server/src/queues.ts server/src/worker/match.ts server/src/services/jobs/repo.ts server/src/services/jobs/fetches-repo.ts server/src/worker/fetch-job.ts server/src/worker/index.ts server/tests/queues-fetch-job.test.ts server/tests/worker/match-user-job.test.ts server/tests/services/job-repos.test.ts server/tests/worker/fetch-job.test.ts
git commit -m "$(cat <<'EOF'
feat(worker): fetch-job queue reads a pasted job page and matches it for that user

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: POST /jobs/from-url and GET /jobs/fetches

**Files:**
- Create: `server/src/services/jobs/links.ts`
- Modify: `server/src/api/deps.ts`, `server/src/api/routes/jobs.ts`, `server/src/api/index.ts`, `server/tests/helpers/deps.ts`
- Test: `server/tests/services/job-links.test.ts`, `server/tests/api/job-links.test.ts`

**Interfaces:**
- Consumes: `canonicalJobUrl`, `MAX_JOB_LINK_LENGTH`, `JobLink`, `JobFetch`, `AddJobLinkResult` (Tasks 1-2); `JobFetchesRepo`, `createJobFetchesRepo`, `findJobIdByUrl`, `enqueueFetchJob`, `FetchJobData`, the `'user-job'` match kind (Task 6); `ApiError` (existing).
- Produces (`api/deps.ts`): `interface JobLinksService { addFromUrl(userId: string, link: JobLink): Promise<AddJobLinkResult>; listFetches(userId: string): Promise<JobFetch[]> }`, and `AppDeps.jobLinks: JobLinksService`.
- Produces (`services/jobs/links.ts`): `RECENT_FETCHES = 20`; `interface JobLinksDeps { findJobIdByUrl(url: string): Promise<string | null>; fetches: JobFetchesRepo; enqueueFetch(data: FetchJobData): Promise<void>; enqueueUserMatch(userId: string, jobId: string): Promise<void> }`; `createJobLinksService(d: JobLinksDeps): JobLinksService`.
- Produces (HTTP): `POST /jobs/from-url` answers 202 `{ queued: true }`, 200 `{ job_id }`, 400 `invalid_request`, 400 `unsupported_job_link` or 429 `rate_limited` (limit 10 an hour per user). `GET /jobs/fetches` answers 200 `JobFetch[]`.

- [ ] **Step 1: Write the failing service test** in `server/tests/services/job-links.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import type { JobFetchesRepo } from '../../src/services/jobs/fetches-repo.js';
import { createJobLinksService, RECENT_FETCHES, type JobLinksDeps } from '../../src/services/jobs/links.js';

const LINK = { url: 'https://www.linkedin.com/jobs/view/4012345678/', source: 'linkedin' as const };

function make(over: Partial<JobLinksDeps> = {}) {
  const fetches = {
    save: vi.fn<JobFetchesRepo['save']>().mockImplementation(async () => undefined),
    listRecent: vi.fn<JobFetchesRepo['listRecent']>().mockImplementation(async () => []),
  };
  const deps: JobLinksDeps = {
    findJobIdByUrl: vi.fn<JobLinksDeps['findJobIdByUrl']>().mockImplementation(async () => null),
    fetches,
    enqueueFetch: vi.fn<JobLinksDeps['enqueueFetch']>().mockImplementation(async () => undefined),
    enqueueUserMatch: vi.fn<JobLinksDeps['enqueueUserMatch']>().mockImplementation(async () => undefined),
    ...over,
  };
  return { deps, fetches, svc: createJobLinksService(deps) };
}

describe('createJobLinksService.addFromUrl', () => {
  it('records a new link as queued and queues the page fetch', async () => {
    const { svc, deps, fetches } = make();
    expect(await svc.addFromUrl('u1', LINK)).toEqual({ queued: true });
    expect(deps.findJobIdByUrl).toHaveBeenCalledWith(LINK.url);
    expect(fetches.save).toHaveBeenCalledWith('u1', LINK.url, { status: 'queued' });
    expect(deps.enqueueFetch).toHaveBeenCalledWith({ userId: 'u1', url: LINK.url, source: 'linkedin' });
    expect(deps.enqueueUserMatch).not.toHaveBeenCalled();
  });

  it('answers with the stored job and matches it for this user when the link is already a job', async () => {
    const { svc, deps, fetches } = make({ findJobIdByUrl: vi.fn<JobLinksDeps['findJobIdByUrl']>().mockImplementation(async () => 'j1') });
    expect(await svc.addFromUrl('u1', LINK)).toEqual({ job_id: 'j1' });
    expect(fetches.save).toHaveBeenCalledWith('u1', LINK.url, { status: 'done', jobId: 'j1' });
    expect(deps.enqueueUserMatch).toHaveBeenCalledWith('u1', 'j1');
    expect(deps.enqueueFetch).not.toHaveBeenCalled();
  });
});

describe('createJobLinksService.listFetches', () => {
  it('lists the user\'s 20 most recent links', async () => {
    const { svc, fetches } = make();
    await svc.listFetches('u1');
    expect(RECENT_FETCHES).toBe(20);
    expect(fetches.listRecent).toHaveBeenCalledWith('u1', 20);
  });
});
```

- [ ] **Step 2: Write the failing route test** in `server/tests/api/job-links.test.ts`

```ts
import type { JobFetch } from '@joblume/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import type { AppDeps } from '../../src/api/deps.js';
import { makeDeps } from '../helpers/deps.js';

const CANONICAL = 'https://www.linkedin.com/jobs/view/4012345678/';

function deps(over: Partial<AppDeps['jobLinks']> = {}) {
  return makeDeps({
    jobLinks: {
      addFromUrl: vi.fn<AppDeps['jobLinks']['addFromUrl']>().mockImplementation(async () => ({ queued: true })),
      listFetches: vi.fn<AppDeps['jobLinks']['listFetches']>().mockImplementation(async () => []),
      ...over,
    },
  });
}
const post = (app: ReturnType<typeof createApp>, body: object) =>
  request(app).post('/jobs/from-url').set('authorization', 'Bearer good').send(body);

describe('POST /jobs/from-url', () => {
  it('queues a new link in its canonical form and answers 202', async () => {
    const d = deps();
    const res = await post(createApp(d), { url: 'https://linkedin.com/jobs/view/data-analyst-at-acme-4012345678?trk=public_jobs' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ queued: true });
    expect(d.jobLinks.addFromUrl).toHaveBeenCalledWith('u1', { url: CANONICAL, source: 'linkedin' });
  });

  it('answers 200 with the job id when the job is already stored', async () => {
    const d = deps({ addFromUrl: vi.fn<AppDeps['jobLinks']['addFromUrl']>().mockImplementation(async () => ({ job_id: 'j1' })) });
    const res = await post(createApp(d), { url: 'https://ng.indeed.com/viewjob?jk=0123456789abcdef&from=serp' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ job_id: 'j1' });
    expect(d.jobLinks.addFromUrl).toHaveBeenCalledWith('u1', { url: 'https://ng.indeed.com/viewjob?jk=0123456789abcdef', source: 'indeed' });
  });

  it.each([
    ['an http link', 'http://www.linkedin.com/jobs/view/4012345678/'],
    ['another job site', 'https://www.glassdoor.com/job-listing/123'],
    ['a look-alike host', 'https://evil-indeed.com/viewjob?jk=0123456789abcdef'],
    ['a LinkedIn profile', 'https://www.linkedin.com/in/ada-lovelace/'],
    ['plain text', 'not a link'],
  ])('refuses %s with unsupported_job_link', async (_n, url) => {
    const d = deps();
    const res = await post(createApp(d), { url });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unsupported_job_link');
    expect(d.jobLinks.addFromUrl).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing url', {}],
    ['a url that is not text', { url: 5 }],
    ['an unknown field', { url: CANONICAL, source: 'linkedin' }],
    ['a url longer than 2048 characters', { url: `${CANONICAL}?pad=${'a'.repeat(2100)}` }],
  ])('refuses %s with invalid_request', async (_n, body) => {
    const d = deps();
    const res = await post(createApp(d), body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(d.jobLinks.addFromUrl).not.toHaveBeenCalled();
  });

  it('needs a signed-in user', async () => {
    const res = await request(createApp(deps())).post('/jobs/from-url').send({ url: CANONICAL });
    expect(res.status).toBe(401);
  });

  it('rate limits to 10 links per hour per user', async () => {
    const app = createApp(deps());
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await post(app, { url: CANONICAL })).status);
    expect(statuses.slice(0, 10).every((s) => s === 202)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('GET /jobs/fetches', () => {
  it('returns the signed-in user\'s recent links', async () => {
    const rows: JobFetch[] = [
      { id: 'f1', url: CANONICAL, status: 'failed', reason: 'login_required', job_id: null, created_at: '2026-10-18T09:00:00.000Z', updated_at: '2026-10-18T09:01:00.000Z' },
    ];
    const d = deps({ listFetches: vi.fn<AppDeps['jobLinks']['listFetches']>().mockImplementation(async () => rows) });
    const res = await request(createApp(d)).get('/jobs/fetches').set('authorization', 'Bearer good');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(d.jobLinks.listFetches).toHaveBeenCalledWith('u1');
  });

  it('needs a signed-in user', async () => {
    expect((await request(createApp(deps())).get('/jobs/fetches')).status).toBe(401);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test -w server -- tests/services/job-links.test.ts tests/api/job-links.test.ts`
Expected: FAIL. `Failed to load url ../../src/services/jobs/links.js`; the route tests get 404 instead of 202/200/400.

- [ ] **Step 4: Add the service type to the app deps** (`server/src/api/deps.ts`)

Replace

```ts
import type { Analytics, FollowUp, FollowUpWithJob, GmailStatus } from '@joblume/shared';
```

with

```ts
import type { AddJobLinkResult, Analytics, FollowUp, FollowUpWithJob, GmailStatus, JobFetch, JobLink } from '@joblume/shared';
```

Replace

```ts
export interface JobsService {
  refresh(userId: string): Promise<void>;
  rematch(userId: string): Promise<void>;
}
```

with

```ts
export interface JobsService {
  refresh(userId: string): Promise<void>;
  rematch(userId: string): Promise<void>;
}

export interface JobLinksService {
  addFromUrl(userId: string, link: JobLink): Promise<AddJobLinkResult>;
  listFetches(userId: string): Promise<JobFetch[]>;
}
```

Replace

```ts
  jobs: JobsService;
  gmail: GmailService;
```

with

```ts
  jobs: JobsService;
  jobLinks: JobLinksService;
  gmail: GmailService;
```

In `server/tests/helpers/deps.ts`, replace

```ts
    jobs: { refresh: vi.fn(), rematch: vi.fn() },
```

with

```ts
    jobs: { refresh: vi.fn(), rematch: vi.fn() },
    jobLinks: { addFromUrl: vi.fn(), listFetches: vi.fn() },
```

- [ ] **Step 5: Implement the service** `server/src/services/jobs/links.ts`

```ts
import type { JobLinksService } from '../../api/deps.js';
import type { FetchJobData } from '../../queues.js';
import type { JobFetchesRepo } from './fetches-repo.js';

export const RECENT_FETCHES = 20;

export interface JobLinksDeps {
  findJobIdByUrl(url: string): Promise<string | null>;
  fetches: JobFetchesRepo;
  enqueueFetch(data: FetchJobData): Promise<void>;
  enqueueUserMatch(userId: string, jobId: string): Promise<void>;
}

export function createJobLinksService(d: JobLinksDeps): JobLinksService {
  return {
    async addFromUrl(userId, link) {
      const existing = await d.findJobIdByUrl(link.url);
      if (existing) {
        // Already stored: no page fetch; the user's application comes through the normal match flow.
        await d.fetches.save(userId, link.url, { status: 'done', jobId: existing });
        await d.enqueueUserMatch(userId, existing);
        return { job_id: existing };
      }
      await d.fetches.save(userId, link.url, { status: 'queued' });
      await d.enqueueFetch({ userId, url: link.url, source: link.source });
      return { queued: true };
    },
    async listFetches(userId) {
      return d.fetches.listRecent(userId, RECENT_FETCHES);
    },
  };
}
```

- [ ] **Step 6: Add the routes** by replacing all of `server/src/api/routes/jobs.ts` with

```ts
import { canonicalJobUrl, MAX_JOB_LINK_LENGTH } from '@joblume/shared';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { ApiError } from '../../lib/errors.js';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

const jobLinkBody = z.object({ url: z.string().trim().min(1).max(MAX_JOB_LINK_LENGTH) }).strict();

const perUserPerHour = (limit: number) =>
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit,
    keyGenerator: (req) => req.user!.id,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited' },
  });

export function jobRoutes(d: Pick<AppDeps, 'jobs' | 'jobLinks'>) {
  const router = Router();

  router.post('/refresh', perUserPerHour(3), asyncHandler(async (req, res) => {
    await d.jobs.refresh(req.user!.id);
    res.status(202).json({ queued: true });
  }));

  router.post('/from-url', perUserPerHour(10), asyncHandler(async (req, res) => {
    const { url } = jobLinkBody.parse(req.body);
    const link = canonicalJobUrl(url);
    if (!link) throw new ApiError(400, 'unsupported_job_link', 'Paste a LinkedIn or Indeed job link');
    const result = await d.jobLinks.addFromUrl(req.user!.id, link);
    res.status('job_id' in result ? 200 : 202).json(result);
  }));

  router.get('/fetches', asyncHandler(async (req, res) => {
    res.json(await d.jobLinks.listFetches(req.user!.id));
  }));

  return router;
}
```

(`server/src/api/app.ts` already calls `jobRoutes(d)` with the full `AppDeps`, so it needs no change.)

- [ ] **Step 7: Wire the API process** (`server/src/api/index.ts`)

Replace `import { createQueues } from '../queues.js';` with:

```ts
import { createQueues, enqueueFetchJob } from '../queues.js';
```

Replace `import { createJobsService } from '../services/jobs/service.js';` with:

```ts
import { createJobsService } from '../services/jobs/service.js';
import { createJobFetchesRepo } from '../services/jobs/fetches-repo.js';
import { createJobLinksService } from '../services/jobs/links.js';
import { findJobIdByUrl } from '../services/jobs/repo.js';
```

Replace `  jobs: createJobsService(queues),` with:

```ts
  jobs: createJobsService(queues),
  jobLinks: createJobLinksService({
    findJobIdByUrl: (url) => findJobIdByUrl(db, url),
    fetches: createJobFetchesRepo(db),
    enqueueFetch: (data) => enqueueFetchJob(queues.fetchJob, data),
    enqueueUserMatch: async (userId, jobId) => {
      await queues.match.add('match', { kind: 'user-job', userId, jobId });
    },
  }),
```

- [ ] **Step 8: Run the server suite and the typecheck**

Run: `npm test -w server`
Expected: PASS (every server test, including `tests/api/app.test.ts`, whose `jobs refresh` tests still answer 202 and rate-limit at 3).

Run: `npm run typecheck -w server`
Expected: exits 0.

- [ ] **Step 9: Commit**

```bash
git add server/src/services/jobs/links.ts server/src/api/deps.ts server/src/api/routes/jobs.ts server/src/api/index.ts server/tests/helpers/deps.ts server/tests/services/job-links.test.ts server/tests/api/job-links.test.ts
git commit -m "$(cat <<'EOF'
feat(api): POST /jobs/from-url and GET /jobs/fetches

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Web: Add a job link card, recent fetch list, error message

**Files:**
- Create: `web/src/lib/job-fetches.ts`, `web/src/components/jobs/AddJobLink.tsx`
- Modify: `web/src/lib/api/endpoints.ts`, `web/src/lib/api/errors.ts`, `web/src/hooks/api.ts`, `web/src/app/(app)/queue/page.tsx`
- Test: `web/tests/lib/api-endpoints-phase4.test.ts`, `web/tests/lib/api-errors-phase4.test.ts`, `web/tests/lib/job-fetches.test.ts`, `web/tests/components/add-job-link.test.tsx`

**Interfaces:**
- Consumes: `canonicalJobUrl`, `JobFetch`, `JobFetchReason`, `AddJobLinkResult` (Tasks 1-2); `POST /jobs/from-url`, `GET /jobs/fetches`, error code `unsupported_job_link` (Task 7); existing `sourceLabel`, `formatRelative` (`web/src/lib/format.ts`), `describeApiError`, `Card`, `Input`, `Label`, `Button`.
- Produces: `api.addJobLink(url: string): Promise<AddJobLinkResult>`, `api.listJobFetches(): Promise<JobFetch[]>`; `keys.jobFetches`, `useJobFetches()`, `useAddJobLink()`; `INVALID_LINK_MESSAGE`, `FETCH_REASON_TEXT`, `fetchStatusText(f)`, `fetchSourceLabel(url)`, `addResultMessage(result)`; `<AddJobLink fetches pending error result onAdd />`.

- [ ] **Step 1: Write the failing lib tests**

`web/tests/lib/api-endpoints-phase4.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@/lib/api/client';
import { createApi } from '@/lib/api/endpoints';

function make() {
  const request = vi.fn().mockResolvedValue({});
  return { api: createApi(request as unknown as ApiClient), request };
}

describe('Phase 4 API calls', () => {
  it('addJobLink posts the link and listJobFetches reads the recent list', async () => {
    const { api, request } = make();
    await api.addJobLink('https://www.linkedin.com/jobs/view/4012345678/');
    expect(request).toHaveBeenLastCalledWith('/jobs/from-url', { method: 'POST', json: { url: 'https://www.linkedin.com/jobs/view/4012345678/' } });
    await api.listJobFetches();
    expect(request).toHaveBeenLastCalledWith('/jobs/fetches');
  });
});
```

`web/tests/lib/api-errors-phase4.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '@/lib/api/client';
import { describeApiError } from '@/lib/api/errors';

describe('describeApiError: Phase 4 codes', () => {
  it('explains an unsupported job link in plain language', () => {
    expect(describeApiError(new ApiRequestError(400, 'unsupported_job_link'))).toMatch(/LinkedIn or Indeed job/);
  });

  it('keeps the rate-limit message for too many links', () => {
    expect(describeApiError(new ApiRequestError(429, 'rate_limited'))).toMatch(/too often/);
  });
});
```

`web/tests/lib/job-fetches.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addResultMessage, FETCH_REASON_TEXT, fetchSourceLabel, fetchStatusText, INVALID_LINK_MESSAGE } from '@/lib/job-fetches';

describe('fetchStatusText', () => {
  it('describes each status and failure reason in plain language', () => {
    expect(fetchStatusText({ status: 'queued', reason: null })).toBe('Reading the job…');
    expect(fetchStatusText({ status: 'done', reason: null })).toBe('Job added. Its application appears in your queue shortly.');
    expect(fetchStatusText({ status: 'failed', reason: 'blocked' })).toBe(FETCH_REASON_TEXT.blocked);
    expect(fetchStatusText({ status: 'failed', reason: 'login_required' })).toBe(FETCH_REASON_TEXT.login_required);
    expect(fetchStatusText({ status: 'failed', reason: 'not_found' })).toBe(FETCH_REASON_TEXT.not_found);
    expect(fetchStatusText({ status: 'failed', reason: 'unparseable' })).toBe(FETCH_REASON_TEXT.unparseable);
    expect(fetchStatusText({ status: 'failed', reason: null })).toBe('We could not read that job.');
  });

  it('has a message for every reason', () => {
    expect(Object.keys(FETCH_REASON_TEXT).sort()).toEqual(['blocked', 'login_required', 'not_found', 'unparseable']);
  });
});

describe('fetchSourceLabel', () => {
  it('names the site of a stored link', () => {
    expect(fetchSourceLabel('https://www.linkedin.com/jobs/view/4012345678/')).toBe('LinkedIn');
    expect(fetchSourceLabel('https://ng.indeed.com/viewjob?jk=0123456789abcdef')).toBe('Indeed');
    expect(fetchSourceLabel('https://example.com/x')).toBe('Link');
  });
});

describe('addResultMessage', () => {
  it('explains a queued link and a job we already have', () => {
    expect(addResultMessage({ queued: true })).toMatch(/reading the job now/i);
    expect(addResultMessage({ job_id: 'j1' })).toMatch(/already have this job/i);
  });

  it('has an invalid-link message that names both sites', () => {
    expect(INVALID_LINK_MESSAGE).toMatch(/LinkedIn or Indeed/);
  });
});
```

- [ ] **Step 2: Write the failing component test** in `web/tests/components/add-job-link.test.tsx`

```tsx
import type { JobFetch } from '@joblume/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddJobLink, type AddJobLinkProps } from '@/components/jobs/AddJobLink';
import { FETCH_REASON_TEXT, INVALID_LINK_MESSAGE } from '@/lib/job-fetches';

const fetches: JobFetch[] = [
  { id: 'f1', url: 'https://www.linkedin.com/jobs/view/4012345678/', status: 'queued', reason: null, job_id: null, created_at: '2026-10-18T09:00:00.000Z', updated_at: '2026-10-18T09:00:00.000Z' },
  { id: 'f2', url: 'https://ng.indeed.com/viewjob?jk=0123456789abcdef', status: 'failed', reason: 'login_required', job_id: null, created_at: '2026-10-18T08:00:00.000Z', updated_at: '2026-10-18T08:01:00.000Z' },
  { id: 'f3', url: 'https://www.linkedin.com/jobs/view/4099999999/', status: 'done', reason: null, job_id: 'j1', created_at: '2026-10-18T07:00:00.000Z', updated_at: '2026-10-18T07:01:00.000Z' },
];

function setup(over: Partial<AddJobLinkProps> = {}) {
  const onAdd = vi.fn<AddJobLinkProps['onAdd']>();
  const props: AddJobLinkProps = { fetches: [], pending: false, error: null, result: null, onAdd, ...over };
  const utils = render(<AddJobLink {...props} />);
  return { onAdd, props, user: userEvent.setup(), ...utils };
}

describe('AddJobLink', () => {
  it('sends the link in its canonical form', async () => {
    const { onAdd, user } = setup();
    await user.type(screen.getByLabelText('Add a job link'), 'https://www.linkedin.com/jobs/view/4012345678/?trk=public_jobs');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).toHaveBeenCalledWith('https://www.linkedin.com/jobs/view/4012345678/');
  });

  it('refuses a link that is not a LinkedIn or Indeed job without calling the server', async () => {
    const { onAdd, user } = setup();
    await user.type(screen.getByLabelText('Add a job link'), 'https://www.glassdoor.com/job-listing/123');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_LINK_MESSAGE);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('disables Add while the box is empty and while adding', () => {
    const { rerender, props } = setup();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    rerender(<AddJobLink {...props} pending />);
    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
  });

  it('confirms a queued link and clears the box', async () => {
    const { user, rerender, props } = setup();
    const input = screen.getByLabelText('Add a job link');
    await user.type(input, 'https://ng.indeed.com/viewjob?jk=0123456789abcdef');
    rerender(<AddJobLink {...props} result={{ queued: true }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/reading the job now/i);
    expect(input).toHaveValue('');
  });

  it('explains when we already have the job', () => {
    setup({ result: { job_id: 'j1' } });
    expect(screen.getByRole('status')).toHaveTextContent(/already have this job/i);
  });

  it('shows the server error in plain language', () => {
    setup({ error: 'You are doing that too often. Try again later.' });
    expect(screen.getByRole('alert')).toHaveTextContent('You are doing that too often. Try again later.');
  });

  it('lists the recent links with their site and status', () => {
    setup({ fetches });
    const list = screen.getByRole('list', { name: 'Recent job links' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByText('LinkedIn')).toBeInTheDocument();
    expect(within(items[0]!).getByText(/Reading the job…/)).toBeInTheDocument();
    expect(within(items[1]!).getByText('Indeed')).toBeInTheDocument();
    expect(within(items[1]!).getByText(new RegExp(FETCH_REASON_TEXT.login_required.replace('.', '\\.')))).toBeInTheDocument();
    expect(within(items[2]!).getByText(/Job added/)).toBeInTheDocument();
  });

  it('shows no list when there are no links yet', () => {
    setup();
    expect(screen.queryByRole('list', { name: 'Recent job links' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test -w web -- tests/lib/api-endpoints-phase4.test.ts tests/lib/api-errors-phase4.test.ts tests/lib/job-fetches.test.ts tests/components/add-job-link.test.tsx`
Expected: FAIL. `api.addJobLink is not a function`; the error message is the generic "The request could not be completed."; `Failed to resolve import "@/lib/job-fetches"` and `"@/components/jobs/AddJobLink"`.

- [ ] **Step 4: Add the API calls and the error message**

In `web/src/lib/api/endpoints.ts`, replace

```ts
import type {
  Analytics,
```

with

```ts
import type {
  AddJobLinkResult,
  Analytics,
```

and replace

```ts
  GmailStatus,
  Profile,
```

with

```ts
  GmailStatus,
  JobFetch,
  Profile,
```

and replace

```ts
    refreshJobs: () => request<{ queued: boolean }>('/jobs/refresh', { method: 'POST' }),
```

with

```ts
    refreshJobs: () => request<{ queued: boolean }>('/jobs/refresh', { method: 'POST' }),
    addJobLink: (url: string) => request<AddJobLinkResult>('/jobs/from-url', { method: 'POST', json: { url } }),
    listJobFetches: () => request<JobFetch[]>('/jobs/fetches'),
```

In `web/src/lib/api/errors.ts`, replace

```ts
    case 'not_auto_eligible':
      return 'Automatic sending no longer applies to this application. Review it and send it yourself.';
```

with

```ts
    case 'not_auto_eligible':
      return 'Automatic sending no longer applies to this application. Review it and send it yourself.';
    case 'unsupported_job_link':
      return 'That is not a LinkedIn or Indeed job link. Open the job itself and copy the address from your browser.';
```

- [ ] **Step 5: Add the plain-language helpers** `web/src/lib/job-fetches.ts`

```ts
import { canonicalJobUrl, type AddJobLinkResult, type JobFetch, type JobFetchReason } from '@joblume/shared';
import { sourceLabel } from './format';

export const INVALID_LINK_MESSAGE =
  'That is not a LinkedIn or Indeed job link. Open the job itself and copy the address from your browser.';

export const FETCH_REASON_TEXT: Record<JobFetchReason, string> = {
  blocked: 'The site blocked us from reading it. Try again later.',
  login_required: 'The site asked for a sign-in, so we could not read it.',
  not_found: 'This job is no longer available.',
  unparseable: 'We could not read the job details on that page.',
};

export function fetchStatusText(f: Pick<JobFetch, 'status' | 'reason'>): string {
  if (f.status === 'queued') return 'Reading the job…';
  if (f.status === 'done') return 'Job added. Its application appears in your queue shortly.';
  return f.reason ? FETCH_REASON_TEXT[f.reason] : 'We could not read that job.';
}

export function fetchSourceLabel(url: string): string {
  const link = canonicalJobUrl(url);
  return link ? sourceLabel(link.source) : 'Link';
}

export function addResultMessage(result: AddJobLinkResult): string {
  return 'job_id' in result
    ? 'We already have this job. Its application appears in your queue shortly.'
    : 'Got it. We are reading the job now. It appears in your queue within a few minutes.';
}
```

- [ ] **Step 6: Add the card** `web/src/components/jobs/AddJobLink.tsx`

```tsx
'use client';

import { canonicalJobUrl, type AddJobLinkResult, type JobFetch } from '@joblume/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatRelative } from '@/lib/format';
import { addResultMessage, fetchSourceLabel, fetchStatusText, INVALID_LINK_MESSAGE } from '@/lib/job-fetches';

export interface AddJobLinkProps {
  fetches: JobFetch[];
  pending: boolean;
  error: string | null;
  result: AddJobLinkResult | null;
  onAdd(url: string): void;
}

export function AddJobLink({ fetches, pending, error, result, onAdd }: AddJobLinkProps) {
  const [url, setUrl] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (result) setUrl('');
  }, [result]);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const link = canonicalJobUrl(url);
    if (!link) {
      setLocalError(INVALID_LINK_MESSAGE);
      return;
    }
    setLocalError(null);
    onAdd(link.url);
  };

  const shownError = localError ?? error;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <form onSubmit={submit} noValidate className="space-y-2">
          <Label htmlFor="job-link">Add a job link</Label>
          <p className="text-sm text-muted-foreground">
            Paste a LinkedIn or Indeed job link. We read that one page and prepare an application for you to review. You apply on the site yourself.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="job-link"
              type="url"
              inputMode="url"
              maxLength={2048}
              placeholder="https://www.linkedin.com/jobs/view/…"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setLocalError(null);
              }}
              aria-invalid={shownError ? true : undefined}
            />
            <Button type="submit" disabled={pending || url.trim() === ''}>
              {pending ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </form>
        {shownError && <p role="alert" className="text-sm text-destructive">{shownError}</p>}
        {!shownError && result && <p role="status" className="text-sm text-muted-foreground">{addResultMessage(result)}</p>}
        {fetches.length > 0 && (
          <ul aria-label="Recent job links" className="divide-y divide-border/70 text-sm">
            {fetches.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{fetchSourceLabel(f.url)}</span> <span className="text-muted-foreground">{f.url}</span>
                </span>
                <span className={f.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
                  {fetchStatusText(f)} · {formatRelative(f.updated_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Add the hooks** (`web/src/hooks/api.ts`)

Replace

```ts
  followUps: ['follow-ups'] as const,
};
```

with

```ts
  followUps: ['follow-ups'] as const,
  jobFetches: ['job-fetches'] as const,
};
```

and replace

```ts
export function useGmailStatus() {
```

with

```ts
export function useJobFetches() {
  return useQuery({
    queryKey: keys.jobFetches,
    queryFn: () => getApi().listJobFetches(),
    // Poll faster while a link is still being read.
    refetchInterval: (query) => (query.state.data?.some((f) => f.status === 'queued') ? 10_000 : 60_000),
    refetchOnWindowFocus: true,
  });
}

export function useAddJobLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => getApi().addJobLink(url),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.jobFetches });
      void qc.invalidateQueries({ queryKey: keys.applications });
    },
  });
}

export function useGmailStatus() {
```

- [ ] **Step 8: Put the card on the queue page** (`web/src/app/(app)/queue/page.tsx`)

Replace

```tsx
import { FollowUpCard } from '@/components/followups/FollowUpCard';
```

with

```tsx
import { FollowUpCard } from '@/components/followups/FollowUpCard';
import { AddJobLink } from '@/components/jobs/AddJobLink';
```

Replace

```tsx
import { useApplications, useDismissFollowUp, useFollowUps, useRefreshJobs, useSendFollowUp, useUpdateFollowUp } from '@/hooks/api';
```

with

```tsx
import {
  useAddJobLink, useApplications, useDismissFollowUp, useFollowUps, useJobFetches, useRefreshJobs, useSendFollowUp, useUpdateFollowUp,
} from '@/hooks/api';
```

Replace

```tsx
  const refresh = useRefreshJobs();
```

with

```tsx
  const refresh = useRefreshJobs();
  const jobFetches = useJobFetches();
  const addLink = useAddJobLink();
```

Replace

```tsx
      {refresh.error && <p role="alert" className="text-sm text-destructive">{describeApiError(refresh.error)}</p>}
```

with

```tsx
      {refresh.error && <p role="alert" className="text-sm text-destructive">{describeApiError(refresh.error)}</p>}

      <AddJobLink
        fetches={jobFetches.data ?? []}
        pending={addLink.isPending}
        error={addLink.error ? describeApiError(addLink.error) : null}
        result={addLink.data ?? null}
        onAdd={(url) => addLink.mutate(url)}
      />
```

- [ ] **Step 9: Run the web suite and the typecheck**

Run: `npm test -w web`
Expected: PASS (all web tests, including the four new files and the existing `format.test.ts`, which already checks the `LinkedIn` and `Indeed` labels).

Run: `npm run typecheck -w web`
Expected: exits 0.

- [ ] **Step 10: Commit**

```bash
git add web/src/lib/job-fetches.ts web/src/components/jobs/AddJobLink.tsx web/src/lib/api/endpoints.ts web/src/lib/api/errors.ts web/src/hooks/api.ts "web/src/app/(app)/queue/page.tsx" web/tests/lib/api-endpoints-phase4.test.ts web/tests/lib/api-errors-phase4.test.ts web/tests/lib/job-fetches.test.ts web/tests/components/add-job-link.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): add a LinkedIn or Indeed job link from the queue page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Auto-mode guard tests, docs and final verification

**Files:**
- Modify: `server/tests/sending/send-application.test.ts` (one table row), `README.md`, `.env.example`
- Create: `server/tests/sending/auto-sources.test.ts`, `docs/phase4-manual-checklist.md`

**Interfaces:**
- Consumes: `LINK_SOURCES` (Task 1); the existing `AUTO_SOURCES`, `checkAutoApply` (`server/src/services/sending/auto-apply.ts`) and the send-time re-check `checkAutoRules` (`send-application.ts`). Both were confirmed during planning to allow only `remotive`, `myjobmag` and `jobberman`, so no production change is needed.
- Produces: tests that fail if `linkedin` or `indeed` ever becomes auto-sendable, plus user docs.

- [ ] **Step 1: Write the Auto-mode guard tests**

Create `server/tests/sending/auto-sources.test.ts`:

```ts
import { LINK_SOURCES } from '@joblume/shared';
import { describe, expect, it } from 'vitest';
import { AUTO_SOURCES, checkAutoApply, type AutoContext } from '../../src/services/sending/auto-apply.js';

const ctx = (jobSource: string): AutoContext => ({
  userId: 'u1',
  jobSource,
  application: { status: 'pending_review', match_score: 99, email_source: 'hunter', email_confidence: 99, hiring_manager_email: 'hr@acme.com' },
  profile: { apply_mode: 'auto', auto_threshold: 50, daily_cap: 20 },
  gmailConnected: true,
  appliedToday: 0,
});

describe('Auto mode never sends LinkedIn or Indeed jobs', () => {
  it.each(LINK_SOURCES)('does not list %s as an auto source', (source) => {
    expect(AUTO_SOURCES as readonly string[]).not.toContain(source);
  });

  it.each(LINK_SOURCES)('refuses a %s job even when every other rule passes', (source) => {
    expect(checkAutoApply(ctx(source))).toEqual({ ok: false, reason: 'source_not_allowed' });
  });

  it('still allows a board source with the same context', () => {
    expect(checkAutoApply(ctx('myjobmag'))).toEqual({ ok: true });
  });
});
```

In `server/tests/sending/send-application.test.ts`, replace the table row

```ts
    ['the job is from LinkedIn', { loadApplication: vi.fn().mockResolvedValue(app({ job: job('linkedin') })) }],
```

with

```ts
    ['the job is from LinkedIn', { loadApplication: vi.fn().mockResolvedValue(app({ job: job('linkedin') })) }],
    ['the job is from Indeed', { loadApplication: vi.fn().mockResolvedValue(app({ job: job('indeed') })) }],
```

- [ ] **Step 2: Run them**

Run: `npm test -w server -- tests/sending/auto-sources.test.ts tests/sending/send-application.test.ts tests/sending/auto-apply.test.ts`
Expected: PASS. These are guard tests: they pass straight away because the existing source rule already excludes these sources. They are there to catch a future regression.

- [ ] **Step 3: Update `.env.example`**

Replace

```
# --- Later phases (not used yet) ---
APOLLO_API_KEY=
JSEARCH_API_KEY=
RESEND_API_KEY=
```

with

```
# --- LinkedIn and Indeed jobs through JSearch (optional; a RapidAPI key subscribed to JSearch) ---
JSEARCH_API_KEY=
# Requests per calendar month; the worker stops at this count until the next month
JSEARCH_MONTHLY_LIMIT=50

# --- Later phases (not used yet) ---
APOLLO_API_KEY=
RESEND_API_KEY=
```

- [ ] **Step 4: Update `README.md`**

Replace

```
- **Test it:** work through `docs/phase3-manual-checklist.md` using a second email address you own.
```

with

```
- **Test it:** work through `docs/phase3-manual-checklist.md` using a second email address you own.

## LinkedIn and Indeed (Phase 4)

- **Apply the database change:** run `supabase/migrations/0003_job_sources.sql` in the Supabase SQL editor (once). It adds the `job_fetches` table.
- **JSearch (optional):** set `JSEARCH_API_KEY` (a RapidAPI key subscribed to JSearch) and optionally `JSEARCH_MONTHLY_LIMIT` (default 50 requests a month). The worker then asks JSearch once a day for your roles and places and keeps only LinkedIn and Indeed results. Without a key, JSearch is skipped.
- **Paste a job link:** on the Queue page, paste a LinkedIn or Indeed job link into **Add a job link**. The worker reads that one page and prepares an application for you. The list under the box shows each link's status, or why it could not be read (blocked, sign-in required, no longer available, or unreadable).
- **Install the browser on the worker host (once):** `npm run browsers:install -w server`. On Linux use `npx -w server playwright install --with-deps chromium` to also install the system libraries. Only the worker uses it; the API never loads it, and the tests never need it.
- **Applying stays manual:** for LinkedIn and Indeed jobs you use the job link, the tailored CV and the cover letter, and apply on the site yourself. Auto mode never sends these, and JobLume never submits anything on LinkedIn or Indeed, never signs in to them, and never crawls their search pages.
- **More endpoints:** `POST /jobs/from-url` (body `{ "url": "..." }`, 10 an hour per user), `GET /jobs/fetches`.
- **Test it:** work through `docs/phase4-manual-checklist.md`.
```

Replace

```
- Worker: an always-on host (Railway, Fly.io or a small VPS) with start command `npm run start:worker`. Render's free tier sleeps, so it cannot run the worker's schedule.
```

with

```
- Worker: an always-on host (Railway, Fly.io or a small VPS) with start command `npm run start:worker`. Render's free tier sleeps, so it cannot run the worker's schedule. Install Chromium on that host once (`npx -w server playwright install --with-deps chromium`) for pasted job links.
```

- [ ] **Step 5: Write the manual checklist** `docs/phase4-manual-checklist.md`

```markdown
# Phase 4 manual checklist

Run this against your real services. The automated tests use saved pages and fakes; only this checklist touches JSearch, LinkedIn, Indeed and the real database. Never test with your own LinkedIn or Indeed login: JobLume never signs in.

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
```

- [ ] **Step 6: Final verification**

Run: `npm test`
Expected: PASS for every workspace (`@joblume/shared`, `server`, `web`) with no failed tests, and no browser launched.

Run: `npm run typecheck`
Expected: exits 0 for every workspace.

Run: `npm run build`
Expected: the shared, server (`tsc -p tsconfig.build.json`) and web (`next build`) builds finish without errors.

Run: `git status --short`
Expected: only the files changed in this task, plus the untracked `Joblume images/` folder, which you must not add.

- [ ] **Step 7: Commit**

```bash
git add server/tests/sending/auto-sources.test.ts server/tests/sending/send-application.test.ts README.md .env.example docs/phase4-manual-checklist.md
git commit -m "$(cat <<'EOF'
docs: Phase 4 setup, worker browser install and manual checklist; guard Auto mode sources

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```
