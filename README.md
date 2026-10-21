# JobLume

Semi-automatic job application platform. Phase 1 is the backend that finds jobs and prepares tailored applications for your review. Phase 2 adds the web dashboard (sign-in, onboarding, review queue, tracker, analytics, settings). See `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Setup

1. Create a Supabase project and run `supabase/migrations/0001_init.sql` (CLI `supabase db push`, or the SQL editor). In Authentication, enable the Email provider. For easy local testing you may turn off "Confirm email".
2. Copy `.env.example` to `.env` and fill in the server values (Supabase, Gemini, Upstash). For email sending also set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` and optionally `HUNTER_API_KEY` and `HUNTER_MONTHLY_LIMIT` (see `.env.example`). `GEMINI_MODEL` must be a model Google currently offers. `WEB_ORIGIN` must equal the web app's address (`http://localhost:3000` in development).
3. Copy `web/.env.example` to `web/.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public values only) and `NEXT_PUBLIC_API_URL` (`http://localhost:4000`).
4. From the repo root run `npm install`. This is an npm workspace (`server`, `web`, `mobile`, `packages/shared`); the install also builds the shared package.
5. Run everything with `npm run dev` (server on port 4000, web on port 3000), or separately with `npm run dev:server` and `npm run dev:web`.
6. Open http://localhost:3000, create an account, and follow the onboarding steps (upload your CV, set your roles).

Useful commands from the repo root: `npm test`, `npm run typecheck`, `npm run build`.

API endpoints: `GET /profile`, `PUT /profile`, `POST /cv`, `GET /applications`, `GET /applications/:id`, `PATCH /applications/:id`, `PATCH /applications/:id/status`, `GET /analytics`, `POST /jobs/refresh`, and `GET /health`. Every endpoint except `/health` needs a Supabase access token sent as `Authorization: Bearer <token>`.

## Web dashboard

- **Queue:** AI-prepared applications sorted by match score. Open one to edit the tailored CV and cover letter, then **Approve & Apply**. Nothing is sent for you: the panel gives you the job link, the CV PDF and a copy button for the cover letter; you apply on the employer's site and click **Mark as applied**.
- **Tracker:** Kanban board (Pending Review, Applied, Interviewing, Rejected, Offer). Drag cards between columns.
- **Analytics:** totals, response rate (counts cards you moved past Applied until email reply tracking exists) and average match score.
- **Settings:** replace your CV, edit preferences, and set apply mode, threshold, daily cap and follow-up preferences. Auto mode sends eligible applications by email (see below).

## Email sending (Phase 3)

