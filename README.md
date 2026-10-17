# JobLume

Semi-automatic job application platform. Phase 1 is the backend that finds jobs and prepares tailored applications for your review. Phase 2 adds the web dashboard (sign-in, onboarding, review queue, tracker, analytics, settings). See `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Setup

1. Create a Supabase project and run `supabase/migrations/0001_init.sql` (CLI `supabase db push`, or the SQL editor). In Authentication, enable the Email provider. For easy local testing you may turn off "Confirm email".
2. Copy `.env.example` to `.env` and fill in the server values (Supabase, Gemini, Upstash). For email sending also set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` and optionally `HUNTER_API_KEY` and `HUNTER_MONTHLY_LIMIT` (see `.env.example`). `GEMINI_MODEL` must be a model Google currently offers. `WEB_ORIGIN` must equal the web app's address (`http://localhost:3000` in development).
3. Copy `web/.env.example` to `web/.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public values only) and `NEXT_PUBLIC_API_URL` (`http://localhost:4000`).
4. From the repo root run `npm install`. This is an npm workspace (`server`, `web`, `packages/shared`); the install also builds the shared package.
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

## Getting a test token (API only, without the web app)

1. In the Supabase dashboard open Authentication > Users and create a user (email and password).
2. Request a session:

```bash
curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password"   -H "apikey: $SUPABASE_ANON_KEY"   -H "content-type: application/json"   -d '{"email":"you@example.com","password":"..."}'
```

3. Send the `access_token` from the response as `Authorization: Bearer <token>`.

Users created BEFORE the migration ran have no profile row, because the signup trigger only fires for new users. Create those users after applying the migration, or insert their profile row by hand.

After the first run, the worker's scheduler keeps running every 6 hours. Deleting the Redis keys resets it.

## Deploying

- API: Render (free) with start command `npm run start:api` after `npm run build`.
- Worker: an always-on host (Railway, Fly.io or a small VPS) with start command `npm run start:worker`. Render's free tier sleeps, so it cannot run the worker's schedule.
- Both processes use the same environment variables.

## Deploying the web app

Deploy `web/` to Vercel. Set the project's Root Directory to `web`, enable "Include source files outside of the Root Directory", and set the three `NEXT_PUBLIC_*` variables. Set the server's `WEB_ORIGIN` to the Vercel URL.

## Notes

- Nothing is sent or applied automatically; you apply on the employer's site.
- Through the API, users can only edit their tailored CV text and cover letter text. Applications are written by the server only; the database denies client writes.
- Remotive jobs must keep their link back and source attribution when shown in the UI.
- Free-tier limits: Upstash counts Redis commands (the worker polls idle queues sparingly); Gemini free quota is lower than the `AI_DAILY_LIMIT` soft cap, so set the cap below your real quota.
- Manual test checklist: `docs/phase2-manual-checklist.md`.
