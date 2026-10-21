# Joblume Phase 8: autofill browser extension

## 1. Goal
Most matched jobs (about 90 of 96 in the user's queue) have no contact email: they are applied for on the employer's own form. Make that fast and safe: a Chrome extension that fills the standard fields of common application forms (Greenhouse, Lever, Ashby, Workable) from JobLume data while the user reviews and presses Submit. Nothing is submitted by the extension. This replaces any idea of bots logging in to LinkedIn or Indeed (against their terms, ban risk).

## 2. Decisions
| Topic | Decision |
|---|---|
| Browser | Chrome and Chromium browsers (Edge, Brave), Manifest V3, loaded unpacked for now (store publishing out of scope). |
| Language | TypeScript, new workspace `extension/` bundled with esbuild; logic tested with Vitest + jsdom against saved real form HTML fixtures. |
| Forms | Greenhouse (boards.greenhouse.io, job-boards.greenhouse.io), Lever (jobs.lever.co), Ashby (jobs.ashbyhq.com), Workable (apply.workable.com). Standard fields only. |
| Data flow | The JobLume web page sends the data to the extension through a content script on the JobLume origin (`window.postMessage` handshake); the extension holds it in memory and fills the next matching form in the tab it opened. No long-lived login or API key is stored in the extension. |
| Safety | Never submits, never clicks Next/Apply, never fills custom questions, passwords, demographic/EEO or consent checkboxes, never reads page content back to any server. |
| Out of scope | Chrome Web Store, Firefox, Safari, mobile, custom company forms (Workday, iCIMS, SmartRecruiters can come later), auto-answering questions, LinkedIn/Indeed Easy Apply. |

## 3. Data the extension needs
Server and shared changes (migration `0007_contact_profile.sql`):
- `profiles` new nullable text columns: `phone`, `linkedin_url`, `github_url`, `portfolio_url`, `city` (length caps; urls must be https; phone 7 to 20 characters of digits, space, + - ( )). Settable through the existing profile PUT (strict zod) and shown in the Settings form on web and mobile ("Contact details for application forms"). Server-write rules unchanged (profile update path).
- The user's full name: `users.full_name` (editable in the same Settings section through the existing profile API if it already exposes it; otherwise add `full_name` to the profile PATCH and persist to `users.full_name`).
- Application detail already returns `cv_pdf_url` (signed) and `cover_letter_text`.
`GET /applications/:id` or a new `GET /applications/:id/autofill` (auth, user-scoped, 404 for others) returns the exact payload: `{ job_url, full_name, first_name, last_name, email, phone, city, linkedin_url, github_url, portfolio_url, cover_letter, cv: { url, filename } | null }` with `first_name`/`last_name` split from full_name (last token is last name). It never includes anything else.

## 4. Extension behaviour
- **Handshake.** A content script on the JobLume origin(s) (configured at build time, default `http://localhost:3000/*`; documented how to add the deployed domain) listens for `window.postMessage({ source: 'joblume-web', type: 'ping' })` and answers `pong` (so the web app knows the extension is installed), and for `{ type: 'fill', payload }` forwards it to the background. It accepts messages only from `event.source === window` and `event.origin === location.origin`. The background validates the payload shape strictly (zod-like manual validator, lengths capped, urls https only, cv url https only) and rejects anything else.
- **Arming.** On a valid `fill` message the background opens `payload.job_url` in a new tab and stores the payload in `chrome.storage.session` keyed by that tab id with a 30 minute expiry; it is deleted after a successful fill, when the tab closes or on expiry.
- **Filling.** Content scripts for the four form hosts ask the background for the payload of their own tab. Per-site adapters locate standard fields (name/first/last, email, phone, location/city, LinkedIn, GitHub, website/portfolio, resume file input, cover letter textarea or file) by stable attributes (name/id/label text/aria-label) with fallbacks by label text, set values with the native value setter and dispatch `input`, `change` and `blur` events so React/Vue forms register them, attach the CV by fetching the signed URL in the background (https only, the host must be a Supabase storage host configured at build time, size cap 10 MB), building a `File` and assigning it through `DataTransfer`, and show a small dismissible banner: "JobLume filled N fields. Review every answer, then submit yourself." Filled fields get a light outline. Pages with no matching fields do nothing. The adapters wait for the form to render (MutationObserver, 15 s cap).
- **Never:** click any button, submit forms, fill fields whose label mentions password, gender, race, ethnicity, veteran, disability, sponsorship, salary, referral, or custom question inputs, or overwrite a field that already has a value.
- **Popup.** Shows status (armed payload for this tab: job title/company only), a "Clear" button and a link to the setup docs.
- **Web app button.** In the assisted-apply panel (web only): "Fill the form with the JobLume extension" (visible when the ping/pong handshake succeeds; otherwise a short "Install the extension" help link to docs). It fetches the autofill payload and posts it. It never marks the application as applied; the existing "Mark as applied" step stays manual.

## 5. Security
Least privilege: `host_permissions` only for the four form hosts, the JobLume origin(s) and the Supabase storage host; permissions `storage`, `tabs` (to open and track the tab) only. No remote code, no analytics. Payload kept in `storage.session` (memory), cleared aggressively. The signed CV URL is used once. All payload strings are inserted only through `.value`/file APIs, never as HTML. The web side never trusts replies other than `pong` and `filled` counts.

## 6. Testing
Fixtures: trimmed real saved HTML of one public application form per platform (fetch live public job pages; strip scripts). Adapter tests in jsdom for each platform: fields found and filled, events dispatched, existing values kept, sensitive/custom fields untouched, file attach via DataTransfer fake, nothing submitted. Tests for the payload validator (https only, caps), the postMessage handshake (wrong origin ignored), expiry and tab binding, and the server endpoint/profile validation (user scoping, strict zod). Web tests for the button visibility and message sent. Manual checklist `docs/phase8-manual-checklist.md`: build, load unpacked at chrome://extensions, test on a real posting per platform, what to do when a platform changes.

## 7. Honest limits
Form markup changes over time; adapters will need updates. Only standard fields are filled; every application still needs the user's review. Many boards' "Apply" links go to other systems (Workday etc.) which are not covered yet.
