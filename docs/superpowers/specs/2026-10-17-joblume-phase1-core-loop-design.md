# JobLume — Phase 1 (Core Loop) Design

Date: 2026-10-17
Status: Draft for user review

## 1. Product summary

JobLume is a semi-automatic job application platform. It aggregates jobs, tailors the user's CV and cover letter per job with AI, finds a contact email, and applies only after the user approves (or, in Auto mode, for low-risk high-match jobs).

Full product scope (all phases): onboarding, aggregator, AI tailoring, email finder, approval dashboard, tracker, analytics, follow-ups, web (Next.js), mobile (Expo). It is decomposed into phases, each with its own spec, plan and runnable result.

| Phase | Result |
|---|---|
| **1 (this spec)** | Server, schema, auth, CV upload/parse, Remotive/MyJobMag/Jobberman scrapers, AI tailoring, PDF generation |
| 2 | Next.js dashboard: queue, edit, approve/skip, tracker kanban, settings |
| 3 | Gmail OAuth + sending, email finder (Hunter/Apollo/pattern), follow-ups, apply modes |
| 4 | LinkedIn/Indeed via JSearch (+ Apify backup), Playwright for detail pages |
| 5 | Expo mobile app mirroring the web dashboard |

## 2. Decisions made

- **Stack** is fixed as specified: Next.js 14 + Tailwind + shadcn, Expo, Node/Express/TypeScript, Supabase, BullMQ + Upstash Redis, Gemini (fallback OpenAI gpt-4o-mini), Hunter/Apollo, Gmail API, Resend, Playwright.
- **Gemini model** is configured via `GEMINI_MODEL`. Gemini 1.5 Flash has been retired, so the default is a current Flash model.
- **Backend layout:** two entry points in `/server`. The API (Express) runs on Render free. The worker (BullMQ, cron, scrapers, PDF, later Playwright) runs on an always-on host. Redis is the link between them. Local dev runs both with one command.
- **Apply behaviour (implemented in Phase 3, schema supports it now):**
  - Default is assisted apply: send a cold email if a contact email exists, otherwise open the job link and provide the tailored CV PDF and cover letter for the user to submit.
  - A per-user setting `apply_mode` (`manual` | `auto`) controls automation.
  - In `auto`, an application is sent without a click only if: source is Remotive/MyJobMag/Jobberman, a contact email exists or the form is a simple external one, match score ≥ `auto_threshold` (default 80), and the daily cap is not reached.
  - LinkedIn and Indeed are always manual. Playwright Easy Apply auto-fill is out of scope and may be added later as an off-by-default module.
- **Multi-user from day one.** Jobs are global. Matching and applications are per user.

## 3. Repo layout

```
joblume/
  supabase/migrations/      schema, RLS policies, storage bucket
  server/
    src/api/                Express routes
    src/worker/             BullMQ workers + cron scheduler
    src/scrapers/           remotive.ts, myjobmag.ts, jobberman.ts
    src/services/           ai/ (gemini + openai fallback), cv/ (parse, pdf), jobs/ (dedupe, match)
    src/lib/                supabase admin client, redis, env validation (zod), logger, crypto
  web/  mobile/             empty until Phases 2 and 5
  .env.example
```

## 4. Data flow

1. Cron (every 6 h) enqueues one `scrape:<source>` job per source.
2. Each scraper returns normalised `Job[]`, upserted into `jobs`. Uniqueness is enforced on `dedupe_key` (normalised company + title).
3. A `match` job pairs each new job with users whose `desired_roles` and location pass a cheap pre-filter (title/keyword overlap, location). It enqueues one `tailor` job per (user, job).
4. `tailor` calls the AI service with the user's base CV text and the job description, validates the JSON, generates the PDF (pdf-lib), uploads it to Storage, and inserts an `applications` row with `status = pending_review`.
5. CV upload (API): validate type/size, parse (pdf-parse for PDF, mammoth for DOCX), store the file in Storage, save `profiles.base_cv_text` and `base_cv_url`.

## 5. Data model

Base tables as specified, with these changes.