- **Apply the database change:** run `supabase/migrations/0002_email.sql` in the Supabase SQL editor (once).
- **Gmail:** follow `docs/gmail-setup.md` and set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` and `GMAIL_REDIRECT_URI`. Then use Settings, Connect Gmail.
- **Finding contacts:** optional `HUNTER_API_KEY` (free tier is about 25 searches a month, capped by `HUNTER_MONTHLY_LIMIT`). Without it, JobLume only offers clearly marked guesses.
- **Sending:** Approve & Apply now has a Send by email section. You always click Send, except in Auto mode (see Settings for the exact rules). Guessed addresses need an extra confirmation and are never sent by Auto mode.
- **Follow-ups:** three days after you send, a draft appears in the queue's Follow-ups tab. You edit and send it, or turn on Auto follow-up.
- **More endpoints:** `POST /gmail/connect`, `GET /gmail/callback`, `GET /gmail/status`, `DELETE /gmail`, `POST /applications/:id/send`, `POST /applications/:id/email/next`, `PUT /applications/:id/email`, `GET /follow-ups`, `PATCH /follow-ups/:id`, `POST /follow-ups/:id/send`, `POST /follow-ups/:id/dismiss`.
- **Test it:** work through `docs/phase3-manual-checklist.md` using a second email address you own.

## LinkedIn and Indeed (Phase 4)

- **Apply the database change:** run `supabase/migrations/0003_job_sources.sql` in the Supabase SQL editor (once). It adds the `job_fetches` table.
- **JSearch (optional):** set `JSEARCH_API_KEY` (a RapidAPI key subscribed to JSearch) and optionally `JSEARCH_MONTHLY_LIMIT` (default 50 requests a month). The worker then asks JSearch once a day for your roles and places and keeps only LinkedIn and Indeed results. Without a key, JSearch is skipped.
- **Paste a job link:** on the Queue page, paste a LinkedIn or Indeed job link into **Add a job link**. The worker reads that one page and prepares an application for you. The list under the box shows each link's status, or why it could not be read (blocked, sign-in required, no longer available, or unreadable).
- **Install the browser on the worker host (once):** `npm run browsers:install -w server`. On Linux use `npx -w server playwright install --with-deps chromium` to also install the system libraries. Only the worker uses it; the API never loads it, and the tests never need it.
- **Terms of service and ban risk:** LinkedIn and Indeed restrict automated access in their terms. Reading a job page with a headless browser may breach those terms, and the site can block your worker host's IP address or, if you ever used the same network for your own account, flag it. JobLume limits this on purpose: it only fetches a link you paste yourself (one page per link, 10 links an hour per user), never signs in, never crawls search or listing pages, and never submits anything on the sites. JSearch is a licensed third-party API and does not touch those sites from your machine. You accept the remaining risk when you paste links; if a page is blocked, JobLume reports it and does not retry around the block.
- **Applying stays manual:** for LinkedIn and Indeed jobs you use the job link, the tailored CV and the cover letter, and apply on the site yourself. Auto mode never sends these, and JobLume never submits anything on LinkedIn or Indeed, never signs in to them, and never crawls their search pages.
- **More endpoints:** `POST /jobs/from-url` (body `{ "url": "..." }`, 10 an hour per user), `GET /jobs/fetches`.
- **Test it:** work through `docs/phase4-manual-checklist.md`.

## Mobile app (Phase 5)

An Android-first Expo app in `mobile/` (Expo SDK 57, Expo Router, React Native 0.86) with the same functions as the web dashboard: sign-in, the queue (search, All / 90%+ / Recent, Follow-ups, Add a job link, pull to refresh), job detail (approve, send by email, skip, assisted apply with PDF share), tracker, analytics, settings with Gmail, and onboarding with CV upload. It talks only to the Express API with your Supabase access token; Supabase JS is used only to sign in and refresh the session, which is kept in the phone's SecureStore. Nothing is sent without your tap, except under the existing Auto-mode rules on the server.

- **Configure:** copy `mobile/.env.example` to `mobile/.env` and set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_API_URL=http://<your PC's Wi-Fi IP>:4000` (not `localhost`; the phone is another device). Use the IPv4 address from `ipconfig` on the PC (the same address Expo prints after `Metro: exp://`). Only these three public values go into the app. Never commit `mobile/.env`.
- **Run on your phone:** install Expo Go from the Play Store (the app targets Expo SDK 57, so it needs an Expo Go that supports SDK 57), put the phone on the same Wi-Fi as the PC, run `npm run dev:server` and `npm run dev:mobile`, then scan the QR code with Expo Go. Windows must allow inbound TCP 4000 (and 8081 for the Metro bundler) on your private network; see `docs/phase5-manual-checklist.md`.
- **Gmail from the phone:** Settings, Connect Gmail opens Google in an in-app browser and the API sends you back to `joblume://gmail-return`. Google only accepts `http://localhost` or an https address as `GMAIL_REDIRECT_URI`, so while the API runs on your PC connect Gmail once from the web app on the PC; the phone then shows it connected (the connection belongs to your account, not the device).
- **Standalone APK (later):** `mobile/eas.json` has a `preview` profile that builds an APK with EAS Build. It needs a deployed https API first (out of scope for this phase); the steps are in the checklist.
- **Tests:** `npm test -w mobile` (Jest with jest-expo and React Native Testing Library, fakes only) and `npm run typecheck -w mobile`.
- **React version:** the repo-root override pins React `19.3.1`; Expo SDK 57 lists `19.2.3`. `mobile/package.json` excludes `react`, `react-dom` and `@types/react` from `expo install --check`, and React Native 0.86 accepts `^19.2.3`, so there is one React for all workspaces.
- **Test it:** work through `docs/phase5-manual-checklist.md` on a real phone.

