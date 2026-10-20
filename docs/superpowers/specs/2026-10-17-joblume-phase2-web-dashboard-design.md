# JobLume — Phase 2 (Web Dashboard) Design

Date: 2026-10-17
Status: Draft for user review
Builds on: `2026-10-17-joblume-phase1-core-loop-design.md` (Phase 1 is merged to `main`)

## 1. Goal

A Next.js web dashboard on top of the Phase 1 backend. A user can sign up and sign in, onboard (CV + preferences), review AI-tailored applications, edit them, apply with an assisted flow, track progress on a Kanban board, see basic analytics, and manage settings. Nothing is sent automatically; sending is Phase 3.

## 2. Decisions made

| Question | Decision |
|---|---|
| Phase 1 branch | Merged to `main` (fast-forward, 165/165 tests pass); Phase 2 is built on `phase2-dashboard`. |
| Approve & Apply (no Gmail yet) | **Assisted apply.** Approve opens a panel with the job link, tailored CV PDF download and cover-letter copy; the user submits on the employer's site and clicks "Mark as applied". Phase 3 adds one-click email sending to the same button. |
| Screens | Sign-in + onboarding + settings, review queue, tracker Kanban, analytics. |
| Sign-in | Email + password via Supabase Auth. Google sign-in is deferred (one button plus a Supabase setting later). |
| Data access | **Everything through the Express API.** The web app never queries the database directly. |
| Repo structure | Single repo, npm workspaces (`server`, `web`, `packages/*`). Not split into three repos. |

## 3. Structure

```
joblume/
  package.json            workspaces: server, web, packages/*
  packages/shared/        types and zod schemas shared by server and web (and later mobile)
  server/                 existing backend + new endpoints (section 5)
  web/                    Next.js 14 App Router, Tailwind, shadcn/ui
  supabase/  docs/
```

- `packages/shared` holds only what both sides must agree on: application status values, the profile settings schema (location Lagos | Abuja | Remote, apply mode, threshold 0..100, daily cap 1..20), and API response types. The server is refactored to import these; existing tests protect the refactor.
- `web` talks to the server only through HTTP and never imports server code, so it could be moved to its own repo later.
- Libraries: `@supabase/ssr` (cookie session), TanStack Query, dnd-kit, shadcn/ui.
- Theme: dark, background `#0A0A0A`, accent `#6C5CE7`, Linear-like. Dark only.
- Deploy: Vercel with root directory `web/`.

## 4. Auth flow

1. `/login` offers Sign in and Create account tabs (email + password).
2. The Supabase session is stored in a cookie via `@supabase/ssr`. Next.js middleware redirects requests without a session to `/login`.
3. An API client reads the session access token and sends `Authorization: Bearer <token>` to `NEXT_PUBLIC_API_URL`. The Supabase client refreshes expired tokens.
4. The server already restricts CORS to `WEB_ORIGIN` and verifies the token with `supabase.auth.getUser`.
5. A `401` from the API signs the user out and redirects to `/login`.

Whether new accounts require email confirmation depends on the user's Supabase project settings; the UI shows the Supabase message either way.

## 5. Server additions

All follow the Phase 1 pattern: user id from the verified token, every query scoped to that user, service-role writes (clients cannot write `applications`), zod validation, logic tested with fakes.

### `PATCH /applications/:id/status`
Body `{ "status": <one of the 7 existing statuses> }`. Side effects, applied server-side:

- To **applied**: set `applied_at = now`, `follow_up_at = now + 3 days`, `apply_method = 'assisted'` (only when it is empty).
- To **interviewing / rejected / offer**: if `applied_at` is empty, set it (with `follow_up_at` and `apply_method`) as for applied, since an application cannot reach those states without being applied.
- To **pending_review / approved / skipped**: clear `applied_at` and `follow_up_at`.
- Re-moving an already-applied application between applied / interviewing / rejected / offer keeps its original `applied_at`.
- `approved` is a transient "Ready to apply" state; the Kanban shows it inside the Pending Review column with a badge. `skipped` goes to an archive tab with Restore.
- Manual marking is **not** blocked by the daily cap; the cap protects automated sending in Phase 3.
- Invalid ids (non-UUID) return 404, unknown statuses 400, another user's application 404.

