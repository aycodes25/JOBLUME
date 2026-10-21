# Joblume Phase 8: Autofill Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Manifest V3 Chrome extension that fills the standard fields of Greenhouse, Lever, Ashby and Workable application forms from JobLume data while the user reviews and presses Submit, plus the contact-detail fields, the autofill endpoint and the web button it needs.

**Architecture:** The server gains five nullable contact columns on `profiles` (migration 0007), a `full_name` write path to `users.full_name`, and `GET /applications/:id/autofill` that returns one fixed payload. The web assisted-apply panel pings the extension with `window.postMessage`; a content script on the JobLume origin answers and forwards the payload to the MV3 background worker, which validates it strictly, opens the job in a new tab and keeps the payload in `chrome.storage.session` keyed by that tab for 30 minutes. A content script on the four form hosts asks the background for its own tab's payload, waits for the form, and per-platform adapters (small `find(doc, slot)` lookups over one shared fill engine) set values through the native setters, fire `input`/`change`/`blur`, attach the CV through `DataTransfer`, show a banner and report the count. Nothing is ever clicked or submitted.

**Tech Stack:** TypeScript (new npm workspace `extension/`), esbuild (bundling, no framework), Chrome MV3 APIs (`@types/chrome`), Vitest v5 + jsdom against saved real form HTML; server: Express + zod + Vitest v5 + supertest; web: Next.js + React Testing Library; mobile: Expo + Jest + RNTL; shared: zod.

## Global Constraints

Copied verbatim from `docs/superpowers/specs/2026-10-21-joblume-phase8-autofill-extension-design.md`. Every task includes these.

- **Goal:** Most matched jobs (about 90 of 96 in the user's queue) have no contact email: they are applied for on the employer's own form. Make that fast and safe: a Chrome extension that fills the standard fields of common application forms (Greenhouse, Lever, Ashby, Workable) from JobLume data while the user reviews and presses Submit. Nothing is submitted by the extension. This replaces any idea of bots logging in to LinkedIn or Indeed (against their terms, ban risk).
- **Browser:** Chrome and Chromium browsers (Edge, Brave), Manifest V3, loaded unpacked for now (store publishing out of scope).
- **Language:** TypeScript, new workspace `extension/` bundled with esbuild; logic tested with Vitest + jsdom against saved real form HTML fixtures.
- **Forms:** Greenhouse (boards.greenhouse.io, job-boards.greenhouse.io), Lever (jobs.lever.co), Ashby (jobs.ashbyhq.com), Workable (apply.workable.com). Standard fields only.
- **Data flow:** The JobLume web page sends the data to the extension through a content script on the JobLume origin (`window.postMessage` handshake); the extension holds it in memory and fills the next matching form in the tab it opened. No long-lived login or API key is stored in the extension.
- **Safety:** Never submits, never clicks Next/Apply, never fills custom questions, passwords, demographic/EEO or consent checkboxes, never reads page content back to any server.
- **Out of scope:** Chrome Web Store, Firefox, Safari, mobile, custom company forms (Workday, iCIMS, SmartRecruiters can come later), auto-answering questions, LinkedIn/Indeed Easy Apply.
- **Data (migration `0007_contact_profile.sql`):** `profiles` new nullable text columns: `phone`, `linkedin_url`, `github_url`, `portfolio_url`, `city` (length caps; urls must be https; phone 7 to 20 characters of digits, space, + - ( )). Settable through the existing profile PUT (strict zod) and shown in the Settings form on web and mobile ("Contact details for application forms"). Server-write rules unchanged (profile update path).
- **Full name:** The user's full name: `users.full_name` (editable in the same Settings section through the existing profile API if it already exposes it; otherwise add `full_name` to the profile PATCH and persist to `users.full_name`).
- **Existing data:** Application detail already returns `cv_pdf_url` (signed) and `cover_letter_text`.
- **Payload endpoint:** `GET /applications/:id` or a new `GET /applications/:id/autofill` (auth, user-scoped, 404 for others) returns the exact payload: `{ job_url, full_name, first_name, last_name, email, phone, city, linkedin_url, github_url, portfolio_url, cover_letter, cv: { url, filename } | null }` with `first_name`/`last_name` split from full_name (last token is last name). It never includes anything else.
- **Handshake:** A content script on the JobLume origin(s) (configured at build time, default `http://localhost:3000/*`; documented how to add the deployed domain) listens for `window.postMessage({ source: 'joblume-web', type: 'ping' })` and answers `pong` (so the web app knows the extension is installed), and for `{ type: 'fill', payload }` forwards it to the background. It accepts messages only from `event.source === window` and `event.origin === location.origin`. The background validates the payload shape strictly (zod-like manual validator, lengths capped, urls https only, cv url https only) and rejects anything else.
- **Arming:** On a valid `fill` message the background opens `payload.job_url` in a new tab and stores the payload in `chrome.storage.session` keyed by that tab id with a 30 minute expiry; it is deleted after a successful fill, when the tab closes or on expiry.
- **Filling:** Content scripts for the four form hosts ask the background for the payload of their own tab. Per-site adapters locate standard fields (name/first/last, email, phone, location/city, LinkedIn, GitHub, website/portfolio, resume file input, cover letter textarea or file) by stable attributes (name/id/label text/aria-label) with fallbacks by label text, set values with the native value setter and dispatch `input`, `change` and `blur` events so React/Vue forms register them, attach the CV by fetching the signed URL in the background (https only, the host must be a Supabase storage host configured at build time, size cap 10 MB), building a `File` and assigning it through `DataTransfer`, and show a small dismissible banner: "JobLume filled N fields. Review every answer, then submit yourself." Filled fields get a light outline. Pages with no matching fields do nothing. The adapters wait for the form to render (MutationObserver, 15 s cap).
- **Never:** click any button, submit forms, fill fields whose label mentions password, gender, race, ethnicity, veteran, disability, sponsorship, salary, referral, or custom question inputs, or overwrite a field that already has a value.
- **Popup:** Shows status (armed payload for this tab: job title/company only), a "Clear" button and a link to the setup docs.
- **Web app button:** In the assisted-apply panel (web only): "Fill the form with the JobLume extension" (visible when the ping/pong handshake succeeds; otherwise a short "Install the extension" help link to docs). It fetches the autofill payload and posts it. It never marks the application as applied; the existing "Mark as applied" step stays manual.
- **Security:** Least privilege: `host_permissions` only for the four form hosts, the JobLume origin(s) and the Supabase storage host; permissions `storage`, `tabs` (to open and track the tab) only. No remote code, no analytics. Payload kept in `storage.session` (memory), cleared aggressively. The signed CV URL is used once. All payload strings are inserted only through `.value`/file APIs, never as HTML. The web side never trusts replies other than `pong` and `filled` counts.
- **Build-time configuration (from the task brief):** JobLume origin list via env `EXTENSION_JOBLUME_ORIGINS` (default `http://localhost:3000`); Supabase storage host via env `EXTENSION_STORAGE_HOST`.
- **Testing:** Fixtures: trimmed real saved HTML of one public application form per platform (fetch live public job pages; strip scripts). Adapter tests in jsdom for each platform: fields found and filled, events dispatched, existing values kept, sensitive/custom fields untouched, file attach via DataTransfer fake, nothing submitted. Tests for the payload validator (https only, caps), the postMessage handshake (wrong origin ignored), expiry and tab binding, and the server endpoint/profile validation (user scoping, strict zod). Web tests for the button visibility and message sent. Manual checklist `docs/phase8-manual-checklist.md`: build, load unpacked at chrome://extensions, test on a real posting per platform, what to do when a platform changes.
- **Honest limits:** Form markup changes over time; adapters will need updates. Only standard fields are filled; every application still needs the user's review. Many boards' "Apply" links go to other systems (Workday etc.) which are not covered yet.

## Conventions every task follows

- Run commands from the repo root `C:\Users\Hp\Documents\JOBLUME` in Git Bash (the commands below are bash). The branch is `phase8-autofill-extension`. `mobile/tsconfig.json` has an unrelated uncommitted change: never `git add` it (every commit below adds named files only; never `git add -A` or `git add .`).
- `npm run build:shared` must be re-run whenever `packages/shared/src` changes; the server, web, mobile and extension `pretest`/`pretypecheck` hooks do it for you, a bare `npx vitest run` does not.
- **Vitest v5 quirks (server, web, shared, extension):** type spies with their function type, `vi.fn<FnType>()`, and use `.mockImplementation(async () => value)`; never return a value from `beforeEach` (Vitest treats a returned function as a teardown); a `Response` body can be read once, so a fetch fake that answers several calls must build a fresh `Response` each time (`mockImplementation(async () => new Response(...))`, never `mockResolvedValue(new Response(...))`).
- **Jest + React Native Testing Library (mobile):** `render`, `fireEvent.*`, `screen.findBy*` are asynchronous: `await render(...)`, `await fireEvent.press(...)`.
- **jsdom quirks the extension tests rely on (verified while writing this plan):** jsdom has no `DataTransfer` and only accepts a real `FileList` for `input.files`, so tests install `FakeDataTransfer` and make `files` a writable property (`tests/helpers/dom.ts`); `window.postMessage` in jsdom does not set `event.source` or `event.origin`, so tests build `new MessageEvent('message', { data, origin, source })` and dispatch it by hand; under the jsdom environment `readFileSync(new URL(..., import.meta.url))` resolves to a wrong path, so fixtures are read with `resolve(dirname(fileURLToPath(import.meta.url)), ...)`.
- **Line endings:** files in the working tree use CRLF (git `autocrlf`); new files may be LF. The Edit tool accepted multi-line `old_string` anchors against CRLF files while this plan was verified; if one ever fails to match, use a shorter single-line anchor.
- **Backslashes in code must stay literal.** Regular expressions such as `/^[0-9 +()-]{7,20}$/`, `/\s+/g`, `/[^A-Za-z0-9 _.()-]/g` and `/[\x00-\x1f\x7f\s]/` carry real backslashes. If you generate a file through a shell heredoc, a JavaScript template literal inside `node -e`, `sed` or any tool that processes escapes, backslashes can be silently dropped or doubled (`\s` becomes `s`). Write files with the Write/Edit tools, then check the result with a fixed-string search (`grep -n -F 'BAD_URL_CHARS' extension/src/payload.ts`). A few files contain real non-ASCII characters on purpose (the banner close button `×`, the label cleaner `✱`, accented and Chinese letters in one server test): keep them as UTF-8 characters and do not turn them into `\u` escapes. Also note that `\\` inside single quotes on a Bash command line can reach the program as a single backslash, so use `grep -F` as shown in this plan.
- **Fixtures are real captured HTML:** copy them exactly (they are single long lines). Do not reformat, and do not "fix" attribute values.
- Commit messages end with a blank line and then `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Verification performed while writing this plan (2026-10-21)

### Live application pages (real requests)

| Platform | How the job was found | Page fetched | Form in the static HTML? | Status |
|---|---|---|---|---|
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/gitlab/jobs` (232 jobs) | `https://job-boards.greenhouse.io/gitlab/jobs/8860302002` (HTTP 200, 80 KB) | **Yes**, server-rendered: `form#application-form` with inputs `#first_name`, `#last_name`, `#email`, `#phone`, `#resume` and `#cover_letter` (both `type=file`). `boards.greenhouse.io/...` answers 301 to `job-boards.greenhouse.io/...` (also for `/embed/job_app`). | **Verified** |
| Lever | `GET https://api.lever.co/v0/postings/spotify?mode=json` (78 postings), second form from `leverdemo` | `https://jobs.lever.co/spotify/223f9722-3579-4ff2-b123-e4cc7b0c1a64/apply` (HTTP 200), and `.../leverdemo/ad208490-4052-4f91-a57e-433f2d1e484b/apply` | **Yes**, static: `form#application-form` with `name=name`, `email`, `phone`, `location`, `org`, `urls[LinkedIn]`, `urls[GitHub]`/`urls[Github]`, `urls[Portfolio]`/`urls[Other Website]`/`urls[Other]`, and `input[type=file][name=resume]`. Neither form has a cover letter text box. | **Verified** (cover letter box not seen) |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/ashby` | `https://jobs.ashbyhq.com/ashby/7458d4e9-da2e-47bd-98cb-adfda43d42b2/application` | **No.** Client-rendered: the static HTML holds no fields and the rendered page has **no `<form>` element**. The playwright browser tools were available, so the DOM was read after rendering: `#_systemfield_name`, `#_systemfield_email`, `input#_systemfield_resume[type=file]` (an earlier, id-less `input[type=file]` is the separate "autofill from resume" upload), custom questions with UUID ids found by label text, and an id-less `role=combobox` location input. | **Verified against the rendered DOM** (not static HTML). Phone and cover letter boxes not seen |
| Workable | `POST https://apply.workable.com/api/v3/accounts/huggingface/jobs` | `https://apply.workable.com/huggingface/j/DB4D7C0EC8/apply/` | **No.** Client-rendered. Rendered DOM via the browser tools: `form[data-ui=application-form]`, `input[name=firstname]`, `input[name=lastname]`, `input[name=email]`, `input[type=file][data-ui=resume]`, `textarea[name=cover_letter]`; custom questions (`CA_47143` "Github profile", `CA_47383` "Linkedin") are textareas labelled through `aria-labelledby`. | **Verified against the rendered DOM**, **except phone**: this posting has no phone box. `input[name=phone]` and the city/location label search are **UNVERIFIED against a live DOM** (documented Workable field key and label search only). It is marked so in the adapter comment, the tests and the checklist. |

Fixtures embedded below are those captures with scripts, styles, svg, comments, hidden inputs, classes, long help paragraphs, extra demographic surveys and long option lists removed. Attributes the adapters or tests use (`id`, `name`, `type`, `for`, `aria-*`, `data-*`, `role`, `accept`, `value`) were kept untouched. The Chrome extension itself could **not** be loaded into a real Chrome from the machine this plan was written on; that is covered by the manual checklist.

### Build approach (scratch install of the exact setup in Task 4, Windows 11, Node 24.21.0, npm 11.19.0)

- npm workspace `extension` next to `packages/*`: `npm install` OK. `@types/chrome@0.3.6` and `@types/node` as dev dependencies; `esbuild@0.28.2` and `jsdom@30.1.3`, `vitest@5.0.5`, `typescript@7.0.2` are the versions already used elsewhere in the repo. npm prints `npm warn install-scripts ... esbuild ... postinstall` (a notice that npm did not pre-approve esbuild's install script); esbuild works regardless.
- `tsc -p extension/tsconfig.json` (TypeScript 7, `module: ESNext`, `moduleResolution: Bundler`, `types: ["chrome","node"]`) passes with `chrome.storage.session`, `chrome.tabs`, `chrome.runtime` typed.
- `node build.mjs` bundles `background.js`, `bridge.js`, `forms.js`, `popup.js` (IIFE, target `chrome116`; roughly 10, 2, 15 and 2 KB), copies `popup.html`, and writes `manifest.json` from `src/manifest.ts` (compiled for Node by a first small esbuild call). `define` replaced `__STORAGE_HOST__`, `__JOBLUME_ORIGINS__` and `__DOCS_URL__`; all four bundles parse as JavaScript; the manifest is valid JSON with `manifest_version: 3`. Setting `EXTENSION_JOBLUME_ORIGINS="https://app.joblume.example, http://localhost:3000"` and `EXTENSION_STORAGE_HOST=abcd1234.supabase.co` changed the manifest and the bundle as expected.
- Vitest 5 + jsdom: 139 extension tests ran green in about 20 s.

## Decisions that resolve spec ambiguities

1. **Endpoint:** a new `GET /applications/:id/autofill` (not an extra field on `GET /applications/:id`), answered by a separate `autofill` member of `AppDeps` so existing `createApplicationsService` callers and tests are untouched. The response is `Cache-Control: no-store` (it holds a signed link).
2. **`full_name`:** the profile API did not expose it, so `full_name` is added to the profile PUT (zod: 2 to 120 characters, not nullable, so a blank name is simply left out of the patch) and persisted to `users.full_name`. `GET /profile` and PUT responses return `full_name` by selecting `*, users(full_name)`.
3. **Settings UI:** the contact fields live in their own card/section "Contact details for application forms" (`ContactForm`) on web and mobile, not inside `SettingsForm`, so the existing apply-mode form and its exact `onSubmit` patch assertions stay unchanged.
4. **Popup shows "job title/company only":** the payload must contain nothing else, so it has no title or company. The web page sends an optional `label: { title, company }` (taken from the application on screen) next to the payload in the `fill` message; the background stores it beside the payload, never inside it, and trims it to 120 characters.
5. **"filled" counts:** the background remembers which JobLume tab armed the fill and, after the form tab reports a count, sends `{ type: 'joblume:filled', count }` to that tab; the bridge posts `{ source: 'joblume-extension', type: 'filled', count }` to the page.
6. **Payload nullability:** contact fields, names, email and cover letter are `string | null` in the payload; only `job_url` is required. A job whose stored link is `http://` is rejected by the strict validator ("urls https only"); the web button shows a message and the manual "Open job link" step remains.
7. **Cover letter:** a text box when the form has one (Workable `textarea[name=cover_letter]`, a Greenhouse `#cover_letter_text` after the user opened it, or any text area labelled "cover letter"); otherwise a `cover-letter.txt` file into a file input that accepts text (Greenhouse). The extension never clicks Greenhouse's "Enter manually" button.
8. **Single-page navigation (Ashby, Workable):** `forms.js` retries when `location.href` changes (checked once a second) until a fill succeeds; each attempt keeps the spec's 15 s wait cap.
9. **`all_frames: true`** for the form script, because Greenhouse boards are embedded as iframes on company sites. This could not be tried in a real Chrome here (checklist item).
10. **Sensitive words:** the spec's list plus `hispanic`, `latino`, `compensation` and `hear about` (the real forms phrase referral and ethnicity that way). The check looks at label text, `name` and `id`. Combobox inputs (react-select, Ashby location) are never filled, so no city is typed into a box that needs a picked option.
11. **Storage host default:** with `EXTENSION_STORAGE_HOST` unset the build allows `*.supabase.co` and prints a warning; the setup guide tells the user to set the exact project host. The host permission is `https://<host>/*`.
12. **CV transfer:** bytes cross `chrome.runtime.sendMessage` (JSON only in MV3) as base64; "used once" means the first successful download marks the link used, failures can be retried.
13. **Help link:** `web/public/extension-setup.html` (a short static page); the web button's "Install the extension" link and the popup's "Setup help" link (built from the first configured origin) both point to it. The full guide is `docs/extension-setup.md`.
14. **Only senders on a configured JobLume origin may arm a fill** (checked again in the background from `sender.url`), and only the extension's own popup (a sender with no tab) may name a tab id for status/clear.

## File structure

Server and shared
- Create `supabase/migrations/0007_contact_profile.sql`
- Modify `packages/shared/src/profile.ts` (contact fields in `profilePatchSchema`, `PHONE_PATTERN`), `packages/shared/src/api-types.ts` (`Profile` fields, `AutofillPayload`)
- Create `server/src/api/profile-merge.ts` (split/flatten of the name), modify `server/src/api/repos.ts`, `server/src/db/types.ts`
- Create `server/src/services/autofill.ts`; modify `server/src/api/deps.ts`, `server/src/api/routes/applications.ts`, `server/src/api/index.ts`, `server/tests/helpers/deps.ts`

Web and mobile
- Modify `web/src/lib/profile-form.ts` and `mobile/src/lib/profile-form.ts` (identical block), create `web/src/components/profile/ContactForm.tsx`, `mobile/src/components/profile/ContactForm.tsx`; modify the two settings screens
- Create `web/src/lib/extension-bridge.ts`, `web/src/components/applications/FillWithExtension.tsx`, `web/public/extension-setup.html`; modify `AssistedApplyPanel.tsx`, `ApplicationDetail.tsx`, `web/src/lib/api/endpoints.ts`

Extension (`extension/`)
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `build.mjs`, `src/env.d.ts`, `src/manifest.ts`
- `src/payload.ts` (strict validator), `src/messages.ts`, `src/b64.ts`
- `src/background-core.ts` (storage, arming, expiry, CV fetch), `src/router.ts` (message routing and sender checks), `src/background.ts` (chrome wiring)
- `src/bridge-core.ts`, `src/content/bridge.ts` (handshake)
- `src/fill/labels.ts`, `src/fill/engine.ts`, `src/fill/wait.ts` (shared fill engine), `src/adapters/{shared,greenhouse,lever,ashby,workable,index}.ts`
- `src/ui/banner.ts`, `src/run-autofill.ts`, `src/content/forms.ts`, `src/popup/{render.ts,popup.ts,popup.html}`
- `tests/helpers/dom.ts`, `tests/fixtures/*.html`, one test file per source file above

Docs: `README.md` (Phase 8 section), `docs/extension-setup.md`, `docs/phase8-manual-checklist.md`

---

### Task 1: Migration 0007, shared types and the profile PUT (contact fields and full name)

**Files:**
- Create: `supabase/migrations/0007_contact_profile.sql`
- Create: `server/src/api/profile-merge.ts`
- Modify: `packages/shared/src/profile.ts`, `packages/shared/src/api-types.ts`, `server/src/db/types.ts`, `server/src/api/repos.ts`
- Modify (fixtures that build a full profile): `server/tests/worker/match.test.ts`, `server/tests/worker/match-user-job.test.ts`, `server/tests/worker/tailor.test.ts`, `mobile/tests/fixtures.ts`
- Test (create): `packages/shared/tests/profile-contact.test.ts`, `server/tests/db/migration-0007.test.ts`, `server/tests/api/profile-merge.test.ts`, `server/tests/api/profile-contact.test.ts`

**Interfaces:**
- Produces (shared): `PHONE_PATTERN: RegExp` (`/^[0-9 +()-]{7,20}$/`); `profilePatchSchema` accepts the extra keys `full_name: string` (trimmed, 2 to 120), `phone`, `city`, `linkedin_url`, `github_url`, `portfolio_url` (each `string | null`, links must be https and at most 300 characters, city 1 to 80); `Profile` gains `full_name | phone | city | linkedin_url | github_url | portfolio_url: string | null`; `AutofillPayload` (exact shape in step 5).
- Produces (server): `ProfileRow` gains the same six fields; `splitProfilePatch(patch): { profile; fullName }`, `flattenProfile(row): ProfileRow`, `PROFILE_SELECT = '*, users(full_name)'` in `server/src/api/profile-merge.ts`; `createProfileRepo(db).get/update` now return `full_name` and write it to `users`.

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/tests/profile-contact.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PHONE_PATTERN, profilePatchSchema } from '../src/index.js';

describe('profilePatchSchema contact details', () => {
  it('accepts every contact field, trimming text', () => {
    const body = {
      full_name: '  Ada Lovelace ',
      phone: '+234 (801) 234-5678',
      city: ' Lagos ',
      linkedin_url: 'https://www.linkedin.com/in/ada',
      github_url: 'https://github.com/ada',
      portfolio_url: 'https://ada.dev',
    };
    expect(profilePatchSchema.parse(body)).toEqual({ ...body, full_name: 'Ada Lovelace', city: 'Lagos' });
  });

  it('accepts null to clear a contact field', () => {
    const body = { phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null };
    expect(profilePatchSchema.parse(body)).toEqual(body);
  });

  it.each([
    ['an http link', { linkedin_url: 'http://linkedin.com/in/ada' }],
    ['a javascript link', { github_url: 'javascript:alert(1)' }],
    ['a link that is not a url', { portfolio_url: 'my website' }],
    ['a link over 300 characters', { portfolio_url: `https://example.com/${'a'.repeat(300)}` }],
    ['a phone with letters', { phone: '0801-CALL-ME' }],
    ['a phone shorter than 7 characters', { phone: '12345' }],
    ['a phone longer than 20 characters', { phone: '1'.repeat(21) }],
    ['an empty city', { city: '   ' }],
    ['a city over 80 characters', { city: 'x'.repeat(81) }],
    ['a name of one character', { full_name: 'A' }],
    ['a null name', { full_name: null }],
    ['a name over 120 characters', { full_name: 'x'.repeat(121) }],
    ['an unknown contact field', { twitter_url: 'https://x.com/ada' }],
  ])('rejects %s', (_name, body) => {
    expect(profilePatchSchema.safeParse(body).success).toBe(false);
  });

  it('exports the phone rule used by the database check', () => {
    expect(PHONE_PATTERN.source).toBe('^[0-9 +()-]{7,20}$');
  });
});
```

Create `server/tests/db/migration-0007.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PHONE_PATTERN } from '@joblume/shared';

const sql = readFileSync(new URL('../../../supabase/migrations/0007_contact_profile.sql', import.meta.url), 'utf8');

describe('migration 0007_contact_profile.sql', () => {
  it('adds the five nullable contact columns to profiles', () => {
    for (const col of ['phone', 'city', 'linkedin_url', 'github_url', 'portfolio_url']) {
      expect(sql).toMatch(new RegExp(String.raw`add column ${col} text\s+check \(${col} is null or`));
    }
    expect(sql).not.toMatch(/ text not null/);
  });

  it('checks the phone with the same rule as the shared zod schema', () => {
    const m = sql.match(/phone ~ '([^']+)'/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(PHONE_PATTERN.source);
  });

  it('requires https for the three links and caps their length', () => {
    for (const col of ['linkedin_url', 'github_url', 'portfolio_url']) {
      expect(sql).toMatch(new RegExp(String.raw`${col} ~\* '\^https://' and char_length\(${col}\) <= 300`));
    }
  });

  it('caps the city and the full name', () => {
    expect(sql).toMatch(/char_length\(city\) between 1 and 80/);
    expect(sql).toMatch(/users_full_name_length\s+check \(full_name is null or char_length\(full_name\) between 1 and 120\) not valid/);
  });

  it('keeps profiles server-write-only and grants nothing', () => {
    expect(sql).toMatch(/revoke update on public\.profiles from anon, authenticated/);
    expect(sql).not.toMatch(/grant /i);
  });
});
```

Create `server/tests/api/profile-merge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { flattenProfile, splitProfilePatch } from '../../src/api/profile-merge.js';
import { createProfileRepo } from '../../src/api/repos.js';
import type { Db } from '../../src/lib/supabase.js';

describe('splitProfilePatch', () => {
  it('separates the full name (stored on users) from the profile columns', () => {
    expect(splitProfilePatch({ full_name: 'Ada Lovelace', phone: '+234 801 234 5678' })).toEqual({
      profile: { phone: '+234 801 234 5678' },
      fullName: 'Ada Lovelace',
    });
    expect(splitProfilePatch({ city: 'Lagos' })).toEqual({ profile: { city: 'Lagos' }, fullName: undefined });
  });
});

describe('flattenProfile', () => {
  it('lifts users.full_name to the top level for an object or one-element array', () => {
    expect(flattenProfile({ user_id: 'u1', phone: null, users: { full_name: 'Ada Lovelace' } })).toEqual({ user_id: 'u1', phone: null, full_name: 'Ada Lovelace' });
    expect(flattenProfile({ user_id: 'u1', users: [{ full_name: 'Ada' }] }).full_name).toBe('Ada');
  });

  it('uses null when there is no name or no joined user', () => {
    expect(flattenProfile({ user_id: 'u1', users: { full_name: null } }).full_name).toBeNull();
    expect(flattenProfile({ user_id: 'u1', users: null }).full_name).toBeNull();
    expect(flattenProfile({ user_id: 'u1' }).full_name).toBeNull();
  });
});

type Call = { table: string; op: string; arg: unknown };

/** A tiny stand-in for the Supabase query builder that records calls and answers with `row`. */
function fakeDb(row: Record<string, unknown> | null) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const b = {
      select: (cols: string) => { calls.push({ table, op: 'select', arg: cols }); return b; },
      update: (values: unknown) => { calls.push({ table, op: 'update', arg: values }); return b; },
      eq: (col: string, val: unknown) => { calls.push({ table, op: 'eq', arg: [col, val] }); return b; },
      maybeSingle: async () => ({ data: row, error: null }),
      single: async () => ({ data: row, error: null }),
      then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
    };
    return b;
  };
  return { db: { from } as unknown as Db, calls };
}

describe('createProfileRepo', () => {
  const row = { user_id: 'u1', phone: '+234 801 234 5678', users: { full_name: 'Ada Lovelace' } };

  it('reads the profile together with users.full_name', async () => {
    const { db, calls } = fakeDb(row);
    const profile = await createProfileRepo(db).get('u1');
    expect(profile).toEqual({ user_id: 'u1', phone: '+234 801 234 5678', full_name: 'Ada Lovelace' });
    expect(calls).toContainEqual({ table: 'profiles', op: 'select', arg: '*, users(full_name)' });
    expect(calls).toContainEqual({ table: 'profiles', op: 'eq', arg: ['user_id', 'u1'] });
  });

  it('returns null when there is no profile', async () => {
    expect(await createProfileRepo(fakeDb(null).db).get('u1')).toBeNull();
  });

  it('writes the name to users and the other fields to profiles, scoped to the signed-in user', async () => {
    const { db, calls } = fakeDb(row);
    const updated = await createProfileRepo(db).update('u1', { full_name: 'Ada Lovelace', phone: '+234 801 234 5678' });
    expect(updated.full_name).toBe('Ada Lovelace');
    expect(calls).toContainEqual({ table: 'users', op: 'update', arg: { full_name: 'Ada Lovelace' } });
    expect(calls).toContainEqual({ table: 'users', op: 'eq', arg: ['id', 'u1'] });
    const profileUpdate = calls.find((c) => c.table === 'profiles' && c.op === 'update')!.arg as Record<string, unknown>;
    expect(profileUpdate.phone).toBe('+234 801 234 5678');
    expect(profileUpdate).not.toHaveProperty('full_name');
    expect(calls).toContainEqual({ table: 'profiles', op: 'eq', arg: ['user_id', 'u1'] });
  });

  it('does not touch users when the patch has no name', async () => {
    const { db, calls } = fakeDb(row);
    await createProfileRepo(db).update('u1', { city: 'Lagos' });
    expect(calls.some((c) => c.table === 'users')).toBe(false);
  });
});
```

Create `server/tests/api/profile-contact.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { makeDeps } from '../helpers/deps.js';

const profile = {
  user_id: 'u1', base_cv_text: null, base_cv_url: null, base_cv_filename: null, skills: [], years_experience: null, desired_roles: [],
  location: null, salary_min: null, salary_max: null, apply_mode: 'manual' as const, auto_threshold: 80, daily_cap: 20,
  auto_followup: false, notify_new_matches: false, updated_at: '',
  full_name: 'Ada Lovelace', phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null,
};

function deps() {
  return makeDeps({
    profiles: { get: vi.fn(async () => profile), update: vi.fn(async (_id, patch) => ({ ...profile, ...patch })) },
    jobs: { refresh: vi.fn(), rematch: vi.fn(async () => undefined) },
  });
}
const authed = (app: ReturnType<typeof createApp>) => ({
  get: (u: string) => request(app).get(u).set('authorization', 'Bearer good'),
  put: (u: string, body: object) => request(app).put(u).set('authorization', 'Bearer good').send(body),
});