## Job discovery (Phase 6)

- **Sources:** MyJobMag and Jobberman (pages 1 to 3), Remotive, RemoteOK, We Work Remotely, Himalayas, Arbeitnow, Working Nomads, plus LinkedIn and Indeed through JSearch. Nothing is sent for you unless you click, or you turn on Auto mode (which only emails eligible, non-guessed addresses and never LinkedIn or Indeed jobs); otherwise you apply on the employer's site yourself.
- **Attribution:** RemoteOK, Remotive, Himalayas, We Work Remotely, Arbeitnow and Working Nomads ask for a link back and naming the source. The stored job link is each board's own page and the source name is shown on every card; keep both visible if you change the UI. Do not republish these jobs to other job boards.
- **Last scan:** the queue shows what each source's last scan found, added and skipped (by title or place) and whether the worker is running (`GET /scan/status`).
- **New-match email:** Settings has "Email me about new matches" (off by default). It sends at most one email an hour to your own Gmail address, with job titles, companies, scores and a link, never your CV. Gmail must be connected.
- **Database:** apply `supabase/migrations/0004_discovery.sql` before starting the new server and worker.
- **Test it:** work through `docs/phase6-manual-checklist.md`.

## Getting a test token (API only, without the web app)

1. In the Supabase dashboard open Authentication > Users and create a user (email and password).
2. Request a session:

```bash
curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password"   -H "apikey: $SUPABASE_ANON_KEY"   -H "content-type: application/json"   -d '{"email":"you@example.com","password":"..."}'
```

3. Send the `access_token` from the response as `Authorization: Bearer <token>`.

Users created BEFORE the migration ran have no profile row, because the signup trigger only fires for new users. Create those users after applying the migration, or insert their profile row by hand.

After the first run, the worker's scheduler scans the job boards every `SCRAPE_EVERY_MINUTES` minutes (default 120), Remotive every 6 hours (its own limit is 4 requests a day) and JSearch daily. Deleting the Redis keys resets it.

## Deploying

- API: Render (free) with start command `npm run start:api` after `npm run build`.
- Worker: an always-on host (Railway, Fly.io or a small VPS) with start command `npm run start:worker`. Render's free tier sleeps, so it cannot run the worker's schedule. Install Chromium on that host once (`npx -w server playwright install --with-deps chromium`) for pasted job links.
- Both processes use the same environment variables.

## Deploying the web app

Deploy `web/` to Vercel. Set the project's Root Directory to `web`, enable "Include source files outside of the Root Directory", and set the three `NEXT_PUBLIC_*` variables. Set the server's `WEB_ORIGIN` to the Vercel URL.

## Notes

- Nothing is sent without your click unless you turn on Auto mode, and even then only to addresses it is allowed to use (see Settings; guessed addresses and LinkedIn or Indeed jobs are never sent). The optional new-match email only goes to your own address and never applies for you.
- Through the API, users can only edit their tailored CV text and cover letter text. Applications are written by the server only; the database denies client writes.
- Remotive, RemoteOK, We Work Remotely, Himalayas, Arbeitnow and Working Nomads jobs must keep their link back and source attribution when shown in the UI.
- Free-tier limits: Upstash counts Redis commands (the worker polls idle queues sparingly); Gemini free quota is lower than the `AI_DAILY_LIMIT` soft cap, so set the cap below your real quota.
- Talent platforms to join once (not scannable listings): `docs/talent-platforms.md`.
- Manual test checklist: `docs/phase2-manual-checklist.md`.
