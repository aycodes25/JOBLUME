# JobLume — Phase 3 (Email: Gmail sending, email finder, follow-ups, Auto mode) Design

Date: 2026-10-17
Status: Draft for user review
Builds on: the Phase 1 and Phase 2 specs (both merged to `main`)

## 1. Goal

Make Approve & Apply able to send. The user connects their Gmail account; for each prepared application the app finds a contact email; one click sends the application email with the tailored CV attached; follow-up drafts appear three days later; and, if the user chooses Auto mode, low-risk high-match applications send themselves within the daily cap. Nothing sends without either the user's click or an explicit Auto-mode setting.

## 2. Decisions made

| Question | Decision |
|---|---|
| Scope | One combined spec for Phase 3. |
| Reply detection | **By card status only.** No inbox access. Only the `gmail.send` permission (plus the user's email address for display) is requested. |
| Email finder sources | **Hunter + role-mailbox guesses.** Apollo is out of scope. |
| Guessed addresses | Manual send only, after the user ticks a confirmation; Auto mode never sends to a guess. |
| Notifications (Resend) | Skipped for now. Drafts and sent mail show in the dashboard. |
| Follow-ups | One per application, only for applications sent through Gmail. |
| Auto mode | As decided in Phase 1: Auto setting + Gmail connected + trusted source + Hunter email at confidence 80 or more + score at or above threshold + daily cap not reached. LinkedIn and Indeed never auto-send. |

### Clarifications to earlier wording
- The Phase 1 spec suggested `firstname.lastname@company.com` guesses. A job posting gives no person's name, so name-based guessing cannot work. Guesses are role mailboxes (`careers@`, `jobs@`, `hr@`, `recruitment@`).
- Follow-ups apply only to applications with `apply_method` `email` or `auto`. Those have a recipient and a Gmail thread. An application the user applied to by hand on a website gets no follow-up draft.

## 3. Architecture

New server modules (all dependencies passed as arguments, so each is unit-testable with fakes):

```
server/src/services/
  gmail/       oauth.ts (state, auth URL, code exchange)  tokens.ts (encrypt/store, refresh, revoke)
               mime.ts (raw message builder)  send.ts (Gmail API call)
  email/       hunter.ts (client + parser)  candidates.ts (ranking, guesses)  finder.ts (cache, quota, orchestration)
  sending/     send-application.ts (rules, lock, status change, log)  auto-apply.ts (eligibility)
  followups/   scan.ts  draft.ts (AI)  send-followup.ts
server/src/api/routes/   gmail.ts  email.ts  send.ts  followups.ts
server/src/worker/       find-email.ts  send.ts  followups.ts   (new queues: find-email, send, followups)
packages/shared/src/     new types: EmailCandidate, FollowUp, GmailStatus; Application gains email fields
web/                     Settings Gmail card, email section in the apply panel, Follow-ups tab
docs/gmail-setup.md      Google Cloud setup guide
```

New dependency: `nodemailer` (only its `MailComposer`, to build raw MIME; no SMTP is used).

## 4. Gmail connection

**Flow.**
1. Settings → "Connect Gmail" calls `POST /gmail/connect` (authenticated). The server returns a Google authorization URL containing a signed `state` (user id + issued-at), valid for 10 minutes. The signing key is derived from `ENCRYPTION_KEY` with a fixed label, never the raw key.
2. Google redirects to `GET /gmail/callback?code&state`. This route is not behind the bearer-token check; it is protected by verifying `state`. It exchanges the code, encrypts the refresh token (AES-256-GCM, existing helper) into `users.gmail_refresh_token_enc`, stores `gmail_email` and `gmail_connected_at`, then redirects to `${WEB_ORIGIN}/settings?gmail=connected` (or `?gmail=error`). It redirects nowhere else.
3. `GET /gmail/status` returns `{ connected, email }`. `DELETE /gmail` revokes the token at Google and clears the columns.

**Scopes.** `https://www.googleapis.com/auth/gmail.send`, `openid`, `email`. Nothing that reads mail.

**Tokens.** Each send obtains an access token from the refresh token (the access token may be cached in memory for its lifetime). If Google answers `invalid_grant`, the stored token is cleared and the call fails with `gmail_reauth_required`; the dashboard shows "Reconnect Gmail".

**Setup guide.** `docs/gmail-setup.md` walks through: create a Google Cloud project, enable the Gmail API, configure the OAuth consent screen (External; add the user's address as a test user while testing; **publish to "In production"** to avoid the 7-day refresh-token expiry that applies to apps in Testing status, accepting the unverified-app warning shown to the owner), create a Web OAuth client with redirect URI `http://localhost:4000/gmail/callback`, and set the three env vars.

**Not configured.** If the Gmail env vars are missing, `POST /gmail/connect` answers 503 `gmail_not_configured` and the Settings card explains it.

## 5. Email finder

**Trigger.** After an application is created (the tailor worker enqueues a `find-email` job), and on demand from the dashboard.

**Lookup, in order.**
1. **Domain.** Use `jobs.company_domain` if set; otherwise the `company_contacts` cache by normalised company name (same normalisation as the job dedupe key); otherwise Hunter Domain Search with `company=<name>`, which returns the domain, a detected pattern and known contacts.
2. **Rank contacts.** Prefer recruiting/HR/talent/people positions, then generic role addresses Hunter knows (`careers@`, `jobs@`), each with Hunter's own confidence, highest first.
3. **Guesses.** If no candidate has confidence 80 or more, append role-mailbox guesses at the company domain (`careers@`, `jobs@`, `hr@`, `recruitment@`) with confidence 30, source `guess`, label "Guess, low confidence".

**Candidate record:** `{ email, confidence, source: 'hunter' | 'guess', label, name?, position? }`, stored best-first in `applications.email_candidates`. `hiring_manager_email`, `email_confidence` and `email_source` hold the current choice (index 0 initially).

**On demand.**
- `POST /applications/:id/email/next` moves to the next candidate; when the list is exhausted it returns `{ exhausted: true }` and changes nothing.
- `PUT /applications/:id/email` with `{ email }` sets a pasted address: source `manual`, confidence null. A manual address counts as confirmed by the user but is never used by Auto mode.

**Free-tier discipline.** Results are cached 30 days per company in `company_contacts` (shared across users, server-only). A Redis counter limits Hunter calls to `HUNTER_MONTHLY_LIMIT` per calendar month (default 25); past it, or without `HUNTER_API_KEY`, the finder uses only a known or cached domain plus guesses. With no domain at all it records no candidates, and the panel offers the paste box or the assisted steps. Hunter calls run on a queue limited to one per second.

## 6. Sending an application

**`POST /applications/:id/send`**, body `{ to?: string, confirmGuess?: boolean }` (strict). Your click on Send is the approval. Checks, in this order, stopping at the first failure:

| # | Check | Failure |
|---|---|---|
| 1 | Application belongs to the user (non-UUID id → 404) and has status `pending_review` or `approved` | 404 `application_not_found` / 409 `already_sent` |
| 2 | Gmail connected | 409 `gmail_not_connected` |
| 3 | Recipient exists (`to` if given, else the stored one; valid email, max 254 chars) | 422 `no_recipient` |
| 4 | If the recipient's source is `guess` and `confirmGuess` is not true | 409 `guess_not_confirmed` |
| 5 | `applications_applied_today(user) < profiles.daily_cap` | 429 `daily_cap_reached` |
| 6 | Redis lock `send-lock-<applicationId>` acquired (60 s), so a double click cannot send twice | 409 `already_sent` |

**The message.** Subject `Application for {role}`; body is the cover letter as plain text; the tailored CV PDF is attached as `CV - {role}.pdf` (sanitised). It is sent with the Gmail API `users.messages.send`. The builder sets a `Message-ID` header so a later follow-up can reference it.

**On success**, in one logical step: the application moves to `applied` using the same rules as the status endpoint (`applied_at = now`, `follow_up_at = now + 3 days`) with `apply_method = 'email'`; the recipient, its source and confidence are stored; and an `email_logs` row records `type = 'application'`, `to_email`, `subject`, `gmail_message_id`, `gmail_thread_id`, `rfc_message_id`, `status = 'sent'`.

**On failure** the application status does not change, an `email_logs` row with `status = 'failed'` and an error summary is written, and the API answers 409 `gmail_reauth_required` (expired token) or 502 `send_failed` (anything else). Failed attempts do not count toward the daily cap.

**Rate limit.** `/send` has its own limit of 10 requests per minute per user on top of the global one.

**Dashboard.** The Approve & Apply panel gains an Email section above the assisted steps:
- Recipient input (editable) with confidence badge and source label, and "Find another email".
- Subject and body preview, and the PDF name.
- A "Send to this guessed address" checkbox when the source is `guess`.
- A Send button, disabled while there are unsaved edits (existing rule) or while sending.
- "Connect Gmail" link when Gmail is not connected.
- The assisted steps remain below, headed "or apply on the site".

## 7. Follow-ups

**Scan.** An hourly BullMQ scheduler (`follow-up-scan`) selects applications where `status = 'applied'`, `follow_up_at <= now()`, `apply_method` is `email` or `auto`, and no `follow_ups` row exists. For each it enqueues `follow-up-draft` (job id `followup-draft-<applicationId>`).

**Draft.** The existing AI service (Gemini primary, OpenAI fallback, JSON validation, quota) generates `{ subject, body }`. Rules: British English, under 120 words, polite and specific to the role and company, mentions the application date, asks about the status without pressure, uses only facts from the application, ends with the candidate's name from the CV header lines supplied in the prompt. Job text and CV are wrapped in data delimiters with the same injection defence as the tailoring prompt. The draft is stored in `follow_ups` with `status = 'pending_review'` and subject `Re: Application for {role}`.

**Review and send.**
- `GET /follow-ups?status=`, `PATCH /follow-ups/:id` (edit subject/body, strict), `POST /follow-ups/:id/send`, `POST /follow-ups/:id/dismiss`.
- Sending uses the original `gmail_thread_id` plus `In-Reply-To`/`References` set to the stored `rfc_message_id`, logs `type = 'follow_up'`, sets the follow-up `sent`, and clears `applications.follow_up_at`.
- Follow-up sends are limited per day to `profiles.daily_cap`, counted separately from `email_logs` (`type = 'follow_up'`, `status = 'sent'`, sent today UTC).
- If the card is no longer `applied` when the user sends, the send is refused (409 `not_applicable`) and the draft is dismissed.

**Auto follow-up.** If `profiles.auto_followup` is true and Gmail is connected, the draft job enqueues the send on the `send` queue after a random 5 to 15 second delay; otherwise the draft waits in the dashboard.

**Dashboard.** The queue page gets a fourth tab, **Follow-ups**, listing drafts with edit, Send and Dismiss.

**Threading risk (verify live).** Gmail may rewrite the `Message-ID` header it receives. If it does, the follow-up still sends but starts a new thread instead of replying. The live checklist tests this.

## 8. Auto mode

After `find-email` finishes for an application with status `pending_review`, the worker evaluates `auto-apply`. All of these must hold:

1. `profiles.apply_mode = 'auto'`.
2. Gmail is connected.
3. `jobs.source` is `remotive`, `myjobmag` or `jobberman`.
4. The chosen email has `email_source = 'hunter'` and `email_confidence >= 80`.
5. `match_score >= profiles.auto_threshold`.
6. Today's applied count is below `daily_cap`.

If so, it enqueues `send-application` (job id `auto-send-<applicationId>`) on the `send` queue with a random 5 to 15 second delay; the queue limiter allows one send per 10 seconds. The send runs through the same service as a manual send (all checks re-run, including the cap) and records `apply_method = 'auto'`. A failure leaves the application in the queue and logs the error. Guessed and manually pasted addresses never auto-send. Turning Auto on later does not send applications that already exist; it affects only newly prepared ones. The Settings note is rewritten to describe exactly these conditions.

## 9. Data model: migration `0002_email.sql`

- `users`: add `gmail_email text`, `gmail_connected_at timestamptz` (not granted to clients; status comes through the API).
- `applications`: add `email_source text check (email_source in ('hunter','guess','manual'))`, `email_candidates jsonb not null default '[]'`.
- `email_logs`: add `to_email text`, `subject text`, `gmail_thread_id text`, `rfc_message_id text`, `status text not null default 'sent' check (status in ('sent','failed'))`, `error text`.
- New `follow_ups`: `id uuid`, `application_id uuid references applications on delete cascade` (unique: one per application), `subject text not null`, `body text not null`, `status text not null default 'pending_review' check (status in ('pending_review','sent','dismissed','failed'))`, `created_at`, `sent_at`. RLS on; clients may select their own rows (through the application); writes are server-only.
- New `company_contacts`: `id uuid`, `company_key text unique not null`, `domain text`, `contacts jsonb not null default '[]'`, `pattern text`, `fetched_at timestamptz not null default now()`. RLS on with no client access.
- Indexes on `follow_ups (status)`; client write privileges revoked on all new tables, matching the existing server-write-only pattern.

## 10. Shared package and API summary

New shared types: `EmailCandidate`, `FollowUp`, `GmailStatus`; `Application` gains `email_source` and `email_candidates`.

| Method and path | Purpose |
|---|---|
| `POST /gmail/connect` | Returns the Google authorization URL |
| `GET /gmail/callback` | OAuth redirect target (state-verified, not bearer-protected) |
| `GET /gmail/status`, `DELETE /gmail` | Connection status; disconnect |
| `POST /applications/:id/email/next` | Move to the next email candidate |
| `PUT /applications/:id/email` | Set a pasted address |
| `POST /applications/:id/send` | Send the application email |
| `GET /follow-ups`, `PATCH /follow-ups/:id` | List and edit drafts |
| `POST /follow-ups/:id/send`, `POST /follow-ups/:id/dismiss` | Send or dismiss a draft |

All except `/gmail/callback` require the bearer token and use the user id from it; every query is scoped to that user.

## 11. Environment variables

Server: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` (all optional as a group; when missing, Gmail features answer `gmail_not_configured`), `HUNTER_API_KEY` (optional), `HUNTER_MONTHLY_LIMIT` (default 25). Web: no new variables.

## 12. Security

- The refresh token is encrypted at rest, never returned to a browser, never logged. Existing column grants already hide `gmail_refresh_token_enc`.
- The OAuth `state` is signed, expires after 10 minutes, and the callback redirects only to `WEB_ORIGIN`.
- Recipients are validated as email addresses; subjects have CR/LF removed; attachment names are sanitised.
- The daily cap is counted from the database. The send lock prevents duplicates.
- Hunter and Gmail secrets are server-only. Email bodies and tokens are never logged.

## 13. Error messages in the dashboard

New plain-language messages for: `gmail_not_connected`, `gmail_not_configured`, `gmail_reauth_required`, `guess_not_confirmed`, `daily_cap_reached`, `already_sent`, `no_recipient`, `send_failed`, `not_applicable`.

## 14. Testing

All with fakes; no live services in automated tests.
- **Server:** OAuth state signing and expiry; MIME builder (headers, attachment, CR/LF injection attempts, Message-ID); token refresh including `invalid_grant`; Hunter response parsing from a recorded sample; candidate ranking and guess generation; finder orchestration with cache and monthly limit; every send check and the lock, status change and log rows; follow-up scan and drafting; Auto eligibility for every condition; routes (auth, validation, ownership, error codes).
- **Web:** the email section of the apply panel (guess confirmation, disabled states, error messages), the Follow-ups tab, the Settings Gmail card.
- **Live checklist:** including connecting Gmail, sending a real application to a second address you own, checking the attachment, forcing a follow-up draft, and checking threading.

## 15. Definition of done

A user connects Gmail; a prepared application shows a contact email; Send application delivers the email with the CV attached and moves the card to Applied; a follow-up draft appears after 3 days and sends from the Follow-ups tab; Auto mode sends eligible applications within the daily cap; all tests, typechecks and builds pass; the Google setup guide and live checklist are written.

## 16. Out of scope

Reading the inbox or detecting replies; Resend notifications; Apollo; LinkedIn and Indeed (Phase 4); the mobile app (Phase 5); more than one follow-up per application; scheduled send times; unsubscribe handling.

## 17. Suggested build order (for the plan)

1. Migration 0002 and shared types.
2. Gmail OAuth, tokens, MIME and send primitives.
3. Send service and routes.
4. Email finder and `find-email` worker.
5. Follow-ups (scan, draft, send, routes).
6. Auto mode.
7. Web: Settings Gmail card, email section, Follow-ups tab, error messages.
8. Docs: Gmail setup guide, checklist, README.