### `GET /analytics`
Returns `{ total, by_status, applied_ever, responded, response_rate, avg_match_score }`.
`applied_ever` = applied + interviewing + rejected + offer. `responded` = interviewing + rejected + offer. `response_rate` = `responded / applied_ever` (0 when `applied_ever` is 0). Until Gmail reply tracking exists (Phase 3), "responded" means the user moved the card past Applied; the UI says so in a tooltip. `avg_match_score` ignores null scores and is null when there are none.

### Other
- `GET /applications` gets a default `limit` of 200 (newest and highest score first, as today).
- No database migration is needed.

## 6. Screens

**Sign-in (`/login`).** Two tabs, inline Supabase errors.

**Onboarding.** Shown on first login or whenever the profile has no CV text or no desired roles.
1. Drag-and-drop CV upload (PDF/DOCX, 5 MB). Server errors are shown in plain language: unsupported file type, too little extractable text, unreadable file.
2. Roles, location, skills, years of experience, salary range.
3. Finish screen: first matches appear within a few minutes.

**Review queue (`/queue`).**
- Cards sorted by match score: role, company, source badge with link, location, score ring, missing-keyword chips, short CV and cover-letter previews.
- Tabs: Pending, Ready to apply, Skipped.
- Detail view: full tailored CV and cover letter side by side, both editable with an explicit Save (saving CV text rebuilds the PDF through the existing PATCH). PDF download uses the signed URL from `GET /applications/:id`.
- **Approve & Apply** sets status `approved` and opens the assisted panel: Open job link, Download CV PDF, Copy cover letter, Mark as applied. **Skip** moves to the Skipped tab; Restore undoes it.
- "Find another email" is not shown (Phase 3).
- The queue refetches on window focus and every 60 seconds so new matches appear.

**Tracker (`/tracker`).** Columns Pending Review | Applied | Interviewing | Rejected | Offer. Drag and drop updates the UI immediately, calls the status endpoint, and rolls back with a message if the server refuses. Clicking a card opens the same detail view.

**Analytics (`/analytics`).** Tiles for total, applied, response rate and average match score, plus a CSS status bar. No chart library.

**Settings (`/settings`).** Replace CV; edit preferences; apply mode (manual | auto), auto threshold, daily cap, auto follow-up toggle. A note states that Auto only stores the preference until Phase 3.

**All screens.** Loading, empty and error states; responsive down to phone width with a collapsing sidebar; keyboard-accessible controls.

## 7. Error handling

| Response | Behaviour |
|---|---|
| 401 | Sign out, redirect to `/login` |
| 400 | Field-level messages from the validation details |
| 413 / 422 (CV) | Plain-language upload messages |
| 429 | "Try again later" |
| 5xx | Toast with Retry |
| Network failure | Offline banner |

## 8. Security

- The browser holds only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_API_URL`. No service-role key or server secret ever reaches the web app.
- Job and apply links render only when the URL scheme is `http` or `https` and open with `rel="noopener noreferrer"`.
- Job descriptions, CVs and cover letters render as plain text. `dangerouslySetInnerHTML` is not used.

## 9. Testing

- **Server** (Vitest + supertest, fakes): status transitions and every side effect above, analytics calculation (including zero and null cases), route auth, validation and ownership.
- **Shared package:** schema tests for the profile settings and status values.
- **Web** (Vitest + React Testing Library + jsdom): API client (token attach, error mapping, 401 handling), Kanban grouping and move logic, optimistic update with rollback, profile form validation against the shared schema, onboarding step flow, link-scheme guard. No snapshot tests.
- **Live check:** a written manual checklist run against the user's real Supabase project and server (login, onboarding, queue, assisted apply, Kanban, analytics, settings), because only that exercises real auth and real data.

## 10. Definition of done

A user can: sign up and sign in; onboard; see matched applications; edit a tailored CV and cover letter; approve and apply through the assisted panel and mark as applied; drag cards across the Kanban; see analytics; change settings. Server, shared and web tests, typecheck and production builds all pass, and the manual checklist is written.

## 11. Out of scope

Gmail connection, email finding, any sending, follow-ups (Phase 3); Google sign-in; mobile app (Phase 5); push notifications; pagination beyond 200 applications; light theme; realtime sockets.

## 12. Environment variables

Web (`web/.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`.
Server: unchanged. `WEB_ORIGIN` must equal the web app's origin (`http://localhost:3000` in development).