describe('profile contact details', () => {
  it('GET /profile returns the contact fields and the full name', async () => {
    const res = await authed(createApp(deps())).get('/profile');
    expect(res.status).toBe(200);
    expect(res.body.full_name).toBe('Ada Lovelace');
    expect(res.body).toHaveProperty('phone', null);
  });

  it('PUT /profile saves contact details for the signed-in user only', async () => {
    const d = deps();
    const body = {
      full_name: 'Ada Lovelace', phone: '+234 801 234 5678', city: 'Lagos',
      linkedin_url: 'https://www.linkedin.com/in/ada', github_url: null, portfolio_url: 'https://ada.dev',
    };
    const res = await authed(createApp(d)).put('/profile', body);
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('+234 801 234 5678');
    expect(d.profiles.update).toHaveBeenCalledWith('u1', body);
  });

  it.each([
    ['an http link', { linkedin_url: 'http://linkedin.com/in/ada' }],
    ['a bad phone', { phone: 'call me' }],
    ['a name of one character', { full_name: 'A' }],
    ['someone else user_id', { user_id: 'u2', phone: '+234 801 234 5678' }],
    ['an unknown field', { twitter_url: 'https://x.com/ada' }],
  ])('PUT /profile rejects %s without writing', async (_name, body) => {
    const d = deps();
    const res = await authed(createApp(d)).put('/profile', body);
    expect(res.status).toBe(400);
    expect(d.profiles.update).not.toHaveBeenCalled();
  });

  it('PUT /profile needs a token', async () => {
    const res = await request(createApp(deps())).put('/profile').send({ city: 'Lagos' });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @joblume/shared -- tests/profile-contact.test.ts` and then `npm test -w server -- tests/db/migration-0007.test.ts tests/api/profile-merge.test.ts tests/api/profile-contact.test.ts`
Expected: FAIL. The shared test fails because `PHONE_PATTERN` is not exported and the contact keys are rejected as unknown (strict schema); the migration test fails with `ENOENT ... 0007_contact_profile.sql`; the merge test fails with `Failed to resolve import "../../src/api/profile-merge.js"`; the route test returns 400 for the contact body.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0007_contact_profile.sql`:

```sql
-- JobLume schema v7: contact details for the browser extension (Phase 8)
-- All columns are nullable. Writes still go only through the server API (profiles are server-write-only).

alter table public.profiles
  add column phone text
    check (phone is null or phone ~ '^[0-9 +()-]{7,20}$'),
  add column city text
    check (city is null or char_length(city) between 1 and 80),
  add column linkedin_url text
    check (linkedin_url is null or (linkedin_url ~* '^https://' and char_length(linkedin_url) <= 300)),
  add column github_url text
    check (github_url is null or (github_url ~* '^https://' and char_length(github_url) <= 300)),
  add column portfolio_url text
    check (portfolio_url is null or (portfolio_url ~* '^https://' and char_length(portfolio_url) <= 300));

-- The full name lives on users.full_name (created in 0001). Cap it for rows written from now on.
alter table public.users
  add constraint users_full_name_length
  check (full_name is null or char_length(full_name) between 1 and 120) not valid;

-- Keep profiles server-write-only (unchanged from 0001; repeated so this file is safe to read on its own).
revoke update on public.profiles from anon, authenticated;
```

- [ ] **Step 4: Extend the shared profile schema**

In `packages/shared/src/profile.ts`, directly after the line `export const LOCATIONS = ['Lagos', 'Abuja', 'Remote'] as const;` insert:

```ts

/** 7 to 20 characters of digits, space, + - ( ). Same rule as the database check in migration 0007. */
export const PHONE_PATTERN = /^[0-9 +()-]{7,20}$/;

const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .url()
  .refine((v) => v.toLowerCase().startsWith('https://'), 'Must start with https://');
```

Then, directly after the line `    notify_new_matches: z.boolean(),` (inside `profilePatchSchema`) insert:

```ts
    // Contact details for the browser extension. full_name is stored on users.full_name by the server.
    full_name: z.string().trim().min(2).max(120),
    phone: z.string().trim().regex(PHONE_PATTERN, 'Phone: 7 to 20 digits, spaces, + - ( )').nullable(),
    city: z.string().trim().min(1).max(80).nullable(),
    linkedin_url: httpsUrl.nullable(),
    github_url: httpsUrl.nullable(),
    portfolio_url: httpsUrl.nullable(),
```

- [ ] **Step 5: Extend the shared API types**

In `packages/shared/src/api-types.ts`, inside `interface Profile`, directly after the line `  notify_new_matches: boolean;` insert:

```ts
  /** users.full_name, joined in by the API. */
  full_name: string | null;
  /** Contact details the browser extension fills into employer forms. */
  phone: string | null;
  city: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
```

Append at the end of the file:

```ts

/** GET /applications/:id/autofill: exactly what the browser extension may fill into an employer form, nothing else. */
export interface AutofillPayload {
  job_url: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  cover_letter: string | null;
  cv: { url: string; filename: string } | null;
}
```

- [ ] **Step 6: Server row type, merge helpers and repo**

In `server/src/db/types.ts`, inside `interface ProfileRow`, directly after the line `  notify_new_matches: boolean;` insert:

```ts
  /** users.full_name, joined in by the profile repo (not a profiles column). */
  full_name: string | null;
  phone: string | null;
  city: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
```

Create `server/src/api/profile-merge.ts`:

```ts
import type { ProfilePatch } from '@joblume/shared';
import type { ProfileRow } from '../db/types.js';

/** The profile PUT body carries full_name, which is stored on users, not on profiles. */
export function splitProfilePatch(patch: ProfilePatch): { profile: Omit<ProfilePatch, 'full_name'>; fullName: string | undefined } {
  const { full_name, ...profile } = patch;
  return { profile, fullName: full_name };
}

type Embedded = { full_name: string | null };

/** A profiles row selected as `*, users(full_name)`: lift the name to the top level. */
export function flattenProfile(row: Record<string, unknown>): ProfileRow {
  const { users, ...rest } = row as Record<string, unknown> & { users?: Embedded | Embedded[] | null };
  const user = Array.isArray(users) ? users[0] : users;
  return { ...rest, full_name: user?.full_name ?? null } as unknown as ProfileRow;
}

export const PROFILE_SELECT = '*, users(full_name)';
```

In `server/src/api/repos.ts` make three edits.

Edit 1, after the line `import type { ApplicationWithJob, ApplicationsRepo, ProfilePatch, ProfileRepo } from './deps.js';` add:

```ts
import { PROFILE_SELECT, flattenProfile, splitProfilePatch } from './profile-merge.js';
```

Edit 2, replace in `createProfileRepo().get`:

```ts
      const { data, error } = await db.from('profiles').select('*').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return (data as ProfileRow | null) ?? null;
```

with:

```ts
      const { data, error } = await db.from('profiles').select(PROFILE_SELECT).eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data ? flattenProfile(data as unknown as Record<string, unknown>) : null;
```

Edit 3, replace in `createProfileRepo().update`:

```ts
      const { data, error } = await db
        .from('profiles')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .select('*')
        .single();
      if (error) throw error;
      return data as ProfileRow;
```

with:

```ts
      const { profile, fullName } = splitProfilePatch(patch);
      if (fullName !== undefined) {
        const { error: nameError } = await db.from('users').update({ full_name: fullName }).eq('id', userId);
        if (nameError) throw nameError;
      }
      const { data, error } = await db
        .from('profiles')
        .update({ ...profile, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .select(PROFILE_SELECT)
        .single();
      if (error) throw error;
      return flattenProfile(data as unknown as Record<string, unknown>);
```

The route `server/src/api/routes/profile.ts` needs no change: `profilePatchSchema.parse(req.body)` now accepts the new keys, and `res.json(updated)` returns them.

- [ ] **Step 7: Update the test fixtures that build a full profile (typecheck would fail otherwise)**

In `server/tests/worker/match.test.ts` and `server/tests/worker/match-user-job.test.ts`, replace the line

```ts
  auto_followup: false, notify_new_matches: false, updated_at: '', ...over,
```

with:

```ts
  auto_followup: false, notify_new_matches: false, updated_at: '',
  full_name: null, phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null, ...over,
```

In `server/tests/worker/tailor.test.ts`, replace the line

```ts
  auto_threshold: 80, daily_cap: 20, auto_followup: false, notify_new_matches: false, updated_at: '',
```

with:

```ts
  auto_threshold: 80, daily_cap: 20, auto_followup: false, notify_new_matches: false, updated_at: '',
  full_name: null, phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null,
```

In `mobile/tests/fixtures.ts`, replace

```ts
  notify_new_matches: false,
  updated_at: '2026-10-18T10:00:00.000Z',
```

with:

```ts
  notify_new_matches: false,
  full_name: 'Ada Lovelace',
  phone: null,
  city: null,
  linkedin_url: null,
  github_url: null,
  portfolio_url: null,
  updated_at: '2026-10-18T10:00:00.000Z',
```

- [ ] **Step 8: Run the tests and the type checks**

Run: `npm test -w @joblume/shared && npm run typecheck -w server && npm test -w server -- tests/api tests/db tests/worker`
Expected: PASS (shared: 7 files, 124 tests; server typecheck prints no errors; the server run ends with `Test Files 29 passed`, `Tests 253 passed`; a logged `gmail callback failed ... db down` line is an expected log from an existing test).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0007_contact_profile.sql packages/shared/src/profile.ts packages/shared/src/api-types.ts packages/shared/tests/profile-contact.test.ts server/src/db/types.ts server/src/api/profile-merge.ts server/src/api/repos.ts server/tests/db/migration-0007.test.ts server/tests/api/profile-merge.test.ts server/tests/api/profile-contact.test.ts server/tests/worker/match.test.ts server/tests/worker/match-user-job.test.ts server/tests/worker/tailor.test.ts mobile/tests/fixtures.ts
git commit -m "feat(profile): contact details columns, full name write path and shared types

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `GET /applications/:id/autofill`

**Files:**
- Create: `server/src/services/autofill.ts`
- Modify: `server/src/api/deps.ts`, `server/src/api/routes/applications.ts`, `server/src/api/index.ts`, `server/tests/helpers/deps.ts`
- Test (create): `server/tests/services/autofill.test.ts`, `server/tests/api/autofill.test.ts`

**Interfaces:**
- Consumes: `ApplicationsRepo.get(userId, id): Promise<ApplicationWithJob | null>` (user-scoped), `ProfileRepo.get(userId): Promise<ProfileRow | null>` (now with `full_name`), `createSignedUrl(db, path)` from Task 1 and `server/src/services/storage.ts`, `AutofillPayload` from Task 1.
- Produces: `AutofillService { get(user: { id: string; email: string | null }, applicationId: string): Promise<AutofillPayload | null> }` and `AppDeps.autofill: AutofillService`; `createAutofillService({ applications, profiles, signUrl })`, `splitFullName(full): { first; last }`, `cvFilename(fullName): string` in `server/src/services/autofill.ts`; HTTP `GET /applications/:id/autofill` (200 payload with `Cache-Control: no-store`, 404 `application_not_found`).

- [ ] **Step 1: Write the failing tests**

Create `server/tests/services/autofill.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationWithJob } from '../../src/api/deps.js';
import type { ProfileRow } from '../../src/db/types.js';
import { createAutofillService, cvFilename, splitFullName } from '../../src/services/autofill.js';

const application = (over: Partial<ApplicationWithJob> = {}): ApplicationWithJob => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'cv', tailored_cv_url: 'u1/tailored/j1.pdf', cover_letter_text: 'Dear team,\nHello.',
  match_score: 80, missing_keywords: [], hiring_manager_email: null, email_confidence: null, email_source: null, email_candidates: [],
  whatsapp_number: null, apply_method: null, status: 'approved', applied_at: null, follow_up_at: null, created_at: '2026-10-01T00:00:00.000Z',
  job: { title: 'Data Analyst', company: 'Acme', location: 'Lagos', source: 'myjobmag', url: 'https://job-boards.greenhouse.io/acme/jobs/1', company_domain: null },
  ...over,
});

const profile = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  user_id: 'u1', base_cv_text: 'cv', base_cv_url: 'p', base_cv_filename: null, skills: [], years_experience: 3, desired_roles: [],
  location: 'Lagos', salary_min: null, salary_max: null, apply_mode: 'manual', auto_threshold: 80, daily_cap: 20, auto_followup: false,
  notify_new_matches: false, updated_at: '', full_name: 'Ada Lovelace', phone: '+234 801 234 5678', city: 'Lagos',
  linkedin_url: 'https://www.linkedin.com/in/ada', github_url: 'https://github.com/ada', portfolio_url: 'https://ada.dev', ...over,
});

type GetApp = (userId: string, id: string) => Promise<ApplicationWithJob | null>;
type GetProfile = (userId: string) => Promise<ProfileRow | null>;
type Sign = (path: string) => Promise<string>;

function make(over: { app?: ApplicationWithJob | null; profile?: ProfileRow | null; sign?: Sign } = {}) {
  const get = vi.fn<GetApp>().mockImplementation(async (userId) => (userId === 'u1' ? (over.app === undefined ? application() : over.app) : null));
  const getProfile = vi.fn<GetProfile>().mockImplementation(async () => (over.profile === undefined ? profile() : over.profile));
  const signUrl = vi.fn<Sign>(over.sign ?? (async (p) => `https://abcd1234.supabase.co/storage/v1/object/sign/cvs/${p}?token=t`));
  return { svc: createAutofillService({ applications: { get }, profiles: { get: getProfile }, signUrl }), get, getProfile, signUrl };
}

describe('splitFullName', () => {
  it('uses the last word as the last name', () => {
    expect(splitFullName('Ada Lovelace')).toEqual({ first: 'Ada', last: 'Lovelace' });
    expect(splitFullName('  Ada  Augusta   King Lovelace ')).toEqual({ first: 'Ada Augusta King', last: 'Lovelace' });
    expect(splitFullName('Adeyemi')).toEqual({ first: 'Adeyemi', last: null });
    expect(splitFullName('')).toEqual({ first: null, last: null });
    expect(splitFullName(null)).toEqual({ first: null, last: null });
  });
});

describe('cvFilename', () => {
  it('builds an ASCII file name and falls back to CV.pdf', () => {
    expect(cvFilename('Ada Lovelace')).toBe('Ada Lovelace CV.pdf');
    expect(cvFilename('Ada/../Lovelace')).toBe('Ada..Lovelace CV.pdf');
    expect(cvFilename('Ádéola O’Neil')).toBe('dola ONeil CV.pdf');
    expect(cvFilename('王小明')).toBe('CV.pdf');
    expect(cvFilename(null)).toBe('CV.pdf');
    expect(cvFilename('x'.repeat(200)).length).toBeLessThanOrEqual(120);
  });
});

describe('autofill service', () => {
  it('returns exactly the allowed fields, scoped to the signed-in user', async () => {
    const { svc, get, signUrl } = make();
    const out = await svc.get({ id: 'u1', email: 'ada@example.com' }, 'a1');
    expect(out).toEqual({
      job_url: 'https://job-boards.greenhouse.io/acme/jobs/1',
      full_name: 'Ada Lovelace', first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com',
      phone: '+234 801 234 5678', city: 'Lagos',
      linkedin_url: 'https://www.linkedin.com/in/ada', github_url: 'https://github.com/ada', portfolio_url: 'https://ada.dev',
      cover_letter: 'Dear team,\nHello.',
      cv: { url: 'https://abcd1234.supabase.co/storage/v1/object/sign/cvs/u1/tailored/j1.pdf?token=t', filename: 'Ada Lovelace CV.pdf' },
    });
    expect(Object.keys(out!).sort()).toEqual([
      'city', 'cover_letter', 'cv', 'email', 'first_name', 'full_name', 'github_url', 'job_url', 'last_name', 'linkedin_url', 'phone', 'portfolio_url',
    ]);
    expect(get).toHaveBeenCalledWith('u1', 'a1');
    expect(signUrl).toHaveBeenCalledWith('u1/tailored/j1.pdf');
  });

  it('returns null for an application that is not the user own (no signing, no profile read)', async () => {
    const { svc, signUrl, getProfile } = make();
    expect(await svc.get({ id: 'u2', email: 'x@y.z' }, 'a1')).toBeNull();
    expect(signUrl).not.toHaveBeenCalled();
    expect(getProfile).not.toHaveBeenCalled();
  });

  it('returns null when the job has no link', async () => {
    const { svc } = make({ app: application({ job: null }) });
    expect(await svc.get({ id: 'u1', email: null }, 'a1')).toBeNull();
  });

  it('uses null for everything the user has not filled in', async () => {
    const { svc } = make({
      app: application({ tailored_cv_url: null, cover_letter_text: '   ' }),
      profile: profile({ full_name: null, phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null }),
    });
    const out = await svc.get({ id: 'u1', email: null }, 'a1');
    expect(out).toMatchObject({
      full_name: null, first_name: null, last_name: null, email: null, phone: null, city: null,
      linkedin_url: null, github_url: null, portfolio_url: null, cover_letter: null, cv: null,
    });
  });

  it('still answers, without a CV, when signing fails or the profile row is missing', async () => {
    const { svc } = make({ sign: async () => { throw new Error('storage down'); }, profile: null });
    const out = await svc.get({ id: 'u1', email: 'ada@example.com' }, 'a1');
    expect(out?.cv).toBeNull();
    expect(out?.email).toBe('ada@example.com');
    expect(out?.full_name).toBeNull();
  });

  it('caps the cover letter at 10000 characters', async () => {
    const { svc } = make({ app: application({ cover_letter_text: 'x'.repeat(12_000) }) });
    expect((await svc.get({ id: 'u1', email: null }, 'a1'))?.cover_letter).toHaveLength(10_000);
  });
});
```

Create `server/tests/api/autofill.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { makeDeps } from '../helpers/deps.js';

const ID = '3f2b8c1e-9a4d-4e7b-8c55-1a2b3c4d5e6f';
const payload = {
  job_url: 'https://job-boards.greenhouse.io/acme/jobs/1', full_name: 'Ada Lovelace', first_name: 'Ada', last_name: 'Lovelace',
  email: 'a@b.c', phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null, cover_letter: 'Hello', cv: null,
};

describe('GET /applications/:id/autofill', () => {
  it('needs a token', async () => {
    const res = await request(createApp(makeDeps())).get(`/applications/${ID}/autofill`);
    expect(res.status).toBe(401);
  });

  it('returns the payload for the signed-in user (id and email from the token) and is not cacheable', async () => {
    const d = makeDeps({ autofill: { get: vi.fn(async () => payload) } });
    const res = await request(createApp(d)).get(`/applications/${ID}/autofill`).set('authorization', 'Bearer good');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(payload);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(d.autofill.get).toHaveBeenCalledWith({ id: 'u1', email: 'a@b.c' }, ID);
  });

  it('answers 404 for another user application or an unknown id', async () => {
    const d = makeDeps({ autofill: { get: vi.fn(async () => null) } });
    const res = await request(createApp(d)).get(`/applications/${ID}/autofill`).set('authorization', 'Bearer good');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('application_not_found');
  });

  it('answers 404 without calling the service when the id is not a uuid', async () => {
    const d = makeDeps();
    const res = await request(createApp(d)).get('/applications/not-a-uuid/autofill').set('authorization', 'Bearer good');
    expect(res.status).toBe(404);
    expect(d.autofill.get).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w server -- tests/services/autofill.test.ts tests/api/autofill.test.ts`
Expected: FAIL: `Failed to resolve import "../../src/services/autofill.js"`, and the route test cannot compile `autofill` into `makeDeps`.

- [ ] **Step 3: Implement the service**

Create `server/src/services/autofill.ts`:

```ts
import type { AutofillPayload } from '@joblume/shared';
import type { ApplicationsRepo, AutofillService, ProfileRepo } from '../api/deps.js';

const COVER_LETTER_MAX = 10_000;

/** The last word is the last name, everything before it the first name. A single word is a first name only. */
export function splitFullName(full: string | null | undefined): { first: string | null; last: string | null } {
  const tokens = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { first: null, last: null };
  if (tokens.length === 1) return { first: tokens[0]!, last: null };
  return { first: tokens.slice(0, -1).join(' '), last: tokens[tokens.length - 1]! };
}

/** ASCII file name for the CV upload: "Ada Lovelace CV.pdf", or "CV.pdf" when the name has no ASCII letters. */
export function cvFilename(fullName: string | null | undefined): string {
  const safe = (fullName ?? '').replace(/[^A-Za-z0-9 _.()-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return safe ? `${safe} CV.pdf` : 'CV.pdf';
}

const orNull = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

export function createAutofillService(deps: {
  applications: Pick<ApplicationsRepo, 'get'>;
  profiles: Pick<ProfileRepo, 'get'>;
  signUrl(path: string): Promise<string>;
}): AutofillService {
  return {
    async get(user, applicationId) {
      const app = await deps.applications.get(user.id, applicationId);
      if (!app?.job?.url) return null;
      const profile = await deps.profiles.get(user.id);

      const fullName = orNull(profile?.full_name);
      const { first, last } = splitFullName(fullName);

      let cv: AutofillPayload['cv'] = null;
      if (app.tailored_cv_url) {
        try {
          cv = { url: await deps.signUrl(app.tailored_cv_url), filename: cvFilename(fullName) };
        } catch {
          cv = null;
        }
      }

      const letter = orNull(app.cover_letter_text);
      return {
        job_url: app.job.url,
        full_name: fullName,
        first_name: first,
        last_name: last,
        email: orNull(user.email),
        phone: orNull(profile?.phone),
        city: orNull(profile?.city),
        linkedin_url: orNull(profile?.linkedin_url),
        github_url: orNull(profile?.github_url),
        portfolio_url: orNull(profile?.portfolio_url),
        cover_letter: letter ? letter.slice(0, COVER_LETTER_MAX) : null,
        cv,
      };
    },
  };
}
```

- [ ] **Step 4: Wire the dependency type, route, helper and server entry**

In `server/src/api/deps.ts`:

Edit 1, replace `import type { AddJobLinkResult, Analytics, FollowUp,` with `import type { AddJobLinkResult, Analytics, AutofillPayload, FollowUp,` (the rest of that import line is unchanged).

Edit 2, before the line `export interface JobsService {` insert:

```ts
/** Builds the exact data the browser extension may fill into an employer form. */
export interface AutofillService {
  /** null when the application does not exist for this user or its job has no link. */
  get(user: { id: string; email: string | null }, applicationId: string): Promise<AutofillPayload | null>;
}

```

Edit 3, inside `interface AppDeps`, after the line `  applications: ApplicationsService;` add the line `  autofill: AutofillService;`.

In `server/src/api/routes/applications.ts`:

Edit 1, replace `export function applicationRoutes(d: Pick<AppDeps, 'applications' | 'sending'>) {` with `export function applicationRoutes(d: Pick<AppDeps, 'applications' | 'sending' | 'autofill'>) {`.

Edit 2, directly before the line `  router.patch('/:id', asyncHandler(async (req, res) => {` insert:

```ts
  // The payload carries a signed CV link, so it is never cached.
  router.get('/:id/autofill', asyncHandler(async (req, res) => {
    const payload = await d.autofill.get(req.user!, parseId(req.params.id));
    if (!payload) throw new ApiError(404, 'application_not_found');
    res.set('Cache-Control', 'no-store');
    res.json(payload);
  }));

```

In `server/tests/helpers/deps.ts`, directly before the line `    jobs: { refresh: vi.fn(), rematch: vi.fn() },` insert `    autofill: { get: vi.fn() },`.

In `server/src/api/index.ts` make four edits:
1. After `import { createApplicationsService } from '../services/applications.js';` add `import { createAutofillService } from '../services/autofill.js';`.
2. After `const applicationsRepo = createApplicationsRepo(db);` add `const profileRepo = createProfileRepo(db);`.
3. Replace `  profiles: createProfileRepo(db),` with `  profiles: profileRepo,`.
4. Directly before `  jobs: createJobsService(queues),` insert:

```ts
  autofill: createAutofillService({
    applications: applicationsRepo,
    profiles: profileRepo,
    signUrl: (path) => createSignedUrl(db, path),
  }),
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npm run typecheck -w server && npm test -w server -- tests/services tests/api`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/autofill.ts server/src/api/deps.ts server/src/api/routes/applications.ts server/src/api/index.ts server/tests/helpers/deps.ts server/tests/services/autofill.test.ts server/tests/api/autofill.test.ts
git commit -m "feat(api): GET /applications/:id/autofill with the exact extension payload

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Settings contact fields on web and mobile

**Files:**
- Modify: `web/src/lib/profile-form.ts`, `mobile/src/lib/profile-form.ts` (the two files are byte-identical copies today and get the identical block), `web/src/app/(app)/settings/page.tsx`, `mobile/src/components/settings/SettingsScreen.tsx`, `mobile/tests/components/settings.test.tsx`
- Create: `web/src/components/profile/ContactForm.tsx`, `mobile/src/components/profile/ContactForm.tsx`
- Test (create): `web/tests/lib/contact-form.test.ts`, `web/tests/components/contact-form.test.tsx`, `mobile/tests/lib/contact-form.test.ts`, `mobile/tests/components/contact-form.test.tsx`

**Interfaces:**
- Consumes: `Profile`, `profilePatchSchema`, `ProfilePatch` from `@joblume/shared` (Task 1); `BuildResult<K>` already defined in each `profile-form.ts`.
- Produces: `ContactValues`, `ContactField`, `buildContactPatch(values): BuildResult<ContactField>`, `profileToContactValues(profile): ContactValues` in both `profile-form.ts` files; `ContactForm` (`{ initial: ContactValues; onSubmit(patch: ProfilePatch): Promise<void> }`) on both platforms.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/lib/contact-form.test.ts`:

```ts
import type { Profile } from '@joblume/shared';
import { describe, expect, it } from 'vitest';
import { buildContactPatch, profileToContactValues, type ContactValues } from '@/lib/profile-form';

const values = (over: Partial<ContactValues> = {}): ContactValues => ({
  fullName: 'Ada Lovelace', phone: '+234 801 234 5678', city: 'Lagos', linkedinUrl: 'https://www.linkedin.com/in/ada', githubUrl: '', portfolioUrl: '', ...over,
});

describe('buildContactPatch', () => {
  it('builds a patch, turning blank links into null', () => {
    expect(buildContactPatch(values())).toEqual({
      ok: true,
      patch: { full_name: 'Ada Lovelace', phone: '+234 801 234 5678', city: 'Lagos', linkedin_url: 'https://www.linkedin.com/in/ada', github_url: null, portfolio_url: null },
    });
  });

  it('clears every contact field when all are blank and leaves the name out', () => {
    expect(buildContactPatch(values({ fullName: '', phone: '', city: '', linkedinUrl: '' }))).toEqual({
      ok: true,
      patch: { phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null },
    });
  });

  it.each([
    ['an http link', { githubUrl: 'http://github.com/ada' }, 'githubUrl'],
    ['a link without a scheme', { portfolioUrl: 'ada.dev' }, 'portfolioUrl'],
    ['a phone with letters', { phone: 'call me' }, 'phone'],
    ['a one-letter name', { fullName: 'A' }, 'fullName'],
    ['a city over 80 characters', { city: 'x'.repeat(81) }, 'city'],
  ])('reports %s on the right field', (_name, over, field) => {
    const res = buildContactPatch(values(over));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors)).toEqual([field]);
  });
});

describe('profileToContactValues', () => {
  const profile = { full_name: 'Ada Lovelace', phone: null, city: 'Lagos', linkedin_url: 'https://www.linkedin.com/in/ada', github_url: null, portfolio_url: null } as Profile;

  it('maps a profile to editable strings, using empty text for missing values', () => {
    expect(profileToContactValues(profile)).toEqual({
      fullName: 'Ada Lovelace', phone: '', city: 'Lagos', linkedinUrl: 'https://www.linkedin.com/in/ada', githubUrl: '', portfolioUrl: '',
    });
  });
});
```

Create `web/tests/components/contact-form.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContactForm } from '@/components/profile/ContactForm';
import type { ContactValues } from '@/lib/profile-form';

const initial: ContactValues = { fullName: 'Ada Lovelace', phone: '', city: '', linkedinUrl: '', githubUrl: '', portfolioUrl: '' };

function setup() {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<ContactForm initial={initial} onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
}

describe('ContactForm', () => {
  it('shows the stored values and explains the https rule', () => {
    setup();
    expect(screen.getByLabelText('Full name')).toHaveValue('Ada Lovelace');
    expect(screen.getByLabelText('Phone')).toHaveValue('');
    expect(screen.getByText(/must start with https/i)).toBeInTheDocument();
  });

  it('submits the changed details', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('Phone'), '+234 801 234 5678');
    await user.type(screen.getByLabelText('City'), 'Lagos');
    await user.type(screen.getByLabelText('LinkedIn link'), 'https://www.linkedin.com/in/ada');
    await user.click(screen.getByRole('button', { name: 'Save contact details' }));
    expect(onSubmit).toHaveBeenCalledWith({
      full_name: 'Ada Lovelace', phone: '+234 801 234 5678', city: 'Lagos', linkedin_url: 'https://www.linkedin.com/in/ada', github_url: null, portfolio_url: null,
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('shows a message under a bad link and does not submit', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('GitHub link'), 'http://github.com/ada');
    await user.click(screen.getByRole('button', { name: 'Save contact details' }));
    expect(await screen.findByText('Enter a full link that starts with https://')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a server error', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    render(<ContactForm initial={initial} onSubmit={onSubmit} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save contact details' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
```

Create `mobile/tests/lib/contact-form.test.ts`:

```ts
import type { Profile } from '@joblume/shared';
import { buildContactPatch, profileToContactValues, type ContactValues } from '@/lib/profile-form';

const values = (over: Partial<ContactValues> = {}): ContactValues => ({
  fullName: 'Ada Lovelace', phone: '+234 801 234 5678', city: 'Lagos', linkedinUrl: 'https://www.linkedin.com/in/ada', githubUrl: '', portfolioUrl: '', ...over,
});

describe('buildContactPatch', () => {
  it('builds a patch, turning blank links into null', () => {
    expect(buildContactPatch(values())).toEqual({
      ok: true,
      patch: { full_name: 'Ada Lovelace', phone: '+234 801 234 5678', city: 'Lagos', linkedin_url: 'https://www.linkedin.com/in/ada', github_url: null, portfolio_url: null },
    });
  });

  it('clears every contact field when all are blank and leaves the name out', () => {
    expect(buildContactPatch(values({ fullName: '', phone: '', city: '', linkedinUrl: '' }))).toEqual({
      ok: true,
      patch: { phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null },
    });
  });

  it.each([
    ['an http link', { githubUrl: 'http://github.com/ada' }, 'githubUrl'],
    ['a link without a scheme', { portfolioUrl: 'ada.dev' }, 'portfolioUrl'],
    ['a phone with letters', { phone: 'call me' }, 'phone'],
    ['a one-letter name', { fullName: 'A' }, 'fullName'],
  ])('reports %s on the right field', (_name, over, field) => {
    const res = buildContactPatch(values(over));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors)).toEqual([field]);
  });
});

describe('profileToContactValues', () => {
  it('maps a profile to editable strings, using empty text for missing values', () => {
    const profile = { full_name: 'Ada Lovelace', phone: null, city: 'Lagos', linkedin_url: null, github_url: null, portfolio_url: null } as Profile;
    expect(profileToContactValues(profile)).toEqual({ fullName: 'Ada Lovelace', phone: '', city: 'Lagos', linkedinUrl: '', githubUrl: '', portfolioUrl: '' });
  });
});
```

Create `mobile/tests/components/contact-form.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ContactForm } from '@/components/profile/ContactForm';

const initial = { fullName: 'Ada Lovelace', phone: '', city: '', linkedinUrl: '', githubUrl: '', portfolioUrl: '' };

describe('ContactForm', () => {
  it('shows the stored values and the https note', async () => {
    await render(<ContactForm initial={initial} onSubmit={jest.fn()} />);
    expect(screen.getByLabelText('Full name')).toHaveDisplayValue('Ada Lovelace');
    expect(screen.getByLabelText('Phone')).toHaveDisplayValue('');
    expect(screen.getByText(/must start with https/i)).toBeOnTheScreen();
  });

  it('submits the changed details', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<ContactForm initial={initial} onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByLabelText('Phone'), '+234 801 234 5678');
    await fireEvent.changeText(screen.getByLabelText('City'), 'Lagos');
    await fireEvent.changeText(screen.getByLabelText('LinkedIn link'), 'https://www.linkedin.com/in/ada');
    await fireEvent.press(screen.getByRole('button', { name: 'Save contact details' }));
    expect(onSubmit).toHaveBeenCalledWith({
      full_name: 'Ada Lovelace', phone: '+234 801 234 5678', city: 'Lagos', linkedin_url: 'https://www.linkedin.com/in/ada', github_url: null, portfolio_url: null,
    });
    expect(await screen.findByText('Saved.')).toBeOnTheScreen();
  });

  it('shows a message under a bad link and does not submit', async () => {
    const onSubmit = jest.fn();
    await render(<ContactForm initial={initial} onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByLabelText('GitHub link'), 'http://github.com/ada');
    await fireEvent.press(screen.getByRole('button', { name: 'Save contact details' }));
    expect(screen.getByText('Enter a full link that starts with https://')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

In `mobile/tests/components/settings.test.tsx`, inside the test `shows the CV, preferences and account`, directly after the line `    expect(screen.getByLabelText('Roles you want')).toHaveDisplayValue('Data Analyst');` insert:

```tsx
    expect(screen.getByText('Contact details for application forms')).toBeOnTheScreen();
    expect(screen.getByLabelText('Full name')).toHaveDisplayValue('Ada Lovelace');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w web -- tests/lib/contact-form.test.ts tests/components/contact-form.test.tsx` and then `npm test -w mobile -- tests/lib/contact-form.test.ts tests/components/contact-form.test.tsx tests/components/settings.test.tsx`
Expected: FAIL: `buildContactPatch` / `profileToContactValues` / `ContactForm` do not exist; the mobile settings test cannot find "Contact details for application forms".

- [ ] **Step 3: Add the shared form logic to both `profile-form.ts` files**

In `web/src/lib/profile-form.ts`, directly before the line `export function profileToSettingsValues(profile: Profile): SettingsValues {` insert this block. Make the identical insertion in `mobile/src/lib/profile-form.ts`.

```ts
export interface ContactValues {
  fullName: string;
  phone: string;
  city: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
}
export type ContactField = keyof ContactValues;

const CONTACT_FIELD: Record<string, ContactField> = {
  full_name: 'fullName',
  phone: 'phone',
  city: 'city',
  linkedin_url: 'linkedinUrl',
  github_url: 'githubUrl',
  portfolio_url: 'portfolioUrl',
};

const CONTACT_MESSAGE: Record<ContactField, string> = {
  fullName: 'Enter your full name (2 to 120 characters).',
  phone: 'Use 7 to 20 characters: digits, spaces, + - ( ).',
  city: 'Use 1 to 80 characters.',
  linkedinUrl: 'Enter a full link that starts with https://',
  githubUrl: 'Enter a full link that starts with https://',
  portfolioUrl: 'Enter a full link that starts with https://',
};

const blankToNull = (s: string): string | null => {
  const t = s.trim();
  return t === '' ? null : t;
};

/** Blank contact fields clear the stored value; a blank name is left out because the name cannot be cleared. */
export function buildContactPatch(values: ContactValues): BuildResult<ContactField> {
  const patch: Record<string, unknown> = {
    phone: blankToNull(values.phone),
    city: blankToNull(values.city),
    linkedin_url: blankToNull(values.linkedinUrl),
    github_url: blankToNull(values.githubUrl),
    portfolio_url: blankToNull(values.portfolioUrl),
  };
  const name = blankToNull(values.fullName);
  if (name !== null) patch.full_name = name;

  const parsed = profilePatchSchema.safeParse(patch);
  if (parsed.success) return { ok: true, patch: parsed.data };

  const errors: Partial<Record<ContactField, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = CONTACT_FIELD[String(issue.path[0])];
    if (field && !errors[field]) errors[field] = CONTACT_MESSAGE[field];
  }
  if (Object.keys(errors).length === 0) errors.fullName = 'Check the form and try again.';
  return { ok: false, errors };
}

export function profileToContactValues(profile: Profile): ContactValues {
  return {
    fullName: profile.full_name ?? '',
    phone: profile.phone ?? '',
    city: profile.city ?? '',
    linkedinUrl: profile.linkedin_url ?? '',
    githubUrl: profile.github_url ?? '',
    portfolioUrl: profile.portfolio_url ?? '',
  };
}
```

- [ ] **Step 4: Web form and page**

Create `web/src/components/profile/ContactForm.tsx`:

```tsx
'use client';

import type { ProfilePatch } from '@joblume/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeApiError } from '@/lib/api/errors';
import { buildContactPatch, type ContactField, type ContactValues } from '@/lib/profile-form';

export interface ContactFormProps {
  initial: ContactValues;
  onSubmit(patch: ProfilePatch): Promise<void>;
}

const FIELDS: Array<{ key: ContactField; label: string; type?: string; autoComplete: string; placeholder?: string }> = [
  { key: 'fullName', label: 'Full name', autoComplete: 'name' },
  { key: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel', placeholder: '+234 801 234 5678' },
  { key: 'city', label: 'City', autoComplete: 'address-level2', placeholder: 'Lagos' },
  { key: 'linkedinUrl', label: 'LinkedIn link', type: 'url', autoComplete: 'url', placeholder: 'https://www.linkedin.com/in/your-name' },
  { key: 'githubUrl', label: 'GitHub link', type: 'url', autoComplete: 'url', placeholder: 'https://github.com/your-name' },
  { key: 'portfolioUrl', label: 'Portfolio or website link', type: 'url', autoComplete: 'url', placeholder: 'https://your-site.example' },
];

export function ContactForm({ initial, onSubmit }: ContactFormProps) {
  const [values, setValues] = useState<ContactValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    setSaved(false);
    const result = buildContactPatch(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await onSubmit(result.patch);
      setSaved(true);
    } catch (err) {
      setServerError(describeApiError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-2">
            <Label htmlFor={`contact-${f.key}`}>{f.label}</Label>
            <Input
              id={`contact-${f.key}`}
              type={f.type ?? 'text'}
              autoComplete={f.autoComplete}
              placeholder={f.placeholder}
              value={values[f.key]}
              onChange={(e) => {
                setValues((v) => ({ ...v, [f.key]: e.target.value }));
                setSaved(false);
              }}
              aria-invalid={errors[f.key] ? true : undefined}
            />
            {errors[f.key] && <p className="text-sm text-destructive">{errors[f.key]}</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Links must start with https://. Leave a box empty to remove it. These details are only used to fill employer forms through the JobLume extension, and only when you press the button.</p>
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-emerald-600">
          Saved.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save contact details'}
      </Button>
    </form>
  );
}
```

In `web/src/app/(app)/settings/page.tsx`:
1. Replace `import { ProfileForm } from '@/components/profile/ProfileForm';` with:

```tsx
import { ContactForm } from '@/components/profile/ContactForm';
import { ProfileForm } from '@/components/profile/ProfileForm';
```

2. Replace `import { profileToFormValues, profileToSettingsValues } from '@/lib/profile-form';` with `import { profileToContactValues, profileToFormValues, profileToSettingsValues } from '@/lib/profile-form';`.
3. Directly before the card whose title is `Applying` (the line `          <CardTitle>Applying</CardTitle>` has `<Card>` and `<CardHeader>` above it), insert this card, so it sits between "Job preferences" and "Applying":

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Contact details for application forms</CardTitle>
          <CardDescription>Used by the JobLume browser extension to fill the standard fields of employer forms. Nothing is submitted for you.</CardDescription>
        </CardHeader>
        <CardContent>
          <ContactForm
            initial={profileToContactValues(data)}
            onSubmit={async (patch) => { await updateProfile.mutateAsync(patch); }}
          />
        </CardContent>
      </Card>

```

(With the Edit tool: use the two-line anchor `      <Card>\n        <CardHeader>\n          <CardTitle>Applying</CardTitle>` as `old_string` and put the new card before it in `new_string`.)

- [ ] **Step 5: Mobile form and screen**

Create `mobile/src/components/profile/ContactForm.tsx`:

```tsx
import type { ProfilePatch } from '@joblume/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Message } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { describeApiError } from '@/lib/api/errors';
import { buildContactPatch, type ContactField, type ContactValues } from '@/lib/profile-form';
import { colors, font, space } from '@/theme';

export interface ContactFormProps {
  initial: ContactValues;
  onSubmit(patch: ProfilePatch): Promise<void>;
}

/** Name, phone, city and links the JobLume browser extension fills into employer forms. */
export function ContactForm({ initial, onSubmit }: ContactFormProps) {
  const [values, setValues] = useState<ContactValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const set = (key: ContactField, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  };

  async function submit() {
    setServerError(null);
    setSaved(false);
    const result = buildContactPatch(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await onSubmit(result.patch);
      setSaved(true);
    } catch (err) {
      setServerError(describeApiError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.form}>
      <TextField label="Full name" autoComplete="name" value={values.fullName} onChangeText={(t) => set('fullName', t)} error={errors.fullName} />
      <TextField label="Phone" keyboardType="phone-pad" autoComplete="tel" value={values.phone} onChangeText={(t) => set('phone', t)} error={errors.phone} />
      <TextField label="City" value={values.city} onChangeText={(t) => set('city', t)} error={errors.city} />
      <TextField label="LinkedIn link" keyboardType="url" autoCapitalize="none" value={values.linkedinUrl} onChangeText={(t) => set('linkedinUrl', t)} error={errors.linkedinUrl} />
      <TextField label="GitHub link" keyboardType="url" autoCapitalize="none" value={values.githubUrl} onChangeText={(t) => set('githubUrl', t)} error={errors.githubUrl} />
      <TextField label="Portfolio or website link" keyboardType="url" autoCapitalize="none" value={values.portfolioUrl} onChangeText={(t) => set('portfolioUrl', t)} error={errors.portfolioUrl} />
      <Text style={styles.hint}>
        Links must start with https://. Leave a box empty to remove it. These details are only used to fill employer forms through the JobLume extension on a
        computer, and only when you press the button there.
      </Text>
      {serverError ? <Message kind="error" text={serverError} /> : null}
      {saved ? <Message kind="success" text="Saved." /> : null}
      <Button label={pending ? 'Saving…' : 'Save contact details'} onPress={() => void submit()} disabled={pending} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space(4) },
  hint: { fontSize: font.tiny, color: colors.muted },
});
```

In `mobile/src/components/settings/SettingsScreen.tsx`:
1. Replace `import { ProfileForm } from '@/components/profile/ProfileForm';` with:

```tsx
import { ContactForm } from '@/components/profile/ContactForm';
import { ProfileForm } from '@/components/profile/ProfileForm';
```

2. Replace `import { profileToFormValues, profileToSettingsValues } from '@/lib/profile-form';` with `import { profileToContactValues, profileToFormValues, profileToSettingsValues } from '@/lib/profile-form';`.
3. Directly before the line `      <Section title="Applying" description="How applications are handled and how often.">` insert:

```tsx
      <Section title="Contact details for application forms" description="Used by the JobLume browser extension to fill the standard fields of employer forms. Nothing is submitted for you.">
        <ContactForm
          initial={profileToContactValues(data)}
          onSubmit={async (patch) => {
            await updateProfile.mutateAsync(patch);
          }}
        />
      </Section>

```

- [ ] **Step 6: Run the tests and the type checks**

Run: `npm run typecheck -w web && npm run typecheck -w mobile && npm test -w web -- tests/lib tests/components && npm test -w mobile`
Expected: PASS everywhere (web about 350 tests, mobile about 390). The existing `SettingsForm` tests are unchanged and still pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/profile-form.ts mobile/src/lib/profile-form.ts web/src/components/profile/ContactForm.tsx mobile/src/components/profile/ContactForm.tsx "web/src/app/(app)/settings/page.tsx" mobile/src/components/settings/SettingsScreen.tsx web/tests/lib/contact-form.test.ts web/tests/components/contact-form.test.tsx mobile/tests/lib/contact-form.test.ts mobile/tests/components/contact-form.test.tsx mobile/tests/components/settings.test.tsx
git commit -m "feat(settings): contact details for application forms on web and mobile

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```


### Task 4: Extension scaffold (workspace, esbuild build, MV3 manifest, test setup)

**Files:**
- Modify: `package.json` (root), `package-lock.json` (by `npm install`)
- Create: `extension/package.json`, `extension/tsconfig.json`, `extension/vitest.config.ts`, `extension/build.mjs`, `extension/src/env.d.ts`, `extension/src/manifest.ts`, `extension/tests/helpers/dom.ts`
- Test (create): `extension/tests/manifest.test.ts`

**Interfaces:**
- Consumes: `AutofillPayload` from `@joblume/shared` (Task 1; type only).
- Produces: workspace `joblume-extension` (so `npm test -w joblume-extension`, `npm run typecheck -w joblume-extension`, root `npm run build:extension`); `parseBuildConfig(env: Record<string, string | undefined>): { origins: string[]; storageHost: string }`, `buildManifest(cfg): Manifest`, `FORM_MATCHES` in `extension/src/manifest.ts`; build-time globals `__STORAGE_HOST__: string`, `__JOBLUME_ORIGINS__: string[]`, `__DOCS_URL__: string` (declared in `src/env.d.ts`, replaced by esbuild `define`); test helpers in `extension/tests/helpers/dom.ts`: `loadFixture(name)`, `payload(over?)`, `cvFile()`, `FakeDataTransfer`, `installFakeDataTransfer()`, `allowFileAssignment(root)`, `recordEvents(el, types?)`, `fileNames(input)`, `byId(id)`, `byName(name)`.

- [ ] **Step 1: Register the workspace and the build script in the root `package.json`**

Replace

```json
    "web",
    "mobile"
  ],
```

with

```json
    "web",
    "mobile",
    "extension"
  ],
```

and, directly after the line `    "dev:mobile": "npm run start -w mobile",`, add:

```json
    "build:extension": "npm run build -w joblume-extension",
```

(The root `typecheck` and `test` scripts use `--workspaces --if-present`, so the extension is picked up automatically.)

- [ ] **Step 2: Create the extension package files**

Create `extension/package.json`:

```json
{
  "name": "joblume-extension",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "pretypecheck": "npm run build:shared --prefix ..",
    "typecheck": "tsc -p tsconfig.json",
    "prebuild": "npm run build:shared --prefix ..",
    "build": "node build.mjs",
    "pretest": "npm run build:shared --prefix ..",
    "test": "vitest run"
  },
  "devDependencies": {
    "@joblume/shared": "*",
    "@types/chrome": "^0.3.6",
    "@types/node": "^26.6.5",
    "esbuild": "^0.28.2",
    "jsdom": "^30.1.3",
    "typescript": "^7.0.2",
    "vitest": "^5.0.5"
  }
}
```

Create `extension/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["chrome", "node"]
  },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

Create `extension/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'jsdom' },
});
```

Create `extension/src/env.d.ts`:

```ts
/** Replaced by esbuild `define` at build time (see build.mjs). */
declare const __STORAGE_HOST__: string;
declare const __JOBLUME_ORIGINS__: string[];
declare const __DOCS_URL__: string;
```

- [ ] **Step 3: Install**

Run: `npm install`
Expected: finishes without errors and ends with the shared package building (`> @joblume/shared@0.1.0 build`). It adds `@types/chrome` and links `node_modules/joblume-extension`. A notice `npm warn install-scripts ... esbuild ... postinstall` is harmless. `package-lock.json` changes (it gains the `extension` workspace and `@types/chrome`).

- [ ] **Step 4: Write the failing test and the test helpers**

Create `extension/tests/helpers/dom.ts`:

```ts
import type { AutofillPayload } from '@joblume/shared';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

/** Saved real application form HTML (see tests/fixtures). */
export function loadFixture(name: 'greenhouse-form' | 'lever-form' | 'ashby-form' | 'workable-form'): string {
  return readFileSync(resolve(here, '../fixtures', `${name}.html`), 'utf8');
}

export function payload(over: Partial<AutofillPayload> = {}): AutofillPayload {
  return {
    job_url: 'https://job-boards.greenhouse.io/gitlab/jobs/8860302002',
    full_name: 'Ada Lovelace',
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    phone: '+234 801 234 5678',
    city: 'Lagos',
    linkedin_url: 'https://www.linkedin.com/in/ada',
    github_url: 'https://github.com/ada',
    portfolio_url: 'https://ada.dev/',
    cover_letter: 'Dear team,\nI would love to join.',
    cv: { url: 'https://abcd1234.supabase.co/storage/v1/object/sign/cvs/u1/tailored/j1.pdf?token=t', filename: 'Ada Lovelace CV.pdf' },
    ...over,
  };
}

export const cvFile = () => new File(['%PDF-1.4 test'], 'Ada Lovelace CV.pdf', { type: 'application/pdf' });

/** jsdom has no DataTransfer; this stands in for it. `files` is a plain array of the added files. */
export class FakeDataTransfer {
  private list: File[] = [];
  items = {
    add: (file: File) => {
      this.list.push(file);
    },
  };
  get files(): File[] {
    return this.list;
  }
}

export function installFakeDataTransfer(): void {
  vi.stubGlobal('DataTransfer', FakeDataTransfer);
}

/** jsdom only lets a real FileList be assigned to input.files; make it a plain writable property instead. */
export function allowFileAssignment(root: ParentNode): void {
  for (const input of Array.from(root.querySelectorAll<HTMLInputElement>('input[type="file"]'))) {
    Object.defineProperty(input, 'files', { configurable: true, writable: true, value: [] });
  }
}

export function recordEvents(el: Element, types = ['input', 'change', 'blur', 'focusout', 'click', 'submit']): string[] {
  const seen: string[] = [];
  for (const t of types) el.addEventListener(t, () => seen.push(t));
  return seen;
}

export const fileNames = (input: HTMLInputElement): string[] => Array.from(input.files ?? []).map((f) => f.name);

export function byId<T extends HTMLElement = HTMLInputElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found in the fixture`);
  return el as T;
}

export function byName<T extends HTMLElement = HTMLInputElement>(name: string): T {
  const el = document.querySelector(`[name="${name}"]`);
  if (!el) throw new Error(`[name="${name}"] not found in the fixture`);
  return el as T;
}
```

Create `extension/tests/manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildManifest, parseBuildConfig } from '../src/manifest';

describe('parseBuildConfig', () => {
  it('defaults to localhost:3000 and the Supabase wildcard host', () => {
    expect(parseBuildConfig({})).toEqual({ origins: ['http://localhost:3000'], storageHost: '*.supabase.co' });
  });

  it('reads several origins and a storage host, trimming and removing duplicates', () => {
    const cfg = parseBuildConfig({
      EXTENSION_JOBLUME_ORIGINS: ' https://app.joblume.example/ , http://localhost:3000, https://app.joblume.example',
      EXTENSION_STORAGE_HOST: 'ABCD1234.supabase.co',
    });
    expect(cfg).toEqual({ origins: ['https://app.joblume.example', 'http://localhost:3000'], storageHost: 'abcd1234.supabase.co' });
  });

  it.each([
    ['plain http on a real host', { EXTENSION_JOBLUME_ORIGINS: 'http://app.joblume.example' }],
    ['an origin with a path', { EXTENSION_JOBLUME_ORIGINS: 'https://app.joblume.example/app' }],
    ['a wildcard origin', { EXTENSION_JOBLUME_ORIGINS: 'https://*.joblume.example' }],
    ['an empty origin list', { EXTENSION_JOBLUME_ORIGINS: ' , ' }],
    ['a storage host with a scheme', { EXTENSION_STORAGE_HOST: 'https://abcd.supabase.co' }],
    ['a storage host with a path', { EXTENSION_STORAGE_HOST: 'abcd.supabase.co/storage' }],
    ['a single-label storage host', { EXTENSION_STORAGE_HOST: 'localhost' }],
  ])('rejects %s', (_name, env) => {
    expect(() => parseBuildConfig(env)).toThrow();
  });
});

describe('buildManifest', () => {
  const manifest = buildManifest({ origins: ['http://localhost:3000'], storageHost: 'abcd1234.supabase.co' });

  it('is a Manifest V3 service-worker extension with the two permissions only', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({ service_worker: 'background.js' });
    expect([...manifest.permissions].sort()).toEqual(['storage', 'tabs']);
  });

  it('limits host permissions to the five form hosts, the JobLume origins and the storage host', () => {
    expect(manifest.host_permissions).toEqual([
      'https://boards.greenhouse.io/*',
      'https://job-boards.greenhouse.io/*',
      'https://jobs.lever.co/*',
      'https://jobs.ashbyhq.com/*',
      'https://apply.workable.com/*',
      'http://localhost:3000/*',
      'https://abcd1234.supabase.co/*',
    ]);
  });

  it('runs the bridge only on the JobLume origins and the form script only on the form hosts', () => {
    const [bridge, forms] = manifest.content_scripts;
    expect(bridge?.matches).toEqual(['http://localhost:3000/*']);
    expect(bridge?.js).toEqual(['bridge.js']);
    expect(forms?.matches).toEqual(manifest.host_permissions.slice(0, 5));
    expect(forms?.js).toEqual(['forms.js']);
  });

  it('survives a JSON round trip and has no wildcard-all host', () => {
    const text = JSON.stringify(manifest);
    expect(JSON.parse(text)).toEqual(manifest);
    expect(text).not.toContain('<all_urls>');
    expect(text).not.toContain('"*://*/*"');
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test -w joblume-extension -- tests/manifest.test.ts`
Expected: FAIL with `Failed to resolve import "../src/manifest"`.

- [ ] **Step 6: Implement the manifest builder and the build script**

Create `extension/src/manifest.ts`:

```ts
/** Hosts of the four supported employer application forms. */
export const FORM_MATCHES = [
  'https://boards.greenhouse.io/*',
  'https://job-boards.greenhouse.io/*',
  'https://jobs.lever.co/*',
  'https://jobs.ashbyhq.com/*',
  'https://apply.workable.com/*',
] as const;

export const DEFAULT_ORIGINS = 'http://localhost:3000';
export const DEFAULT_STORAGE_HOST = '*.supabase.co';

export interface BuildConfig {
  /** JobLume web origins such as http://localhost:3000 (no path). */
  origins: string[];
  /** Supabase storage host the signed CV link may point to, e.g. abcd1234.supabase.co or *.supabase.co. */
  storageHost: string;
}

const ORIGIN_RE = /^(https?):\/\/([a-z0-9.-]+)(:\d{1,5})?$/;
const HOST_RE = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function parseBuildConfig(env: Record<string, string | undefined>): BuildConfig {
  const rawOrigins = (env.EXTENSION_JOBLUME_ORIGINS ?? DEFAULT_ORIGINS)
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, '').toLowerCase())
    .filter(Boolean);
  if (rawOrigins.length === 0) throw new Error('EXTENSION_JOBLUME_ORIGINS must list at least one origin');
  for (const o of rawOrigins) {
    const m = ORIGIN_RE.exec(o);
    if (!m) throw new Error(`Bad origin in EXTENSION_JOBLUME_ORIGINS: ${o} (use scheme://host[:port], no path)`);
    const host = m[2]!;
    if (m[1] === 'http' && host !== 'localhost' && host !== '127.0.0.1') {
      throw new Error(`Only https origins are allowed except localhost: ${o}`);
    }
  }
  const storageHost = (env.EXTENSION_STORAGE_HOST ?? DEFAULT_STORAGE_HOST).trim().toLowerCase();
  if (!HOST_RE.test(storageHost)) throw new Error(`Bad EXTENSION_STORAGE_HOST: ${storageHost} (host name only, e.g. abcd1234.supabase.co)`);
  return { origins: [...new Set(rawOrigins)], storageHost };
}

export function buildManifest(cfg: BuildConfig) {
  const webMatches = cfg.origins.map((o) => `${o}/*`);
  return {
    manifest_version: 3,
    name: 'JobLume Autofill',
    version: '0.1.0',
    description: 'Fills the standard fields of employer application forms from JobLume. It never submits anything.',
    minimum_chrome_version: '116',
    permissions: ['storage', 'tabs'],
    host_permissions: [...FORM_MATCHES, ...webMatches, `https://${cfg.storageHost}/*`],
    background: { service_worker: 'background.js' },
    content_scripts: [
      { matches: webMatches, js: ['bridge.js'], run_at: 'document_start' },
      { matches: [...FORM_MATCHES], js: ['forms.js'], run_at: 'document_idle', all_frames: true },
    ],
    action: { default_title: 'JobLume Autofill', default_popup: 'popup.html' },
  };
}
```

Create `extension/build.mjs`:

```js
// Bundles the extension into extension/dist (load that folder unpacked in Chrome).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dist = resolve(root, 'dist');
const tmp = resolve(root, '.build');

rmSync(dist, { recursive: true, force: true });
rmSync(tmp, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// manifest.ts is TypeScript: compile it for Node once, then import it.
await build({
  entryPoints: [resolve(root, 'src/manifest.ts')],
  outfile: resolve(tmp, 'manifest.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const { buildManifest, parseBuildConfig } = await import(pathToFileURL(resolve(tmp, 'manifest.mjs')).href);
rmSync(tmp, { recursive: true, force: true });

const cfg = parseBuildConfig(process.env);
if (!process.env.EXTENSION_STORAGE_HOST) {
  console.warn(
    'EXTENSION_STORAGE_HOST is not set: the CV download is allowed from any *.supabase.co host. Set it to your project host (for example abcd1234.supabase.co).',
  );
}

await build({
  entryPoints: {
    background: resolve(root, 'src/background.ts'),
    bridge: resolve(root, 'src/content/bridge.ts'),
    forms: resolve(root, 'src/content/forms.ts'),
    popup: resolve(root, 'src/popup/popup.ts'),
  },
  outdir: dist,
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  platform: 'browser',
  define: {
    __STORAGE_HOST__: JSON.stringify(cfg.storageHost),
    __JOBLUME_ORIGINS__: JSON.stringify(cfg.origins),
    __DOCS_URL__: JSON.stringify(`${cfg.origins[0]}/extension-setup.html`),
  },
  logLevel: 'info',
});

copyFileSync(resolve(root, 'src/popup/popup.html'), resolve(dist, 'popup.html'));
writeFileSync(resolve(dist, 'manifest.json'), `${JSON.stringify(buildManifest(cfg), null, 2)}\n`);
console.log(`Built ${dist}`);
```

(`build.mjs` bundles four entry points that later tasks create, so `npm run build:extension` is first run in Task 10.)

- [ ] **Step 7: Run the test and the type check**

Run: `npm test -w joblume-extension -- tests/manifest.test.ts && npm run typecheck -w joblume-extension`
Expected: 13 manifest tests PASS, typecheck prints no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json extension/package.json extension/tsconfig.json extension/vitest.config.ts extension/build.mjs extension/src/env.d.ts extension/src/manifest.ts extension/tests/helpers/dom.ts extension/tests/manifest.test.ts
git commit -m "feat(extension): workspace scaffold, MV3 manifest builder and esbuild build script

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Payload validator and background storage, arming and expiry

**Files:**
- Create: `extension/src/messages.ts`, `extension/src/payload.ts`, `extension/src/b64.ts`, `extension/src/background-core.ts`, `extension/src/router.ts`, `extension/src/background.ts`
- Test (create): `extension/tests/payload.test.ts`, `extension/tests/background-core.test.ts`, `extension/tests/router.test.ts`

**Interfaces:**
- Consumes: `payload()` helper from Task 4; `AutofillPayload` from `@joblume/shared`.
- Produces:
  - `validatePayload(input: unknown): AutofillPayload | null`, `httpsHref(v: unknown): string | null`, `LIMITS` (`src/payload.ts`).
  - `WEB_SOURCE = 'joblume-web'`, `EXT_SOURCE = 'joblume-extension'`, `JobLabel`, `ToBackground`, `ArmReply`, `PayloadReply`, `CvReply`, `StatusReply`, `FilledMessage` (`src/messages.ts`).
  - `bytesToBase64(bytes: Uint8Array): string`, `base64ToBytes(b64: string): Uint8Array` (`src/b64.ts`).
  - `createBackground(deps: CoreDeps): Background` with `arm(raw, rawLabel, originTabId): Promise<ArmReply>`, `getPayload(tabId)`, `fetchCv(tabId, url): Promise<CvReply>`, `complete(tabId, filled)`, `clear(tabId)`, `status(tabId): Promise<StatusReply>`, `onTabRemoved(tabId)`; `EXPIRY_MS` (30 min), `MAX_CV_BYTES` (10 MB), `hostAllowed(host, pattern)`, `cleanLabel(raw)`, `SessionStore`, `CoreDeps` (`src/background-core.ts`).
  - `routeMessage(core, cfg, msg, sender): Promise<RouterReply>` (`src/router.ts`). Message types: `joblume:arm`, `joblume:get-payload`, `joblume:fetch-cv`, `joblume:done`, `joblume:status`, `joblume:clear`.

- [ ] **Step 1: Write the failing tests**

Create `extension/tests/payload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LIMITS, httpsHref, validatePayload } from '../src/payload';
import { payload } from './helpers/dom';

describe('validatePayload', () => {
  it('accepts a full payload and returns a clean copy', () => {
    const input = payload();
    const out = validatePayload(input);
    expect(out).toEqual({ ...input, portfolio_url: 'https://ada.dev/' });
    expect(out).not.toBe(input);
  });

  it('accepts nulls and a missing cv', () => {
    const out = validatePayload({ job_url: 'https://example.com/jobs/1' });
    expect(out).toEqual({
      job_url: 'https://example.com/jobs/1', full_name: null, first_name: null, last_name: null, email: null, phone: null, city: null,
      linkedin_url: null, github_url: null, portfolio_url: null, cover_letter: null, cv: null,
    });
  });

  it('turns blank strings into null and trims text', () => {
    const out = validatePayload({ ...payload(), city: '   ', full_name: '  Ada Lovelace ' });
    expect(out?.city).toBeNull();
    expect(out?.full_name).toBe('Ada Lovelace');
  });

  it.each([
    ['not an object', 'hello'],
    ['an array', []],
    ['null', null],
    ['an unknown key', { ...payload(), password: 'x' }],
    ['a missing job_url', { ...payload(), job_url: undefined }],
    ['an http job_url', payload({ job_url: 'http://example.com/job' })],
    ['a javascript job_url', payload({ job_url: 'javascript:alert(1)' })],
    ['a job_url with credentials', payload({ job_url: 'https://user:pw@example.com/job' })],
    ['an http linkedin_url', payload({ linkedin_url: 'http://linkedin.com/in/a' })],
    ['a non-string github_url', { ...payload(), github_url: 5 }],
    ['an http cv url', payload({ cv: { url: 'http://abcd1234.supabase.co/x.pdf', filename: 'cv.pdf' } })],
    ['a cv with an extra key', { ...payload(), cv: { url: 'https://abcd1234.supabase.co/x.pdf', filename: 'cv.pdf', extra: 1 } }],
    ['a cv filename with a slash', payload({ cv: { url: 'https://abcd1234.supabase.co/x.pdf', filename: '../cv.pdf' } })],
    ['a bad email', payload({ email: 'not-an-email' })],
    ['a bad phone', payload({ phone: 'call me maybe' })],
    ['a name over the cap', payload({ full_name: 'x'.repeat(LIMITS.name + 1) })],
    ['a cover letter over the cap', payload({ cover_letter: 'x'.repeat(LIMITS.coverLetter + 1) })],
    ['a url over the cap', payload({ portfolio_url: `https://example.com/${'a'.repeat(LIMITS.url)}` })],
    ['a url with a space', payload({ portfolio_url: 'https://example.com/a b' })],
  ])('rejects %s', (_name, input) => {
    expect(validatePayload(input)).toBeNull();
  });
});

describe('httpsHref', () => {
  it('normalises https urls and rejects everything else', () => {
    expect(httpsHref('https://Example.com')).toBe('https://example.com/');
    expect(httpsHref('ftp://example.com')).toBeNull();
    expect(httpsHref('//example.com')).toBeNull();
    expect(httpsHref('')).toBeNull();
    expect(httpsHref(undefined)).toBeNull();
  });
});
```

Create `extension/tests/background-core.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { EXPIRY_MS, MAX_CV_BYTES, createBackground, hostAllowed, type CoreDeps, type SessionStore } from '../src/background-core';
import type { FilledMessage } from '../src/messages';
import { payload } from './helpers/dom';

function memoryStore(): SessionStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (k) => data.get(k),
    set: async (k, v) => {
      data.set(k, v);
    },
    remove: async (k) => {
      data.delete(k);
    },
    keys: async () => [...data.keys()],
  };
}

type OpenTab = (url: string) => Promise<number | null>;
type NotifyTab = (tabId: number, msg: FilledMessage) => Promise<void>;
type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

function setup(over: Partial<CoreDeps> = {}) {
  const store = memoryStore();
  const clock = { now: 1_000_000 };
  const openTab = vi.fn<OpenTab>().mockImplementation(async () => 7);
  const notifyTab = vi.fn<NotifyTab>().mockImplementation(async () => undefined);
  const fetchImpl = vi.fn<FetchImpl>().mockImplementation(async () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 }));
  const core = createBackground({
    store, openTab, notifyTab, fetchImpl, now: () => clock.now, storageHost: 'abcd1234.supabase.co', ...over,
  });
  return { core, store, clock, openTab, notifyTab, fetchImpl };
}

describe('hostAllowed', () => {
  it('matches exact hosts and wildcard sub-domains only', () => {
    expect(hostAllowed('abcd1234.supabase.co', 'abcd1234.supabase.co')).toBe(true);
    expect(hostAllowed('other.supabase.co', 'abcd1234.supabase.co')).toBe(false);
    expect(hostAllowed('abcd1234.supabase.co', '*.supabase.co')).toBe(true);
    expect(hostAllowed('supabase.co', '*.supabase.co')).toBe(false);
    expect(hostAllowed('evilsupabase.co', '*.supabase.co')).toBe(false);
    expect(hostAllowed('abcd1234.supabase.co.evil.com', '*.supabase.co')).toBe(false);
  });
});

describe('arming', () => {
  it('opens the job in a new tab and stores the payload for that tab with a 30 minute expiry', async () => {
    const { core, store, openTab, clock } = setup();
    const res = await core.arm(payload(), { title: 'Data Analyst', company: 'Acme' }, 3);
    expect(res).toEqual({ ok: true });
    expect(openTab).toHaveBeenCalledWith('https://job-boards.greenhouse.io/gitlab/jobs/8860302002');
    const rec = store.data.get('armed:7') as { expiresAt: number; originTabId: number; label: unknown };
    expect(rec.expiresAt).toBe(clock.now + EXPIRY_MS);
    expect(rec.originTabId).toBe(3);
    expect(rec.label).toEqual({ title: 'Data Analyst', company: 'Acme' });
  });

  it('rejects an invalid payload without opening a tab or storing anything', async () => {
    const { core, store, openTab } = setup();
    const res = await core.arm({ ...payload(), job_url: 'http://insecure.example/job' }, null, 3);
    expect(res).toEqual({ ok: false, error: 'invalid_payload' });
    expect(openTab).not.toHaveBeenCalled();
    expect(store.data.size).toBe(0);
  });

  it('reports tab_failed when Chrome gives no tab id', async () => {
    const { core, store } = setup({ openTab: vi.fn<OpenTab>().mockImplementation(async () => null) });
    expect(await core.arm(payload(), null, 3)).toEqual({ ok: false, error: 'tab_failed' });
    expect(store.data.size).toBe(0);
  });

  it('keeps only a clean job label and drops a malformed one', async () => {
    const { core, store } = setup();
    await core.arm(payload(), { title: 'x'.repeat(500), company: 5 }, null);
    expect((store.data.get('armed:7') as { label: { title: string; company: string } }).label).toEqual({ title: 'x'.repeat(120), company: '' });
    await core.arm(payload(), 'nope', null);
    expect((store.data.get('armed:7') as { label: unknown }).label).toBeNull();
  });

  it('removes expired records of other tabs when arming', async () => {
    const { core, store, clock } = setup();
    await core.arm(payload(), null, null);
    store.data.set('unrelated', 'keep');
    clock.now += EXPIRY_MS + 1;
    await core.arm(payload(), null, null);
    expect([...store.data.keys()].sort()).toEqual(['armed:7', 'unrelated']);
    expect((store.data.get('armed:7') as { expiresAt: number }).expiresAt).toBe(clock.now + EXPIRY_MS);
  });
});

describe('tab binding and expiry', () => {
  it('hands the payload only to the tab it was armed for', async () => {
    const { core } = setup();
    await core.arm(payload(), null, null);
    expect((await core.getPayload(7))?.email).toBe('ada@example.com');
    expect(await core.getPayload(8)).toBeNull();
  });

  it('forgets the payload after 30 minutes', async () => {
    const { core, store, clock } = setup();
    await core.arm(payload(), null, null);
    clock.now += EXPIRY_MS - 1;
    expect(await core.getPayload(7)).not.toBeNull();
    clock.now += 1;
    expect(await core.getPayload(7)).toBeNull();
    expect(store.data.has('armed:7')).toBe(false);
    expect(await core.status(7)).toEqual({ armed: false, label: null, expiresAt: null });
  });

  it('forgets the payload when the tab closes or the user clears it', async () => {
    const { core, store } = setup();
    await core.arm(payload(), null, null);
    await core.onTabRemoved(7);
    expect(store.data.size).toBe(0);
    await core.arm(payload(), null, null);
    await core.clear(7);
    expect(store.data.size).toBe(0);
  });

  it('reports status with the label and expiry', async () => {
    const { core, clock } = setup();
    await core.arm(payload(), { title: 'Data Analyst', company: 'Acme' }, null);
    expect(await core.status(7)).toEqual({ armed: true, label: { title: 'Data Analyst', company: 'Acme' }, expiresAt: clock.now + EXPIRY_MS });
  });
});

describe('completing a fill', () => {
  it('deletes the payload and tells the JobLume tab how many fields were filled', async () => {
    const { core, store, notifyTab } = setup();
    await core.arm(payload(), null, 3);
    await core.complete(7, 5);
    expect(store.data.size).toBe(0);
    expect(notifyTab).toHaveBeenCalledWith(3, { type: 'joblume:filled', count: 5 });
  });

  it('still deletes the payload when the JobLume tab is gone', async () => {
    const { core, store } = setup({ notifyTab: vi.fn<NotifyTab>().mockImplementation(async () => { throw new Error('no receiver'); }) });
    await core.arm(payload(), null, 3);
    await core.complete(7, 2);
    expect(store.data.size).toBe(0);
  });

  it('does not notify anyone when no tab armed it', async () => {
    const { core, notifyTab } = setup();
    await core.arm(payload(), null, null);
    await core.complete(7, 2);
    expect(notifyTab).not.toHaveBeenCalled();
  });
});

describe('fetching the CV', () => {
  const url = payload().cv!.url;

  it('downloads the armed link once, with no cookies and no redirects, and returns it as base64', async () => {
    const { core, fetchImpl } = setup();
    await core.arm(payload(), null, null);
    const res = await core.fetchCv(7, url);
    expect(res).toEqual({ ok: true, base64: 'JVBERg==', contentType: 'application/pdf' });
    expect(fetchImpl).toHaveBeenCalledWith(url, { credentials: 'omit', redirect: 'error', cache: 'no-store' });
    expect(await core.fetchCv(7, url)).toEqual({ ok: false, error: 'already_used' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses a url other than the armed one, a tab with no payload and a payload with no cv', async () => {
    const { core, fetchImpl } = setup();
    await core.arm(payload(), null, null);
    expect(await core.fetchCv(7, 'https://abcd1234.supabase.co/other.pdf')).toEqual({ ok: false, error: 'url_mismatch' });
    expect(await core.fetchCv(9, url)).toEqual({ ok: false, error: 'no_cv' });
    await core.arm(payload({ cv: null }), null, null);
    expect(await core.fetchCv(7, url)).toEqual({ ok: false, error: 'no_cv' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a host that is not the configured storage host', async () => {
    const { core, fetchImpl } = setup();
    const evil = 'https://evil.example/x.pdf';
    await core.arm(payload({ cv: { url: evil, filename: 'cv.pdf' } }), null, null);
    expect(await core.fetchCv(7, evil)).toEqual({ ok: false, error: 'host_not_allowed' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a file over 10 MB, by header and by size', async () => {
    const big = vi.fn<FetchImpl>().mockImplementation(async () => new Response('x', { status: 200, headers: { 'content-length': String(MAX_CV_BYTES + 1) } }));
    const a = setup({ fetchImpl: big });
    await a.core.arm(payload(), null, null);
    expect(await a.core.fetchCv(7, url)).toEqual({ ok: false, error: 'too_large' });

    const body = vi.fn<FetchImpl>().mockImplementation(async () => new Response(new Uint8Array(MAX_CV_BYTES + 1), { status: 200 }));
    const b = setup({ fetchImpl: body });
    await b.core.arm(payload(), null, null);
    expect(await b.core.fetchCv(7, url)).toEqual({ ok: false, error: 'too_large' });
  });

  it('reports http errors and network errors, and allows a retry after a failure', async () => {
    const fetchImpl = vi.fn<FetchImpl>();
    fetchImpl.mockImplementationOnce(async () => new Response('no', { status: 403 }));
    fetchImpl.mockImplementationOnce(async () => { throw new TypeError('network'); });
    fetchImpl.mockImplementation(async () => new Response(new Uint8Array([1]), { status: 200 }));
    const { core } = setup({ fetchImpl });
    await core.arm(payload(), null, null);
    expect(await core.fetchCv(7, url)).toEqual({ ok: false, error: 'http_403' });
    expect(await core.fetchCv(7, url)).toEqual({ ok: false, error: 'fetch_failed' });
    expect((await core.fetchCv(7, url)).ok).toBe(true);
  });
});
```

Create `extension/tests/router.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Background } from '../src/background-core';
import { routeMessage, type RouterConfig } from '../src/router';
import { payload } from './helpers/dom';

const cfg: RouterConfig = { joblumeOrigins: ['http://localhost:3000'], extensionBase: 'chrome-extension://abc/' };

function fakeCore() {
  return {
    arm: vi.fn<Background['arm']>().mockImplementation(async () => ({ ok: true })),
    getPayload: vi.fn<Background['getPayload']>().mockImplementation(async () => payload()),
    fetchCv: vi.fn<Background['fetchCv']>().mockImplementation(async () => ({ ok: true, base64: 'AA==', contentType: 'application/pdf' })),
    complete: vi.fn<Background['complete']>().mockImplementation(async () => undefined),
    clear: vi.fn<Background['clear']>().mockImplementation(async () => undefined),
    status: vi.fn<Background['status']>().mockImplementation(async () => ({ armed: false, label: null, expiresAt: null })),
    onTabRemoved: vi.fn<Background['onTabRemoved']>().mockImplementation(async () => undefined),
  };
}

describe('routeMessage', () => {
  it('arms only for a tab on a configured JobLume origin', async () => {
    const core = fakeCore();
    const msg = { type: 'joblume:arm', payload: payload(), label: { title: 'T', company: 'C' } };
    expect(await routeMessage(core, cfg, msg, { tab: { id: 3 }, url: 'http://localhost:3000/queue' })).toEqual({ ok: true });
    expect(core.arm).toHaveBeenCalledWith(msg.payload, msg.label, 3);

    core.arm.mockClear();
    const denied = { ok: false, error: 'not_allowed' };
    expect(await routeMessage(core, cfg, msg, { tab: { id: 3 }, url: 'https://boards.greenhouse.io/x' })).toEqual(denied);
    expect(await routeMessage(core, cfg, msg, { tab: { id: 3 }, url: 'http://localhost:3000.evil.com/' })).toEqual(denied);
    expect(await routeMessage(core, cfg, msg, { url: 'http://localhost:3000/' })).toEqual(denied);
    expect(await routeMessage(core, cfg, msg, { tab: { id: 3 } })).toEqual(denied);
    expect(core.arm).not.toHaveBeenCalled();
  });

  it('answers get-payload, fetch-cv and done for the sending tab only', async () => {
    const core = fakeCore();
    const from = { tab: { id: 7 }, url: 'https://jobs.lever.co/x' };
    expect((await routeMessage(core, cfg, { type: 'joblume:get-payload' }, from) as { payload: unknown }).payload).toEqual(payload());
    expect(core.getPayload).toHaveBeenCalledWith(7);
    await routeMessage(core, cfg, { type: 'joblume:fetch-cv', url: 'https://abcd1234.supabase.co/x.pdf' }, from);
    expect(core.fetchCv).toHaveBeenCalledWith(7, 'https://abcd1234.supabase.co/x.pdf');
    expect(await routeMessage(core, cfg, { type: 'joblume:done', filled: 4 }, from)).toEqual({ ok: true });
    expect(core.complete).toHaveBeenCalledWith(7, 4);

    expect(await routeMessage(core, cfg, { type: 'joblume:get-payload' }, {})).toBeNull();
    expect(await routeMessage(core, cfg, { type: 'joblume:fetch-cv', url: 5 }, from)).toBeNull();
    expect(await routeMessage(core, cfg, { type: 'joblume:done', filled: -1 }, from)).toBeNull();
    expect(await routeMessage(core, cfg, { type: 'joblume:done', filled: 1.5 }, from)).toBeNull();
  });

  it('lets the popup name a tab for status and clear, but never a web page', async () => {
    const core = fakeCore();
    const popup = { url: 'chrome-extension://abc/popup.html' };
    await routeMessage(core, cfg, { type: 'joblume:status', tabId: 12 }, popup);
    expect(core.status).toHaveBeenCalledWith(12);
    expect(await routeMessage(core, cfg, { type: 'joblume:clear', tabId: 12 }, popup)).toEqual({ ok: true });
    expect(core.clear).toHaveBeenCalledWith(12);

    core.status.mockClear();
    const page = { tab: { id: 7 }, url: 'https://jobs.lever.co/x' };
    await routeMessage(core, cfg, { type: 'joblume:status', tabId: 12 }, page);
    expect(core.status).toHaveBeenCalledWith(7);
    expect(await routeMessage(core, cfg, { type: 'joblume:status', tabId: 12 }, { url: 'https://evil.example/' })).toBeNull();
  });

  it('ignores unknown and malformed messages', async () => {
    const core = fakeCore();
    expect(await routeMessage(core, cfg, 'hello', { tab: { id: 1 } })).toBeNull();
    expect(await routeMessage(core, cfg, null, { tab: { id: 1 } })).toBeNull();
    expect(await routeMessage(core, cfg, { type: 'joblume:nope' }, { tab: { id: 1 } })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w joblume-extension -- tests/payload.test.ts tests/background-core.test.ts tests/router.test.ts`
Expected: FAIL with `Failed to resolve import "../src/payload"` (and the other two modules).

- [ ] **Step 3: Implement**

Create `extension/src/messages.ts`:

```ts
import type { AutofillPayload } from '@joblume/shared';

/** Value of `source` on window.postMessage data sent by the JobLume web page. */
export const WEB_SOURCE = 'joblume-web';
/** Value of `source` on window.postMessage data sent by the extension's bridge. */
export const EXT_SOURCE = 'joblume-extension';

/** Job title and company shown in the popup. They come from the web page, never from the autofill payload. */
export interface JobLabel {
  title: string;
  company: string;
}

/** Messages the background service worker understands. */
export type ToBackground =
  | { type: 'joblume:arm'; payload: unknown; label?: unknown }
  | { type: 'joblume:get-payload' }
  | { type: 'joblume:fetch-cv'; url: string }
  | { type: 'joblume:done'; filled: number }
  | { type: 'joblume:status'; tabId?: number }
  | { type: 'joblume:clear'; tabId?: number };

export type ArmReply = { ok: true } | { ok: false; error: 'invalid_payload' | 'tab_failed' | 'not_allowed' };
export type PayloadReply = { payload: AutofillPayload | null };
export type CvReply = { ok: true; base64: string; contentType: string } | { ok: false; error: string };
export interface StatusReply {
  armed: boolean;
  label: JobLabel | null;
  expiresAt: number | null;
}

/** Sent by the background to the JobLume tab that armed the fill. */
export interface FilledMessage {
  type: 'joblume:filled';
  count: number;
}
```

Create `extension/src/payload.ts`:

```ts
import type { AutofillPayload } from '@joblume/shared';

export type { AutofillPayload };

/** Hard caps; anything longer is rejected, never truncated. */
export const LIMITS = { name: 120, email: 254, phone: 20, city: 80, url: 2048, coverLetter: 10_000, filename: 120 } as const;

const KEYS = [
  'job_url', 'full_name', 'first_name', 'last_name', 'email', 'phone', 'city',
  'linkedin_url', 'github_url', 'portfolio_url', 'cover_letter', 'cv',
] as const;
const PHONE_RE = /^[0-9 +()-]{7,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FILENAME_RE = /^[A-Za-z0-9 _.()-]{1,120}$/;
// eslint-disable-next-line no-control-regex
const BAD_URL_CHARS = /[\x00-\x1f\x7f\s]/;

type Res<T> = { ok: true; value: T } | { ok: false };
const bad = { ok: false } as const;

function optText(v: unknown, max: number): Res<string | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== 'string' || v.length > max) return bad;
  const t = v.trim();
  return { ok: true, value: t === '' ? null : t };
}

/** The normalised https URL, or null when v is not a plain https URL without credentials. */
export function httpsHref(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0 || v.length > LIMITS.url || BAD_URL_CHARS.test(v)) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.hostname === '') return null;
    return u.href;
  } catch {
    return null;
  }
}

function optUrl(v: unknown): Res<string | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  const href = httpsHref(v);
  return href ? { ok: true, value: href } : bad;
}

/** Strict shape check of what the web page sent. Returns a clean copy, or null when anything is wrong. */
export function validatePayload(input: unknown): AutofillPayload | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  if (Object.keys(o).some((k) => !(KEYS as readonly string[]).includes(k))) return null;

  const jobUrl = httpsHref(o.job_url);
  if (!jobUrl) return null;

  const fullName = optText(o.full_name, LIMITS.name);
  const firstName = optText(o.first_name, LIMITS.name);
  const lastName = optText(o.last_name, LIMITS.name);
  const email = optText(o.email, LIMITS.email);
  const phone = optText(o.phone, LIMITS.phone);
  const city = optText(o.city, LIMITS.city);
  const linkedin = optUrl(o.linkedin_url);
  const github = optUrl(o.github_url);
  const portfolio = optUrl(o.portfolio_url);
  const cover = optText(o.cover_letter, LIMITS.coverLetter);
  if (!fullName.ok || !firstName.ok || !lastName.ok || !email.ok || !phone.ok || !city.ok) return null;
  if (!linkedin.ok || !github.ok || !portfolio.ok || !cover.ok) return null;
  if (email.value !== null && !EMAIL_RE.test(email.value)) return null;
  if (phone.value !== null && !PHONE_RE.test(phone.value)) return null;

  let cv: AutofillPayload['cv'] = null;
  if (o.cv !== null && o.cv !== undefined) {
    if (typeof o.cv !== 'object' || Array.isArray(o.cv)) return null;
    const c = o.cv as Record<string, unknown>;
    if (Object.keys(c).some((k) => k !== 'url' && k !== 'filename')) return null;
    const url = httpsHref(c.url);
    if (!url || typeof c.filename !== 'string' || !FILENAME_RE.test(c.filename)) return null;
    cv = { url, filename: c.filename };
  }

  return {
    job_url: jobUrl,
    full_name: fullName.value,
    first_name: firstName.value,
    last_name: lastName.value,
    email: email.value,
    phone: phone.value,
    city: city.value,
    linkedin_url: linkedin.value,
    github_url: github.value,
    portfolio_url: portfolio.value,
    cover_letter: cover.value,
    cv,
  };
}
```

Create `extension/src/b64.ts`:

```ts
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
```

Create `extension/src/background-core.ts`:

```ts
import type { AutofillPayload } from '@joblume/shared';
import { bytesToBase64 } from './b64';
import type { ArmReply, CvReply, FilledMessage, JobLabel, StatusReply } from './messages';
import { validatePayload } from './payload';

export const EXPIRY_MS = 30 * 60 * 1000;
export const MAX_CV_BYTES = 10 * 1024 * 1024;
const PREFIX = 'armed:';
const key = (tabId: number) => `${PREFIX}${tabId}`;

export interface ArmedRecord {
  payload: AutofillPayload;
  label: JobLabel | null;
  expiresAt: number;
  /** The JobLume tab that armed this fill; it is told how many fields were filled. */
  originTabId: number | null;
  /** The signed CV link is fetched at most once. */
  cvFetched: boolean;
}

/** In production chrome.storage.session; a Map in tests. */
export interface SessionStore {
  get(k: string): Promise<unknown>;
  set(k: string, value: unknown): Promise<void>;
  remove(k: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface CoreDeps {
  store: SessionStore;
  /** Opens the job in a new tab and returns its id (null when Chrome gave none). */
  openTab(url: string): Promise<number | null>;
  notifyTab(tabId: number, msg: FilledMessage): Promise<void>;
  fetchImpl(url: string, init: RequestInit): Promise<Response>;
  now(): number;
  /** Allowed host for the signed CV link: an exact host or a wildcard such as *.supabase.co. */
  storageHost: string;
}

export function hostAllowed(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase();
  if (p.startsWith('*.')) return h.length > p.length - 1 && h.endsWith(p.slice(1));
  return h === p;
}

export function cleanLabel(raw: unknown): JobLabel | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.trim().slice(0, 120) : '';
  const company = typeof o.company === 'string' ? o.company.trim().slice(0, 120) : '';
  return title || company ? { title, company } : null;
}

export function createBackground(d: CoreDeps) {
  async function read(tabId: number): Promise<ArmedRecord | null> {
    const raw = (await d.store.get(key(tabId))) as ArmedRecord | undefined;
    if (!raw) return null;
    if (raw.expiresAt <= d.now()) {
      await d.store.remove(key(tabId));
      return null;
    }
    return raw;
  }

  async function sweep(): Promise<void> {
    for (const k of await d.store.keys()) {
      if (!k.startsWith(PREFIX)) continue;
      const rec = (await d.store.get(k)) as ArmedRecord | undefined;
      if (!rec || rec.expiresAt <= d.now()) await d.store.remove(k);
    }
  }

  return {
    async arm(raw: unknown, rawLabel: unknown, originTabId: number | null): Promise<ArmReply> {
      const payload = validatePayload(raw);
      if (!payload) return { ok: false, error: 'invalid_payload' };
      await sweep();
      const tabId = await d.openTab(payload.job_url);
      if (tabId === null) return { ok: false, error: 'tab_failed' };
      const record: ArmedRecord = { payload, label: cleanLabel(rawLabel), expiresAt: d.now() + EXPIRY_MS, originTabId, cvFetched: false };
      await d.store.set(key(tabId), record);
      return { ok: true };
    },

    async getPayload(tabId: number): Promise<AutofillPayload | null> {
      return (await read(tabId))?.payload ?? null;
    },

    async fetchCv(tabId: number, url: string): Promise<CvReply> {
      const rec = await read(tabId);
      if (!rec?.payload.cv) return { ok: false, error: 'no_cv' };
      if (rec.payload.cv.url !== url) return { ok: false, error: 'url_mismatch' };
      if (rec.cvFetched) return { ok: false, error: 'already_used' };
      let u: URL;
      try {
        u = new URL(url);
      } catch {
        return { ok: false, error: 'bad_url' };
      }
      if (u.protocol !== 'https:' || !hostAllowed(u.hostname, d.storageHost)) return { ok: false, error: 'host_not_allowed' };
      try {
        const res = await d.fetchImpl(url, { credentials: 'omit', redirect: 'error', cache: 'no-store' });
        if (!res.ok) return { ok: false, error: `http_${res.status}` };
        if (Number(res.headers.get('content-length') ?? '0') > MAX_CV_BYTES) return { ok: false, error: 'too_large' };
        const buf = await res.arrayBuffer();
        if (buf.byteLength > MAX_CV_BYTES) return { ok: false, error: 'too_large' };
        await d.store.set(key(tabId), { ...rec, cvFetched: true });
        return { ok: true, base64: bytesToBase64(new Uint8Array(buf)), contentType: 'application/pdf' };
      } catch {
        return { ok: false, error: 'fetch_failed' };
      }
    },

    /** The form was filled: forget the payload and tell the JobLume tab how many fields were filled. */
    async complete(tabId: number, filled: number): Promise<void> {
      const rec = await read(tabId);
      await d.store.remove(key(tabId));
      if (rec?.originTabId != null) {
        try {
          await d.notifyTab(rec.originTabId, { type: 'joblume:filled', count: filled });
        } catch {
          // The JobLume tab may be closed; nothing to do.
        }
      }
    },

    async clear(tabId: number): Promise<void> {
      await d.store.remove(key(tabId));
    },

    async status(tabId: number): Promise<StatusReply> {
      const rec = await read(tabId);
      return rec ? { armed: true, label: rec.label, expiresAt: rec.expiresAt } : { armed: false, label: null, expiresAt: null };
    },

    async onTabRemoved(tabId: number): Promise<void> {
      await d.store.remove(key(tabId));
    },
  };
}

export type Background = ReturnType<typeof createBackground>;
```

Create `extension/src/router.ts`:

```ts
import type { Background } from './background-core';
import type { ArmReply, CvReply, PayloadReply, StatusReply } from './messages';

export interface Sender {
  tab?: { id?: number };
  url?: string;
}

export interface RouterConfig {
  /** Origins of the JobLume web app: the only senders that may arm a fill. */
  joblumeOrigins: string[];
  /** chrome.runtime.getURL('') of this extension: only the popup (no tab) may name a tab id. */
  extensionBase: string;
}

export type RouterReply = ArmReply | PayloadReply | CvReply | StatusReply | { ok: true } | null;

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Routes one runtime message to the background core. Unknown or malformed messages get null. */
export async function routeMessage(core: Background, cfg: RouterConfig, msg: unknown, sender: Sender): Promise<RouterReply> {
  if (typeof msg !== 'object' || msg === null) return null;
  const m = msg as Record<string, unknown>;
  const senderTab = sender.tab?.id;

  switch (m.type) {
    case 'joblume:arm': {
      const origin = originOf(sender.url);
      if (senderTab === undefined || origin === null || !cfg.joblumeOrigins.includes(origin)) return { ok: false, error: 'not_allowed' };
      return core.arm(m.payload, m.label, senderTab);
    }
    case 'joblume:get-payload':
      return senderTab === undefined ? null : { payload: await core.getPayload(senderTab) };
    case 'joblume:fetch-cv':
      return senderTab === undefined || typeof m.url !== 'string' ? null : core.fetchCv(senderTab, m.url);
    case 'joblume:done':
      if (senderTab === undefined || typeof m.filled !== 'number' || !Number.isInteger(m.filled) || m.filled < 0) return null;
      await core.complete(senderTab, m.filled);
      return { ok: true };
    case 'joblume:status':
    case 'joblume:clear': {
      const fromPopup = senderTab === undefined && typeof sender.url === 'string' && sender.url.startsWith(cfg.extensionBase);
      const tabId = senderTab ?? (fromPopup && typeof m.tabId === 'number' ? m.tabId : undefined);
      if (tabId === undefined) return null;
      if (m.type === 'joblume:status') return core.status(tabId);
      await core.clear(tabId);
      return { ok: true };
    }
    default:
      return null;
  }
}
```

Create `extension/src/background.ts` (the thin Chrome wiring; it is covered by the build and the manual checklist, not by unit tests):

```ts
import { createBackground, type SessionStore } from './background-core';
import { routeMessage } from './router';

const store: SessionStore = {
  async get(k) {
    return (await chrome.storage.session.get(k))[k];
  },
  async set(k, value) {
    await chrome.storage.session.set({ [k]: value });
  },
  async remove(k) {
    await chrome.storage.session.remove(k);
  },
  async keys() {
    return Object.keys(await chrome.storage.session.get(null));
  },
};

const core = createBackground({
  store,
  openTab: async (url) => (await chrome.tabs.create({ url })).id ?? null,
  notifyTab: async (tabId, msg) => {
    await chrome.tabs.sendMessage(tabId, msg);
  },
  fetchImpl: (url, init) => fetch(url, init),
  now: () => Date.now(),
  storageHost: __STORAGE_HOST__,
});

// Listeners must be registered synchronously at the top level of a service worker.
chrome.tabs.onRemoved.addListener((tabId) => {
  void core.onTabRemoved(tabId);
});

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  const cfg = { joblumeOrigins: __JOBLUME_ORIGINS__, extensionBase: chrome.runtime.getURL('') };
  void routeMessage(core, cfg, msg, sender).then(sendResponse);
  return true;
});
```

- [ ] **Step 4: Confirm the regular expressions kept their backslashes**

Run: `grep -n -E 'BAD_URL_CHARS =|EMAIL_RE =|PHONE_RE =' extension/src/payload.ts`
Expected: the three lines show `/[\x00-\x1f\x7f\s]/`, `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` and `/^[0-9 +()-]{7,20}$/` with their backslashes.

- [ ] **Step 5: Run the tests and the type check**

Run: `npm test -w joblume-extension -- tests/payload.test.ts tests/background-core.test.ts tests/router.test.ts && npm run typecheck -w joblume-extension`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add extension/src/messages.ts extension/src/payload.ts extension/src/b64.ts extension/src/background-core.ts extension/src/router.ts extension/src/background.ts extension/tests/payload.test.ts extension/tests/background-core.test.ts extension/tests/router.test.ts
git commit -m "feat(extension): strict payload validator and background arming, expiry and CV fetch

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Web bridge content script (handshake with origin checks)

**Files:**
- Create: `extension/src/bridge-core.ts`, `extension/src/content/bridge.ts`
- Test (create): `extension/tests/bridge.test.ts`

**Interfaces:**
- Consumes: `WEB_SOURCE`, `EXT_SOURCE` from `src/messages.ts` (Task 5); the background message `joblume:arm` and its `ArmReply`; the background's `{ type: 'joblume:filled', count }` message.
- Produces: `installBridge(win: Window, rt: BridgeRuntime): () => void` and `BridgeRuntime { sendMessage(msg): Promise<unknown>; onMessage(cb): void }`. Page-facing protocol (what Task 11 uses): the page posts `{ source: 'joblume-web', type: 'ping' }` and gets `{ source: 'joblume-extension', type: 'pong' }`; posts `{ source: 'joblume-web', type: 'fill', payload, label }` and gets `{ source: 'joblume-extension', type: 'armed', ok: true }` or `{ ..., ok: false, error }`; later receives `{ source: 'joblume-extension', type: 'filled', count }`. All posts target `location.origin`.

- [ ] **Step 1: Write the failing test**

Create `extension/tests/bridge.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBridge, type BridgeRuntime } from '../src/bridge-core';
import { payload } from './helpers/dom';

type Send = (msg: unknown) => Promise<unknown>;

function setup(reply: unknown = { ok: true }) {
  const sendMessage = vi.fn<Send>().mockImplementation(async () => reply);
  let listener: ((msg: unknown) => void) | undefined;
  const rt: BridgeRuntime = { sendMessage, onMessage: (cb) => { listener = cb; } };
  const post = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
  const remove = installBridge(window, rt);
  return { sendMessage, post, remove, fromBackground: (m: unknown) => listener?.(m) };
}

function deliver(data: unknown, init: { origin?: string; source?: Window | null } = {}) {
  window.dispatchEvent(new MessageEvent('message', { data, origin: init.origin ?? window.location.origin, source: init.source === undefined ? window : init.source }));
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('web bridge', () => {
  let remove: (() => void) | undefined;
  beforeEach(() => {
    remove = undefined;
  });
  afterEach(() => {
    remove?.();
    vi.restoreAllMocks();
  });

  it('answers a ping from the page with a pong on the same origin', () => {
    const t = setup();
    remove = t.remove;
    deliver({ source: 'joblume-web', type: 'ping' });
    expect(t.post).toHaveBeenCalledWith({ source: 'joblume-extension', type: 'pong' }, window.location.origin);
  });

  it('ignores messages from another origin, another window, or without the JobLume source tag', () => {
    const t = setup();
    remove = t.remove;
    deliver({ source: 'joblume-web', type: 'ping' }, { origin: 'https://evil.example' });
    deliver({ source: 'joblume-web', type: 'ping' }, { source: null });
    deliver({ source: 'joblume-web', type: 'ping' }, { source: {} as Window });
    deliver({ source: 'something-else', type: 'ping' });
    deliver('ping');
    deliver(null);
    expect(t.post).not.toHaveBeenCalled();
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it('forwards a fill request to the background and tells the page whether it was armed', async () => {
    const t = setup({ ok: true });
    remove = t.remove;
    const label = { title: 'Data Analyst', company: 'Acme' };
    deliver({ source: 'joblume-web', type: 'fill', payload: payload(), label });
    await flush();
    expect(t.sendMessage).toHaveBeenCalledWith({ type: 'joblume:arm', payload: payload(), label });
    expect(t.post).toHaveBeenCalledWith({ source: 'joblume-extension', type: 'armed', ok: true }, window.location.origin);
  });

  it('reports a rejected or unanswered fill as not armed', async () => {
    const rejected = setup({ ok: false, error: 'invalid_payload' });
    remove = rejected.remove;
    deliver({ source: 'joblume-web', type: 'fill', payload: { nope: 1 } });
    await flush();
    expect(rejected.post).toHaveBeenCalledWith({ source: 'joblume-extension', type: 'armed', ok: false, error: 'invalid_payload' }, window.location.origin);
    rejected.remove();
    vi.restoreAllMocks();

    const t = setup();
    remove = t.remove;
    t.sendMessage.mockImplementation(async () => { throw new Error('worker asleep'); });
    deliver({ source: 'joblume-web', type: 'fill', payload: payload() });
    await flush();
    expect(t.post).toHaveBeenCalledWith({ source: 'joblume-extension', type: 'armed', ok: false, error: 'no_reply' }, window.location.origin);
  });

  it('does not forward a fill from the wrong origin', async () => {
    const t = setup();
    remove = t.remove;
    deliver({ source: 'joblume-web', type: 'fill', payload: payload() }, { origin: 'https://evil.example' });
    await flush();
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it('relays the filled count from the background to the page and ignores anything else', () => {
    const t = setup();
    remove = t.remove;
    t.fromBackground({ type: 'joblume:filled', count: 6 });
    expect(t.post).toHaveBeenCalledWith({ source: 'joblume-extension', type: 'filled', count: 6 }, window.location.origin);
    t.post.mockClear();
    t.fromBackground({ type: 'joblume:filled', count: 'many' });
    t.fromBackground({ type: 'joblume:filled', count: -2 });
    t.fromBackground({ type: 'other' });
    t.fromBackground(null);
    expect(t.post).not.toHaveBeenCalled();
  });

  it('stops listening once removed', () => {
    const t = setup();
    t.remove();
    deliver({ source: 'joblume-web', type: 'ping' });
    expect(t.post).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w joblume-extension -- tests/bridge.test.ts`
Expected: FAIL with `Failed to resolve import "../src/bridge-core"`.

- [ ] **Step 3: Implement**

Create `extension/src/bridge-core.ts`:

```ts
import { EXT_SOURCE, WEB_SOURCE } from './messages';

export interface BridgeRuntime {
  sendMessage(msg: unknown): Promise<unknown>;
  onMessage(cb: (msg: unknown) => void): void;
}

/**
 * Listens on the JobLume page for the handshake. Only messages the page itself posted
 * (same window, same origin) are considered; everything else is ignored.
 * Returns a function that removes the listener.
 */
export function installBridge(win: Window, rt: BridgeRuntime): () => void {
  const post = (data: Record<string, unknown>) => {
    win.postMessage({ source: EXT_SOURCE, ...data }, win.location.origin);
  };

  const onWindowMessage = (event: MessageEvent) => {
    if (event.source !== win || event.origin !== win.location.origin) return;
    const d: unknown = event.data;
    if (typeof d !== 'object' || d === null) return;
    const msg = d as Record<string, unknown>;
    if (msg.source !== WEB_SOURCE) return;

    if (msg.type === 'ping') {
      post({ type: 'pong' });
      return;
    }
    if (msg.type === 'fill') {
      rt.sendMessage({ type: 'joblume:arm', payload: msg.payload, label: msg.label })
        .then((reply) => {
          const r = reply as { ok?: boolean; error?: string } | null | undefined;
          post(r?.ok === true ? { type: 'armed', ok: true } : { type: 'armed', ok: false, error: r?.error ?? 'no_reply' });
        })
        .catch(() => post({ type: 'armed', ok: false, error: 'no_reply' }));
    }
  };
  win.addEventListener('message', onWindowMessage);

  rt.onMessage((m) => {
    const f = m as { type?: unknown; count?: unknown } | null;
    if (f?.type === 'joblume:filled' && typeof f.count === 'number' && Number.isInteger(f.count) && f.count >= 0) {
      post({ type: 'filled', count: f.count });
    }
  });

  return () => win.removeEventListener('message', onWindowMessage);
}
```

Create `extension/src/content/bridge.ts` (the entry that is injected on the JobLume origins):

```ts
import { installBridge } from '../bridge-core';

installBridge(window, {
  sendMessage: (msg) => chrome.runtime.sendMessage(msg),
  onMessage: (cb) => {
    chrome.runtime.onMessage.addListener((m: unknown) => {
      cb(m);
    });
  },
});
```

- [ ] **Step 4: Run the test and the type check**

Run: `npm test -w joblume-extension -- tests/bridge.test.ts && npm run typecheck -w joblume-extension`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add extension/src/bridge-core.ts extension/src/content/bridge.ts extension/tests/bridge.test.ts
git commit -m "feat(extension): web bridge content script with same-window same-origin checks

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Field-fill engine primitives (labels, native setters, events, file attach, waiting)

**Files:**
- Create: `extension/src/fill/labels.ts`, `extension/src/fill/engine.ts`, `extension/src/fill/wait.ts`
- Test (create): `extension/tests/engine.test.ts`

**Interfaces:**
- Consumes: `AutofillPayload` (type), test helpers from Task 4 (`allowFileAssignment`, `cvFile`, `fileNames`, `installFakeDataTransfer`, `payload`, `recordEvents`).
- Produces:
  - `src/fill/labels.ts`: `normaliseLabel(s): string`, `labelText(el: Element): string` (aria-label, aria-labelledby, `label[for]`, wrapping label), `isSensitive(el: Element): boolean` (password, gender, race, ethnic, veteran, disabilit, sponsor, salary, compensation, referr, hear about, hispanic, latino, checked on label text, `name` and `id`).
  - `src/fill/engine.ts`: `type TextSlot`, `type FileSlot`, `type Slot`, `TEXT_SLOTS`, `interface Adapter { id: 'greenhouse' | 'lever' | 'ashby' | 'workable'; hosts: readonly string[]; find(doc: Document, slot: Slot): HTMLElement | null }`, `FillResult { filled: number; slots: Slot[] }`, `setNativeValue(el, value)`, `fireFieldEvents(el)`, `fillTextControl(el, value): boolean`, `acceptsFile(accept, mime, ext): boolean`, `attachFile(input, file): boolean`, `textValueFor(slot, payload): string | null`, `formPresent(doc, adapter): boolean`, `fillForm(doc, adapter, payload, cv: File | null): FillResult`, `isTextControl`, `isFileControl`, `OUTLINE`.
  - `src/fill/wait.ts`: `waitFor<T>(doc, probe: () => T | null, timeoutMs): Promise<T | null>`, `sleep(ms)`.
  - Slots: text `full_name first_name last_name email phone city linkedin github portfolio cover_text`; file `cv_file cover_file`.

- [ ] **Step 1: Write the failing test**

Create `extension/tests/engine.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptsFile, attachFile, fillForm, fillTextControl, formPresent, setNativeValue, textValueFor,
  type Adapter, type Slot,
} from '../src/fill/engine';
import { isSensitive, labelText, normaliseLabel } from '../src/fill/labels';
import { sleep, waitFor } from '../src/fill/wait';
import { allowFileAssignment, cvFile, fileNames, installFakeDataTransfer, payload, recordEvents } from './helpers/dom';

beforeEach(() => {
  document.body.innerHTML = '';
  installFakeDataTransfer();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('labels', () => {
  it('normalises stars, optional markers and spacing', () => {
    expect(normaliseLabel('  First  Name ✱ ')).toBe('first name');
    expect(normaliseLabel('Cover letter (Optional)')).toBe('cover letter');
    expect(normaliseLabel('Email*')).toBe('email');
  });

  it('reads aria-label, aria-labelledby, label[for] and a wrapping label', () => {
    document.body.innerHTML = `
      <input id="a" aria-label="Alpha">
      <span id="lb">Beta</span><input id="b" aria-labelledby="lb">
      <label for="c">Gamma</label><input id="c">
      <label>Delta <input id="d"></label>`;
    expect(labelText(document.getElementById('a')!)).toBe('alpha');
    expect(labelText(document.getElementById('b')!)).toBe('beta');
    expect(labelText(document.getElementById('c')!)).toBe('gamma');
    expect(labelText(document.getElementById('d')!)).toContain('delta');
  });

  it.each([
    'Password', 'Gender', 'What is your race?', 'Race & Ethnicity', 'Are you Hispanic/Latino?', 'Veteran Status', 'Disability status',
    'Will you require visa sponsorship?', 'Expected salary', 'Salary expectations', 'Referral source', 'How did you hear about us?',
  ])('treats "%s" as sensitive', (text) => {
    document.body.innerHTML = `<label for="x">${text}</label><input id="x">`;
    expect(isSensitive(document.getElementById('x')!)).toBe(true);
  });

  it('also catches a sensitive name or id when the label is missing', () => {
    document.body.innerHTML = '<input name="veteran_status"><input id="gender">';
    expect(isSensitive(document.querySelector('[name="veteran_status"]')!)).toBe(true);
    expect(isSensitive(document.getElementById('gender')!)).toBe(true);
  });

  it('does not flag ordinary contact fields', () => {
    document.body.innerHTML = '<label for="x">LinkedIn Profile</label><input id="x"><label for="y">Phone</label><input id="y">';
    expect(isSensitive(document.getElementById('x')!)).toBe(false);
    expect(isSensitive(document.getElementById('y')!)).toBe(false);
  });
});

describe('setNativeValue and fillTextControl', () => {
  it('sets the value through the prototype setter, bypassing a framework value tracker on the element', () => {
    const input = document.createElement('input');
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    const tracked: string[] = [];
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return proto.get!.call(this); },
      set(v: string) { tracked.push(v); proto.set!.call(this, v); },
    });
    setNativeValue(input, 'Ada');
    expect(input.value).toBe('Ada');
    expect(tracked).toEqual([]);
  });

  it('works for textareas too', () => {
    const area = document.createElement('textarea');
    setNativeValue(area, 'Dear team');
    expect(area.value).toBe('Dear team');
  });

  it('fills, fires input, change, blur and focusout, and outlines the field', () => {
    document.body.innerHTML = '<input id="a" type="text">';
    const input = document.getElementById('a') as HTMLInputElement;
    const seen = recordEvents(input);
    expect(fillTextControl(input, 'Ada')).toBe(true);
    expect(input.value).toBe('Ada');
    expect(seen).toEqual(['input', 'change', 'blur', 'focusout']);
    expect(input.style.outline).toContain('solid');
  });

  it('never overwrites a value, and skips disabled, read-only, combobox and sensitive controls', () => {
    document.body.innerHTML = `
      <input id="filled" value="Grace">
      <input id="off" disabled>
      <input id="ro" readonly>
      <input id="combo" role="combobox">
      <label for="g">Gender</label><input id="g">`;
    for (const id of ['filled', 'off', 'ro', 'combo', 'g']) {
      expect(fillTextControl(document.getElementById(id) as HTMLInputElement, 'Ada')).toBe(false);
    }
    expect((document.getElementById('filled') as HTMLInputElement).value).toBe('Grace');
    expect((document.getElementById('g') as HTMLInputElement).value).toBe('');
  });
});

describe('attachFile', () => {
  it('assigns the file through DataTransfer and fires input and change', () => {
    document.body.innerHTML = '<input id="f" type="file" accept=".pdf,.docx">';
    allowFileAssignment(document);
    const input = document.getElementById('f') as HTMLInputElement;
    const seen = recordEvents(input);
    expect(attachFile(input, cvFile())).toBe(true);
    expect(fileNames(input)).toEqual(['Ada Lovelace CV.pdf']);
    expect(seen).toEqual(['input', 'change']);
  });

  it('skips an input that already has a file, is disabled, or does not accept the file type', () => {
    document.body.innerHTML = '<input id="a" type="file"><input id="b" type="file" disabled><input id="c" type="file" accept=".png,image/*">';
    allowFileAssignment(document);
    const [a, b, c] = ['a', 'b', 'c'].map((id) => document.getElementById(id) as HTMLInputElement);
    expect(attachFile(a!, cvFile())).toBe(true);
    expect(attachFile(a!, cvFile())).toBe(false);
    expect(attachFile(b!, cvFile())).toBe(false);
    expect(attachFile(c!, cvFile())).toBe(false);
  });

  it('returns false instead of throwing when DataTransfer is unavailable', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('DataTransfer', undefined);
    document.body.innerHTML = '<input id="f" type="file">';
    expect(attachFile(document.getElementById('f') as HTMLInputElement, cvFile())).toBe(false);
  });

  it('checks accept lists by mime type, extension and wildcard', () => {
    expect(acceptsFile('', 'application/pdf', '.pdf')).toBe(true);
    expect(acceptsFile('.pdf,.doc', 'application/pdf', '.pdf')).toBe(true);
    expect(acceptsFile('application/pdf', 'application/pdf', '.pdf')).toBe(true);
    expect(acceptsFile('image/*', 'image/png', '.png')).toBe(true);
    expect(acceptsFile('image/*', 'application/pdf', '.pdf')).toBe(false);
    expect(acceptsFile('.txt', 'application/pdf', '.pdf')).toBe(false);
  });
});

describe('textValueFor', () => {
  it('maps slots to payload fields and builds a full name when only parts exist', () => {
    const p = payload();
    expect(textValueFor('linkedin', p)).toBe(p.linkedin_url);
    expect(textValueFor('cover_text', p)).toBe(p.cover_letter);
    expect(textValueFor('full_name', payload({ full_name: null }))).toBe('Ada Lovelace');
    expect(textValueFor('full_name', payload({ full_name: null, first_name: null, last_name: null }))).toBeNull();
  });
});

describe('fillForm', () => {
  const adapter: Adapter = {
    id: 'lever',
    hosts: ['example.test'],
    find: (doc: Document, slot: Slot) => doc.querySelector<HTMLElement>(`[data-slot="${slot}"]`),
  };

  it('fills text, cv and cover letter slots and counts them', () => {
    document.body.innerHTML = `
      <input data-slot="email"><input data-slot="phone"><textarea data-slot="cover_text"></textarea>
      <input data-slot="cv_file" type="file">`;
    allowFileAssignment(document);
    const res = fillForm(document, adapter, payload(), cvFile());
    expect(res.slots).toEqual(['email', 'phone', 'cover_text', 'cv_file']);
    expect(res.filled).toBe(4);
  });

  it('attaches the cover letter as cover-letter.txt when there is only a file input for it', () => {
    document.body.innerHTML = '<input data-slot="cover_file" type="file" accept=".pdf,.txt">';
    allowFileAssignment(document);
    const res = fillForm(document, adapter, payload(), null);
    expect(res.slots).toEqual(['cover_file']);
    const input = document.querySelector('input') as HTMLInputElement;
    expect(fileNames(input)).toEqual(['cover-letter.txt']);
    expect(input.files?.[0]?.type).toBe('text/plain');
  });

  it('skips slots with no value, no field, or a field of the wrong kind', () => {
    document.body.innerHTML = '<input data-slot="github" type="file"><input data-slot="city">';
    const res = fillForm(document, adapter, payload({ city: null }), null);
    expect(res).toEqual({ filled: 0, slots: [] });
  });

  it('detects a form only when a standard field exists', () => {
    expect(formPresent(document, adapter)).toBe(false);
    document.body.innerHTML = '<input data-slot="email">';
    expect(formPresent(document, adapter)).toBe(true);
  });

  it('never clicks or submits anything', () => {
    document.body.innerHTML = '<form><input data-slot="email"><button type="submit">Submit application</button></form>';
    const click = vi.spyOn(HTMLElement.prototype, 'click');
    const submit = vi.fn();
    document.querySelector('form')!.addEventListener('submit', submit);
    fillForm(document, adapter, payload(), null);
    expect(click).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('waitFor', () => {
  it('resolves at once when the probe already succeeds', async () => {
    expect(await waitFor(document, () => 'yes', 1000)).toBe('yes');
  });

  it('resolves when the DOM changes and the probe starts to succeed', async () => {
    const p = waitFor(document, () => (document.getElementById('late') ? true : null), 1000);
    await sleep(10);
    document.body.innerHTML = '<div id="late"></div>';
    expect(await p).toBe(true);
  });

  it('gives up with null after the time cap', async () => {
    expect(await waitFor(document, () => null, 30)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w joblume-extension -- tests/engine.test.ts`
Expected: FAIL with `Failed to resolve import "../src/fill/engine"`.

- [ ] **Step 3: Implement**

Create `extension/src/fill/labels.ts`:

```ts
/** Lower-case, no required-field stars, no "(optional)", single spaces. */
export function normaliseLabel(s: string): string {
  return s
    .replace(/[*✱]/g, ' ')
    .replace(/\(optional\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The human label of a form control: aria-label, aria-labelledby targets, label[for] and a wrapping label. */
export function labelText(el: Element): string {
  const doc = el.ownerDocument;
  const parts: string[] = [];
  const aria = el.getAttribute('aria-label');
  if (aria) parts.push(aria);
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    for (const id of by.split(/\s+/)) {
      const text = id ? doc.getElementById(id)?.textContent : null;
      if (text) parts.push(text);
    }
  }
  if (el.id) {
    for (const label of Array.from(doc.querySelectorAll('label'))) {
      if (label.htmlFor === el.id) parts.push(label.textContent ?? '');
    }
  }
  const wrapping = el.closest('label');
  if (wrapping) parts.push(wrapping.textContent ?? '');
  return normaliseLabel(parts.join(' '));
}

/** Questions the extension must never answer, whatever field they sit in. */
const SENSITIVE =
  /password|gender|\brace\b|racial|ethnic|veteran|disabilit|sponsor|salary|compensation|referr|hear about|hispanic|latino/;

/** Label plus name and id, so a control with a telling name but no label is still caught. */
export function isSensitive(el: Element): boolean {
  const name = el.getAttribute('name') ?? '';
  return SENSITIVE.test(`${labelText(el)} ${name.toLowerCase()} ${el.id.toLowerCase()}`);
}
```

Create `extension/src/fill/engine.ts`:

```ts
import type { AutofillPayload } from '@joblume/shared';
import { isSensitive } from './labels';

export type TextSlot =
  | 'full_name' | 'first_name' | 'last_name' | 'email' | 'phone' | 'city'
  | 'linkedin' | 'github' | 'portfolio' | 'cover_text';
export type FileSlot = 'cv_file' | 'cover_file';
export type Slot = TextSlot | FileSlot;

export const TEXT_SLOTS: readonly TextSlot[] = [
  'full_name', 'first_name', 'last_name', 'email', 'phone', 'city', 'linkedin', 'github', 'portfolio', 'cover_text',
];

/** One employer platform: which hosts it owns and how to find each standard field on its form. */
export interface Adapter {
  id: 'greenhouse' | 'lever' | 'ashby' | 'workable';
  hosts: readonly string[];
  find(doc: Document, slot: Slot): HTMLElement | null;
}

export interface FillResult {
  filled: number;
  slots: Slot[];
}

const TEXT_INPUT_TYPES = new Set(['text', 'email', 'tel', 'url', 'search']);
export const OUTLINE = '2px solid #93c5fd';

export function isTextControl(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && TEXT_INPUT_TYPES.has((el as HTMLInputElement).type);
}

export function isFileControl(el: Element | null): el is HTMLInputElement {
  return el?.tagName === 'INPUT' && (el as HTMLInputElement).type === 'file';
}

/** Sets .value through the prototype setter so React and Vue notice the change. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

export function fireFieldEvents(el: HTMLElement): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur'));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

/** Fills one text control. Skips disabled, read-only, combobox, sensitive and already-filled controls. */
export function fillTextControl(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  if (value === '' || el.disabled || el.readOnly) return false;
  if (el.getAttribute('role') === 'combobox') return false;
  if (el.value.trim() !== '') return false;
  if (isSensitive(el)) return false;
  setNativeValue(el, value);
  fireFieldEvents(el);
  el.style.outline = OUTLINE;
  el.style.outlineOffset = '1px';
  return true;
}

/** True when the input's accept list (empty means anything) allows this kind of file. */
export function acceptsFile(accept: string, mime: string, ext: string): boolean {
  const list = accept.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length === 0) return true;
  return list.some((a) => a === mime || a === ext || (a.endsWith('/*') && mime.startsWith(a.slice(0, -1))));
}

/** Gives a file input a file the way a user pick would: DataTransfer, then input and change events. */
export function attachFile(input: HTMLInputElement, file: File): boolean {
  if (input.disabled || (input.files?.length ?? 0) > 0) return false;
  if (isSensitive(input)) return false;
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  if (!acceptsFile(input.accept, file.type, ext)) return false;
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  } catch {
    return false;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

export function textValueFor(slot: TextSlot, p: AutofillPayload): string | null {
  switch (slot) {
    case 'full_name':
      return p.full_name ?? ([p.first_name, p.last_name].filter(Boolean).join(' ') || null);
    case 'first_name':
      return p.first_name;
    case 'last_name':
      return p.last_name;
    case 'email':
      return p.email;
    case 'phone':
      return p.phone;
    case 'city':
      return p.city;
    case 'linkedin':
      return p.linkedin_url;
    case 'github':
      return p.github_url;
    case 'portfolio':
      return p.portfolio_url;
    case 'cover_text':
      return p.cover_letter;
  }
}

/** True once the page shows at least one field this adapter can fill. */
export function formPresent(doc: Document, adapter: Adapter): boolean {
  return (['email', 'full_name', 'first_name', 'cv_file'] as const).some((s) => adapter.find(doc, s) !== null);
}

/**
 * Fills every standard field the adapter finds. Never clicks, never submits, never overwrites.
 * `cv` is the already-downloaded CV file (null when there is none).
 */
export function fillForm(doc: Document, adapter: Adapter, payload: AutofillPayload, cv: File | null): FillResult {
  const slots: Slot[] = [];

  for (const slot of TEXT_SLOTS) {
    const value = textValueFor(slot, payload);
    if (!value) continue;
    const el = adapter.find(doc, slot);
    if (isTextControl(el) && fillTextControl(el, value)) slots.push(slot);
  }

  if (cv) {
    const input = adapter.find(doc, 'cv_file');
    if (isFileControl(input) && attachFile(input, cv)) slots.push('cv_file');
  }

  // A cover letter goes into a text box when the form has one; otherwise into a file input as a .txt file.
  if (payload.cover_letter && !slots.includes('cover_text')) {
    const input = adapter.find(doc, 'cover_file');
    if (isFileControl(input)) {
      const file = new File([payload.cover_letter], 'cover-letter.txt', { type: 'text/plain' });
      if (attachFile(input, file)) slots.push('cover_file');
    }
  }

  return { filled: slots.length, slots };
}
```

Create `extension/src/fill/wait.ts`:

```ts
/**
 * Resolves with the probe's first non-null result: now if it already has one, otherwise on the first DOM change
 * that makes it succeed, or null after timeoutMs.
 */
export function waitFor<T>(doc: Document, probe: () => T | null, timeoutMs: number): Promise<T | null> {
  const now = probe();
  if (now !== null) return Promise.resolve(now);
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const obs = new MutationObserver(() => {
      const v = probe();
      if (v !== null) finish(v);
    });
    function finish(v: T | null) {
      obs.disconnect();
      if (timer !== undefined) clearTimeout(timer);
      resolve(v);
    }
    timer = setTimeout(() => finish(null), timeoutMs);
    obs.observe(doc.documentElement, { childList: true, subtree: true, attributes: true });
  });
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
```

- [ ] **Step 4: Confirm the backslashes survived**

Run: `grep -n -F -e 'SENSITIVE' -e '\s+' -e '\brace\b' extension/src/fill/labels.ts`
Expected: five lines: two containing `\s+`, two containing `SENSITIVE` and one containing `\brace\b`, each with its backslashes intact.

- [ ] **Step 5: Run the test and the type check**

Run: `npm test -w joblume-extension -- tests/engine.test.ts && npm run typecheck -w joblume-extension`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add extension/src/fill/labels.ts extension/src/fill/engine.ts extension/src/fill/wait.ts extension/tests/engine.test.ts
git commit -m "feat(extension): fill engine with native setters, events, file attach and sensitive-field guard

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Greenhouse and Lever adapters

Both platforms were **verified against live static HTML** (see the verification table). Their fixtures are real captures.

**Files:**
- Create: `extension/src/adapters/shared.ts`, `extension/src/adapters/greenhouse.ts`, `extension/src/adapters/lever.ts`, `extension/src/adapters/index.ts`
- Create fixtures: `extension/tests/fixtures/greenhouse-form.html`, `extension/tests/fixtures/lever-form.html`
- Test (create): `extension/tests/adapters/greenhouse.test.ts`, `extension/tests/adapters/lever.test.ts`

**Interfaces:**
- Consumes: `Adapter`, `Slot`, `fillForm`, `formPresent` (Task 7); `isSensitive`, `labelText` (Task 7); test helpers (Task 4).
- Produces: `byLabel(doc, pattern, tag?): HTMLInputElement | HTMLTextAreaElement | null`, `byId(doc, id)`, `LABEL` patterns (`src/adapters/shared.ts`); `greenhouse: Adapter` (hosts `boards.greenhouse.io`, `job-boards.greenhouse.io`), `lever: Adapter` (host `jobs.lever.co`); `ADAPTERS: readonly Adapter[]` and `adapterForHost(host: string): Adapter | null` (`src/adapters/index.ts`).

- [ ] **Step 1: Save the real fixtures (exactly as given, one long line each)**

Create `extension/tests/fixtures/greenhouse-form.html` (captured from `https://job-boards.greenhouse.io/gitlab/jobs/8860302002`):

```html
<form id="application-form"><div><div><div><div><label id="first_name-label" for="first_name">First Name<span>*</span></label><input id="first_name" aria-label="First Name" aria-required="true" type="text" autocomplete="given-name" value=""></div></div></div><div><div><div><label id="last_name-label" for="last_name">Last Name<span>*</span></label><input id="last_name" aria-label="Last Name" aria-required="true" type="text" autocomplete="family-name" value=""></div></div></div><div><div><div><label id="email-label" for="email">Email<span>*</span></label><input id="email" aria-label="Email" aria-required="true" type="text" autocomplete="email" value=""></div></div></div><div><fieldset><legend>Phone</legend><div><div><div><label id="country-label" for="country">Country</label><div><div><div><div><div id="react-select-country-placeholder"></div><div><input autocomplete="off" id="country" type="text" aria-labelledby="country-label" aria-required="false" role="combobox" value=""></div></div><div><button type="button" aria-label="Toggle flyout"></button></div></div></div></div></div></div></div><div><div><div><label id="phone-label" for="phone">Phone</label><input id="phone" aria-label="Phone" aria-required="false" type="tel"></div></div></div></fieldset></div><div><div role="group" aria-labelledby="upload-label-resume" aria-required="true"><div id="upload-label-resume">Resume/CV<span>*</span></div><div><div><div><div><button type="button">Attach</button><label for="resume">Attach</label><input id="resume" type="file" accept=".pdf,.doc,.docx,.txt,.rtf"></div></div><div><div><button type="button" data-testid="resume-text">Enter manually</button><label for="resume_text">Enter manually</label></div></div><p id="accepted-filetypes">Accepted file types: pdf, doc, docx, txt, rtf</p></div></div></div></div><div><div role="group" aria-labelledby="upload-label-cover_letter" aria-required="false"><div id="upload-label-cover_letter">Cover Letter</div><div><div><div><div><button type="button">Attach</button><label for="cover_letter">Attach</label><input id="cover_letter" type="file" accept=".pdf,.doc,.docx,.txt,.rtf"></div></div><div><div><button type="button" data-testid="cover_letter-text">Enter manually</button><label for="cover_letter_text">Enter manually</label></div></div><p id="accepted-filetypes">Accepted file types: pdf, doc, docx, txt, rtf</p></div></div></div></div></div><div><hr><div><div><div><label id="question_38624168002-label" for="question_38624168002">LinkedIn Profile</label><input id="question_38624168002" aria-label="LinkedIn Profile" aria-required="false" type="text" value=""></div></div></div><div><div><div><label id="question_38624169002-label" for="question_38624169002">What's the name you'd prefer us to use throughout the interview process?</label><input id="question_38624169002" aria-label="What's the name you'd prefer us to use throughout the interview process?" aria-required="false" type="text" value=""></div></div></div><div><div><div><label id="question_38624170002-label" for="question_38624170002">Are you subject to any employment agreements and/or post-employment restrictions with your current employer or a past employer?<span>*</span></label><div><div><div><div><div id="react-select-question_38624170002-placeholder">Select...</div><div><input autocomplete="off" id="question_38624170002" type="text" aria-labelledby="question_38624170002-label" aria-required="true" role="combobox" value=""></div></div><div><button type="button" aria-label="Toggle flyout"></button></div></div></div><input required="" value=""></div></div></div></div><div><div><div><label id="question_38624171002-label" for="question_38624171002">It is important to us to create an accessible and inclusive interview experience. Please let us know if there are any adjustments we can make to assist you during the hiring and interview process.</label><input id="question_38624171002" aria-label="It is important to us to create an accessible and inclusive interview experience. Please let us know if there are any adjustments we can make to assist you during the hiring and interview process." aria-required="false" type="text" value=""></div></div></div><div><div><div><label id="question_38624172002-label" for="question_38624172002">Will you now or in the future require sponsorship for a visa to remain in your current location?<span>*</span></label><div><div><div><div><div id="react-select-question_38624172002-placeholder">Select...</div><div><input autocomplete="off" id="question_38624172002" type="text" aria-labelledby="question_38624172002-label" aria-required="true" role="combobox" value=""></div></div><div><button type="button" aria-label="Toggle flyout"></button></div></div></div><input required="" value=""></div></div></div></div><div><div><div><label id="question_38624173002-label" for="question_38624173002">Have you previously worked at or consulted for GitLab?<span>*</span></label><div><div><div><div><div id="react-select-question_38624173002-placeholder">Select...</div><div><input autocomplete="off" id="question_38624173002" type="text" aria-labelledby="question_38624173002-label" aria-required="true" role="combobox" value=""></div></div><div><button type="button" aria-label="Toggle flyout"></button></div></div></div><input required="" value=""></div></div></div></div><div><div><div><label id="question_38624174002-label" for="question_38624174002">What is your current country of residence?<span>*</span></label><div><div><div><div><div id="react-select-question_38624174002-placeholder">Select...</div><div><input autocomplete="off" id="question_38624174002" type="text" aria-labelledby="question_38624174002-label" aria-required="true" role="combobox" value=""></div></div><div><button type="button" aria-label="Toggle flyout"></button></div></div></div><input required="" value=""></div></div></div></div></div><div><div role="separator"></div><div><h2>Voluntary Self-Identification</h2>


<p>As set forth in GitLab’s Equal Employment Opportunity policy,
we do not discriminate on the basis of any protected group status under any applicable law.</p>
</div><div><div><div><label id="gender-label" for="gender">Gender</label><div><div><div><div><div id="react-select-gender-placeholder">Select...</div><div><input autocomplete="off" id="gender" type="text" aria-labelledby="gender-label" aria-required="false" role="combobox" value=""></div></div><div><button type="button" aria-label="Toggle flyout"></button></div></div></div></div></div></div></div><div><div><div><label id="hispanic_ethnicity-label" for="hispanic_ethnicity">Are you Hispanic/Latino?</label><div><div><div><div><div id="react-select-hispanic_ethnicity-placeholder">Select...</div><div><input autocomplete="off" id="hispanic_ethnicity" type="text" aria-labelledby="hispanic_ethnicity-label" aria-required="false" role="combobox" value=""></div></div><div><button type="button" aria-label="Toggle flyout"></button></div></div></div></div></div></div><a>Race &amp; Ethnicity Definitions</a></div><div>




</div><div><div><div><label id="veteran_status-label" for="veteran_status">Veteran Status</label><div><div><div><div><div id="react-select-veteran_status-placeholder">Select...</div><div><input autocomplete="off" id="veteran_status" type="text" aria-labelledby="veteran_status-label" aria-required="false" role="combobox" value=""></div></div><div><button type="button" aria-label="Toggle flyout"></button></div></div></div></div></div></div></div></div><div><button type="submit">Submit application</button></div></form>
```

Create `extension/tests/fixtures/lever-form.html` (captured from `https://jobs.lever.co/spotify/223f9722-3579-4ff2-b123-e4cc7b0c1a64/apply`):

```html
<form id="application-form"><div><h4>Submit your application</h4><ul><li><label><div>Resume/CV <span>✱</span></div><div><a href="#"><span></span><span>ATTACH RESUME/CV</span><input data-qa="input-resume" id="resume-upload-input" name="resume" type="file"></a><span></span><span><div></div></span><span><div></div></span></div></label><span><p>File exceeds the maximum upload size of <b>100MB</b>. Please try a smaller size.</p></span></li><li><label><div>Full name<span>✱</span></div><div><input type="text" data-qa="name-input" name="name" required=""></div></label></li><li><label><div>Email<span>✱</span></div><div><input name="email" data-qa="email-input" type="email" required=""></div></label></li><li><label><div>Phone <span>✱</span></div><div><input type="text" data-qa="phone-input" name="phone" required=""></div></label></li><li data-qa="structured-contact-location-question"><label><div>Current location <span data-qa="SCL-question-required-asterisk">✱</span></div><div><input data-qa="location-input" id="location-input" type="text" name="location" required=""><div><div></div><div><div></div></div></div></div></label></li><li><label><div>Current company <span>✱</span></div><div><input type="text" data-qa="org-input" name="org" required=""></div></label></li></ul></div><div><h4>Links</h4><ul><li><label><div>LinkedIn URL</div><div><input type="text" name="urls[LinkedIn]"></div></label></li><li><label><div>GitHub URL</div><div><input type="text" name="urls[GitHub]"></div></label></li><li><label><div>Portfolio URL</div><div><input type="text" name="urls[Portfolio]"></div></label></li><li><label><div>Other website</div><div><input type="text" name="urls[Other]"></div></label></li></ul></div><div data-qa="additional-cards"><h4 data-qa="card-name">Previous Spotify Employment</h4><ul><li><div><div><div>Have you ever been previously employed by Spotify?<span>✱</span></div></div><div><ul data-qa="checkboxes"><li><label><input type="checkbox" name="cards[92a51f92-d683-4f7b-be57-e25376f60abe][field0]" value="No"><span>No</span></label></li><li><label><input type="checkbox" name="cards[92a51f92-d683-4f7b-be57-e25376f60abe][field0]" value="Yes - Intern"><span>Yes - Intern</span></label></li><li><label><input type="checkbox" name="cards[92a51f92-d683-4f7b-be57-e25376f60abe][field0]" value="Yes - Full Time Employment"><span>Yes - Full Time Employment</span></label></li></ul></div></div></li></ul></div><div><hr><h4 data-qa="card-name">Demographic Questions for Spotify</h4><ul><li><div><div>What best describes your gender?</div></div><div><ul data-qa="multiple-choice"><li><label><input type="radio" name="surveysResponses[cbf1b3c9-4157-4ddd-a66e-41dae0d8badb][responses][field0]" value="Woman"><span>Woman</span></label></li><li><label><input type="radio" name="surveysResponses[cbf1b3c9-4157-4ddd-a66e-41dae0d8badb][responses][field0]" value="Man"><span>Man</span></label></li><li><label><input type="radio" name="surveysResponses[cbf1b3c9-4157-4ddd-a66e-41dae0d8badb][responses][field0]" value="Non-binary"><span>Non-binary</span></label></li><li><label><input type="radio" name="surveysResponses[cbf1b3c9-4157-4ddd-a66e-41dae0d8badb][responses][field0]" value="I use another term"><span>I use another term</span></label></li><li><label><input type="radio" name="surveysResponses[cbf1b3c9-4157-4ddd-a66e-41dae0d8badb][responses][field0]" value="Prefer not to disclose"><span>Prefer not to disclose</span></label></li></ul></div></li><li><div><div>What is your race/ethnicity?:</div></div><div><ul data-qa="multiple-choice"><li><label><input type="radio" name="surveysResponses[cbf1b3c9-4157-4ddd-a66e-41dae0d8badb][responses][field1]" value="American Indian or Alaska Native"><span>American Indian or Alaska Native</span></label></li><li><label><input type="radio" name="surveysResponses[cbf1b3c9-4157-4ddd-a66e-41dae0d8badb][responses][field1]" value="Asian"><span>Asian</span></label></li><li><label><input type="radio" name="surveysResponses[cbf1b3c9-4157-4ddd-a66e-41dae0d8badb][responses][field1]" value="Black or African American"><span>Black or African American</span></label></li><li><label><input type="radio" name="surveysResponses[cbf1b3c9-4157-4ddd-a66e-41dae0d8badb][responses][field1]" value="Hispanic or Latino"><span>Hispanic or Latino</span></label></li><li><label><input type="radio" name="surveysResponses[cbf1b3c9-4157-4ddd-a66e-41dae0d8badb][responses][field1]" value="Native Hawaiian or Other Pacific Islander"><span>Native Hawaiian or Other Pacific Islander</span></label></li><li><label><input type="radio" name="surveysResponses[cbf1b3c9-4157-4ddd-a66e-41dae0d8badb][responses][field1]" value="Two or More Races"><span>Two or More Races</span></label></li><li><label><input type="radio" name="surveysResponses[cbf1b3c9-4157-4ddd-a66e-41dae0d8badb][responses][field1]" value="White (Not Hispanic or Latino)"><span>White (Not Hispanic or Latino)</span></label></li><li><label><input type="radio" name="surveysResponses[cbf1b3c9-4157-4ddd-a66e-41dae0d8badb][responses][field1]" value="Prefer not to disclose"><span>Prefer not to disclose</span></label></li></ul></div></li><li><div><div>Are you a veteran/have you served in the military? </div></div><div><ul data-qa="multiple-choice"><li><label><input type="radio" name="surveysResponses[cbf1b3c9-4157-4ddd-a66e-41dae0d8badb][responses][field2]" value="Yes"><span>Yes</span></label></li><li><label><input type="radio" name="surveysResponses[cbf1b3c9-4157-4ddd-a66e-41dae0d8badb][responses][field2]" value="No"><span>No</span></label></li><li><label><input type="radio" name="surveysResponses[cbf1b3c9-4157-4ddd-a66e-41dae0d8badb][responses][field2]" value="Prefer not to disclose"><span>Prefer not to disclose</span></label></li></ul></div></li></ul></div><div data-qa="consent-section"><hr><ul><li><div><p data-qa="legitimate-interest-copy">By applying for this position, your data will be processed as per Spotify's <a>Privacy Policy</a>.</p><ul><li><label><span>Spotify has my consent to contact me about future job opportunities.</span><input type="checkbox" name="consent[marketing]" value="1"></label></li></ul></div></li></ul></div><div><button id="btn-submit" type="button" data-qa="btn-submit" href="#">Submit application</button></div></form>
```

- [ ] **Step 2: Write the failing tests**

Create `extension/tests/adapters/greenhouse.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADAPTERS, adapterForHost } from '../../src/adapters';
import { greenhouse } from '../../src/adapters/greenhouse';
import { fillForm, formPresent } from '../../src/fill/engine';
import { allowFileAssignment, byId, cvFile, fileNames, installFakeDataTransfer, loadFixture, payload, recordEvents } from '../helpers/dom';

beforeEach(() => {
  document.body.innerHTML = loadFixture('greenhouse-form');
  allowFileAssignment(document);
  installFakeDataTransfer();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('registry', () => {
  it('maps the two Greenhouse hosts to this adapter and unknown hosts to nothing', () => {
    expect(adapterForHost('job-boards.greenhouse.io')).toBe(greenhouse);
    expect(adapterForHost('boards.greenhouse.io')).toBe(greenhouse);
    expect(adapterForHost('example.com')).toBeNull();
    expect(ADAPTERS.map((a) => a.id)).toContain('greenhouse');
  });
});

describe('Greenhouse adapter on a saved real form (job-boards.greenhouse.io/gitlab/jobs/8860302002)', () => {
  it('recognises the form', () => {
    expect(formPresent(document, greenhouse)).toBe(true);
  });

  it('fills name, email, phone, the LinkedIn question, the CV and the cover letter file', () => {
    const res = fillForm(document, greenhouse, payload(), cvFile());
    expect(byId('first_name').value).toBe('Ada');
    expect(byId('last_name').value).toBe('Lovelace');
    expect(byId('email').value).toBe('ada@example.com');
    expect(byId('phone').value).toBe('+234 801 234 5678');
    expect(byId('question_38624168002').value).toBe('https://www.linkedin.com/in/ada');
    expect(fileNames(byId('resume'))).toEqual(['Ada Lovelace CV.pdf']);
    expect(fileNames(byId('cover_letter'))).toEqual(['cover-letter.txt']);
    expect(res.slots).toEqual(['first_name', 'last_name', 'email', 'phone', 'linkedin', 'cv_file', 'cover_file']);
    expect(res.filled).toBe(7);
  });

  it('fires input, change and blur on a filled field so React registers it', () => {
    const seen = recordEvents(byId('first_name'));
    fillForm(document, greenhouse, payload(), null);
    expect(seen).toEqual(['input', 'change', 'blur', 'focusout']);
  });

  it('leaves custom questions, sponsorship, the country box and every self-identification field untouched', () => {
    fillForm(document, greenhouse, payload(), cvFile());
    for (const id of [
      'question_38624169002', 'question_38624171002', 'question_38624170002', 'question_38624172002', 'question_38624173002',
      'question_38624174002', 'country', 'gender', 'hispanic_ethnicity', 'veteran_status',
    ]) {
      expect(byId(id).value, id).toBe('');
    }
  });

  it('does not overwrite a value the user already typed', () => {
    byId('first_name').value = 'Grace';
    const res = fillForm(document, greenhouse, payload(), null);
    expect(byId('first_name').value).toBe('Grace');
    expect(res.slots).not.toContain('first_name');
  });

  it('uses the cover letter text box when the user has already opened it', () => {
    document.getElementById('cover_letter')!.insertAdjacentHTML('afterend', '<textarea id="cover_letter_text"></textarea>');
    const res = fillForm(document, greenhouse, payload(), null);
    expect((document.getElementById('cover_letter_text') as HTMLTextAreaElement).value).toBe('Dear team,\nI would love to join.');
    expect(res.slots).toContain('cover_text');
    expect(res.slots).not.toContain('cover_file');
  });

  it('never clicks a button or submits the form', () => {
    const click = vi.spyOn(HTMLElement.prototype, 'click');
    const submit = vi.fn();
    document.querySelector('form')!.addEventListener('submit', submit);
    fillForm(document, greenhouse, payload(), cvFile());
    expect(click).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('finds nothing on a page that is not an application form', () => {
    document.body.innerHTML = '<main><h1>Open positions</h1><a href="#">Apply</a></main>';
    expect(formPresent(document, greenhouse)).toBe(false);
    expect(fillForm(document, greenhouse, payload(), cvFile())).toEqual({ filled: 0, slots: [] });
  });
});
```

Create `extension/tests/adapters/lever.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adapterForHost } from '../../src/adapters';
import { lever } from '../../src/adapters/lever';
import { fillForm, formPresent } from '../../src/fill/engine';
import { allowFileAssignment, byName, cvFile, fileNames, installFakeDataTransfer, loadFixture, payload, recordEvents } from '../helpers/dom';

beforeEach(() => {
  document.body.innerHTML = loadFixture('lever-form');
  allowFileAssignment(document);
  installFakeDataTransfer();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Lever adapter on a saved real form (jobs.lever.co/spotify/223f9722-.../apply)', () => {
  it('is registered for jobs.lever.co and recognises the form', () => {
    expect(adapterForHost('jobs.lever.co')).toBe(lever);
    expect(formPresent(document, lever)).toBe(true);
  });

  it('fills the single full-name box, email, phone, location, the three links and the CV', () => {
    const res = fillForm(document, lever, payload(), cvFile());
    expect(byName('name').value).toBe('Ada Lovelace');
    expect(byName('email').value).toBe('ada@example.com');
    expect(byName('phone').value).toBe('+234 801 234 5678');
    expect(byName('location').value).toBe('Lagos');
    expect(byName('urls[LinkedIn]').value).toBe('https://www.linkedin.com/in/ada');
    expect(byName('urls[GitHub]').value).toBe('https://github.com/ada');
    expect(byName('urls[Portfolio]').value).toBe('https://ada.dev/');
    expect(fileNames(byName('resume'))).toEqual(['Ada Lovelace CV.pdf']);
    expect(res.slots).toEqual(['full_name', 'email', 'phone', 'city', 'linkedin', 'github', 'portfolio', 'cv_file']);
  });

  it('leaves the current company, the other-website box, checkboxes and demographic answers alone', () => {
    fillForm(document, lever, payload(), cvFile());
    expect(byName('org').value).toBe('');
    expect(byName('urls[Other]').value).toBe('');
    for (const box of Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]'))) {
      expect(box.checked).toBe(false);
    }
  });

  it('matches link boxes without regard to case and falls back to other website names', () => {
    document.body.innerHTML = `
      <input name="urls[Github]"><input name="urls[Other Website]"><input name="urls[Video Link ]">`;
    fillForm(document, lever, payload(), null);
    expect(byName('urls[Github]').value).toBe('https://github.com/ada');
    expect(byName('urls[Other Website]').value).toBe('https://ada.dev/');
    expect(byName('urls[Video Link ]').value).toBe('');
  });

  it('fires the framework events on filled fields', () => {
    const seen = recordEvents(byName('email'));
    fillForm(document, lever, payload(), null);
    expect(seen).toEqual(['input', 'change', 'blur', 'focusout']);
  });

  it('does not touch an existing value and never submits', () => {
    byName('phone').value = '0800 000 0000';
    const click = vi.spyOn(HTMLElement.prototype, 'click');
    const submit = vi.fn();
    document.querySelector('form')!.addEventListener('submit', submit);
    fillForm(document, lever, payload(), null);
    expect(byName('phone').value).toBe('0800 000 0000');
    expect(click).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('fills a text area only when it is labelled as a cover letter', () => {
    document.body.innerHTML = `
      <label>Cover letter <textarea name="comments"></textarea></label>
      <label>Anything else? <textarea name="other"></textarea></label>`;
    const res = fillForm(document, lever, payload(), null);
    expect(byName<HTMLTextAreaElement>('comments').value).toBe('Dear team,\nI would love to join.');
    expect(byName<HTMLTextAreaElement>('other').value).toBe('');
    expect(res.slots).toEqual(['cover_text']);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -w joblume-extension -- tests/adapters`
Expected: FAIL with `Failed to resolve import "../../src/adapters"` (or `.../greenhouse`).

- [ ] **Step 4: Implement the shared helpers and both adapters**

Create `extension/src/adapters/shared.ts`:

```ts
import { isSensitive, labelText } from '../fill/labels';

/** Text-like controls only: never files, checkboxes, radios, hidden fields, buttons or comboboxes. */
const CANDIDATES = 'textarea, input:not([type]), input[type="text"], input[type="url"], input[type="tel"], input[type="search"]';

/** Label patterns for the fallback search (matched against the lower-case label text). */
export const LABEL = {
  phone: /\b(phone|mobile|telephone)\b/,
  city: /^(current |your |preferred )?(city|location)( \(city\))?$/,
  linkedin: /linkedin/,
  github: /github/,
  portfolio: /\b(portfolio|personal (web)?site|website)\b/,
  cover: /cover letter/,
} as const;

/**
 * The first plain text control whose label matches. Sensitive questions and comboboxes are never returned,
 * so a custom question can only be matched by an explicit standard label such as "LinkedIn Profile".
 */
export function byLabel(doc: Document, pattern: RegExp, tag?: 'textarea'): HTMLInputElement | HTMLTextAreaElement | null {
  for (const el of Array.from(doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(tag ?? CANDIDATES))) {
    if (el.getAttribute('role') === 'combobox' || el.disabled) continue;
    if (isSensitive(el)) continue;
    if (pattern.test(labelText(el))) return el;
  }
  return null;
}

export function byId<T extends HTMLElement = HTMLInputElement>(doc: Document, id: string): T | null {
  return doc.getElementById(id) as T | null;
}
```

Create `extension/src/adapters/greenhouse.ts`:

```ts
import type { Adapter, Slot } from '../fill/engine';
import { byId, byLabel, LABEL } from './shared';

/**
 * Greenhouse (job-boards.greenhouse.io; boards.greenhouse.io redirects there).
 * Verified against a live server-rendered form (GitLab posting 8860302002, 2026-10-21):
 * stable ids first_name, last_name, email, phone, resume (file), cover_letter (file).
 * LinkedIn and website questions are custom questions with ids like question_38624168002, found by their label.
 * #cover_letter_text is the target of the label "Enter manually"; the textarea only exists after the user clicks it.
 */
export const greenhouse: Adapter = {
  id: 'greenhouse',
  hosts: ['boards.greenhouse.io', 'job-boards.greenhouse.io'],
  find(doc: Document, slot: Slot): HTMLElement | null {
    switch (slot) {
      case 'first_name':
        return byId(doc, 'first_name');
      case 'last_name':
        return byId(doc, 'last_name');
      case 'email':
        return byId(doc, 'email');
      case 'phone':
        return byId(doc, 'phone') ?? byLabel(doc, LABEL.phone);
      case 'city':
        return byLabel(doc, LABEL.city);
      case 'linkedin':
        return byLabel(doc, LABEL.linkedin);
      case 'github':
        return byLabel(doc, LABEL.github);
      case 'portfolio':
        return byLabel(doc, LABEL.portfolio);
      case 'cv_file':
        return doc.querySelector<HTMLInputElement>('input#resume[type="file"]');
      case 'cover_file':
        return doc.querySelector<HTMLInputElement>('input#cover_letter[type="file"]');
      case 'cover_text':
        return byId<HTMLTextAreaElement>(doc, 'cover_letter_text');
      case 'full_name':
        return null;
    }
  },
};
```

Create `extension/src/adapters/lever.ts`:

```ts
import type { Adapter, Slot } from '../fill/engine';
import { byLabel, LABEL } from './shared';

/** The input inside "Links" whose name is urls[<key>], comparing keys without case; first key in the list wins. */
function linkInput(doc: Document, keys: string[]): HTMLInputElement | null {
  const inputs = Array.from(doc.querySelectorAll<HTMLInputElement>('input[name^="urls["]'));
  for (const key of keys) {
    const hit = inputs.find((i) => i.name.slice(5, -1).trim().toLowerCase() === key);
    if (hit) return hit;
  }
  return null;
}

/**
 * Lever (jobs.lever.co/<company>/<id>/apply).
 * Verified against two live server-rendered forms (Spotify 223f9722-..., Lever demo ad208490-..., 2026-10-21):
 * input[name=name] (one full-name box), input[name=email], input[name=phone], input[name=location],
 * input[name="urls[LinkedIn]"], urls[GitHub] or urls[Github], urls[Portfolio] or urls[Other Website] or urls[Other],
 * and input[type=file][name=resume].
 * NOT seen on either form: a cover letter box. It is only filled when a text area is labelled "cover letter".
 * The location box shows suggestions; the user may need to pick one.
 */
export const lever: Adapter = {
  id: 'lever',
  hosts: ['jobs.lever.co'],
  find(doc: Document, slot: Slot): HTMLElement | null {
    switch (slot) {
      case 'full_name':
        return doc.querySelector<HTMLInputElement>('input[name="name"]');
      case 'email':
        return doc.querySelector<HTMLInputElement>('input[name="email"]');
      case 'phone':
        return doc.querySelector<HTMLInputElement>('input[name="phone"]');
      case 'city':
        return doc.querySelector<HTMLInputElement>('input[name="location"]');
      case 'linkedin':
        return linkInput(doc, ['linkedin']) ?? byLabel(doc, LABEL.linkedin);
      case 'github':
        return linkInput(doc, ['github']) ?? byLabel(doc, LABEL.github);
      case 'portfolio':
        return linkInput(doc, ['portfolio', 'other website', 'website', 'other']);
      case 'cv_file':
        return doc.querySelector<HTMLInputElement>('input[type="file"][name="resume"]');
      case 'cover_text':
        return byLabel(doc, LABEL.cover, 'textarea');
      case 'first_name':
      case 'last_name':
      case 'cover_file':
        return null;
    }
  },
};
```

Create `extension/src/adapters/index.ts` (Task 9 replaces this file with the four-adapter version):

```ts
import type { Adapter } from '../fill/engine';
import { greenhouse } from './greenhouse';
import { lever } from './lever';

export const ADAPTERS: readonly Adapter[] = [greenhouse, lever];

export function adapterForHost(host: string): Adapter | null {
  const h = host.toLowerCase();
  return ADAPTERS.find((a) => a.hosts.includes(h)) ?? null;
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npm test -w joblume-extension -- tests/adapters && npm run typecheck -w joblume-extension`
Expected: PASS (Greenhouse 9 tests, Lever 7 tests), no type errors.

- [ ] **Step 6: Commit**

```bash
git add extension/src/adapters/shared.ts extension/src/adapters/greenhouse.ts extension/src/adapters/lever.ts extension/src/adapters/index.ts extension/tests/fixtures/greenhouse-form.html extension/tests/fixtures/lever-form.html extension/tests/adapters/greenhouse.test.ts extension/tests/adapters/lever.test.ts
git commit -m "feat(extension): Greenhouse and Lever adapters verified against saved real forms

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ashby and Workable adapters

Both pages are client-rendered, so their fixtures are the **rendered DOM** captured with a browser (not static HTML). Ashby is verified against that DOM; Workable is too, **except `input[name=phone]` and the city label search, which are UNVERIFIED against a live DOM** and say so in code, tests and the checklist.

**Files:**
- Create: `extension/src/adapters/ashby.ts`, `extension/src/adapters/workable.ts`
- Modify (replace whole file): `extension/src/adapters/index.ts`
- Create fixtures: `extension/tests/fixtures/ashby-form.html`, `extension/tests/fixtures/workable-form.html`
- Test (create): `extension/tests/adapters/ashby.test.ts`, `extension/tests/adapters/workable.test.ts`

**Interfaces:**
- Consumes: everything from Task 8 (`byLabel`, `byId`, `LABEL`), `Adapter`/`Slot` (Task 7).
- Produces: `ashby: Adapter` (host `jobs.ashbyhq.com`), `workable: Adapter` (host `apply.workable.com`); `ADAPTERS` now lists `[greenhouse, lever, ashby, workable]`.

- [ ] **Step 1: Save the rendered-DOM fixtures**

Create `extension/tests/fixtures/ashby-form.html` (rendered DOM of `https://jobs.ashbyhq.com/ashby/7458d4e9-da2e-47bd-98cb-adfda43d42b2/application`, subtree holding the fields, wrapped in a div with id `ashby-root`):

```html
<div id="ashby-root"><div><div data-field-path="_systemfield_name"><label for="_systemfield_name">Name</label><div><input placeholder="Type here..." name="_systemfield_name" required="" id="_systemfield_name" type="text" value=""></div></div><div data-field-path="_systemfield_email"><label for="_systemfield_email">Email</label><div><input placeholder="hello@example.com..." name="_systemfield_email" required="" id="_systemfield_email" type="email" value=""></div></div><div data-field-path="_systemfield_resume"><label for="_systemfield_resume">Resume</label><div role="presentation"><input accept="application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.oasis.opendocument.text,.odt,application/rtf,.rtf,text/plain,.txt,text/markdown,.md,image/*,video/*,audio/*" type="file" id="_systemfield_resume"><div><button><span><span>Upload File</span></span></button><p>or drag and drop here</p></div></div></div><div data-field-path="2f73c135-4c72-40cf-84bc-ba7700192f2f"><label for="2f73c135-4c72-40cf-84bc-ba7700192f2f">LinkedIn Profile</label><div><input placeholder="Type here..." name="2f73c135-4c72-40cf-84bc-ba7700192f2f" required="" id="2f73c135-4c72-40cf-84bc-ba7700192f2f" type="text" value=""></div></div><div data-field-path="c96f681c-a8cf-4bf2-b6cf-fc08420a01d8"><label for="c96f681c-a8cf-4bf2-b6cf-fc08420a01d8">Do you currently live in the EMEA timezone? If not, please explain why you're applying to this role</label><div><p>We unfortunately won't hire folks in APAC who want to work in these time zones.</p></div><div><input placeholder="Type here..." name="c96f681c-a8cf-4bf2-b6cf-fc08420a01d8" id="c96f681c-a8cf-4bf2-b6cf-fc08420a01d8" type="text" value=""></div></div><div data-field-path="_systemfield_location"><label for="_systemfield_location">Which country do you intend to work from?</label><div><p>Please list your city and country.</p></div><div><input placeholder="Start typing..." role="combobox" value=""><button></button></div></div><div data-field-path="9dbddae8-2594-40be-b4b9-92420e945f18"><label for="9dbddae8-2594-40be-b4b9-92420e945f18">Will you now or in the future require sponsorship for employment visa status to work in this location?</label><div><button>Yes</button><button>No</button><input type="checkbox" name="9dbddae8-2594-40be-b4b9-92420e945f18"></div></div><div data-field-path="f890254e-5bf6-483d-87cb-a8cb9ec59a83"><label for="f890254e-5bf6-483d-87cb-a8cb9ec59a83">Describe the best engineer you've worked with, someone else in your top 5, and the difference between the two.</label><div></div><textarea placeholder="Type here..." required="" name="f890254e-5bf6-483d-87cb-a8cb9ec59a83" id="f890254e-5bf6-483d-87cb-a8cb9ec59a83"></textarea></div><div data-field-path="5668eabe-daee-426a-bfac-e22ee07a4a5e"><label for="5668eabe-daee-426a-bfac-e22ee07a4a5e">What's the most recent thing you've built or shipped? Walk us through what it was and why you did it.</label><div><p>We're looking for evidence that you're still hands-on, something you've written or shipped recently as part of your work.</p></div><textarea placeholder="Type here..." required="" name="5668eabe-daee-426a-bfac-e22ee07a4a5e" id="5668eabe-daee-426a-bfac-e22ee07a4a5e"></textarea></div><div data-field-path="2fc5a8e3-79e3-447d-8247-e5a75116f47b"><label for="2fc5a8e3-79e3-447d-8247-e5a75116f47b">How do you typically communicate a difficult decision or a change in direction to your team? Give us a specific example.</label><div><p>We care a lot about communication at Ashby. We're looking for how you bring people with you, not just what you decided.</p></div><textarea placeholder="Type here..." required="" name="2fc5a8e3-79e3-447d-8247-e5a75116f47b" id="2fc5a8e3-79e3-447d-8247-e5a75116f47b"></textarea></div></div></div>
```

Create `extension/tests/fixtures/workable-form.html` (rendered `form[data-ui=application-form]` of `https://apply.workable.com/huggingface/j/DB4D7C0EC8/apply/`, last three yes/no and essay questions removed):

```html
<form data-ui="application-form"><div><div><div><div><div><strong>Autofill application</strong></div><p>Save time by importing your resume in one of the following formats: .pdf, .doc, .docx, .odt, or .rtf.</p></div><div data-ui="autofill-button"><div><div><button type="button"><div><span>Import resume from</span></div></button></div></div></div></div></div></div><span><span>*</span>&nbsp;<span>Required fields</span></span><section data-ui="section"><div><h2 id="section-0_section_name">Personal information</h2><a role="button" data-ui="clear-section-0" aria-label="Clear Personal information"><span>Clear</span></a></div><div data-ui="section-fields"><div><label><span><span><strong>*</strong></span><span><span id="firstname_label"><strong>First name</strong></span></span></span><div><div><input aria-required="true" id="firstname" data-ui="firstname" name="firstname" aria-labelledby="firstname_label" required="" type="text" value=""></div></div></label></div><div><label><span><span><strong>*</strong></span><span><span id="lastname_label"><strong>Last name</strong></span></span></span><div><div><input aria-required="true" id="lastname" data-ui="lastname" name="lastname" aria-labelledby="lastname_label" required="" type="text" value=""></div></div></label></div><div><label><span><span><strong>*</strong></span><span><span id="email_label"><strong>Email</strong></span></span></span><div><div><input aria-required="true" id="email" data-ui="email" name="email" aria-labelledby="email_label" required="" type="email" value=""></div></div></label></div></div></section><section data-ui="section"><div><h2 id="section-1_section_name">Profile</h2><a role="button" data-ui="clear-section-1" aria-label="Clear Profile"><span>Clear</span></a></div><div data-ui="section-fields"><div><label><span><span><span id="summary_label"><strong>Summary</strong></span><span> (Optional)</span></span></span><div><div><textarea aria-required="false" id="summary" data-ui="summary" name="summary" aria-labelledby="summary_label" type="text"></textarea></div></div></label></div><div><div><div><span><span><strong>*</strong></span><span><span id="mW0SbupYVoRghUg1_label"><strong>Resume</strong></span><span></span></span></span><div><div><div><div><label for="input_files_input_FoALasHBSbjRlJAm"></label></div><div></div><div></div></div></div><div><label role="button" for="input_files_input_FoALasHBSbjRlJAm" id="description_input_FoALasHBSbjRlJAm">Choose file</label> <span>or drag and drop here</span></div><input data-ui="resume" id="input_files_input_FoALasHBSbjRlJAm" type="file" aria-labelledby="mW0SbupYVoRghUg1_label description_input_FoALasHBSbjRlJAm" accept=".pdf,.doc,.docx,.odt,.rtf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,application/rtf" required=""></div></div></div></div><div><label><span><span><strong>*</strong></span><span><span id="CA_47143_label"><strong>Github profile</strong></span></span></span><div><div><textarea aria-required="true" id="CA_47143" data-ui="CA_47143" name="CA_47143" aria-labelledby="CA_47143_label" required="" type="text"></textarea></div></div></label></div><div><label><span><span><strong>*</strong></span><span><span id="CA_47383_label"><strong>Linkedin</strong></span></span></span><div><div><textarea aria-required="true" id="CA_47383" data-ui="CA_47383" name="CA_47383" aria-labelledby="CA_47383_label" required="" type="text"></textarea></div></div></label></div></div></section><section data-ui="section"><div><h2 id="section-2_section_name">Details</h2><a role="button" data-ui="clear-section-2" aria-label="Clear Details"><span>Clear</span></a></div><div data-ui="section-fields"><div><label><span><span><span id="cover_letter_label"><strong>Cover letter</strong></span><span> (Optional)</span></span></span><div><div><textarea aria-required="false" id="cover_letter" data-ui="cover_letter" name="cover_letter" aria-labelledby="cover_letter_label" type="text"></textarea></div></div></label></div><div><label><span><span><span id="CA_10626_label"><strong>Expected salary</strong></span><span> (Optional)</span></span></span><div><div><input aria-required="false" id="CA_10626" data-ui="CA_10626" name="CA_10626" aria-labelledby="CA_10626_label" type="text" value=""></div></div></label></div><div><div><span><span><span id="CA_10627_label"><strong>Notice period / availability</strong></span><span> (Optional)</span></span></span><div data-ui="CA_10627"><label><div><div><input id="input_CA_10627_input" role="combobox" autocomplete="off" aria-labelledby="CA_10627_label" placeholder="Select an option…" type="text" value=""></div></div></label><input name="CA_10627" value=""></div></div></div><div><div><span><span><span id="EaPUM8W1cD7f8yQv_label"><strong>Are you eligible to work in the country you are applying?</strong></span><span> (Optional)</span></span></span><div><fieldset role="radiogroup" data-ui="CA_10628" aria-labelledby="EaPUM8W1cD7f8yQv_label"><div data-ui="option" aria-labelledby="EaPUM8W1cD7f8yQv_label radio_label_NOTzUiJUE8Q6NfLJ" id="wrapper_NOTzUiJUE8Q6NfLJ" role="radio" aria-required="false"><label><input aria-required="false" id="NOTzUiJUE8Q6NfLJ" type="radio" name="CA_10628" value="true"><div><div><span id="radio_label_NOTzUiJUE8Q6NfLJ">YES</span></div></div></label></div><div data-ui="option" aria-labelledby="EaPUM8W1cD7f8yQv_label radio_label_vOKLp61lzReNelVi" id="wrapper_vOKLp61lzReNelVi" role="radio" aria-required="false"><label><input aria-required="false" id="vOKLp61lzReNelVi" type="radio" name="CA_10628" value="false"><div><div><span id="radio_label_vOKLp61lzReNelVi">NO</span></div></div></label></div></fieldset></div></div></div><div><label><span><span><span id="CA_10629_label"><strong>How did you hear about us?</strong></span><span> (Optional)</span></span></span><div><div><input aria-required="false" id="CA_10629" data-ui="CA_10629" name="CA_10629" aria-labelledby="CA_10629_label" type="text" value=""></div></div></label></div></div></section><div id="turnstile-container-777286"></div><button data-ui="apply-button" type="submit">Submit application</button></form>
```

- [ ] **Step 2: Write the failing tests**

Create `extension/tests/adapters/ashby.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adapterForHost } from '../../src/adapters';
import { ashby } from '../../src/adapters/ashby';
import { fillForm, formPresent } from '../../src/fill/engine';
import { allowFileAssignment, byId, cvFile, fileNames, installFakeDataTransfer, loadFixture, payload, recordEvents } from '../helpers/dom';

const LINKEDIN_ID = '2f73c135-4c72-40cf-84bc-ba7700192f2f';

beforeEach(() => {
  // The real page has an unlabelled "autofill from resume" file input before the form fields.
  document.body.innerHTML = `<input type="file" id="autofill-decoy">${loadFixture('ashby-form')}`;
  allowFileAssignment(document);
  installFakeDataTransfer();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Ashby adapter on a saved rendered form (jobs.ashbyhq.com/ashby/7458d4e9-.../application)', () => {
  it('is registered for jobs.ashbyhq.com and recognises the form without a <form> element', () => {
    expect(adapterForHost('jobs.ashbyhq.com')).toBe(ashby);
    expect(document.querySelector('form')).toBeNull();
    expect(formPresent(document, ashby)).toBe(true);
  });

  it('fills name, email, the LinkedIn custom field and attaches the CV to the resume field, not the decoy', () => {
    const res = fillForm(document, ashby, payload(), cvFile());
    expect(byId('_systemfield_name').value).toBe('Ada Lovelace');
    expect(byId('_systemfield_email').value).toBe('ada@example.com');
    expect(byId(LINKEDIN_ID).value).toBe('https://www.linkedin.com/in/ada');
    expect(fileNames(byId('_systemfield_resume'))).toEqual(['Ada Lovelace CV.pdf']);
    expect(fileNames(byId('autofill-decoy'))).toEqual([]);
    expect(res.slots).toEqual(['full_name', 'email', 'linkedin', 'cv_file']);
  });

  it('leaves the location combobox, the time-zone question, sponsorship and the long essay answers untouched', () => {
    fillForm(document, ashby, payload(), cvFile());
    expect((document.querySelector('[role="combobox"]') as HTMLInputElement).value).toBe('');
    expect(byId('c96f681c-a8cf-4bf2-b6cf-fc08420a01d8').value).toBe('');
    expect((document.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
    for (const area of Array.from(document.querySelectorAll('textarea'))) expect(area.value).toBe('');
  });

  it('fires the framework events and keeps an existing value', () => {
    byId('_systemfield_email').value = 'keep@example.com';
    const seen = recordEvents(byId('_systemfield_name'));
    const res = fillForm(document, ashby, payload(), null);
    expect(seen).toEqual(['input', 'change', 'blur', 'focusout']);
    expect(byId('_systemfield_email').value).toBe('keep@example.com');
    expect(res.slots).not.toContain('email');
  });

  it('never clicks the Upload button or submits', () => {
    const click = vi.spyOn(HTMLElement.prototype, 'click');
    fillForm(document, ashby, payload(), cvFile());
    expect(click).not.toHaveBeenCalled();
  });

  it('finds nothing on the job description page before the application tab is opened', () => {
    document.body.innerHTML = '<h1>Engineering Manager - EU</h1><button>Apply for this Job</button>';
    expect(formPresent(document, ashby)).toBe(false);
  });
});
```

Create `extension/tests/adapters/workable.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adapterForHost } from '../../src/adapters';
import { workable } from '../../src/adapters/workable';
import { fillForm, formPresent } from '../../src/fill/engine';
import { allowFileAssignment, byId, byName, cvFile, fileNames, installFakeDataTransfer, loadFixture, payload, recordEvents } from '../helpers/dom';

beforeEach(() => {
  document.body.innerHTML = loadFixture('workable-form');
  allowFileAssignment(document);
  installFakeDataTransfer();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Workable adapter on a saved rendered form (apply.workable.com/huggingface/j/DB4D7C0EC8/apply/)', () => {
  it('is registered for apply.workable.com and recognises the form', () => {
    expect(adapterForHost('apply.workable.com')).toBe(workable);
    expect(formPresent(document, workable)).toBe(true);
  });

  it('fills first name, last name, email, the cover letter, the CV and the labelled LinkedIn and GitHub questions', () => {
    const res = fillForm(document, workable, payload(), cvFile());
    expect(byName('firstname').value).toBe('Ada');
    expect(byName('lastname').value).toBe('Lovelace');
    expect(byName('email').value).toBe('ada@example.com');
    expect(byName<HTMLTextAreaElement>('cover_letter').value).toBe('Dear team,\nI would love to join.');
    expect(byName<HTMLTextAreaElement>('CA_47383').value).toBe('https://www.linkedin.com/in/ada');
    expect(byName<HTMLTextAreaElement>('CA_47143').value).toBe('https://github.com/ada');
    expect(fileNames(document.querySelector('input[data-ui="resume"]') as HTMLInputElement)).toEqual(['Ada Lovelace CV.pdf']);
    expect(res.slots).toEqual(['first_name', 'last_name', 'email', 'linkedin', 'github', 'cover_text', 'cv_file']);
  });

  it('leaves the summary, salary, how-did-you-hear, notice period and eligibility questions untouched', () => {
    fillForm(document, workable, payload(), cvFile());
    expect(byName<HTMLTextAreaElement>('summary').value).toBe('');
    expect(byName('CA_10626').value).toBe('');
    expect(byName('CA_10629').value).toBe('');
    expect((document.getElementById('input_CA_10627_input') as HTMLInputElement).value).toBe('');
    for (const radio of Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'))) expect(radio.checked).toBe(false);
  });

  it('fires the framework events and keeps an existing value', () => {
    byName('lastname').value = 'Byron';
    const seen = recordEvents(byName('firstname'));
    const res = fillForm(document, workable, payload(), null);
    expect(seen).toEqual(['input', 'change', 'blur', 'focusout']);
    expect(byName('lastname').value).toBe('Byron');
    expect(res.slots).not.toContain('last_name');
  });

  it('never clicks the import or submit buttons', () => {
    const click = vi.spyOn(HTMLElement.prototype, 'click');
    const submit = vi.fn();
    document.querySelector('form')!.addEventListener('submit', submit);
    fillForm(document, workable, payload(), cvFile());
    expect(click).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  // UNVERIFIED against a live form: the sampled posting has no phone box. These two tests only prove that the
  // documented field name and a "Phone" label are used if a posting does have one.
  it('fills input[name=phone] when a posting has one (name unverified against a live form)', () => {
    byId('email').insertAdjacentHTML('afterend', '<input name="phone" type="tel">');
    fillForm(document, workable, payload(), null);
    expect(byName('phone').value).toBe('+234 801 234 5678');
  });

  it('fills a box labelled Phone when it has no known name (unverified)', () => {
    byId('email').insertAdjacentHTML('afterend', '<label for="tel1">Phone</label><input id="tel1" type="tel" name="x1">');
    fillForm(document, workable, payload(), null);
    expect(byId('tel1').value).toBe('+234 801 234 5678');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -w joblume-extension -- tests/adapters/ashby.test.ts tests/adapters/workable.test.ts`
Expected: FAIL with `Failed to resolve import "../../src/adapters/ashby"` (and `workable`).

- [ ] **Step 4: Implement the adapters and the final registry**

Create `extension/src/adapters/ashby.ts`:

```ts
import type { Adapter, Slot } from '../fill/engine';
import { byId, byLabel, LABEL } from './shared';

/**
 * Ashby (jobs.ashbyhq.com/<company>/<id>/application). The page is rendered by JavaScript and has no <form>.
 * Verified against the live rendered DOM (Ashby posting 7458d4e9-..., 2026-10-21) with a browser:
 * #_systemfield_name, #_systemfield_email, input#_systemfield_resume[type=file] (the first file input on the page
 * is a different "autofill from resume" upload and is deliberately not used).
 * LinkedIn is a custom field (id is a UUID) found by its label. The location field is a combobox and is never filled.
 * Not seen on this posting: a phone box (label search only) and a cover letter box (label search only).
 */
export const ashby: Adapter = {
  id: 'ashby',
  hosts: ['jobs.ashbyhq.com'],
  find(doc: Document, slot: Slot): HTMLElement | null {
    switch (slot) {
      case 'full_name':
        return byId(doc, '_systemfield_name');
      case 'email':
        return byId(doc, '_systemfield_email');
      case 'cv_file':
        return doc.querySelector<HTMLInputElement>('input#_systemfield_resume[type="file"]');
      case 'phone':
        return byLabel(doc, LABEL.phone);
      case 'city':
        return byLabel(doc, LABEL.city);
      case 'linkedin':
        return byLabel(doc, LABEL.linkedin);
      case 'github':
        return byLabel(doc, LABEL.github);
      case 'portfolio':
        return byLabel(doc, LABEL.portfolio);
      case 'cover_text':
        return byLabel(doc, LABEL.cover, 'textarea');
      case 'first_name':
      case 'last_name':
      case 'cover_file':
        return null;
    }
  },
};
```

Create `extension/src/adapters/workable.ts`:

```ts
import type { Adapter, Slot } from '../fill/engine';
import { byLabel, LABEL } from './shared';

/**
 * Workable (apply.workable.com/<company>/j/<shortcode>/apply/). Rendered by JavaScript.
 * Verified against the live rendered DOM (Hugging Face DB4D7C0EC8, 2026-10-21) with a browser:
 * form[data-ui=application-form], input[name=firstname], input[name=lastname], input[name=email],
 * input[type=file][data-ui=resume], textarea[name=cover_letter].
 * LinkedIn and GitHub are custom questions (names like CA_47383, textareas) found by their label.
 * UNVERIFIED against a live form: input[name=phone] (this posting has no phone box; the name is the documented
 * Workable candidate field key) and the city/location label search.
 */
export const workable: Adapter = {
  id: 'workable',
  hosts: ['apply.workable.com'],
  find(doc: Document, slot: Slot): HTMLElement | null {
    switch (slot) {
      case 'first_name':
        return doc.querySelector<HTMLInputElement>('input[name="firstname"]');
      case 'last_name':
        return doc.querySelector<HTMLInputElement>('input[name="lastname"]');
      case 'email':
        return doc.querySelector<HTMLInputElement>('input[name="email"]');
      case 'phone':
        return doc.querySelector<HTMLInputElement>('input[name="phone"]') ?? byLabel(doc, LABEL.phone);
      case 'city':
        return byLabel(doc, LABEL.city);
      case 'linkedin':
        return byLabel(doc, LABEL.linkedin);
      case 'github':
        return byLabel(doc, LABEL.github);
      case 'portfolio':
        return byLabel(doc, LABEL.portfolio);
      case 'cv_file':
        return doc.querySelector<HTMLInputElement>('input[type="file"][data-ui="resume"]');
      case 'cover_text':
        return doc.querySelector<HTMLTextAreaElement>('textarea[name="cover_letter"]');
      case 'full_name':
      case 'cover_file':
        return null;
    }
  },
};
```

Replace the whole of `extension/src/adapters/index.ts` with:

```ts
import type { Adapter } from '../fill/engine';
import { ashby } from './ashby';
import { greenhouse } from './greenhouse';
import { lever } from './lever';
import { workable } from './workable';

export const ADAPTERS: readonly Adapter[] = [greenhouse, lever, ashby, workable];

export function adapterForHost(host: string): Adapter | null {
  const h = host.toLowerCase();
  return ADAPTERS.find((a) => a.hosts.includes(h)) ?? null;
}
```

- [ ] **Step 5: Run all adapter tests and the type check**

Run: `npm test -w joblume-extension -- tests/adapters && npm run typecheck -w joblume-extension`
Expected: PASS for all four adapter files (Greenhouse 9, Lever 7, Ashby 6, Workable 7), no type errors.

- [ ] **Step 6: Commit**

```bash
git add extension/src/adapters/ashby.ts extension/src/adapters/workable.ts extension/src/adapters/index.ts extension/tests/fixtures/ashby-form.html extension/tests/fixtures/workable-form.html extension/tests/adapters/ashby.test.ts extension/tests/adapters/workable.test.ts
git commit -m "feat(extension): Ashby and Workable adapters from rendered-DOM fixtures

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Popup, banner and the form-page content script (and the first full build)

**Files:**
- Create: `extension/src/ui/banner.ts`, `extension/src/run-autofill.ts`, `extension/src/content/forms.ts`, `extension/src/popup/render.ts`, `extension/src/popup/popup.ts`, `extension/src/popup/popup.html`
- Test (create): `extension/tests/run-autofill.test.ts`, `extension/tests/ui.test.ts`

**Interfaces:**
- Consumes: `adapterForHost` (Task 9), `fillForm`, `formPresent` (Task 7), `waitFor`, `sleep` (Task 7), `base64ToBytes` (Task 5), `PayloadReply`, `CvReply`, `StatusReply` (Task 5), messages `joblume:get-payload`, `joblume:fetch-cv`, `joblume:done`, `joblume:status`, `joblume:clear` (Task 5).
- Produces: `showBanner(doc, count): HTMLElement`, `bannerText(count)`, `BANNER_ID` (`src/ui/banner.ts`); `runAutofill(deps: RunDeps): Promise<{ filled: number }>` with `RunDeps { doc; host; send<T>(msg): Promise<T | undefined>; waitMs; settleMs }` (`src/run-autofill.ts`); `renderPopup(root, status, now, actions)`, `describeStatus(status, now)` (`src/popup/render.ts`).

- [ ] **Step 1: Write the failing tests**

Create `extension/tests/run-autofill.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bytesToBase64 } from '../src/b64';
import { runAutofill } from '../src/run-autofill';
import { BANNER_ID } from '../src/ui/banner';
import { allowFileAssignment, byId, fileNames, installFakeDataTransfer, loadFixture, payload } from './helpers/dom';

type Send = (msg: unknown) => Promise<unknown>;

function scriptedSend(replies: { payload?: unknown; cv?: unknown }) {
  return vi.fn<Send>().mockImplementation(async (msg) => {
    const type = (msg as { type: string }).type;
    if (type === 'joblume:get-payload') return { payload: replies.payload ?? null };
    if (type === 'joblume:fetch-cv') return replies.cv;
    if (type === 'joblume:done') return { ok: true };
    return undefined;
  });
}

const deps = (send: ReturnType<typeof scriptedSend>, host = 'job-boards.greenhouse.io') => ({
  doc: document,
  host,
  send: send as unknown as <T>(msg: unknown) => Promise<T | undefined>,
  waitMs: 60,
  settleMs: 0,
});

const pdfReply = { ok: true, base64: bytesToBase64(new TextEncoder().encode('%PDF-1.4')), contentType: 'application/pdf' };

beforeEach(() => {
  document.body.innerHTML = loadFixture('greenhouse-form');
  allowFileAssignment(document);
  installFakeDataTransfer();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runAutofill', () => {
  it('fills the form, downloads the CV through the background, shows the banner and reports the count', async () => {
    const send = scriptedSend({ payload: payload(), cv: pdfReply });
    const res = await runAutofill(deps(send));
    expect(res.filled).toBe(7);
    expect(byId('first_name').value).toBe('Ada');
    expect(fileNames(byId('resume'))).toEqual(['Ada Lovelace CV.pdf']);
    expect(send).toHaveBeenCalledWith({ type: 'joblume:fetch-cv', url: payload().cv!.url });
    expect(send).toHaveBeenLastCalledWith({ type: 'joblume:done', filled: 7 });
    expect(document.getElementById(BANNER_ID)?.textContent).toContain('JobLume filled 7 fields.');
  });

  it('still fills the other fields when the CV cannot be downloaded', async () => {
    const send = scriptedSend({ payload: payload(), cv: { ok: false, error: 'http_403' } });
    const res = await runAutofill(deps(send));
    expect(res.filled).toBe(6);
    expect(fileNames(byId('resume'))).toEqual([]);
    expect(byId('email').value).toBe('ada@example.com');
  });

  it('does nothing without an armed payload', async () => {
    const send = scriptedSend({});
    expect(await runAutofill(deps(send))).toEqual({ filled: 0 });
    expect(byId('first_name').value).toBe('');
    expect(document.getElementById(BANNER_ID)).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a host without an adapter and does not even ask for the payload', async () => {
    const send = scriptedSend({ payload: payload() });
    expect(await runAutofill(deps(send, 'example.com'))).toEqual({ filled: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('gives up quietly when the form never appears', async () => {
    document.body.innerHTML = '<main>Not a form</main>';
    const send = scriptedSend({ payload: payload(), cv: pdfReply });
    expect(await runAutofill(deps(send))).toEqual({ filled: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(document.getElementById(BANNER_ID)).toBeNull();
  });

  it('waits for a form that renders late', async () => {
    document.body.innerHTML = '';
    const send = scriptedSend({ payload: payload(), cv: pdfReply });
    const run = runAutofill({ ...deps(send), waitMs: 2000 });
    setTimeout(() => {
      document.body.innerHTML = loadFixture('greenhouse-form');
      allowFileAssignment(document);
    }, 20);
    expect((await run).filled).toBe(7);
  });

  it('does not report a fill when nothing could be filled', async () => {
    document.body.innerHTML = '<input id="email" value="already@there.com">';
    const send = scriptedSend({ payload: payload({ cv: null, phone: null }) });
    expect(await runAutofill(deps(send))).toEqual({ filled: 0 });
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'joblume:done' }));
  });
});
```

Create `extension/tests/ui.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describeStatus, renderPopup } from '../src/popup/render';
import { BANNER_ID, bannerText, showBanner } from '../src/ui/banner';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('banner', () => {
  it('says how many fields were filled and tells the user to review and submit themselves', () => {
    expect(bannerText(1)).toBe('JobLume filled 1 field. Review every answer, then submit yourself.');
    expect(bannerText(7)).toBe('JobLume filled 7 fields. Review every answer, then submit yourself.');
  });

  it('is dismissible, shown once, and set as text', () => {
    showBanner(document, 2);
    const box = showBanner(document, 3);
    expect(document.querySelectorAll(`#${BANNER_ID}`)).toHaveLength(1);
    expect(box.textContent).toContain('JobLume filled 3 fields.');
    expect(box.querySelector('img, script')).toBeNull();
    (box.querySelector('button') as HTMLButtonElement).click();
    expect(document.getElementById(BANNER_ID)).toBeNull();
  });
});

describe('popup', () => {
  const none = { armed: false, label: null, expiresAt: null };
  const actions = () => ({ onClear: vi.fn(), docsUrl: 'http://localhost:3000/extension-setup.html' });

  it('describes an empty tab, a labelled job and an unlabelled job', () => {
    expect(describeStatus(none, 0)).toBe('Nothing is waiting to be filled in this tab.');
    expect(describeStatus({ armed: true, label: { title: 'Data Analyst', company: 'Acme' }, expiresAt: 10 * 60_000 }, 0)).toBe(
      'Ready to fill: Data Analyst at Acme. It expires in 10 minutes.',
    );
    expect(describeStatus({ armed: true, label: null, expiresAt: 30_000 }, 0)).toBe('Ready to fill: a job from JobLume. It expires in 1 minute.');
  });

  it('shows a Clear button only while something is armed, and calls the handler', () => {
    const root = document.createElement('main');
    document.body.append(root);
    const a = actions();
    renderPopup(root, none, 0, a);
    expect(root.querySelector('#clear')).toBeNull();

    renderPopup(root, { armed: true, label: { title: 'T', company: 'C' }, expiresAt: 60_000 }, 0, a);
    (root.querySelector('#clear') as HTMLButtonElement).click();
    expect(a.onClear).toHaveBeenCalledTimes(1);
  });

  it('links to the setup help safely and never renders markup from the job label', () => {
    const root = document.createElement('main');
    document.body.append(root);
    renderPopup(root, { armed: true, label: { title: '<img src=x onerror=alert(1)>', company: 'Acme' }, expiresAt: 60_000 }, 0, actions());
    const help = root.querySelector('#help') as HTMLAnchorElement;
    expect(help.href).toBe('http://localhost:3000/extension-setup.html');
    expect(help.rel).toBe('noopener noreferrer');
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w joblume-extension -- tests/run-autofill.test.ts tests/ui.test.ts`
Expected: FAIL with `Failed to resolve import "../src/run-autofill"` (and `../src/popup/render`).

- [ ] **Step 3: Implement**

Create `extension/src/ui/banner.ts`:

```ts
export const BANNER_ID = 'joblume-autofill-banner';

export function bannerText(count: number): string {
  return `JobLume filled ${count} field${count === 1 ? '' : 's'}. Review every answer, then submit yourself.`;
}

/** A small dismissible notice in the top right corner. Text only, never HTML. */
export function showBanner(doc: Document, count: number): HTMLElement {
  doc.getElementById(BANNER_ID)?.remove();
  const box = doc.createElement('div');
  box.id = BANNER_ID;
  box.setAttribute('role', 'status');
  Object.assign(box.style, {
    position: 'fixed',
    top: '12px',
    right: '12px',
    zIndex: '2147483647',
    maxWidth: '320px',
    padding: '10px 12px',
    background: '#eff6ff',
    color: '#1e3a8a',
    border: '1px solid #93c5fd',
    borderRadius: '8px',
    font: '14px/1.4 system-ui, sans-serif',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-start',
  });
  const text = doc.createElement('span');
  text.textContent = bannerText(count);
  const close = doc.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Dismiss JobLume message');
  Object.assign(close.style, { border: '0', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '16px', lineHeight: '1' });
  close.addEventListener('click', () => box.remove());
  box.append(text, close);
  (doc.body ?? doc.documentElement).append(box);
  return box;
}
```

Create `extension/src/run-autofill.ts`:

```ts
import { adapterForHost } from './adapters';
import { base64ToBytes } from './b64';
import { fillForm, formPresent } from './fill/engine';
import { sleep, waitFor } from './fill/wait';
import type { CvReply, PayloadReply } from './messages';
import { showBanner } from './ui/banner';

export interface RunDeps {
  doc: Document;
  host: string;
  /** Sends a runtime message to the background and returns its reply (undefined when there is none). */
  send<T>(msg: unknown): Promise<T | undefined>;
  /** How long to wait for the form to appear. */
  waitMs: number;
  /** Pause after the form appears, so a framework finishes its first render before values are set. */
  settleMs: number;
}

/** One attempt on the current page. Returns how many fields were filled (0 when nothing applies). */
export async function runAutofill(d: RunDeps): Promise<{ filled: number }> {
  const adapter = adapterForHost(d.host);
  if (!adapter) return { filled: 0 };
  const reply = await d.send<PayloadReply>({ type: 'joblume:get-payload' });
  const payload = reply?.payload;
  if (!payload) return { filled: 0 };

  const found = await waitFor(d.doc, () => (formPresent(d.doc, adapter) ? true : null), d.waitMs);
  if (!found) return { filled: 0 };
  await sleep(d.settleMs);

  let cv: File | null = null;
  if (payload.cv && adapter.find(d.doc, 'cv_file')) {
    const res = await d.send<CvReply>({ type: 'joblume:fetch-cv', url: payload.cv.url });
    if (res?.ok) cv = new File([base64ToBytes(res.base64) as BlobPart], payload.cv.filename, { type: res.contentType });
  }

  const result = fillForm(d.doc, adapter, payload, cv);
  if (result.filled > 0) {
    showBanner(d.doc, result.filled);
    await d.send({ type: 'joblume:done', filled: result.filled });
  }
  return { filled: result.filled };
}
```

Create `extension/src/content/forms.ts` (the entry injected on the four form hosts; covered by the build and the manual checklist):

```ts
import { adapterForHost } from '../adapters';
import { runAutofill } from '../run-autofill';

const WAIT_MS = 15_000;
const SETTLE_MS = 400;

async function send<T>(msg: unknown): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as T | undefined;
  } catch {
    return undefined;
  }
}

if (adapterForHost(location.hostname)) {
  let running = false;
  let finished = false;

  const attempt = async () => {
    if (running || finished) return;
    running = true;
    try {
      const { filled } = await runAutofill({ doc: document, host: location.hostname, send, waitMs: WAIT_MS, settleMs: SETTLE_MS });
      if (filled > 0) finished = true;
    } finally {
      running = false;
    }
  };

  void attempt();

  // Ashby and Workable change pages without a reload: try again when the address changes.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      void attempt();
    }
  }, 1000);
}
```

Create `extension/src/popup/render.ts`:

```ts
import type { StatusReply } from '../messages';

export interface PopupActions {
  onClear(): void;
  docsUrl: string;
}

export function describeStatus(status: StatusReply, now: number): string {
  if (!status.armed) return 'Nothing is waiting to be filled in this tab.';
  const { title, company } = status.label ?? { title: '', company: '' };
  const job = title && company ? `${title} at ${company}` : title || company || 'a job from JobLume';
  const minutes = Math.max(1, Math.ceil(((status.expiresAt ?? now) - now) / 60_000));
  return `Ready to fill: ${job}. It expires in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

/** Draws the popup. Everything is set through textContent, never innerHTML. */
export function renderPopup(root: HTMLElement, status: StatusReply, now: number, actions: PopupActions): void {
  const doc = root.ownerDocument;
  root.replaceChildren();

  const heading = doc.createElement('h1');
  heading.textContent = 'JobLume Autofill';

  const text = doc.createElement('p');
  text.id = 'status';
  text.textContent = describeStatus(status, now);

  const note = doc.createElement('p');
  note.textContent = 'The extension fills standard fields only. You review everything and press Submit yourself.';

  root.append(heading, text, note);

  if (status.armed) {
    const clear = doc.createElement('button');
    clear.type = 'button';
    clear.id = 'clear';
    clear.textContent = 'Clear';
    clear.addEventListener('click', actions.onClear);
    root.append(clear);
  }

  const help = doc.createElement('a');
  help.id = 'help';
  help.href = actions.docsUrl;
  help.target = '_blank';
  help.rel = 'noopener noreferrer';
  help.textContent = 'Setup help';
  root.append(help);
}
```

Create `extension/src/popup/popup.ts`:

```ts
import type { StatusReply } from '../messages';
import { renderPopup } from './render';

async function main() {
  const root = document.getElementById('app');
  if (!root) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;

  const draw = async () => {
    const status = tabId === undefined ? undefined : ((await chrome.runtime.sendMessage({ type: 'joblume:status', tabId })) as StatusReply | null);
    renderPopup(root, status ?? { armed: false, label: null, expiresAt: null }, Date.now(), {
      docsUrl: __DOCS_URL__,
      onClear: () => {
        void chrome.runtime.sendMessage({ type: 'joblume:clear', tabId }).then(draw);
      },
    });
  };
  await draw();
}

void main();
```

Create `extension/src/popup/popup.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>JobLume Autofill</title>
    <style>
      body { width: 300px; margin: 0; padding: 12px; font: 14px/1.4 system-ui, sans-serif; color: #0f172a; }
      h1 { margin: 0 0 8px; font-size: 16px; }
      p { margin: 0 0 8px; }
      button { margin: 0 8px 8px 0; padding: 6px 12px; border: 1px solid #93c5fd; border-radius: 6px; background: #eff6ff; cursor: pointer; }
      a { color: #1d4ed8; }
    </style>
  </head>
  <body>
    <main id="app"></main>
    <script src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Run all extension tests and the type check**

Run: `npm test -w joblume-extension && npm run typecheck -w joblume-extension`
Expected: PASS for all 12 test files (about 139 tests), no type errors.

- [ ] **Step 5: Build the extension and check the output**

Run: `npm run build:extension`
Expected: a warning line `EXTENSION_STORAGE_HOST is not set: the CV download is allowed from any *.supabase.co host...`, then esbuild lists `dist\forms.js` (about 15 kb), `dist\background.js` (about 10 kb), `dist\popup.js` (about 2 kb), `dist\bridge.js` (about 2 kb), and `Built ...\extension\dist`.

Run: `ls extension/dist && node -e "const m=JSON.parse(require('fs').readFileSync('extension/dist/manifest.json','utf8')); console.log('manifest_version', m.manifest_version, 'permissions', m.permissions.join(','), 'hosts', m.host_permissions.length)"`
Expected: files `background.js bridge.js forms.js manifest.json popup.html popup.js`, and `manifest_version 3 permissions storage,tabs hosts 7`.

Run: `EXTENSION_JOBLUME_ORIGINS="https://app.joblume.example,http://localhost:3000" EXTENSION_STORAGE_HOST=abcd1234.supabase.co npm run build:extension && grep -c "abcd1234.supabase.co" extension/dist/manifest.json extension/dist/background.js`
Expected: no warning this time; the counts are `1` for the manifest and `1` for the background bundle. Then rebuild once with defaults (`npm run build:extension`) so `dist` matches the default setup.

- [ ] **Step 6: Commit**

```bash
git add extension/src/ui/banner.ts extension/src/run-autofill.ts extension/src/content/forms.ts extension/src/popup/render.ts extension/src/popup/popup.ts extension/src/popup/popup.html extension/tests/run-autofill.test.ts extension/tests/ui.test.ts
git commit -m "feat(extension): popup, fill banner and form-page content script

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Web button in the assisted-apply panel (ping/pong, fetch payload, post message)

**Files:**
- Create: `web/src/lib/extension-bridge.ts`, `web/src/components/applications/FillWithExtension.tsx`, `web/public/extension-setup.html`
- Modify: `web/src/components/applications/AssistedApplyPanel.tsx`, `web/src/components/applications/ApplicationDetail.tsx`, `web/src/lib/api/endpoints.ts`
- Test (create): `web/tests/lib/extension-bridge.test.ts`, `web/tests/components/fill-with-extension.test.tsx`
- Test (modify): `web/tests/components/assisted-apply-panel.test.tsx`, `web/tests/lib/api-endpoints-phase6.test.ts`

**Interfaces:**
- Consumes: `AutofillPayload` (Task 1); `GET /applications/:id/autofill` (Task 2); the page protocol of the bridge (Task 6): ping/pong, fill/armed, filled.
- Produces: `createExtensionBridge(win?, timeouts?): ExtensionBridge` with `ping(): Promise<boolean>`, `fill(payload, label): Promise<FillResult>`, `onFilled(cb): () => void`; `FillResult = { ok: true } | { ok: false; error: 'invalid_payload' | 'not_allowed' | 'tab_failed' | 'no_reply' | 'unknown' }`; `<FillWithExtension app loadPayload bridge? />`; `createApi(...).getAutofill(id): Promise<AutofillPayload>`; `AssistedApplyPanel` prop `fillAction?: ReactNode`.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/lib/extension-bridge.test.ts`:

```ts
import type { AutofillPayload } from '@joblume/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExtensionBridge } from '@/lib/extension-bridge';

const payload: AutofillPayload = {
  job_url: 'https://job-boards.greenhouse.io/acme/jobs/1', full_name: 'Ada Lovelace', first_name: 'Ada', last_name: 'Lovelace', email: 'a@b.c',
  phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null, cover_letter: null, cv: null,
};
const label = { title: 'Data Analyst', company: 'Acme' };

/** Delivers a message the way the extension's content script does: from this window, on this origin. */
function fromExtension(data: unknown, init: { origin?: string; source?: Window | null } = {}) {
  window.dispatchEvent(
    new MessageEvent('message', { data, origin: init.origin ?? window.location.origin, source: init.source === undefined ? window : init.source }),
  );
}

/** Makes window.postMessage answer like the extension would. */
function extensionAnswers(reply: (sent: Record<string, unknown>) => unknown) {
  return vi.spyOn(window, 'postMessage').mockImplementation(((sent: Record<string, unknown>) => {
    const r = reply(sent);
    if (r !== undefined) setTimeout(() => fromExtension(r), 0);
  }) as typeof window.postMessage);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('extension bridge', () => {
  it('pings with the web tag on this origin and sees the pong', async () => {
    const post = extensionAnswers((m) => (m.type === 'ping' ? { source: 'joblume-extension', type: 'pong' } : undefined));
    expect(await createExtensionBridge().ping()).toBe(true);
    expect(post).toHaveBeenCalledWith({ source: 'joblume-web', type: 'ping' }, window.location.origin);
  });

  it('reports not installed when nothing answers', async () => {
    extensionAnswers(() => undefined);
    expect(await createExtensionBridge(window, { ping: 20, fill: 20 }).ping()).toBe(false);
  });

  it('ignores a pong from another origin, another window or without the extension tag', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation((() => {
      fromExtension({ source: 'joblume-extension', type: 'pong' }, { origin: 'https://evil.example' });
      fromExtension({ source: 'joblume-extension', type: 'pong' }, { source: null });
      fromExtension({ source: 'someone-else', type: 'pong' });
    }) as typeof window.postMessage);
    expect(await createExtensionBridge(window, { ping: 30, fill: 30 }).ping()).toBe(false);
  });

  it('sends the payload and label in a fill message and resolves ok when the extension arms it', async () => {
    const post = extensionAnswers((m) => (m.type === 'fill' ? { source: 'joblume-extension', type: 'armed', ok: true } : undefined));
    expect(await createExtensionBridge().fill(payload, label)).toEqual({ ok: true });
    expect(post).toHaveBeenCalledWith({ source: 'joblume-web', type: 'fill', payload, label }, window.location.origin);
  });

  it('passes on a known refusal, maps an unknown one, and times out to no_reply', async () => {
    extensionAnswers(() => ({ source: 'joblume-extension', type: 'armed', ok: false, error: 'invalid_payload' }));
    expect(await createExtensionBridge().fill(payload, label)).toEqual({ ok: false, error: 'invalid_payload' });
    vi.restoreAllMocks();

    extensionAnswers(() => ({ source: 'joblume-extension', type: 'armed', ok: false, error: '<script>' }));
    expect(await createExtensionBridge().fill(payload, label)).toEqual({ ok: false, error: 'unknown' });
    vi.restoreAllMocks();

    extensionAnswers(() => undefined);
    expect(await createExtensionBridge(window, { ping: 20, fill: 20 }).fill(payload, label)).toEqual({ ok: false, error: 'no_reply' });
  });

  it('reports filled counts, ignores anything malformed, and stops after unsubscribe', () => {
    const seen: number[] = [];
    const stop = createExtensionBridge().onFilled((n) => seen.push(n));
    fromExtension({ source: 'joblume-extension', type: 'filled', count: 5 });
    fromExtension({ source: 'joblume-extension', type: 'filled', count: '5' });
    fromExtension({ source: 'joblume-extension', type: 'filled', count: -1 });
    fromExtension({ source: 'joblume-extension', type: 'filled', count: 5 }, { origin: 'https://evil.example' });
    fromExtension({ source: 'joblume-web', type: 'filled', count: 5 });
    expect(seen).toEqual([5]);
    stop();
    fromExtension({ source: 'joblume-extension', type: 'filled', count: 6 });
    expect(seen).toEqual([5]);
  });
});
```

Create `web/tests/components/fill-with-extension.test.tsx`:

```tsx
import type { AutofillPayload } from '@joblume/shared';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FillWithExtension } from '@/components/applications/FillWithExtension';
import type { ExtensionBridge, FillResult } from '@/lib/extension-bridge';

const payload: AutofillPayload = {
  job_url: 'https://job-boards.greenhouse.io/acme/jobs/1', full_name: 'Ada Lovelace', first_name: 'Ada', last_name: 'Lovelace', email: 'a@b.c',
  phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null, cover_letter: 'Hello', cv: null,
};
const app = { id: 'a1', job: { title: 'Data Analyst', company: 'Acme', location: 'Lagos', source: 'myjobmag', url: 'https://example.com/job/1', company_domain: null } };

type Ping = () => Promise<boolean>;
type Fill = (p: AutofillPayload, label: { title: string; company: string }) => Promise<FillResult>;
type Load = (id: string) => Promise<AutofillPayload>;

function setup(opts: { installed?: boolean; fill?: FillResult; load?: Load } = {}) {
  let filledCb: ((n: number) => void) | undefined;
  const ping = vi.fn<Ping>().mockImplementation(async () => opts.installed ?? true);
  const fill = vi.fn<Fill>().mockImplementation(async () => opts.fill ?? { ok: true });
  const bridge: ExtensionBridge = { ping, fill, onFilled: (cb) => { filledCb = cb; return () => { filledCb = undefined; }; } };
  const loadPayload = vi.fn<Load>().mockImplementation(opts.load ?? (async () => payload));
  render(<FillWithExtension app={app} loadPayload={loadPayload} bridge={bridge} />);
  return { ping, fill, loadPayload, filled: (n: number) => act(() => filledCb?.(n)), user: userEvent.setup() };
}

describe('FillWithExtension', () => {
  it('shows the fill button when the extension answers the handshake', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Fill the form with the JobLume extension' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Install the extension' })).toBeNull();
  });

  it('shows only a help link when the extension is not installed', async () => {
    setup({ installed: false });
    const link = await screen.findByRole('link', { name: 'Install the extension' });
    expect(link).toHaveAttribute('href', '/extension-setup.html');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows nothing while the handshake is still pending', () => {
    const bridge: ExtensionBridge = { ping: () => new Promise<boolean>(() => undefined), fill: vi.fn(), onFilled: () => () => undefined };
    const { container } = render(<FillWithExtension app={app} loadPayload={vi.fn()} bridge={bridge} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('fetches the payload, sends it with the job label, and never marks the application applied', async () => {
    const { fill, loadPayload, user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Fill the form with the JobLume extension' }));
    expect(loadPayload).toHaveBeenCalledWith('a1');
    expect(fill).toHaveBeenCalledWith(payload, { title: 'Data Analyst', company: 'Acme' });
    expect(await screen.findByRole('status')).toHaveTextContent('Opened the job in a new tab');
    expect(screen.queryByText(/marked as applied/i)).toBeNull();
  });

  it('shows how many fields were filled when the extension reports back', async () => {
    const { filled, user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Fill the form with the JobLume extension' }));
    filled(6);
    expect(await screen.findByText(/JobLume filled 6 fields/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('submit yourself');
  });

  it('explains a refusal from the extension', async () => {
    const { user } = setup({ fill: { ok: false, error: 'invalid_payload' } });
    await user.click(await screen.findByRole('button', { name: 'Fill the form with the JobLume extension' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('refused the data');
  });

  it('explains a failure to load the payload and sends nothing', async () => {
    const { fill, user } = setup({ load: async () => { throw new Error('boom'); } });
    await user.click(await screen.findByRole('button', { name: 'Fill the form with the JobLume extension' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(fill).not.toHaveBeenCalled();
  });
});
```

In `web/tests/components/assisted-apply-panel.test.tsx`, directly before the test `  it('marks the application as applied', async () => {` insert:

```tsx
  it('shows an optional autofill action above the manual steps, and nothing when it is omitted', () => {
    const { rerender } = render(<AssistedApplyPanel app={detail()} onMarkApplied={() => {}} />);
    expect(screen.queryByText('Fill it for me')).toBeNull();
    rerender(<AssistedApplyPanel app={detail()} onMarkApplied={() => {}} fillAction={<button type="button">Fill it for me</button>} />);
    expect(screen.getByRole('button', { name: 'Fill it for me' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open job link' })).toBeInTheDocument();
  });

```

In `web/tests/lib/api-endpoints-phase6.test.ts`, directly before the line `describe('Phase 6 API calls', () => {` insert:

```ts
describe('Phase 8 API calls', () => {
  it('getAutofill reads /applications/:id/autofill', async () => {
    const request = vi.fn().mockResolvedValue({ job_url: 'https://example.com/j' });
    const api = createApi(request as unknown as ApiClient);
    await api.getAutofill('3f2b8c1e-9a4d-4e7b-8c55-1a2b3c4d5e6f');
    expect(request).toHaveBeenLastCalledWith('/applications/3f2b8c1e-9a4d-4e7b-8c55-1a2b3c4d5e6f/autofill');
  });
});

```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w web -- tests/lib/extension-bridge.test.ts tests/components/fill-with-extension.test.tsx tests/components/assisted-apply-panel.test.tsx tests/lib/api-endpoints-phase6.test.ts`
Expected: FAIL: `Failed to resolve import "@/lib/extension-bridge"`, `@/components/applications/FillWithExtension`; the panel test finds no "Fill it for me" button; `api.getAutofill is not a function`.

- [ ] **Step 3: Implement the bridge, the component and the help page**

Create `web/src/lib/extension-bridge.ts`:

```ts
import type { AutofillPayload } from '@joblume/shared';

/** Tags on window.postMessage data. They must match extension/src/messages.ts. */
export const WEB_SOURCE = 'joblume-web';
export const EXT_SOURCE = 'joblume-extension';

export interface JobLabel {
  title: string;
  company: string;
}

export type FillResult = { ok: true } | { ok: false; error: 'invalid_payload' | 'not_allowed' | 'tab_failed' | 'no_reply' | 'unknown' };

export interface ExtensionBridge {
  /** True when the extension answers the handshake (it is installed and allowed on this site). */
  ping(): Promise<boolean>;
  /** Hands the payload to the extension, which opens the job in a new tab. Resolves once it says whether it accepted it. */
  fill(payload: AutofillPayload, label: JobLabel): Promise<FillResult>;
  /** Calls back with how many fields the extension filled. Returns a function that stops listening. */
  onFilled(cb: (count: number) => void): () => void;
}

const KNOWN_ERRORS = ['invalid_payload', 'not_allowed', 'tab_failed', 'no_reply'] as const;

/**
 * Only what the page itself received from the extension's content script counts: same window, same origin,
 * tagged as coming from the extension. Anything else is ignored.
 */
function fromExtension(win: Window, event: MessageEvent): Record<string, unknown> | null {
  if (event.source !== win || event.origin !== win.location.origin) return null;
  const d: unknown = event.data;
  if (typeof d !== 'object' || d === null) return null;
  const msg = d as Record<string, unknown>;
  return msg.source === EXT_SOURCE ? msg : null;
}

export function createExtensionBridge(win: Window = window, timeouts = { ping: 800, fill: 5000 }): ExtensionBridge {
  const post = (data: Record<string, unknown>) => win.postMessage({ source: WEB_SOURCE, ...data }, win.location.origin);

  function once<T>(type: string, ms: number, pick: (msg: Record<string, unknown>) => T, onTimeout: T, send: () => void): Promise<T> {
    return new Promise((resolve) => {
      const done = (value: T) => {
        win.removeEventListener('message', listener);
        clearTimeout(timer);
        resolve(value);
      };
      const listener = (event: MessageEvent) => {
        const msg = fromExtension(win, event);
        if (msg && msg.type === type) done(pick(msg));
      };
      const timer = setTimeout(() => done(onTimeout), ms);
      win.addEventListener('message', listener);
      send();
    });
  }

  return {
    ping: () => once('pong', timeouts.ping, () => true, false, () => post({ type: 'ping' })),

    fill: (payload, label) =>
      once<FillResult>(
        'armed',
        timeouts.fill,
        (msg) => {
          if (msg.ok === true) return { ok: true };
          const error = KNOWN_ERRORS.find((e) => e === msg.error);
          return { ok: false, error: error ?? 'unknown' };
        },
        { ok: false, error: 'no_reply' },
        () => post({ type: 'fill', payload, label }),
      ),

    onFilled(cb) {
      const listener = (event: MessageEvent) => {
        const msg = fromExtension(win, event);
        if (msg && msg.type === 'filled' && typeof msg.count === 'number' && Number.isInteger(msg.count) && msg.count >= 0 && msg.count <= 999) cb(msg.count);
      };
      win.addEventListener('message', listener);
      return () => win.removeEventListener('message', listener);
    },
  };
}
```

Create `web/src/components/applications/FillWithExtension.tsx`:

```tsx
'use client';

import type { ApplicationDetail, AutofillPayload } from '@joblume/shared';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { describeApiError } from '@/lib/api/errors';
import { createExtensionBridge, type ExtensionBridge, type FillResult } from '@/lib/extension-bridge';

export interface FillWithExtensionProps {
  app: Pick<ApplicationDetail, 'id' | 'job'>;
  /** Fetches the autofill payload for an application (GET /applications/:id/autofill). */
  loadPayload(id: string): Promise<AutofillPayload>;
  /** Injected in tests; the real window bridge by default. */
  bridge?: ExtensionBridge;
}

type Install = 'checking' | 'installed' | 'missing';
type Progress =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'sent' }
  | { kind: 'filled'; count: number }
  | { kind: 'error'; message: string };

const REFUSALS: Record<Exclude<FillResult, { ok: true }>['error'], string> = {
  invalid_payload: 'The extension refused the data. A link may not start with https://. Use "Open job link" below instead.',
  not_allowed: 'The extension does not trust this site yet. Rebuild it with this address, as described in the setup guide.',
  tab_failed: 'The extension could not open a new tab. Use "Open job link" below instead.',
  no_reply: 'The extension did not answer. Reload this page and try again.',
  unknown: 'The extension did not accept the data. Reload this page and try again.',
};

export function FillWithExtension({ app, loadPayload, bridge }: FillWithExtensionProps) {
  const [api] = useState<ExtensionBridge>(() => bridge ?? createExtensionBridge());
  const [install, setInstall] = useState<Install>('checking');
  const [progress, setProgress] = useState<Progress>({ kind: 'idle' });

  useEffect(() => {
    let live = true;
    void api.ping().then((ok) => {
      if (live) setInstall(ok ? 'installed' : 'missing');
    });
    const stop = api.onFilled((count) => {
      if (live) setProgress({ kind: 'filled', count });
    });
    return () => {
      live = false;
      stop();
    };
  }, [api]);

  async function start() {
    setProgress({ kind: 'working' });
    try {
      const payload = await loadPayload(app.id);
      const result = await api.fill(payload, { title: app.job?.title ?? '', company: app.job?.company ?? '' });
      setProgress(result.ok ? { kind: 'sent' } : { kind: 'error', message: REFUSALS[result.error] });
    } catch (err) {
      setProgress({ kind: 'error', message: describeApiError(err) });
    }
  }

  if (install === 'checking') return null;

  if (install === 'missing') {
    return (
      <p className="text-sm text-muted-foreground">
        Want the form filled for you?{' '}
        <a href="/extension-setup.html" target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
          Install the extension
        </a>
        .
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button size="sm" onClick={() => void start()} disabled={progress.kind === 'working'}>
        {progress.kind === 'working' ? 'Preparing…' : 'Fill the form with the JobLume extension'}
      </Button>
      <p className="text-xs text-muted-foreground">Opens the job in a new tab and fills the standard fields. It never submits. You review every answer.</p>
      {progress.kind === 'sent' && (
        <p role="status" className="text-sm text-emerald-600">
          Opened the job in a new tab. When its form appears, the extension fills it.
        </p>
      )}
      {progress.kind === 'filled' && (
        <p role="status" className="text-sm text-emerald-600">
          JobLume filled {progress.count} {progress.count === 1 ? 'field' : 'fields'}. Review every answer, then submit yourself. Come back here and press Mark as applied when you have.
        </p>
      )}
      {progress.kind === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {progress.message}
        </p>
      )}
    </div>
  );
}
```

Create `web/public/extension-setup.html` (Next serves everything in `web/public` at the site root, so this is reachable at `/extension-setup.html`):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>JobLume Autofill extension: setup</title>
    <style>
      body { max-width: 40rem; margin: 2rem auto; padding: 0 1rem; font: 16px/1.5 system-ui, sans-serif; color: #0f172a; }
      code { background: #f1f5f9; padding: 0.1rem 0.3rem; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>JobLume Autofill extension</h1>
    <p>The extension fills the standard fields of employer application forms (Greenhouse, Lever, Ashby and Workable) from your JobLume details. It never submits anything: you review every answer and press Submit yourself.</p>
    <h2>Install it (Chrome, Edge or Brave on a computer)</h2>
    <ol>
      <li>Ask whoever runs your JobLume for the <code>extension/dist</code> folder, or build it: in the JobLume folder run <code>npm run build -w joblume-extension</code>.</li>
      <li>Open <code>chrome://extensions</code> in the browser and switch on <strong>Developer mode</strong> (top right).</li>
      <li>Press <strong>Load unpacked</strong> and choose the <code>extension/dist</code> folder.</li>
      <li>Come back to JobLume and reload this page. Open an application: a <strong>Fill the form with the JobLume extension</strong> button appears.</li>
    </ol>
    <p>Fill in <strong>Settings, Contact details for application forms</strong> first so there is something to fill.</p>
    <p>Full guide: <code>docs/extension-setup.md</code> in the JobLume project.</p>
  </body>
</html>
```

- [ ] **Step 4: Wire the endpoint, the panel and the detail view**

In `web/src/lib/api/endpoints.ts`:
1. In the type import list, after the line `  ApplicationStatus,` add the line `  AutofillPayload,`.
2. Directly before the line `    updateApplicationText: (id: string, patch: { tailored_cv_text?: string; cover_letter_text?: string }) =>` add:

```ts
    getAutofill: (id: string) => request<AutofillPayload>(`/applications/${encodeURIComponent(id)}/autofill`),
```

In `web/src/components/applications/AssistedApplyPanel.tsx`:
1. Replace `import { useState } from 'react';` with `import { useState, type ReactNode } from 'react';`.
2. In `AssistedApplyPanelProps`, after the line `  onDone?(): void;` add:

```ts
  /** Optional autofill action (the JobLume extension button), shown above the manual steps. */
  fillAction?: ReactNode;
```

3. Replace the function signature line `export function AssistedApplyPanel({ app, onMarkApplied, pending = false, lockedReason, applied = false, onOpenNext, onDone }: AssistedApplyPanelProps) {` with the same line plus `fillAction` in the destructuring: `export function AssistedApplyPanel({ app, onMarkApplied, pending = false, lockedReason, applied = false, onOpenNext, onDone, fillAction }: AssistedApplyPanelProps) {`.
4. Directly before the line `      <ol className="space-y-3 text-sm">` insert:

```tsx
      {fillAction ? <div className="rounded-lg border border-border/70 bg-white p-3">{fillAction}</div> : null}
```

In `web/src/components/applications/ApplicationDetail.tsx`:
1. Replace `import { AssistedApplyPanel } from './AssistedApplyPanel';` with:

```tsx
import { getApi } from '@/lib/api/runtime';
import { AssistedApplyPanel } from './AssistedApplyPanel';
import { FillWithExtension } from './FillWithExtension';
```

2. In the `<AssistedApplyPanel ... />` element, after the line `                  onDone={onClose}` add:

```tsx
                  fillAction={<FillWithExtension app={data} loadPayload={(appId) => getApi().getAutofill(appId)} />}
```

- [ ] **Step 5: Run the web tests and the type check**

Run: `npm run typecheck -w web && npm test -w web`
Expected: PASS for the whole web suite (about 346 tests), no type errors. The existing `ApplicationDetail` tests keep passing: they mock `@/hooks/api` only, and the new button pings a window nobody answers, so it renders the small "Install the extension" line after 0.8 s.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/extension-bridge.ts web/src/components/applications/FillWithExtension.tsx web/public/extension-setup.html web/src/components/applications/AssistedApplyPanel.tsx web/src/components/applications/ApplicationDetail.tsx web/src/lib/api/endpoints.ts web/tests/lib/extension-bridge.test.ts web/tests/components/fill-with-extension.test.tsx web/tests/components/assisted-apply-panel.test.tsx web/tests/lib/api-endpoints-phase6.test.ts
git commit -m "feat(web): fill-with-extension button in the assisted-apply panel

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Docs, manual checklist and final verification

**Files:**
- Modify: `README.md`
- Create: `docs/extension-setup.md`, `docs/phase8-manual-checklist.md`

- [ ] **Step 1: README section**

In `README.md`, directly before the line `## Getting a test token (API only, without the web app)` insert:

```markdown
## Autofill extension (Phase 8)

- **What it does:** a Chrome (also Edge and Brave) extension that fills the standard fields of Greenhouse, Lever, Ashby and Workable application forms from your JobLume details and your tailored CV. It never submits, never answers custom or demographic questions and never overwrites text that is already there. You review everything and press Submit yourself.
- **Database:** apply `supabase/migrations/0007_contact_profile.sql` in the Supabase SQL editor BEFORE starting the new server. Then fill in Settings, "Contact details for application forms" (web or phone app).
- **Install:** `npm install`, `npm run build:extension`, then load `extension/dist` unpacked at `chrome://extensions` with Developer mode on. To use a deployed web address, set `EXTENSION_JOBLUME_ORIGINS` and `EXTENSION_STORAGE_HOST` before building. Full steps: `docs/extension-setup.md`.
- **Use:** in an application's "apply on the employer's site" panel press "Fill the form with the JobLume extension", check every answer on the employer's form, submit it yourself, then press Mark as applied in JobLume.
- **Limits:** form markup changes over time, so adapters need occasional updates; other systems (Workday, iCIMS and so on) are not covered; the extension is loaded unpacked, not from the Chrome Web Store.
- **Test it:** work through `docs/phase8-manual-checklist.md`.

```

- [ ] **Step 2: Setup guide**

Create `docs/extension-setup.md`:

````markdown
# JobLume Autofill extension: setup

The extension fills the standard fields of employer application forms from the details in JobLume: name, email, phone, city, LinkedIn, GitHub and website links, your tailored CV and your cover letter. It works on Greenhouse, Lever, Ashby and Workable forms in Chrome, Edge and Brave on a computer. **It never submits anything.** You review every answer and press Submit yourself.

It never fills custom questions, passwords, or anything about gender, race, ethnicity, veterans, disability, visa sponsorship, salary or referrals, and it never overwrites a box that already has text.

## 1. Fill in your contact details
Open JobLume, go to **Settings**, and complete **Contact details for application forms** (your phone, city and links; links must start with `https://`). Save.

## 2. Build the extension
From the JobLume folder, in a terminal:

```bash
npm install
npm run build:extension
```

This creates the folder `extension/dist`.

### Tell the extension where your JobLume lives
By default it only trusts `http://localhost:3000` (the app on your own computer). If you use the app at a web address, set it before building:

```bash
# Git Bash or macOS or Linux
EXTENSION_JOBLUME_ORIGINS="https://your-app.vercel.app,http://localhost:3000" EXTENSION_STORAGE_HOST="abcd1234.supabase.co" npm run build:extension
```

```powershell
# PowerShell
$env:EXTENSION_JOBLUME_ORIGINS = "https://your-app.vercel.app,http://localhost:3000"
$env:EXTENSION_STORAGE_HOST = "abcd1234.supabase.co"
npm run build:extension
```

- `EXTENSION_JOBLUME_ORIGINS`: the address(es) of your JobLume web app, comma separated, no path and no trailing slash. Only `https` addresses are accepted, apart from `localhost`.
- `EXTENSION_STORAGE_HOST`: the host of your Supabase project (the part of `SUPABASE_URL` after `https://`, for example `abcd1234.supabase.co`). The CV is only downloaded from this host. If you leave it out, any `*.supabase.co` host is allowed and the build prints a warning.

After changing either value, build again and press the reload arrow on the extension's card at `chrome://extensions`.

## 3. Load it into the browser
1. Open `chrome://extensions` (in Edge `edge://extensions`, in Brave `brave://extensions`).
2. Switch on **Developer mode** (top right).
3. Press **Load unpacked** and choose the `extension/dist` folder.
4. Optional: pin the JobLume Autofill icon from the puzzle-piece menu.

## 4. Use it
1. In JobLume open an application whose email is missing (the "Site" kind).
2. Press **Fill the form with the JobLume extension**. If you do not see the button, the extension is not installed or does not trust this address (see step 2).
3. The job opens in a new tab. If it leads to a Greenhouse, Lever, Ashby or Workable form, the extension fills it after a moment and shows a banner: "JobLume filled N fields. Review every answer, then submit yourself."
4. Check every answer, answer the custom questions yourself, then submit on the employer's site.
5. Back in JobLume press **Mark as applied**. The extension never does this for you.

The extension remembers what to fill for 30 minutes, only in the tab it opened, and forgets it after a fill or when the tab closes. The toolbar icon shows what is waiting in the current tab and has a **Clear** button.

## When something does not work
- **No button in JobLume:** reload the page; check the build used your app's address (`EXTENSION_JOBLUME_ORIGINS`); check the extension is switched on at `chrome://extensions`.
- **Nothing is filled:** the page may not be one of the four supported forms (many "Apply" links go to Workday, iCIMS and others, which are not covered). Open the form's own page and wait up to 15 seconds.
- **Some boxes stay empty:** the form may have changed its markup, or the box is a custom question. Fill those yourself. If a whole platform stops working, see "What to do when a platform changes" in `docs/phase8-manual-checklist.md`.
- **The CV was not attached:** the signed CV link lasts one hour; press the button again from JobLume.
````

- [ ] **Step 3: Manual checklist**

Create `docs/phase8-manual-checklist.md`:

```markdown
# Phase 8 manual checklist (autofill extension)

The automated tests use fakes and saved copies of real forms. This checklist uses your real Supabase project, Chrome and live job pages. You do not need to be technical: tick each box as you go. Nothing here submits an application unless you press Submit yourself, so use a posting you do not mind opening.

## Before starting (do these in order)
- [ ] **Update the database first.** Open your Supabase project, go to the SQL editor, paste the whole of `supabase/migrations/0007_contact_profile.sql` and run it. It must finish without errors. Do this BEFORE you start or restart the server.
- [ ] In Table editor check that `profiles` now has the columns `phone`, `city`, `linkedin_url`, `github_url` and `portfolio_url`.
- [ ] Run `npm install`, then `npm run dev` (server and web).
- [ ] Run `npm run build:extension`. It must finish with "Built ...extension\dist". If you use JobLume at a web address (not localhost), follow `docs/extension-setup.md` step 2 first.

## Settings (web and phone app)
- [ ] Web: Settings shows a card "Contact details for application forms". Enter your full name, phone, city and links, press **Save contact details**: it says "Saved." Reload: the values are still there.
- [ ] A link that starts with `http://` is refused with a message; a phone with letters is refused.
- [ ] Phone app: the same section appears in Settings with the same boxes and saves the same way.
- [ ] Clearing a box and saving removes it.

## Load the extension (Chrome, Edge or Brave)
- [ ] Open `chrome://extensions` and switch on **Developer mode**.
- [ ] Press **Load unpacked** and choose the `extension\dist` folder. A card "JobLume Autofill" appears with no red "Errors" button.
- [ ] Reload the JobLume web page, open an application in the "Site" kind: the button **Fill the form with the JobLume extension** is visible. (With the extension switched off at `chrome://extensions` it is replaced by an "Install the extension" link.)
- [ ] The toolbar icon opens a small popup that says nothing is waiting, with a **Setup help** link.

## Try each platform on a real posting
For each platform, open a real, public job in JobLume's queue if you have one, or any public posting you like. Open its application in JobLume and press the button. The job opens in a new tab.

- [ ] **Greenhouse** (`job-boards.greenhouse.io` or `boards.greenhouse.io`): first name, last name, email, phone and your LinkedIn answer are filled; the CV is attached under Resume/CV; the cover letter is attached as `cover-letter.txt`. The country box, custom questions and every "Voluntary Self-Identification" box are empty. Nothing was submitted. Verified against a saved real form.
- [ ] **Lever** (`jobs.lever.co/.../apply`): full name, email, phone, current location, the LinkedIn, GitHub and portfolio boxes are filled; the CV is attached. "Current company", the demographic questions and the consent tick box are untouched. The location box may show suggestions: pick one if the page asks. Verified against saved real forms.
- [ ] **Ashby** (`jobs.ashbyhq.com/.../application`): name, email and the LinkedIn question are filled; the CV is attached to the Resume box (not the "autofill from resume" button at the top). Location, yes/no questions and essay answers are untouched. Verified against a saved copy of the live rendered page. If you land on the job description first, click **Application** yourself: the extension tries again when the page changes.
- [ ] **Workable** (`apply.workable.com/.../apply/`): first name, last name, email, the cover letter box, the CV and the LinkedIn and GitHub questions are filled. Summary, salary, notice period and yes/no questions are untouched. Phone is **UNVERIFIED against a live form** (the posting we saved had no phone box): note whether your posting has a phone box and whether it was filled.
- [ ] On every platform a banner appears: "JobLume filled N fields. Review every answer, then submit yourself." It can be dismissed with the x. Filled boxes have a light blue outline.
- [ ] Back in the JobLume tab a green message says how many fields were filled. The application is **not** marked as applied.
- [ ] Type something into a box first, then press the button again from JobLume: that box keeps your text.
- [ ] The toolbar popup, opened on the job tab before the fill, says "Ready to fill: <job title> at <company>"; after the fill it says nothing is waiting. **Clear** removes a waiting fill.
- [ ] Close the job tab before the form appears, then open the same job by hand: nothing is filled (the data was forgotten).
- [ ] A job whose link starts with `http://` shows a message instead of opening (the extension only accepts `https`).

## Safety spot checks
- [ ] On a form with a "Gender", "Race", "Veteran", "Disability", "visa sponsorship", "salary" or "How did you hear about us" box, that box stays empty.
- [ ] No button was clicked for you (the Submit button is still waiting for you).
- [ ] In `chrome://extensions` the card's "Details" page lists site access only for the five employer hosts, your JobLume address and your Supabase host.

## What to do when a platform changes
Employer sites change their forms from time to time. If a platform stops filling a box that used to work:
1. Open the form in Chrome, right-click the box, choose **Inspect**, and note its `id`, `name` and label text.
2. Compare with the adapter in `extension/src/adapters/<platform>.ts` (the comment at the top says what was seen and when).
3. Save a copy of the new form as a fixture (see `extension/tests/fixtures/`), update the adapter and its test in `extension/tests/adapters/`, run `npm test -w joblume-extension`, rebuild and press the reload arrow on the extension's card at `chrome://extensions`.
4. Until then, fill that platform's form by hand with the existing "Open job link", "Download CV PDF" and "Copy cover letter" steps. They are unchanged.

## Not verified from the build machine
- The extension has not been loaded into a real Chrome by the developer who built it. Chrome accepting the manifest (including the `http://localhost:3000/*` pattern and `all_frames`) is checked by you in the box "Load unpacked" above.
- The Workable phone box and the Lever cover letter box were not present in the saved forms; they use documented field names and label search only.
```

- [ ] **Step 4: Full verification**

Run: `npm run build:shared && npm run typecheck`
Expected: every workspace (shared, server, web, mobile, extension) type checks with no errors.

Run: `npm test`
Expected: every workspace passes (shared 124 tests, server 1133, web 346, mobile 392, extension 139). A logged `gmail callback failed` line in the server output is an expected log from an existing test.

Run: `npm run build:extension && node -e "const m=JSON.parse(require('fs').readFileSync('extension/dist/manifest.json','utf8')); console.log(m.manifest_version, m.host_permissions.join(' '))"`
Expected: `3` followed by the five form hosts, `http://localhost:3000/*` and `https://*.supabase.co/*`.

Run: `git status --short`
Expected: only `mobile/tsconfig.json` (the unrelated change that was already there) is modified and nothing is untracked except `extension/dist` if your global ignore does not cover it (the repo `.gitignore` ignores `dist/`).

- [ ] **Step 5: Commit**

```bash
git add README.md docs/extension-setup.md docs/phase8-manual-checklist.md
git commit -m "docs: Phase 8 autofill extension README section, setup guide and manual checklist

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand over the manual checks**

Tell the user: the extension has not been loaded into a real Chrome by the author of this plan; they must run `docs/phase8-manual-checklist.md` (first the SQL migration, then `chrome://extensions` Developer mode, Load unpacked, one real posting per platform). Platform status: Greenhouse and Lever verified against live static HTML; Ashby and Workable verified against live rendered DOM; Workable phone and the Lever and Ashby cover letter boxes unverified.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Migration `0007_contact_profile.sql`: five nullable columns, caps, https, phone rule | 1 |
| Profile PUT (strict zod) accepts contact fields; `full_name` persisted to `users.full_name` | 1 |
| Settings "Contact details for application forms" on web and mobile | 3 |
| `GET /applications/:id/autofill`: auth, user-scoped, 404 for others, exact keys, name split | 2 |
| Extension workspace, TypeScript, esbuild, Vitest + jsdom | 4 |
| Manifest V3, least privilege permissions, hosts from build-time env | 4, 10 (build check) |
| Handshake: ping/pong, fill, `event.source === window`, `event.origin === location.origin` | 6 |
| Strict payload validation (caps, https only, cv https only) | 5 |
| Arming: new tab, `storage.session` per tab id, 30 minute expiry, deleted after fill / tab close / expiry | 5 |
| Signed CV fetched in the background, https, storage host allow-list, 10 MB cap, used once | 5 |
| Fill: native setters, `input`/`change`/`blur`, outline, never overwrite, never click/submit, sensitive-label guard | 7 |
| Adapters Greenhouse, Lever, Ashby, Workable with fixtures from real pages | 8, 9 |
| Wait for the form (MutationObserver, 15 s cap), pages with no fields do nothing | 7, 10 |
| Banner "JobLume filled N fields. Review every answer, then submit yourself." | 10 |
| Popup: status for this tab, Clear, setup link | 10 |
| Web button visible only after the handshake, otherwise an install help link, never marks applied | 11 |
| Tests: validator, handshake with wrong origin, expiry and tab binding, endpoint and profile validation, button visibility and message sent | 1, 2, 5, 6, 11 |
| `docs/phase8-manual-checklist.md`, setup docs with chrome://extensions steps | 12 |