- `users`: `id`, `email`, `full_name`, `gmail_refresh_token_enc` (AES-256-GCM, key in env; used from Phase 3).
- `profiles`: `user_id`, `base_cv_text`, `base_cv_url`, `skills JSONB`, `years_experience`, `desired_roles TEXT[]`, `location`, `salary_min`, `salary_max`, plus settings: `apply_mode` (default `manual`), `auto_threshold` (default 80), `daily_cap` (default 20), `auto_followup` (default false).
- `jobs`: `id`, `title`, `company`, `location`, `description`, `source`, `url`, `company_domain`, `dedupe_key UNIQUE`, `created_at`.
- `applications`: `id`, `user_id`, `job_id`, `tailored_cv_text`, `tailored_cv_url`, `cover_letter_text`, `match_score`, `missing_keywords TEXT[]`, `hiring_manager_email`, `email_confidence`, `apply_method` (`email` | `assisted` | `auto`, nullable until decided), `status` (`pending_review`, `approved`, `applied`, `interviewing`, `rejected`, plus `offer` and `skipped`), `applied_at`, `follow_up_at`. Unique on `(user_id, job_id)`.
- `email_logs`: as specified.
- RLS is enabled on all user-owned tables: a user can read and write only rows where `user_id = auth.uid()`. `jobs` is readable by authenticated users. Worker writes use the service role.
- The daily cap is enforced server-side as a count of the user's applications with `applied_at` on the current day.

## 6. Scrapers

- **Remotive:** public JSON API.
- **MyJobMag, Jobberman:** axios + Cheerio, list page then detail page, 1–2 s delay between requests, rotating user agent. Selectors are verified against the live sites at build time. Each scraper has a saved-HTML fixture test so a markup change fails loudly.
- Errors are logged and retried by BullMQ with backoff. One failing source never blocks the others.
- `company_domain` is derived from the apply URL or company website when available, otherwise null (resolved by the Phase 3 email finder).

## 7. AI tailoring

- Prompt: the "Nigerian ATS expert" prompt, extended with a rule never to add employers, titles, dates, or skills absent from the base CV, and to output JSON only.
- Output: `{ tailored_cv_text, cover_letter_text, match_score_0_to_100, missing_keywords }`, validated with zod. One automatic retry feeds the validation error back to the model.
- Providers: Gemini (`GEMINI_MODEL`) first. On 429, 5xx, or invalid JSON after a retry, fall back to OpenAI gpt-4o-mini.
- Rate limiting: BullMQ limiter (about 10 calls/min) plus a daily-usage counter. When the daily quota is exhausted, jobs wait rather than fail.
- Cost control: only jobs passing the pre-filter are sent to the model.
- Cover letter style follows the user's tone guidance: direct, human, no clichés, British English.

## 8. PDF generation

pdf-lib renders one clean template (name header, summary, skills, experience, education) from the tailored text. A small section parser splits the CV text. If a section cannot be parsed, the renderer falls back to a plain single-column layout rather than dropping content.

## 9. API (Phase 1)

All routes require a Supabase JWT, verified in Express. The user id comes from the token, never the body.

- `GET /profile`, `PUT /profile` — profile and settings.
- `POST /cv` — PDF/DOCX up to 5 MB.
- `GET /applications?status=`, `GET /applications/:id`.
- `PATCH /applications/:id` — edit CV/cover letter text; regenerates the PDF if CV text changes.
- `POST /jobs/refresh` — manual scrape trigger, rate-limited.

## 10. Security

- zod validation on every input, helmet, CORS restricted to the web origin, per-user rate limiting.
- Service-role key only on the server. Secrets validated at boot; the app refuses to start if one is missing.
- Scrapers use user-agent rotation and random delays. Playwright with stealth arrives in Phase 4 for job-detail pages only.

## 11. Testing

Vitest unit tests for dedupe, pre-filter, JSON validation, PDF output, and crypto. Scraper tests against saved HTML fixtures. AI service tests with the provider call stubbed at the HTTP boundary (provider behaviour only, not application data).

## 12. Phase 1 definition of done

A user can sign in, upload a CV, set preferences, and run the worker. Within minutes the worker fetches real jobs from Remotive, MyJobMag and Jobberman and creates `pending_review` applications, each with a tailored CV PDF and cover letter, readable through the API. Requires the user's own Supabase, Gemini and Upstash credentials.

## 13. Out of scope for Phase 1

Gmail, email finding, follow-ups, analytics, tracker, mobile app, any apply action, LinkedIn/Indeed, Playwright.

## 14. Environment variables

Phase 1: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `OPENAI_API_KEY` (fallback), `UPSTASH_REDIS_URL`, `ENCRYPTION_KEY`, `WEB_ORIGIN`.
Later phases: `HUNTER_API_KEY`, `APOLLO_API_KEY`, `JSEARCH_API_KEY`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `RESEND_API_KEY`.
