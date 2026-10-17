# JobLume

Semi-automatic job application platform. Phase 1 (this repo state): backend that finds jobs and prepares tailored applications for your review. See `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Phase 1 setup

1. Create a Supabase project. Run `supabase/migrations/0001_init.sql` (CLI `supabase db push`, or the SQL editor).
2. Copy `.env.example` to `.env` and fill in Supabase, Gemini and Upstash values. `GEMINI_MODEL` must be a model currently offered by Google.
3. `cd server && npm install && npm run dev` starts the API (port 4000) and the worker together.

API endpoints: `GET /profile`, `PUT /profile`, `POST /cv`, `GET /applications`, `GET /applications/:id`, `PATCH /applications/:id`, `POST /jobs/refresh`, and `GET /health`. Every endpoint except `/health` needs a Supabase access token sent as `Authorization: Bearer <token>`.

## Getting a test token (no frontend yet)

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

## Notes

- Nothing is sent or applied in Phase 1.
- Through the API, users can only edit their tailored CV text and cover letter text. Applications are written by the server only; the database denies client writes.
- Remotive jobs must keep their link back and source attribution when shown in the UI.
- Free-tier limits: Upstash counts Redis commands (the worker polls idle queues sparingly); Gemini free quota is lower than the `AI_DAILY_LIMIT` soft cap, so set the cap below your real quota.
