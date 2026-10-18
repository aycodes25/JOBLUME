# Joblume Phase 4: LinkedIn and Indeed job sources

## 1. Goal
Let LinkedIn and Indeed jobs enter the queue without scraping their search pages: through the JSearch API, and through a job link the user pastes. Applying to these jobs stays manual.

## 2. Decisions
| Topic | Decision |
|---|---|
| Discovery | JSearch API (RapidAPI), optional `JSEARCH_API_KEY`; skipped when absent. |
| Paste a link | `POST /jobs/from-url` for LinkedIn/Indeed job URLs; a Playwright (stealth) fetch of that one page in the worker. |
| Apply | Always manual for `linkedin` and `indeed`. Auto mode never sends them (existing source rule and send-time re-check stay). Nothing is ever submitted on those sites. |
| Out of scope | Easy Apply auto-fill, logging in to LinkedIn/Indeed, crawling search pages, company pages. |

## 3. JSearch scraper
- `server/src/scrapers/jsearch.ts` implements the existing `Scraper` interface (`source`, `list()`, `detail()`, optional `detailDelayMs`). `runScrape`, dedupe, match and tailor are unchanged.
- It queries JSearch using the role/location preferences of the users (union, capped), keeps only results whose publisher is LinkedIn or Indeed, and tags `source` as `linkedin` or `indeed`. The description comes from the JSearch payload, so `detail()` makes no extra request.
- A monthly request counter in Redis (`JSEARCH_MONTHLY_LIMIT`, default 50, per calendar month) is consumed before each request and refunded if the request fails. At the limit the scraper returns an empty list and logs once.
- Errors (401/403/429/5xx/timeouts/malformed body) throw a typed `JSearchError`; a malformed 200 is never treated as "no jobs". The API key travels only in the request header and is never logged.
- `JobSource` gains `'linkedin' | 'indeed'` in shared types, the DB check constraint (migration `0003_job_sources.sql`) and the web labels.

## 4. Paste a link
- `POST /jobs/from-url` body `{ url }`, strict zod: https only, host allow-list (`linkedin.com`, `www.linkedin.com`, `indeed.com`, any `*.indeed.com`), path must look like a job page, max 2048 characters, canonicalised (tracking params stripped) before use. Per-user rate limit. Answers 202 `{ queued: true }`, or 200 `{ job_id }` if the canonical URL already exists as a job (the user then gets an application through the normal match flow).
- A new `fetch-job` queue (job id derived from user id and canonical URL, attempts 2). The worker opens the page with Playwright (stealth plugin) in one reused browser, one page at a time, 30 s timeout, random 2 to 5 s delay, closing the page and context in `finally`. It extracts title, company, location, description with defensive selectors/JSON-LD, validates through the same normaliser as other scrapers, inserts the job (source `linkedin`/`indeed`) and enqueues matching for that user only.
- A blocked page, login wall or missing fields fails the job with a reason code (`blocked`, `login_required`, `not_found`, `unparseable`); nothing is inserted. Each request is recorded in a `job_fetches` table (user id, canonical URL, status `queued|done|failed`, reason, job id, timestamps; server-write-only, readable by its owner), exposed through `GET /jobs/fetches` (the signed-in user's 20 most recent). The queue page shows these.
- Playwright is a `server` dependency used only by the worker; the browser binary is installed on the worker host (documented). The API process never imports it.

## 5. Web
- Queue page: an "Add a job link" input with an Add button (styled like the existing cards), success and failure messages in plain language, and a small list of the user's recent link fetches with their status.
- Source labels for `linkedin` and `indeed`. The Approve & Apply panel for these sources keeps the existing assisted flow: open the job link, tailored CV, cover letter.

## 6. Testing
Fixtures only: saved JSearch JSON, saved LinkedIn and Indeed HTML. Fakes for the HTTP client, Redis and the Playwright page. Tests cover the URL allow-list and canonicalisation, the publisher filter, quota consume and refund, error mapping, every failure reason, user scoping, and that Auto never sends these sources. No live scraping in tests.

## 7. Env
`JSEARCH_API_KEY` (optional), `JSEARCH_MONTHLY_LIMIT` (default 50).
