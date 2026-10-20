# JobLume Phase 5 (Expo mobile app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Android-first Expo app (new `mobile/` workspace) with the same functions as the web dashboard, talking only to the existing Express API, plus the one server change it needs: a signed, allow-listed Gmail return path to the app.

**Architecture:** `mobile/` is an Expo SDK 58 app with Expo Router (file routes under `mobile/src/app`), bottom tabs (Queue, Tracker, Analytics, Settings) and stack screens for job detail and onboarding. Data goes through a copy of the web API client (`createApiClient` + `createApi`) with TanStack Query hooks that use the same keys and endpoint shapes as `web/src/hooks/api.ts`. Supabase JS is used only for email+password sign-in and session refresh, with its session kept in `expo-secure-store` through a chunking storage adapter. Pure logic already in `web/src/lib` is copied into `mobile/src/lib` together with its web tests (run under jest-expo), and new mobile-only logic (queue filters, auth redirect, chunked secure storage, Gmail deep-link parsing, CV file checks, safe external links) is written test-first with fakes. The server change adds an optional `return` target to `POST /gmail/connect`, kept inside the signed OAuth state, so the callback can redirect to `joblume://gmail-return?status=...`.

**Tech Stack:** Expo SDK 58 (`expo@~58.0.16`), `react-native@0.88.0`, `expo-router@~58.0.24`, React `19.3.1` (the repo-root override), TypeScript `~6.0.3` in `mobile/` (the version Expo 58's template uses; the other workspaces keep theirs), `@tanstack/react-query@^5.104.3`, `@supabase/supabase-js@^2.118.0`, `expo-secure-store@~58.0.2`, `expo-web-browser@~58.0.6`, `expo-document-picker@~58.0.4`, `expo-sharing@~58.0.19`, `expo-file-system@~58.0.10`, `expo-clipboard@~58.0.3`, `expo-linking@~58.0.13`, `expo-constants@~58.0.12`, `expo-status-bar@~58.0.3`, `react-native-safe-area-context@~5.10.1`, `react-native-screens@~4.30.0`. Tests: `jest@~30.5.2`, `jest-expo@~58.0.11`, `@react-native/jest-preset@0.88.0`, `@testing-library/react-native@^14.1.0` with its renderer `test-renderer@~1.3.0`, `@types/jest@^30.0.0`. Server side is unchanged: Express 4, zod 3, Vitest 5, supertest.

Every version above, the React 19.3.1 resolution and the Metro monorepo setup were checked while planning with `npm view` and a scratch install of this repo; see "Verified versions" and Decision 1 below.

## Global Constraints

- Goal (spec 1): "An Android-first Expo app with the same functions as the web dashboard, following the two Visily mobile mockups (`Joblume images/visily-mobile-home.jpg`, `visily-mobile-tracker.jpg`) and the web screens for the rest."
- Safety (spec 1): "Nothing sends without the user's tap on Send / Approve & Apply, except under the existing Auto-mode rules (server-side, unchanged)."
- Scope (spec 2): "Everything the web has: sign-in, queue, job detail (approve, email send, skip, assisted apply), tracker, analytics, settings (profile, apply mode, Gmail), onboarding with CV upload, follow-ups, paste-a-job-link."
- Run (spec 2): "Expo Go for development against the PC's Wi-Fi address (`EXPO_PUBLIC_API_URL=http://<pc-lan-ip>:4000`). Standalone APK through EAS Build later; it needs a deployed API (out of scope for this phase)."
- Data access (spec 2): "Through the Express API only, with the Supabase user's access token (same as web). Supabase JS is used only for email+password sign-in and session refresh."
- Server changes (spec 2): "Minimal: allow the app origin in CORS if needed, and a mobile return path for the Gmail callback (section 5). Nothing else."
- Out of scope (spec 2): "Push notifications, deploying the API, iOS builds, offline mode, Google sign-in."
- Structure (spec 3): "New workspace `mobile/` (Expo SDK current stable, Expo Router, TypeScript strict, React 19 as pinned at the repo root). Root `package.json` adds the workspace and `dev:mobile` (`expo start`)."
- Shared code (spec 3): "`@joblume/shared` supplies types and `canonicalJobUrl`. The mobile app never imports server code." Mobile never imports from `web/` either ("copy the API client pattern, do not import from `web`").
- State (spec 3): "TanStack Query (same keys and endpoint shapes as `web/src/hooks/api.ts` ...). Session: `expo-secure-store` storage adapter for Supabase."
- Navigation (spec 3): "Expo Router, bottom tabs (Queue, Tracker, Analytics, Settings) as in the mockups; stack screens for job detail and onboarding; auth gate redirecting to `/login` when signed out."
- Styling (spec 3): "the web design tokens (blue primary, light grey background, white rounded cards, pill badges), in a small `theme.ts`; plain React Native components (no UI kit)."
- Screens (spec 4): Queue has "search box, filter chips All / 90%+ / Recent, cards with match badge, source, time, "Add a job link" card, pull-to-refresh, Follow-ups as a segment". Tracker: "status tabs and cards; status change via an action sheet instead of drag and drop". Analytics: "KPI cards and status bars from real `/analytics` data only". "Only data the API returns is shown."
- Gmail (spec 5): "Add an optional `return` target to `POST /gmail/connect` (allow-listed to `joblume://gmail-return`, never an arbitrary URL, kept inside the signed OAuth state) so the callback redirects to `joblume://gmail-return?status=...` when the flow started from the app. The app opens the Google URL with `expo-web-browser` and refreshes Gmail status on return. The Google redirect URI is unchanged."
- Errors and safety (spec 6): "Same plain-language messages as the web (`describeApiError` equivalent). Network failures show a retry state. Tokens only in SecureStore. No secrets in the bundle: only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`. External links open only http(s) URLs."
- Testing (spec 7): jest-expo unit tests for pure logic and the API client, with fakes; React Native Testing Library component tests for "the send flow (no send without tap, guess needs confirmation), the auth gate, and the queue filters"; manual checklist `docs/phase5-manual-checklist.md`; server tests "for the allow-listed return target and signed state".
- TDD with fakes only: no test talks to Supabase, the API, Google or a device. Native modules are replaced with `jest.mock(...)` fakes in the test file that needs them.
- Repo rules: never read, print or commit the repo-root `.env`, `web/.env.local` or `mobile/.env`; never commit anything under `.superpowers/`, `node_modules/`, `.next/`, `dist/`, `.expo/`, `next-env.d.ts`, `mobile/expo-env.d.ts`, `tsconfig.tsbuildinfo` or the untracked `Joblume images/` folder.
- Vitest is v5 in `server`, `web` and `packages/shared`: never return a value from a `beforeEach`/`afterEach` arrow (use block bodies). `mobile` uses Jest 30 globals (`describe`, `it`, `expect`, `jest.fn`), never `vitest`.
- React Native Testing Library 14 is async: always `await render(...)`, `await fireEvent.press(...)`, `await fireEvent.changeText(...)` (each returns a Promise and wraps `act`). Query with `screen.getByRole`, `getByText`, `getByLabelText` (which matches `accessibilityLabel`), `getByPlaceholderText`, `getByDisplayValue`.
- Code in this plan is exact. Backslashes and escapes in regexes and strings (for example `/\s+/g`, `/[,\n]/`, `/^\d+$/`, `'\n'`, `\.`) must be copied literally. Do not "fix" or double them. The `sed` commands in this plan are also exact.
- Commit messages end with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (exactly that model name).
- Shell commands use Git Bash syntax from the repo root. Workspace tests: `npm test -w server`, `npm test -w web`, `npm test -w @joblume/shared`, `npm test -w mobile` (each `pretest` rebuilds the shared package first). Pass a file to run one test file, for example `npm test -w mobile -- tests/lib/format.test.ts`.

- In Git Bash, quote paths that contain parentheses or brackets, for example `git add "mobile/src/app/(tabs)/queue.tsx"`; add `mobile/src/app/application` as a folder rather than naming `[id].tsx`.
- React Native Testing Library's `toHaveTextContent('text')` with a string matches the whole text exactly; use a regular expression to match part of a text.

## Decisions made while planning (spec ambiguities resolved)

1. **React version.** Expo SDK 58 (current stable, `expo@58.0.16`) lists `react@19.3.0` / `react-native@0.88.0`, while the repo root overrides React to `19.3.1`. Resolution: keep one React for the whole repo. `mobile` depends on `react@19.3.1` (the override wins anyway), `react-native@0.88.0` accepts it (`peerDependencies.react: ^19.3.0`), its bundled renderer (`19.3.0`) has no exact-version check, and `expo.install.exclude: ["react", "react-dom"]` in `mobile/package.json` stops `expo install --check` from asking for `19.3.0`. No nested React, no second override, no change for `web`. Verified in a scratch copy of this repo: `npm install` gave a single deduped `react@19.3.1`, `jest` (jest-expo + RNTL 14) rendered components, `tsc` passed, `expo export --platform android` bundled the app with `@joblume/shared`, `expo install --check` reported "Dependencies are up to date", and the existing `web` (255 tests) and `server` test suites still passed with `mobile` in the workspace.
2. **TypeScript.** `mobile` uses `typescript@~6.0.3` (what Expo 58's template ships with `expo/tsconfig.base`); `server` and `packages/shared` keep `^7.0.2` and `web` keeps `^5.9.3`. npm nests the 6.x copy under `mobile/node_modules`, so the root `typescript@7.0.2` that builds the shared package is unchanged.
3. **Metro and the shared package.** `@joblume/shared` stays ESM built to `dist` (its `postinstall` and every `pre*` script rebuild it). Expo SDK 52+ configures Metro for npm workspaces automatically and package `exports` are on by default, so `metro.config.js` is Expo's default config. Jest resolves the same `dist/index.js` through the workspace link and Babel transforms it (it is outside `node_modules`).
4. **Pure logic.** The web's pure modules and their tests are copied into `mobile` unchanged (Task 3). Nothing moves into `packages/shared` except one constant, `MOBILE_GMAIL_RETURN`, which the server and the app must agree on; the web is unaffected by it.
5. **CORS.** No change. React Native's `fetch` sends no `Origin` header and is not subject to CORS, so the existing `cors({ origin: WEB_ORIGIN })` already serves the phone; Task 1 adds a test that a request without `Origin` is answered. (Expo web is out of scope.)
6. **Gmail return target.** `POST /gmail/connect` takes an optional strict body `{ "return": "joblume://gmail-return" }`; any other value or key is a 400 `invalid_request`. The signed state gets `r: "app"` (a web state is byte-identical to before). The callback reads the target with `readReturnTarget`, which checks the HMAC signature but not the age, so an expired or denied flow that started on the phone still returns to the app with its reason; an unsigned or forged marker always falls back to the web. Query parameters can never choose the target. The deep link is `joblume://gmail-return?status=connected` or `?status=error&reason=<reason>`.
7. **Gmail on a phone in development.** Google accepts only `http://localhost` or https redirect URIs, and the spec keeps `GMAIL_REDIRECT_URI` unchanged, so while the API runs on the PC the consent page cannot call back to it from the phone. The checklist says to connect Gmail once from the web app on the PC (the connection is per account) and to test the phone flow against a deployed https API or a standalone build. Expo Go cannot open `joblume://` links either; the app therefore refreshes the Gmail status whenever the in-app browser closes, which is also what the spec asks for.
8. **Queue filter chips.** The spec names All / 90%+ / Recent. "90%+" is `match_score >= 90`; "Recent" is prepared in the last 7 days, newest first. The mockup's "Remote" and "High Salary" chips are left out because the API has no salary data for applications and "Only data the API returns is shown". The mockup's avatar and full name are replaced by the signed-in email (the API returns no name or photo).
9. **Queue segments.** Pending, Ready, Skipped and Follow-ups are one segment row (the web's tabs, with Follow-ups as a segment as the spec says); the chips and the search apply to the three application segments.
10. **Tracker tabs.** The five board columns (Pending Review, Applied, Interviewing, Rejected, Offer) as tabs, Applied first as in the mockup. The mockup's "Saved" tab has no matching status and is left out. Moves use an action sheet (`OptionSheet`), with the same optimistic update and rollback as the web board.
11. **Job detail follow-up card.** The spec lists a follow-up card on job detail; the detail screen shows the pending follow-up draft for that application (from `GET /follow-ups?status=pending_review`) with the same Save / Send follow-up / Dismiss controls as the Follow-ups segment.
12. **Session storage.** Supabase's session is often larger than SecureStore's 2048-byte guidance, so the adapter splits values into 1800-character chunks (`key.0`, `key.1`, ..., `key.count`, the count written last). Tokens are never written anywhere else.
13. **Signing out on a 401.** The API client's `onUnauthorized` signs out with `scope: 'local'` (no network call), and the session listener sends the user to `/login`; the Settings "Sign out" button uses the normal sign-out and clears the query cache. The session provider also clears the cache whenever the user id changes.
14. **PDF share.** "PDF share" downloads the signed `cv_pdf_url` (http(s) only) to the app cache with `expo-file-system` and opens the Android share sheet with `expo-sharing`, so the user can attach it in the employer's site or another app. The cover letter is copied with `expo-clipboard` (added to the dependency list for this).
15. **Icons.** `@expo/vector-icons` (Ionicons) for the four tab icons; it ships with Expo Go.
16. **Standalone APK.** `mobile/eas.json` gets a `preview` profile (`buildType: apk`); building it is documented, not done, because it needs a deployed API.

## Verified versions (checked with `npm view` and a scratch install on 2026-10-19)

| Package | Version used | Note |
|---|---|---|
| `expo` | `~58.0.16` | current stable SDK (`latest` tag) |
| `expo-router` | `~58.0.24` | from `expo/bundledNativeModules.json` |
| `react-native` | `0.88.0` | pinned by SDK 58 |
| `react` | `19.3.1` | repo-root override; SDK 58 lists `19.3.0`, see Decision 1 |
| `jest-expo` | `~58.0.11` | with `jest@~30.5.2` and its peer `@react-native/jest-preset@0.88.0` |
| `@testing-library/react-native` | `^14.1.0` | async API; peer `test-renderer@~1.3.0` |
| `expo-secure-store` | `~58.0.2` | |
| `expo-web-browser` | `~58.0.6` | `openAuthSessionAsync(url, redirectUrl)` |
| `expo-document-picker` | `~58.0.4` | `getDocumentAsync` returns `{ canceled, assets }` |
| `expo-sharing` | `~58.0.19` | `isAvailableAsync`, `shareAsync(uri, { mimeType })` |
| `expo-file-system` | `~58.0.10` | `File.downloadFileAsync(url, new File(Paths.cache, name), { idempotent: true })` |
| `expo-clipboard`, `expo-linking`, `expo-constants`, `expo-status-bar` | `~58.0.3`, `~58.0.13`, `~58.0.12`, `~58.0.3` | |
| `react-native-safe-area-context`, `react-native-screens` | `~5.10.1`, `~4.30.0` | |
| `@expo/vector-icons` | `^15.1.1` | |
| `@supabase/supabase-js`, `@tanstack/react-query` | `^2.118.0`, `^5.104.3` | same as web |
| `typescript` (mobile only) | `~6.0.3` | Expo 58 template version |
| `eas-cli` | `>= 25.0.0` (25.2.0 current) | only for the later APK build |

## File structure

```
packages/shared/src/gmail.ts                     (new)  MOBILE_GMAIL_RETURN, GmailReturnTarget
server/src/services/gmail/oauth.ts  service.ts    (mod)  signed return target, readReturnTarget, returnTarget()
server/src/api/routes/gmail.ts  deps.ts           (mod)  POST /gmail/connect { return }, callback to joblume://gmail-return
package.json                                      (mod)  mobile workspace, dev:mobile
mobile/package.json app.json babel.config.js metro.config.js jest.config.js tsconfig.json .gitignore .env.example eas.json
mobile/src/theme.ts                                      web design tokens
mobile/src/lib/                                          pure logic (copies of web + mobile-only helpers), API client, session
  format applications email-send follow-ups job-fetches cv-name onboarding profile-form   (copied from web)
  api/client.ts api/errors.ts                            (copied from web)
  api/endpoints.ts api/runtime.ts                        mobile API surface and the singleton
  env.ts cv-file.ts gmail-return.ts gmail-connect.ts queue-filters.ts auth-redirect.ts external.ts share-pdf.ts
  secure-storage.ts supabase.ts query-client.ts session.tsx
mobile/src/hooks/api.ts                                  TanStack Query hooks, same keys as web
mobile/src/components/ui/                                Button Card Badge TextField Checkbox Chips States ScoreRing OptionSheet Screen
mobile/src/components/{auth,applications,jobs,followups,queue,tracker,analytics,cv,profile,onboarding,settings}/   screens and cards
mobile/src/components/AppProviders.tsx
mobile/src/app/                                          Expo Router routes
  _layout.tsx index.tsx login.tsx onboarding.tsx gmail-return.tsx application/[id].tsx
  (tabs)/_layout.tsx queue.tsx tracker.tsx analytics.tsx settings.tsx
mobile/tests/                                            Jest tests (lib, hooks, components) and fixtures.ts
docs/phase5-manual-checklist.md  README.md               (new/mod)
```

---

### Task 1: Server: Gmail return target for the phone

**Files:**
- Create: `packages/shared/src/gmail.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/tests/gmail.test.ts`
- Modify: `server/src/services/gmail/oauth.ts`
- Modify: `server/src/services/gmail/service.ts`
- Modify: `server/src/api/deps.ts` (the `GmailService` interface)
- Modify: `server/src/api/routes/gmail.ts`
- Modify: `server/tests/helpers/deps.ts`
- Modify: `server/tests/gmail/oauth.test.ts`
- Modify: `server/tests/gmail/service.test.ts`
- Modify: `server/tests/api/gmail.test.ts`

**Interfaces:**
- Consumes: existing `signState`, `verifyState`, `createGmailService`, `gmailRoutes`, `gmailCallbackRoutes`, `makeDeps`.
- Produces:
  - `@joblume/shared`: `export const MOBILE_GMAIL_RETURN = 'joblume://gmail-return'` and `export type GmailReturnTarget = 'web' | 'app'`.
  - `server/src/services/gmail/oauth.ts`: `signState(userId: string, keyHex: string, now?: number, returnTo?: GmailReturnTarget): string` (a `'web'` state is byte-identical to before) and `readReturnTarget(state: unknown, keyHex: string): GmailReturnTarget`.
  - `GmailService.startConnect(userId: string, returnTo?: GmailReturnTarget): Promise<string>` and `GmailService.returnTarget(state: string | undefined): GmailReturnTarget`.
  - `POST /gmail/connect` accepts an optional strict JSON body `{ "return": "joblume://gmail-return" }`. Any other value or key answers 400 `invalid_request`.
  - `GET /gmail/callback` redirects to `joblume://gmail-return?status=connected` or `joblume://gmail-return?status=error&reason=<reason>` when the signed state says the flow started in the app; otherwise to `<WEB_ORIGIN>/settings?gmail=...` exactly as before.

- [ ] **Step 1: Write the failing shared test**

Create `packages/shared/tests/gmail.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MOBILE_GMAIL_RETURN } from '../src/index.js';

describe('MOBILE_GMAIL_RETURN', () => {
  it('is the joblume app deep link for the Gmail return screen', () => {
    expect(MOBILE_GMAIL_RETURN).toBe('joblume://gmail-return');
    const u = new URL(MOBILE_GMAIL_RETURN);
    expect(u.protocol).toBe('joblume:');
    expect(u.host).toBe('gmail-return');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @joblume/shared -- tests/gmail.test.ts`
Expected: FAIL (`MOBILE_GMAIL_RETURN` is undefined, so `toBe('joblume://gmail-return')` fails).

- [ ] **Step 3: Add the shared constant**

Create `packages/shared/src/gmail.ts`:

```ts
/**
 * Where the Gmail callback sends the phone back to. This is the only non-web target the server accepts:
 * the app asks for it by name and the server never redirects to a URL taken from a request.
 */
export const MOBILE_GMAIL_RETURN = 'joblume://gmail-return';

/** Which screen the Gmail callback returns to: the web Settings page or the phone app. */
export type GmailReturnTarget = 'web' | 'app';
```

In `packages/shared/src/index.ts` add this line at the end:

```ts
export * from './gmail.js';
```

- [ ] **Step 4: Run the shared tests**

Run: `npm test -w @joblume/shared`
Expected: PASS (all shared test files, including `tests/gmail.test.ts`).

- [ ] **Step 5: Write the failing server tests**

In `server/tests/gmail/oauth.test.ts`:

Change the import block to:

```ts
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { gmailConfig } from '../../src/services/gmail/config.js';
import {
  buildAuthUrl, exchangeCode, GmailAuthError, GMAIL_SCOPES, readReturnTarget, signState, verifyState,
} from '../../src/services/gmail/oauth.js';
```

Then add this block directly after the closing `});` of `describe('state signing', ...)`:

```ts
describe('return target in the signed state', () => {
  it('leaves a web state exactly as before (no extra field)', () => {
    expect(signState('user-1', KEY, NOW, 'web')).toBe(signState('user-1', KEY, NOW));
    const payload = JSON.parse(Buffer.from(signState('user-1', KEY, NOW).split('.')[0]!, 'base64url').toString('utf8'));
    expect(payload).toEqual({ u: 'user-1', t: NOW });
  });

  it('marks an app state and still verifies it for the same user', () => {
    const state = signState('user-1', KEY, NOW, 'app');
    expect(verifyState(state, KEY, NOW)).toEqual({ userId: 'user-1' });
    expect(readReturnTarget(state, KEY)).toBe('app');
    expect(readReturnTarget(signState('user-1', KEY, NOW), KEY)).toBe('web');
  });

  it('still returns an expired app state to the app (the signature is what matters here)', () => {
    const state = signState('user-1', KEY, NOW - 60 * 60 * 1000, 'app');
    expect(verifyState(state, KEY, NOW)).toBeNull();
    expect(readReturnTarget(state, KEY)).toBe('app');
  });

  it('never trusts an unsigned or forged app marker', () => {
    const forgedPayload = Buffer.from(JSON.stringify({ u: 'user-1', t: NOW, r: 'app' })).toString('base64url');
    const [, webSig] = signState('user-1', KEY, NOW).split('.') as [string, string];
    expect(readReturnTarget(`${forgedPayload}.${webSig}`, KEY)).toBe('web');
    expect(readReturnTarget(signState('user-1', OTHER_KEY, NOW, 'app'), KEY)).toBe('web');
  });

  it.each([undefined, 42, '', 'nodots', 'a.b.c'])('falls back to web for %j', (state) => {
    expect(readReturnTarget(state, KEY)).toBe('web');
  });
});
```

In `server/tests/gmail/service.test.ts`, add this test inside `describe('startConnect', ...)`, after the first `it(...)`:

```ts
  it('signs an app return target into the state when asked, and reads it back', async () => {
    const { service } = make();
    const state = new URL(await service.startConnect('user-1', 'app')).searchParams.get('state')!;
    expect(state).toBe(signState('user-1', KEY, NOW, 'app'));
    expect(service.returnTarget(state)).toBe('app');
    expect(service.returnTarget(signState('user-1', KEY, NOW))).toBe('web');
    expect(service.returnTarget(undefined)).toBe('web');
  });
```

In `server/tests/api/gmail.test.ts`:

Replace the line

```ts
    expect(deps.gmail.startConnect).toHaveBeenCalledWith('u1');
```

with

```ts
    expect(deps.gmail.startConnect).toHaveBeenCalledWith('u1', 'web');
```

Then add these tests inside `describe('authenticated Gmail routes', ...)`, after the `'POST /gmail/connect maps gmail_not_configured to 503'` test:

```ts
  it('POST /gmail/connect asks for the app return target when the phone names it', async () => {
    const deps = makeDeps();
    deps.gmail.startConnect = vi.fn().mockResolvedValue('https://accounts.google.com/o/oauth2/v2/auth?x=2');
    const res = await auth(request(createApp(deps)).post('/gmail/connect')).send({ return: 'joblume://gmail-return' });
    expect(res.status).toBe(200);
    expect(deps.gmail.startConnect).toHaveBeenCalledWith('u1', 'app');
  });

  it.each([
    ['an arbitrary URL', { return: 'https://evil.example/steal' }],
    ['another app scheme', { return: 'otherapp://gmail-return' }],
    ['an unknown key', { return: 'joblume://gmail-return', next: '/x' }],
  ])('POST /gmail/connect refuses %s with 400 invalid_request', async (_name, body) => {
    const deps = makeDeps();
    const res = await auth(request(createApp(deps)).post('/gmail/connect')).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(deps.gmail.startConnect).not.toHaveBeenCalled();
  });

  it('serves a request that carries no Origin header (the phone app sends none)', async () => {
    const deps = makeDeps();
    deps.gmail.status = vi.fn().mockResolvedValue({ configured: true, connected: false, email: null });
    const res = await auth(request(createApp(deps)).get('/gmail/status'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ configured: true, connected: false, email: null });
  });
```

Then add these tests inside `describe('GET /gmail/callback', ...)`, after the `'ignores non-string query values'` test:

```ts
  it('sends the phone back to the app when the signed state says so', async () => {
    const deps = makeDeps();
    deps.gmail.finishConnect = vi.fn().mockResolvedValue({ ok: true });
    deps.gmail.returnTarget = vi.fn().mockReturnValue('app');
    const res = await request(createApp(deps)).get('/gmail/callback?code=C&state=S');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('joblume://gmail-return?status=connected');
    expect(deps.gmail.returnTarget).toHaveBeenCalledWith('S');
  });

  it('carries the failure reason back to the app', async () => {
    const deps = makeDeps();
    deps.gmail.finishConnect = vi.fn().mockResolvedValue({ ok: false, reason: 'denied' });
    deps.gmail.returnTarget = vi.fn().mockReturnValue('app');
    const res = await request(createApp(deps)).get('/gmail/callback?error=access_denied&state=S');
    expect(res.headers.location).toBe('joblume://gmail-return?status=error&reason=denied');
  });

  it('keeps the web redirect when the state names no app target', async () => {
    const deps = makeDeps();
    deps.gmail.finishConnect = vi.fn().mockResolvedValue({ ok: true });
    deps.gmail.returnTarget = vi.fn().mockReturnValue('web');
    const res = await request(createApp(deps)).get('/gmail/callback?code=C&state=S&return=joblume://gmail-return');
    expect(res.headers.location).toBe('http://localhost:3000/settings?gmail=connected');
  });
```

In `server/tests/helpers/deps.ts` replace the `gmail:` line with:

```ts
    gmail: { startConnect: vi.fn(), finishConnect: vi.fn(), returnTarget: vi.fn(() => 'web' as const), status: vi.fn(), disconnect: vi.fn() },
```

- [ ] **Step 6: Run the server tests to verify they fail**

Run: `npm test -w server -- tests/gmail/oauth.test.ts tests/gmail/service.test.ts tests/api/gmail.test.ts`
Expected: FAIL (16 tests). `readReturnTarget` is not exported, `service.returnTarget` is not a function, `startConnect` was called with only `'u1'`, the 400 cases answer 200, and the app callback still redirects to `http://localhost:3000/settings...`. Three new tests already pass and must keep passing, because they guard existing behaviour: "leaves a web state exactly as before", "serves a request that carries no Origin header" and "keeps the web redirect when the state names no app target".

- [ ] **Step 7: Implement the signed return target**

In `server/src/services/gmail/oauth.ts` replace the import line and the two functions `signState` and `verifyState` with:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { GmailReturnTarget } from '@joblume/shared';
import type { GmailConfig } from './config.js';
```

(keep `GMAIL_SCOPES`, `SEND_SCOPE`, `STATE_MAX_AGE_MS`, `CLOCK_SKEW_MS` and `stateKey` as they are), then:

```ts
/** `returnTo: 'app'` adds `r: 'app'` to the signed payload. A web state carries no extra field, so it is unchanged. */
export function signState(userId: string, keyHex: string, now: number = Date.now(), returnTo: GmailReturnTarget = 'web'): string {
  const body: { u: string; t: number; r?: 'app' } = { u: userId, t: now };
  if (returnTo === 'app') body.r = 'app';
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = createHmac('sha256', stateKey(keyHex)).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** The payload of a state this server signed, or null. Does not check its age. */
function signedPayload(state: unknown, keyHex: string): string | null {
  if (typeof state !== 'string') return null;
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts as [string, string];
  const expected = createHmac('sha256', stateKey(keyHex)).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return payload;
}

export function verifyState(state: unknown, keyHex: string, now: number = Date.now()): { userId: string } | null {
  const payload = signedPayload(state, keyHex);
  if (payload === null) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u?: unknown; t?: unknown };
    if (typeof data.u !== 'string' || typeof data.t !== 'number') return null;
    if (now - data.t > STATE_MAX_AGE_MS || data.t - now > CLOCK_SKEW_MS) return null;
    return { userId: data.u };
  } catch {
    return null;
  }
}

/**
 * Where the callback should send the browser. 'app' only when a state this server signed says so.
 * The age is not checked, so an expired flow that started on the phone still lands back in the app with its error.
 */
export function readReturnTarget(state: unknown, keyHex: string): GmailReturnTarget {
  const payload = signedPayload(state, keyHex);
  if (payload === null) return 'web';
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { r?: unknown };
    return data.r === 'app' ? 'app' : 'web';
  } catch {
    return 'web';
  }
}
```

In `server/src/services/gmail/service.ts` change the oauth import to:

```ts
import { buildAuthUrl, exchangeCode, GmailAuthError, readReturnTarget, signState, verifyState } from './oauth.js';
```

and replace the `startConnect` method with:

```ts
    async startConnect(userId, returnTo = 'web') {
      if (!deps.cfg) throw new ApiError(503, 'gmail_not_configured', 'Gmail is not configured on this server');
      const state = signState(userId, deps.encryptionKey, now(), returnTo);
      await deps.redis.set(stateKey(state), userId, 'EX', STATE_TTL_SECONDS, 'NX');
      return buildAuthUrl(deps.cfg, state);
    },

    returnTarget: (state) => readReturnTarget(state, deps.encryptionKey),
```

In `server/src/api/deps.ts` change the second shared import line to:

```ts
import type { AddJobLinkResult, Analytics, FollowUp, FollowUpWithJob, GmailReturnTarget, GmailStatus, JobFetch, JobLink } from '@joblume/shared';
```

and replace the `GmailService` interface with:

```ts
export interface GmailService {
  startConnect(userId: string, returnTo?: GmailReturnTarget): Promise<string>;
  finishConnect(input: { code?: string; state?: string; error?: string }): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** 'app' only for a state this server signed for a flow started in the phone app. */
  returnTarget(state: string | undefined): GmailReturnTarget;
  status(userId: string): Promise<GmailStatus>;
  disconnect(userId: string): Promise<void>;
}
```

Replace the whole of `server/src/api/routes/gmail.ts` with:

```ts
import { MOBILE_GMAIL_RETURN } from '@joblume/shared';
import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

/** Public: Google redirects the browser here. Protected by the signed state, not a bearer token. */
export function gmailCallbackRoutes(d: Pick<AppDeps, 'gmail' | 'webOrigin'>) {
  const router = Router();
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

  router.get('/callback', asyncHandler(async (req, res) => {
    const state = str(req.query.state);
    let result: { ok: true } | { ok: false; reason: string };
    try {
      result = await d.gmail.finishConnect({ code: str(req.query.code), state, error: str(req.query.error) });
    } catch (err) {
      logger.error({ err }, 'gmail callback failed');
      result = { ok: false, reason: 'server_error' };
    }
    // Only two targets exist: the web Settings page, or the fixed app deep link named in the signed state.
    let target: URL;
    if (d.gmail.returnTarget(state) === 'app') {
      target = new URL(MOBILE_GMAIL_RETURN);
      target.searchParams.set('status', result.ok ? 'connected' : 'error');
    } else {
      target = new URL('/settings', d.webOrigin);
      target.searchParams.set('gmail', result.ok ? 'connected' : 'error');
    }
    if (!result.ok) target.searchParams.set('reason', result.reason);
    res.redirect(302, target.toString());
  }));
  return router;
}

const connectBody = z.object({ return: z.literal(MOBILE_GMAIL_RETURN).optional() }).strict();

export function gmailRoutes(d: Pick<AppDeps, 'gmail'>) {
  const router = Router();

  router.post('/connect', asyncHandler(async (req, res) => {
    const body = connectBody.parse(req.body ?? {});
    const returnTo = body.return === MOBILE_GMAIL_RETURN ? 'app' : 'web';
    res.json({ url: await d.gmail.startConnect(req.user!.id, returnTo) });
  }));

  router.get('/status', asyncHandler(async (req, res) => {
    res.json(await d.gmail.status(req.user!.id));
  }));

  router.delete('/', asyncHandler(async (req, res) => {
    await d.gmail.disconnect(req.user!.id);
    res.json({ connected: false });
  }));

  return router;
}
```

- [ ] **Step 8: Run the server tests and typecheck**

Run: `npm test -w server -- tests/gmail/oauth.test.ts tests/gmail/service.test.ts tests/api/gmail.test.ts`
Expected: PASS.

Run: `npm test -w server && npm run typecheck -w server && npm test -w web`
Expected: all PASS, no type errors. (The web still calls `POST /gmail/connect` with no body, which is the `'web'` path.)

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/gmail.ts packages/shared/src/index.ts packages/shared/tests/gmail.test.ts server/src/services/gmail/oauth.ts server/src/services/gmail/service.ts server/src/api/deps.ts server/src/api/routes/gmail.ts server/tests/helpers/deps.ts server/tests/gmail/oauth.test.ts server/tests/gmail/service.test.ts server/tests/api/gmail.test.ts
git commit -m "feat(server): return the Gmail callback to the phone app through a signed, allow-listed target

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 2: Mobile workspace scaffold (Expo SDK 58, Metro monorepo, Jest, theme)

**Files:**
- Modify: `package.json` (root: add the `mobile` workspace and `dev:mobile`)
- Create: `mobile/package.json`, `mobile/app.json`, `mobile/babel.config.js`, `mobile/metro.config.js`, `mobile/jest.config.js`, `mobile/tsconfig.json`, `mobile/.gitignore`, `mobile/.env.example`
- Create: `mobile/src/theme.ts`
- Create: `mobile/src/app/_layout.tsx` and `mobile/src/app/index.tsx` (temporary; Task 6 replaces both)
- Test: `mobile/tests/theme.test.ts`
- Modify: `package-lock.json` (by `npm install`)

**Interfaces:**
- Consumes: `@joblume/shared` (built to `packages/shared/dist` by the root `postinstall`), `canonicalJobUrl`.
- Produces:
  - Workspace `mobile` with scripts `start` (`expo start`), `test` (`jest`), `typecheck` (`tsc --noEmit`), each with a `pre` script that rebuilds the shared package. Root script `dev:mobile`.
  - Path alias `@/*` -> `mobile/src/*` (TypeScript `paths`, honoured by Metro through Expo's tsconfig paths support and by Jest through `moduleNameMapper`).
  - `mobile/src/theme.ts`: `colors` (`background`, `card`, `text`, `muted`, `border`, `primary`, `primaryText`, `primarySoft`, `secondary`, `secondaryText`, `success`, `successSoft`, `warning`, `warningSoft`, `danger`, `dangerSoft`), `radius` (`card` 16, `input` 10, `pill` 999), `space(n: number): number` (n * 4), `font` (`title` 24, `heading` 18, `body` 15, `small` 13, `tiny` 11), `cardShadow`.
  - App scheme `joblume` (so `joblume://gmail-return` opens the app in a standalone build), Android package `com.joblume.app`.

Why these versions and settings (all verified while planning, see "Verified versions" at the top): Expo SDK 58 pins `react-native@0.88.0` and expects React `19.3.0`; the repo-root override forces `19.3.1` everywhere. React Native 0.88's renderer has no exact-version check and `react-native@0.88.0` declares `peerDependencies.react: ^19.3.0`, so one hoisted `react@19.3.1` is used by the app, Jest and Metro. `expo.install.exclude: ["react", "react-dom"]` stops `expo install --check` (and `expo-doctor`) from asking for 19.3.0. Expo SDK 52+ detects the npm workspace root itself, so `metro.config.js` is the plain default; package `exports` are on by default, and `@joblume/shared` resolves to its built `dist/index.js`. Do not add `watchFolders` or `nodeModulesPaths` by hand.

- [ ] **Step 1: Add the workspace to the root package.json**

In the root `package.json`, change the `workspaces` array to:

```json
  "workspaces": [
    "packages/*",
    "server",
    "web",
    "mobile"
  ],
```

and add this line to `scripts`, directly after `"dev:web": "npm run dev -w web",`:

```json
    "dev:mobile": "npm run start -w mobile",
```

Leave `overrides` (`react` and `react-dom` at `19.3.1`), `postinstall` and every other script unchanged.

- [ ] **Step 2: Create the mobile package files**

Create `mobile/package.json`:

```json
{
  "name": "mobile",
  "private": true,
  "version": "0.1.0",
  "main": "expo-router/entry",
  "scripts": {
    "prestart": "npm run build:shared --prefix ..",
    "start": "expo start",
    "pretypecheck": "npm run build:shared --prefix ..",
    "typecheck": "tsc --noEmit",
    "pretest": "npm run build:shared --prefix ..",
    "test": "jest"
  },
  "dependencies": {
    "@expo/vector-icons": "^15.1.1",
    "@joblume/shared": "*",
    "@supabase/supabase-js": "^2.118.0",
    "@tanstack/react-query": "^5.104.3",
    "expo": "~58.0.16",
    "expo-clipboard": "~58.0.3",
    "expo-constants": "~58.0.12",
    "expo-document-picker": "~58.0.4",
    "expo-file-system": "~58.0.10",
    "expo-linking": "~58.0.13",
    "expo-router": "~58.0.24",
    "expo-secure-store": "~58.0.2",
    "expo-sharing": "~58.0.19",
    "expo-status-bar": "~58.0.3",
    "expo-web-browser": "~58.0.6",
    "react": "19.3.1",
    "react-native": "0.88.0",
    "react-native-safe-area-context": "~5.10.1",
    "react-native-screens": "~4.30.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@react-native/jest-preset": "0.88.0",
    "@testing-library/react-native": "^14.1.0",
    "@types/jest": "^30.0.0",
    "@types/react": "~19.3.0",
    "jest": "~30.5.2",
    "jest-expo": "~58.0.11",
    "test-renderer": "~1.3.0",
    "typescript": "~6.0.3"
  },
  "expo": {
    "install": {
      "exclude": ["react", "react-dom"]
    }
  }
}
```

Create `mobile/app.json`:

```json
{
  "expo": {
    "name": "JobLume",
    "slug": "joblume",
    "scheme": "joblume",
    "version": "0.1.0",
    "orientation": "portrait",
    "userInterfaceStyle": "light",
    "android": { "package": "com.joblume.app" },
    "plugins": ["expo-router", "expo-secure-store", "expo-web-browser"],
    "experiments": { "typedRoutes": false }
  }
}
```

Create `mobile/babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
```

Create `mobile/metro.config.js`:

```js
// Expo's default config detects the npm workspace root, watches it and resolves hoisted packages (SDK 52+).
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
```

Create `mobile/jest.config.js`:

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  // The first render of a React Native module is slow on a cold cache (Windows especially).
  testTimeout: 20000,
};
```

Create `mobile/tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "types": ["jest"],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", "expo-env.d.ts"]
}
```

Create `mobile/.gitignore`:

```gitignore
.expo/
expo-env.d.ts
android/
ios/
*.apk
*.aab
```

Create `mobile/.env.example`:

```dotenv
# Public values only: everything named EXPO_PUBLIC_ is built into the app and readable by anyone who has it.
# Never put the Supabase service role key, Gemini keys or Gmail secrets here.
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
# Your PC's Wi-Fi address and the API port (not localhost: the phone is a different device). See docs/phase5-manual-checklist.md.
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000
```

(The root `.gitignore` already ignores `.env` and `.env.*` in every folder and keeps `.env.example`, so `mobile/.env` is never committed.)

- [ ] **Step 3: Install**

Run: `npm install`
Expected: finishes with exit code 0 (npm may print `deprecated` and `install-scripts` warnings; those are fine). The `postinstall` line `> tsc -p tsconfig.build.json` shows the shared package was rebuilt.

Run: `npm ls react react-native`
Expected: every `react` entry is `19.3.1` (most `deduped`), every `react-native` entry is `0.88.0`, and there is no `invalid` or `ERR` line.

- [ ] **Step 4: Write the failing theme test**

Create `mobile/tests/theme.test.ts`:

```ts
import { colors, radius, space } from '@/theme';

describe('theme', () => {
  it('uses the web tokens: blue primary, light grey background, white cards, pill badges', () => {
    expect(colors.primary).toBe('#3571F3');
    expect(colors.background).toBe('#F6F7F9');
    expect(colors.card).toBe('#FFFFFF');
    expect(radius.pill).toBe(999);
  });

  it('spaces in steps of 4', () => {
    expect(space(0)).toBe(0);
    expect(space(4)).toBe(16);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm test -w mobile -- tests/theme.test.ts`
Expected: FAIL with `Cannot find module '@/theme' from 'tests/theme.test.ts'`.

- [ ] **Step 6: Add the theme and the temporary routes**

Create `mobile/src/theme.ts`:

```ts
/** Web design tokens (web/src/app/globals.css) as plain values for React Native styles. */
export const colors = {
  background: '#F6F7F9',
  card: '#FFFFFF',
  text: '#171C26',
  muted: '#616875',
  border: '#DCDFE5',
  primary: '#3571F3',
  primaryText: '#FFFFFF',
  primarySoft: '#EAF1FE',
  secondary: '#EDEFF3',
  secondaryText: '#333B4D',
  success: '#047857',
  successSoft: '#ECFDF5',
  warning: '#B45309',
  warningSoft: '#FFFBEB',
  danger: '#DC2828',
  dangerSoft: '#FEF2F2',
} as const;

export const radius = { card: 16, input: 10, pill: 999 } as const;

/** 4-point spacing scale: space(4) is 16. */
export const space = (n: number): number => n * 4;

export const font = { title: 24, heading: 18, body: 15, small: 13, tiny: 11 } as const;

export const cardShadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;
```

Create `mobile/src/app/_layout.tsx` (temporary, replaced in Task 6):

```tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

Create `mobile/src/app/index.tsx` (temporary, replaced in Task 6; it proves Metro resolves `@joblume/shared` and the `@/` alias):

```tsx
import { canonicalJobUrl } from '@joblume/shared';
import { Text, View } from 'react-native';
import { colors } from '@/theme';

export default function Index() {
  const link = canonicalJobUrl('https://www.linkedin.com/jobs/view/4012345678/?trk=x');
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <Text>{link ? 'JobLume' : 'Shared package missing'}</Text>
    </View>
  );
}
```

- [ ] **Step 7: Run the tests, the typecheck and a real Metro bundle**

Run: `npm test -w mobile`
Expected: PASS, `Tests: 2 passed, 2 total`.

Run: `npm run typecheck -w mobile`
Expected: no output after the `tsc --noEmit` line (exit code 0).

Run: `cd mobile && CI=1 npx expo export --platform android --output-dir ../.superpowers/expo-export-check; cd ..`
Expected: `Using src/app as the root directory for Expo Router.`, then `Android Bundled ... node_modules\expo-router\entry.js`, then `Exported: ../.superpowers/expo-export-check`. This is the Metro monorepo check: it fails with `Unable to resolve module @joblume/shared` if the workspace or the shared build is broken. (`.superpowers/` is git-ignored; delete the folder afterwards.)

Run: `cd mobile && CI=1 npx expo install --check; cd ..`
Expected: `Skipped checking dependencies: react and react-dom. These dependencies are listed in expo.install.exclude in package.json.` and `Dependencies are up to date`.

Run: `npm test -w web && npm test -w server`
Expected: both PASS (adding the workspace must not disturb them).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json mobile/package.json mobile/app.json mobile/babel.config.js mobile/metro.config.js mobile/jest.config.js mobile/tsconfig.json mobile/.gitignore mobile/.env.example mobile/src/theme.ts mobile/src/app/_layout.tsx mobile/src/app/index.tsx mobile/tests/theme.test.ts
git commit -m "feat(mobile): Expo SDK 58 workspace with Metro monorepo resolution, Jest and the web design tokens

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 3: Pure logic: web copies with their tests, plus the mobile-only helpers

**Files:**
- Create (copied from `web/src/lib`, byte for byte): `mobile/src/lib/format.ts`, `applications.ts`, `email-send.ts`, `follow-ups.ts`, `job-fetches.ts`, `cv-name.ts`, `onboarding.ts`, `profile-form.ts`, `mobile/src/lib/api/client.ts`, `mobile/src/lib/api/errors.ts`
- Create (copied from `web/tests/lib`, Vitest import removed): `mobile/tests/lib/format.test.ts`, `analytics-format.test.ts`, `applications.test.ts`, `email-send.test.ts`, `follow-ups.test.ts`, `job-fetches.test.ts`, `cv-name.test.ts`, `onboarding.test.ts`, `profile-form.test.ts`, `api-client.test.ts`, `api-errors.test.ts`, `api-errors-phase3.test.ts`, `api-errors-phase4.test.ts`
- Create: `mobile/src/lib/gmail-return.ts`, `mobile/src/lib/cv-file.ts`, `mobile/src/lib/env.ts`
- Test: `mobile/tests/lib/gmail-return.test.ts`, `mobile/tests/lib/cv-file.test.ts`, `mobile/tests/lib/env.test.ts`

**Interfaces:**
- Consumes: `@joblume/shared` (`MOBILE_GMAIL_RETURN` from Task 1, `canonicalJobUrl`, `profilePatchSchema`, types).
- Produces (same names and signatures as the web files, so later tasks can rely on them):
  - `format.ts`: `sourceLabel(source)`, `formatShortDate(iso)`, `COLUMN_LABELS`, `formatPercent(rate)`, `formatScore(avg)`, `STATUS_LABELS`, `statusSegments(byStatus)` (returns `{ status, label, count, pct }[]`), `formatRelative(iso, now?)`.
  - `applications.ts`: `QueueTab = 'pending' | 'ready' | 'skipped'`, `sortByScore`, `queueTab`, `splitQueue(apps): Record<QueueTab, Application[]>`, `groupByColumn(apps): Record<KanbanColumn, Application[]>`, `applyStatusLocal`, `resolveDrop`, `previewText(text, max?)`, `scoreTone(score): 'high' | 'mid' | 'low' | 'none'`, `MIN_CV_CHARS`, `buildTextPatch(original, current)`, `averageScore`.
  - `email-send.ts`: `isValidEmail`, `recipientInfo(stored, current)`, `sendDisabledReason({ gmailConnected, email, isGuess, guessConfirmed, locked? })`.
  - `follow-ups.ts`: `buildFollowUpPatch(original, current)`.
  - `job-fetches.ts`: `INVALID_LINK_MESSAGE`, `FETCH_REASON_TEXT`, `fetchStatusText`, `fetchSourceLabel`, `addResultMessage`, `FAST_POLL_MAX_AGE_MS`, `hasRecentPendingFetch`.
  - `cv-name.ts`: `displayCvName(profile)`. `onboarding.ts`: `needsOnboarding(profile)`, `initialStep(profile)`.
  - `profile-form.ts`: `ProfileFormValues`, `ProfileField`, `SettingsValues`, `SettingsField`, `buildProfilePatch(values, { requireRoles? })`, `buildSettingsPatch(values)`, `profileToFormValues(profile)`, `profileToSettingsValues(profile)`.
  - `api/client.ts`: `ApiRequestError(status, code, message?, details?)`, `createApiClient({ baseUrl, getToken, onUnauthorized, fetchImpl? }): ApiClient`, `ApiClient`, `RequestInitLite`. `api/errors.ts`: `describeApiError(err): string` (the web's plain-language messages).
  - `gmail-return.ts` (mobile version): `GmailReturn = { kind: 'connected' } | { kind: 'error'; reason: string }`, `parseGmailReturn({ status?, reason? }): GmailReturn | null` (each param `string | string[] | undefined`), `parseGmailReturnUrl(url: string): GmailReturn | null`, `describeGmailReason(reason): string`.
  - `cv-file.ts`: `MAX_CV_BYTES`, `CV_MIME_TYPES: string[]`, `CvFile { uri: string; name: string; mimeType: string }`, `validateCvAsset({ name, size? }): string | null`, `toCvFile({ uri, name, mimeType? }): CvFile`.
  - `env.ts`: `PublicEnv { supabaseUrl; supabaseAnonKey; apiUrl }`, `readPublicEnv(values): PublicEnv`, `getPublicEnv(): PublicEnv` (reads `process.env.EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL` literally).

Decision: these modules are copied, not moved into `packages/shared`. The spec says "copy the API client pattern, do not import from `web`"; moving them would change the web's imports and its Next.js build for no gain. The copies keep the web's own tests, so the two stay equivalent.

- [ ] **Step 1: Copy the web tests (they fail first)**

Run:

```bash
mkdir -p mobile/tests/lib mobile/src/lib/api
for t in format analytics-format applications email-send follow-ups job-fetches cv-name onboarding profile-form api-client api-errors api-errors-phase3 api-errors-phase4; do
  sed -e "/from 'vitest';/d" -e 's/\bvi\.fn\b/jest.fn/g' "web/tests/lib/$t.test.ts" > "mobile/tests/lib/$t.test.ts"
done
grep -l "vitest\|vi\." mobile/tests/lib/*.test.ts
```

Expected: the final `grep` prints nothing (no Vitest left; Jest provides `describe`, `it`, `expect` and `jest.fn` as globals).

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w mobile -- tests/lib`
Expected: FAIL, 13 suites with `Cannot find module '@/lib/format'` (and the other `@/lib/...` modules).

- [ ] **Step 3: Copy the web modules**

Run:

```bash
for f in format applications email-send follow-ups job-fetches cv-name onboarding profile-form; do cp "web/src/lib/$f.ts" "mobile/src/lib/$f.ts"; done
cp web/src/lib/api/client.ts web/src/lib/api/errors.ts mobile/src/lib/api/
for f in format applications email-send follow-ups job-fetches cv-name onboarding profile-form; do diff -q "web/src/lib/$f.ts" "mobile/src/lib/$f.ts"; done
```

Expected: the `diff -q` loop prints nothing (identical copies). None of these files import anything from Next.js or the DOM.

- [ ] **Step 4: Run the copied tests**

Run: `npm test -w mobile -- tests/lib`
Expected: PASS, `Test Suites: 13 passed, 13 total`, `Tests: 128 passed, 128 total`. (The API client tests run on the `fetch`, `Response`, `FormData` and `Blob` globals that jest-expo provides.)

- [ ] **Step 5: Write the failing tests for the mobile-only helpers**

Create `mobile/tests/lib/gmail-return.test.ts`:

```ts
import { describeGmailReason, parseGmailReturn, parseGmailReturnUrl } from '@/lib/gmail-return';

describe('parseGmailReturn', () => {
  it('reads a successful return', () => {
    expect(parseGmailReturn({ status: 'connected' })).toEqual({ kind: 'connected' });
  });

  it('reads an error with its reason, or unknown when there is none', () => {
    expect(parseGmailReturn({ status: 'error', reason: 'missing_scope' })).toEqual({ kind: 'error', reason: 'missing_scope' });
    expect(parseGmailReturn({ status: 'error' })).toEqual({ kind: 'error', reason: 'unknown' });
  });

  it('takes the first value of a repeated parameter', () => {
    expect(parseGmailReturn({ status: ['error', 'connected'], reason: ['denied', 'x'] })).toEqual({ kind: 'error', reason: 'denied' });
  });

  it.each([{}, { status: 'maybe' }, { status: undefined }])('returns null for %j', (params) => {
    expect(parseGmailReturn(params)).toBeNull();
  });
});

describe('parseGmailReturnUrl', () => {
  it('reads the deep link the server redirects to', () => {
    expect(parseGmailReturnUrl('joblume://gmail-return?status=connected')).toEqual({ kind: 'connected' });
    expect(parseGmailReturnUrl('joblume://gmail-return?status=error&reason=denied')).toEqual({ kind: 'error', reason: 'denied' });
    expect(parseGmailReturnUrl('joblume://gmail-return/?status=connected')).toEqual({ kind: 'connected' });
  });

  it.each([
    'https://evil.example/?status=connected',
    'joblume://other?status=connected',
    'joblume://gmail-returnx?status=connected',
    'joblume://gmail-return',
  ])('ignores %s', (url) => {
    expect(parseGmailReturnUrl(url)).toBeNull();
  });
});

describe('describeGmailReason', () => {
  it.each([
    ['denied', /chose not/i],
    ['missing_scope', /permission to send/i],
    ['invalid_state', /expired/i],
    ['no_refresh_token', /permissions/i],
    ['not_configured', /not set up/i],
  ])('explains %s', (reason, pattern) => {
    expect(describeGmailReason(reason)).toMatch(pattern);
  });

  it('falls back to a generic message', () => {
    expect(describeGmailReason('server_error')).toMatch(/could not complete/i);
  });
});
```

Create `mobile/tests/lib/cv-file.test.ts`:

```ts
import { CV_MIME_TYPES, MAX_CV_BYTES, toCvFile, validateCvAsset } from '@/lib/cv-file';

describe('validateCvAsset', () => {
  it('accepts a PDF or DOCX up to 5 MB, and a missing size', () => {
    expect(validateCvAsset({ name: 'cv.pdf', size: 1000 })).toBeNull();
    expect(validateCvAsset({ name: 'CV.DOCX', size: MAX_CV_BYTES })).toBeNull();
    expect(validateCvAsset({ name: 'cv.pdf' })).toBeNull();
    expect(validateCvAsset({ name: 'cv.pdf', size: null })).toBeNull();
  });

  it('rejects other types, empty files and files over 5 MB', () => {
    expect(validateCvAsset({ name: 'cv.doc', size: 10 })).toBe('Upload a PDF or DOCX file.');
    expect(validateCvAsset({ name: 'cv.pdf', size: 0 })).toBe('That file is empty.');
    expect(validateCvAsset({ name: 'cv.pdf', size: MAX_CV_BYTES + 1 })).toBe('That file is larger than 5 MB.');
  });
});

describe('toCvFile', () => {
  it('keeps the picked type, or derives it from the extension', () => {
    expect(toCvFile({ uri: 'file:///a.pdf', name: 'a.pdf', mimeType: 'application/pdf' })).toEqual({
      uri: 'file:///a.pdf',
      name: 'a.pdf',
      mimeType: 'application/pdf',
    });
    expect(toCvFile({ uri: 'file:///b', name: 'b.docx' }).mimeType).toBe(CV_MIME_TYPES[1]);
    expect(toCvFile({ uri: 'file:///c', name: 'c.pdf', mimeType: null }).mimeType).toBe('application/pdf');
  });
});
```

Create `mobile/tests/lib/env.test.ts`:

```ts
import { readPublicEnv } from '@/lib/env';

describe('readPublicEnv', () => {
  it('returns the values and trims trailing slashes from the API address', () => {
    expect(readPublicEnv({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', apiUrl: 'http://192.168.1.20:4000//' })).toEqual({
      supabaseUrl: 'https://x.supabase.co',
      supabaseAnonKey: 'anon',
      apiUrl: 'http://192.168.1.20:4000',
    });
  });

  it.each([
    [{ supabaseAnonKey: 'anon', apiUrl: 'http://a' }],
    [{ supabaseUrl: 'https://x', apiUrl: 'http://a' }],
    [{ supabaseUrl: 'https://x', supabaseAnonKey: 'anon', apiUrl: '' }],
  ])('names the missing variables and the file to copy for %j', (values) => {
    expect(() => readPublicEnv(values)).toThrow(/EXPO_PUBLIC_API_URL.*mobile\/\.env\.example/);
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npm test -w mobile -- tests/lib/gmail-return.test.ts tests/lib/cv-file.test.ts tests/lib/env.test.ts`
Expected: FAIL with `Cannot find module '@/lib/gmail-return'`, `'@/lib/cv-file'` and `'@/lib/env'`.

- [ ] **Step 7: Implement the helpers**

Create `mobile/src/lib/gmail-return.ts`:

```ts
import { MOBILE_GMAIL_RETURN } from '@joblume/shared';

export type GmailReturn = { kind: 'connected' } | { kind: 'error'; reason: string };

type Param = string | string[] | undefined;
const first = (v: Param): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Reads the status the API puts on joblume://gmail-return (?status=connected or ?status=error&reason=...). */
export function parseGmailReturn(params: { status?: Param; reason?: Param }): GmailReturn | null {
  const status = first(params.status);
  if (status === 'connected') return { kind: 'connected' };
  if (status === 'error') return { kind: 'error', reason: first(params.reason) || 'unknown' };
  return null;
}

/** The same, from the full redirect URL the in-app browser hands back. Anything that is not our deep link is ignored. */
export function parseGmailReturnUrl(url: string): GmailReturn | null {
  if (!url.startsWith(MOBILE_GMAIL_RETURN)) return null;
  const rest = url.slice(MOBILE_GMAIL_RETURN.length);
  if (rest !== '' && !rest.startsWith('?') && !rest.startsWith('/?')) return null;
  const query = rest.slice(rest.indexOf('?') + 1);
  const params = new URLSearchParams(rest.includes('?') ? query : '');
  return parseGmailReturn({ status: params.get('status') ?? undefined, reason: params.get('reason') ?? undefined });
}

const MESSAGES: Record<string, string> = {
  denied: 'You chose not to allow access. Connect again and allow JobLume to send email.',
  missing_scope: 'JobLume needs permission to send email. Connect again and keep every box ticked.',
  invalid_state: 'The connection link expired. Please start again.',
  no_refresh_token: 'Google did not return a long-lived token. Remove JobLume at myaccount.google.com/permissions and connect again.',
  not_configured: 'Gmail is not set up on this server yet. Follow the Gmail setup guide, then restart the server.',
};

export function describeGmailReason(reason: string): string {
  return MESSAGES[reason] ?? 'Google could not complete the connection. Please try again.';
}
```

Create `mobile/src/lib/cv-file.ts`:

```ts
export const MAX_CV_BYTES = 5 * 1024 * 1024;

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** What the document picker is asked to offer. */
export const CV_MIME_TYPES = [PDF, DOCX];

/** A picked file as React Native's FormData expects it: a local uri plus a name and type. */
export interface CvFile {
  uri: string;
  name: string;
  mimeType: string;
}

/** Same rules and messages as the web upload. `size` can be missing on some Android providers; the server still enforces 5 MB. */
export function validateCvAsset(asset: { name: string; size?: number | null }): string | null {
  if (!/\.(pdf|docx)$/i.test(asset.name)) return 'Upload a PDF or DOCX file.';
  if (asset.size === 0) return 'That file is empty.';
  if (typeof asset.size === 'number' && asset.size > MAX_CV_BYTES) return 'That file is larger than 5 MB.';
  return null;
}

export function toCvFile(asset: { uri: string; name: string; mimeType?: string | null }): CvFile {
  const mimeType = asset.mimeType || (/\.docx$/i.test(asset.name) ? DOCX : PDF);
  return { uri: asset.uri, name: asset.name, mimeType };
}
```

Create `mobile/src/lib/env.ts`:

```ts
export interface PublicEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiUrl: string;
}

/** Checks the three public values. Nothing secret belongs here: everything EXPO_PUBLIC_ ends up in the app bundle. */
export function readPublicEnv(values: { supabaseUrl?: string; supabaseAnonKey?: string; apiUrl?: string }): PublicEnv {
  const { supabaseUrl, supabaseAnonKey, apiUrl } = values;
  if (!supabaseUrl || !supabaseAnonKey || !apiUrl) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY or EXPO_PUBLIC_API_URL. Copy mobile/.env.example to mobile/.env and fill it in.',
    );
  }
  return { supabaseUrl, supabaseAnonKey, apiUrl: apiUrl.replace(/\/+$/, '') };
}

/** Each variable is referenced literally so Expo can inline it into the bundle. */
export function getPublicEnv(): PublicEnv {
  return readPublicEnv({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
  });
}
```

- [ ] **Step 8: Run all mobile tests and the typecheck**

Run: `npm test -w mobile`
Expected: PASS, `Test Suites: 17 passed, 17 total`, `Tests: 154 passed, 154 total`.

Run: `npm run typecheck -w mobile`
Expected: exit code 0, no errors.

- [ ] **Step 9: Commit**

```bash
git add mobile/src/lib mobile/tests/lib
git commit -m "feat(mobile): copy the web's pure logic and tests; add Gmail deep-link parsing, CV file checks and public env

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 4: API endpoints, Supabase session in SecureStore, query client and hooks

**Files:**
- Create: `mobile/src/lib/api/endpoints.ts`, `mobile/src/lib/api/runtime.ts`
- Create: `mobile/src/lib/secure-storage.ts`, `mobile/src/lib/supabase.ts`
- Create: `mobile/src/lib/query-client.ts`, `mobile/src/lib/session.tsx`
- Create: `mobile/src/hooks/api.ts`
- Test: `mobile/tests/lib/api-endpoints.test.ts`, `mobile/tests/lib/secure-storage.test.ts`, `mobile/tests/lib/query-client.test.ts`, `mobile/tests/lib/session.test.tsx`, `mobile/tests/hooks/api.test.tsx`

**Interfaces:**
- Consumes: `createApiClient`, `ApiClient`, `ApiRequestError` (Task 3), `CvFile` (Task 3), `getPublicEnv` (Task 3), `applyStatusLocal` and `hasRecentPendingFetch` (Task 3), `MOBILE_GMAIL_RETURN` (Task 1).
- Produces:
  - `endpoints.ts`: `cvFormData(file: CvFile): FormData`, `createApi(request: ApiClient)` with the same members and paths as the web (`getProfile`, `updateProfile`, `uploadCv(file: CvFile)`, `listApplications`, `getApplication`, `updateApplicationText`, `setApplicationStatus`, `getAnalytics`, `refreshJobs`, `addJobLink`, `listJobFetches`, `getGmailStatus`, `startGmailConnect()` (posts `{ return: 'joblume://gmail-return' }`), `disconnectGmail`, `sendApplication`, `nextEmail`, `setEmail`, `listFollowUps`, `updateFollowUp`, `sendFollowUp`, `dismissFollowUp`), `type Api`.
  - `runtime.ts`: `getApi(): Api` (bearer token from the Supabase session; a 401 signs out locally).
  - `secure-storage.ts`: `KeyValueStore`, `AsyncStorageLike`, `CHUNK_SIZE = 1800`, `createChunkedStorage(store: KeyValueStore): AsyncStorageLike`.
  - `supabase.ts`: `getSupabase(): SupabaseClient` (session stored only through `createChunkedStorage(SecureStore)`), `watchAppStateForRefresh(auth): () => void`.
  - `query-client.ts`: `shouldRetry(failureCount, error): boolean`, `createQueryClient(): QueryClient`, `watchAppFocus(): () => void`.
  - `session.tsx`: `SessionStatus = 'loading' | 'signedIn' | 'signedOut'`, `SessionValue { status; email: string | null }`, `SessionSource` (the `getSession` and `onAuthStateChange` part of `supabase.auth`), `useSession(): SessionValue`, `SessionProvider({ source, children })` (clears the query cache when the user changes or signs out), `StaticSession({ value, children })` (fixed value for tests).
  - `hooks/api.ts`: `keys` (identical to the web) and every hook of `web/src/hooks/api.ts` with the same name and arguments, except `useUploadCv` takes a `CvFile` and `useConnectGmail` only returns the `{ url }` mutation (the Settings screen opens the browser in Task 14).

- [ ] **Step 1: Write the failing tests**

Create `mobile/tests/lib/api-endpoints.test.ts`:

```ts
import type { ApiClient } from '@/lib/api/client';
import { createApi, cvFormData } from '@/lib/api/endpoints';

function make() {
  const request = jest.fn().mockResolvedValue({});
  return { api: createApi(request as unknown as ApiClient), request };
}

describe('createApi (mobile)', () => {
  it('profile, analytics and job refresh', async () => {
    const { api, request } = make();
    await api.getProfile();
    expect(request).toHaveBeenLastCalledWith('/profile');
    await api.updateProfile({ location: 'Lagos' });
    expect(request).toHaveBeenLastCalledWith('/profile', { method: 'PUT', json: { location: 'Lagos' } });
    await api.getAnalytics();
    expect(request).toHaveBeenLastCalledWith('/analytics');
    await api.refreshJobs();
    expect(request).toHaveBeenLastCalledWith('/jobs/refresh', { method: 'POST' });
  });

  it('uploads the picked CV as multipart form data', async () => {
    const { api, request } = make();
    await api.uploadCv({ uri: 'file:///cache/cv.pdf', name: 'cv.pdf', mimeType: 'application/pdf' });
    const [path, init] = request.mock.calls[0]!;
    expect(path).toBe('/cv');
    expect(init.method).toBe('POST');
    expect(init.formData).toBeInstanceOf(FormData);
  });

  it('builds the form with the uri, name and type React Native needs', () => {
    const append = jest.spyOn(FormData.prototype, 'append');
    cvFormData({ uri: 'file:///cache/cv.docx', name: 'cv.docx', mimeType: 'application/msword' });
    expect(append).toHaveBeenCalledWith('file', { uri: 'file:///cache/cv.docx', name: 'cv.docx', type: 'application/msword' });
    append.mockRestore();
  });

  it('applications: list, detail, text, status, encoded ids', async () => {
    const { api, request } = make();
    await api.listApplications();
    expect(request).toHaveBeenLastCalledWith('/applications');
    await api.listApplications('applied');
    expect(request).toHaveBeenLastCalledWith('/applications?status=applied');
    await api.getApplication('a/b');
    expect(request).toHaveBeenLastCalledWith('/applications/a%2Fb');
    await api.updateApplicationText('a1', { cover_letter_text: 'Hi' });
    expect(request).toHaveBeenLastCalledWith('/applications/a1', { method: 'PATCH', json: { cover_letter_text: 'Hi' } });
    await api.setApplicationStatus('a1', 'approved');
    expect(request).toHaveBeenLastCalledWith('/applications/a1/status', { method: 'PATCH', json: { status: 'approved' } });
  });

  it('Gmail connect always names the app return target', async () => {
    const { api, request } = make();
    await api.startGmailConnect();
    expect(request).toHaveBeenLastCalledWith('/gmail/connect', { method: 'POST', json: { return: 'joblume://gmail-return' } });
    await api.getGmailStatus();
    expect(request).toHaveBeenLastCalledWith('/gmail/status');
    await api.disconnectGmail();
    expect(request).toHaveBeenLastCalledWith('/gmail', { method: 'DELETE' });
  });

  it('sending and contact emails', async () => {
    const { api, request } = make();
    await api.sendApplication('a1', { to: 'x@y.co', confirmGuess: true });
    expect(request).toHaveBeenLastCalledWith('/applications/a1/send', { method: 'POST', json: { to: 'x@y.co', confirmGuess: true } });
    await api.nextEmail('a1');
    expect(request).toHaveBeenLastCalledWith('/applications/a1/email/next', { method: 'POST' });
    await api.setEmail('a1', 'jane@acme.com');
    expect(request).toHaveBeenLastCalledWith('/applications/a1/email', { method: 'PUT', json: { email: 'jane@acme.com' } });
  });

  it('follow-ups and job links', async () => {
    const { api, request } = make();
    await api.listFollowUps('pending_review');
    expect(request).toHaveBeenLastCalledWith('/follow-ups?status=pending_review');
    await api.updateFollowUp('f1', { body: 'New body' });
    expect(request).toHaveBeenLastCalledWith('/follow-ups/f1', { method: 'PATCH', json: { body: 'New body' } });
    await api.sendFollowUp('f1');
    expect(request).toHaveBeenLastCalledWith('/follow-ups/f1/send', { method: 'POST' });
    await api.dismissFollowUp('f1');
    expect(request).toHaveBeenLastCalledWith('/follow-ups/f1/dismiss', { method: 'POST' });
    await api.addJobLink('https://www.linkedin.com/jobs/view/4012345678/');
    expect(request).toHaveBeenLastCalledWith('/jobs/from-url', { method: 'POST', json: { url: 'https://www.linkedin.com/jobs/view/4012345678/' } });
    await api.listJobFetches();
    expect(request).toHaveBeenLastCalledWith('/jobs/fetches');
  });
});
```

Create `mobile/tests/lib/secure-storage.test.ts`:

```ts
import { CHUNK_SIZE, createChunkedStorage, type KeyValueStore } from '@/lib/secure-storage';

function fakeStore() {
  const data = new Map<string, string>();
  const store: KeyValueStore = {
    getItemAsync: jest.fn(async (k: string) => data.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      if (!/^[A-Za-z0-9._-]+$/.test(k)) throw new Error(`invalid key ${k}`);
      if (v.length > 2048) throw new Error('value too large');
      data.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      data.delete(k);
    }),
  };
  return { data, store };
}

describe('createChunkedStorage', () => {
  it('round-trips a short value', async () => {
    const { store } = fakeStore();
    const s = createChunkedStorage(store);
    await s.setItem('sb-abc-auth-token', '{"a":1}');
    expect(await s.getItem('sb-abc-auth-token')).toBe('{"a":1}');
  });

  it('splits a long session into chunks under the SecureStore limit and joins them back', async () => {
    const { store, data } = fakeStore();
    const s = createChunkedStorage(store);
    const value = 'x'.repeat(CHUNK_SIZE * 2 + 5);
    await s.setItem('session', value);
    expect(data.get('session.count')).toBe('3');
    expect([...data.values()].every((v) => v.length <= 2048)).toBe(true);
    expect(await s.getItem('session')).toBe(value);
  });

  it('removes old chunks when a shorter value replaces a longer one', async () => {
    const { store, data } = fakeStore();
    const s = createChunkedStorage(store);
    await s.setItem('session', 'y'.repeat(CHUNK_SIZE * 3));
    await s.setItem('session', 'short');
    expect(data.has('session.1')).toBe(false);
    expect(data.has('session.2')).toBe(false);
    expect(await s.getItem('session')).toBe('short');
  });

  it('returns null for a missing key, a bad count or a missing chunk', async () => {
    const { store, data } = fakeStore();
    const s = createChunkedStorage(store);
    expect(await s.getItem('none')).toBeNull();
    data.set('bad.count', 'abc');
    expect(await s.getItem('bad')).toBeNull();
    data.set('gap.count', '2');
    data.set('gap.0', 'a');
    expect(await s.getItem('gap')).toBeNull();
  });

  it('removeItem deletes every chunk and the count', async () => {
    const { store, data } = fakeStore();
    const s = createChunkedStorage(store);
    await s.setItem('session', 'z'.repeat(CHUNK_SIZE + 1));
    await s.removeItem('session');
    expect(data.size).toBe(0);
    expect(await s.getItem('session')).toBeNull();
  });

  it('turns characters SecureStore refuses into underscores', async () => {
    const { store, data } = fakeStore();
    const s = createChunkedStorage(store);
    await s.setItem('a key:with/odd chars', 'v');
    expect(data.get('a_key_with_odd_chars.0')).toBe('v');
    expect(await s.getItem('a key:with/odd chars')).toBe('v');
  });
});
```

Create `mobile/tests/lib/query-client.test.ts`:

```ts
import { ApiRequestError } from '@/lib/api/client';
import { createQueryClient, shouldRetry } from '@/lib/query-client';

describe('shouldRetry', () => {
  it('retries network and server errors up to twice', () => {
    expect(shouldRetry(0, new ApiRequestError(0, 'network_error'))).toBe(true);
    expect(shouldRetry(1, new ApiRequestError(503, 'http_error'))).toBe(true);
    expect(shouldRetry(2, new ApiRequestError(503, 'http_error'))).toBe(false);
    expect(shouldRetry(0, new Error('boom'))).toBe(true);
  });

  it('never retries a 4xx', () => {
    expect(shouldRetry(0, new ApiRequestError(400, 'invalid_request'))).toBe(false);
    expect(shouldRetry(0, new ApiRequestError(401, 'unauthorized'))).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('uses the shared retry rule and a 15 second stale time', () => {
    const qc = createQueryClient();
    expect(qc.getDefaultOptions().queries?.retry).toBe(shouldRetry);
    expect(qc.getDefaultOptions().queries?.staleTime).toBe(15_000);
  });
});
```

Create `mobile/tests/lib/session.test.tsx`:

```tsx
import type { Session } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SessionProvider, useSession, type SessionSource } from '@/lib/session';

const session = (id: string, email: string) => ({ user: { id, email } }) as unknown as Session;

function fakeSource(initial: Session | null) {
  let listener: ((event: string, s: Session | null) => void) | null = null;
  const unsubscribe = jest.fn();
  const source: SessionSource = {
    getSession: jest.fn(async () => ({ data: { session: initial } })),
    onAuthStateChange: jest.fn((cb) => {
      listener = cb;
      return { data: { subscription: { unsubscribe } } };
    }),
  };
  return { source, unsubscribe, emit: (s: Session | null) => listener?.('EVENT', s) };
}

function Probe() {
  const { status, email } = useSession();
  return <Text>{`${status}:${email ?? '-'}`}</Text>;
}

async function setup(initial: Session | null) {
  const qc = new QueryClient();
  const clear = jest.spyOn(qc, 'clear');
  const fake = fakeSource(initial);
  const view = await render(
    <QueryClientProvider client={qc}>
      <SessionProvider source={fake.source}>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  );
  return { ...fake, clear, view };
}

describe('SessionProvider', () => {
  it('reports signed in with the email from the stored session', async () => {
    await setup(session('u1', 'me@example.com'));
    expect(await screen.findByText('signedIn:me@example.com')).toBeOnTheScreen();
  });

  it('reports signed out when there is no session', async () => {
    await setup(null);
    expect(await screen.findByText('signedOut:-')).toBeOnTheScreen();
  });

  it('follows sign-out and clears cached API data', async () => {
    const { emit, clear } = await setup(session('u1', 'me@example.com'));
    await screen.findByText('signedIn:me@example.com');
    await act(async () => emit(null));
    expect(screen.getByText('signedOut:-')).toBeOnTheScreen();
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('clears cached data when a different user signs in, but not on a token refresh for the same user', async () => {
    const { emit, clear } = await setup(session('u1', 'me@example.com'));
    await screen.findByText('signedIn:me@example.com');
    await act(async () => emit(session('u1', 'me@example.com')));
    expect(clear).not.toHaveBeenCalled();
    await act(async () => emit(session('u2', 'other@example.com')));
    expect(screen.getByText('signedIn:other@example.com')).toBeOnTheScreen();
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes when unmounted', async () => {
    const { view, unsubscribe } = await setup(null);
    await view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
```

Create `mobile/tests/hooks/api.test.tsx` (it replaces `@/lib/api/runtime` with a fake API, so no Supabase or network is touched; `gcTime: Infinity` keeps TanStack from leaving timers behind):

```tsx
import type { Application, ApplicationDetail } from '@joblume/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockApi = {
  setApplicationStatus: jest.fn(),
  startGmailConnect: jest.fn(),
  uploadCv: jest.fn(),
};
jest.mock('@/lib/api/runtime', () => ({ getApi: () => mockApi }));

import { keys, useConnectGmail, useSetStatus, useUploadCv } from '@/hooks/api';

const app = (over: Partial<Application> = {}): Application => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'cv', tailored_cv_url: null, cover_letter_text: 'l',
  match_score: 70, missing_keywords: [], hiring_manager_email: null, email_confidence: null, email_source: null, email_candidates: [],
  apply_method: null, status: 'pending_review', applied_at: null, follow_up_at: null, created_at: '2026-10-01T00:00:00.000Z', job: null, ...over,
});

function setup(initial: Application[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  qc.setQueryData(keys.applications, initial);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
}

const statusOf = (qc: QueryClient) => (qc.getQueryData(keys.applications) as Application[])[0]!.status;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('keys', () => {
  it('match the web query keys', () => {
    expect(keys.applications).toEqual(['applications']);
    expect(keys.application('a1')).toEqual(['application', 'a1']);
    expect(keys.followUps).toEqual(['follow-ups']);
    expect(keys.jobFetches).toEqual(['job-fetches']);
  });
});

describe('useSetStatus', () => {
  it('updates the cached list and detail before the server answers', async () => {
    let resolve!: (v: unknown) => void;
    mockApi.setApplicationStatus.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { qc, wrapper } = setup([app()]);
    qc.setQueryData<ApplicationDetail>(keys.application('a1'), { ...app(), cv_pdf_url: null });
    const { result } = await renderHook(() => useSetStatus(), { wrapper });
    await act(async () => {
      result.current.mutate({ id: 'a1', status: 'applied' });
    });
    await waitFor(() => expect(statusOf(qc)).toBe('applied'));
    expect((qc.getQueryData(keys.application('a1')) as ApplicationDetail).status).toBe('applied');
    expect(mockApi.setApplicationStatus).toHaveBeenCalledWith('a1', 'applied');
    await act(async () => resolve({}));
  });

  it('rolls back when the server refuses', async () => {
    mockApi.setApplicationStatus.mockRejectedValue(new Error('refused'));
    const { qc, wrapper } = setup([app()]);
    const { result } = await renderHook(() => useSetStatus(), { wrapper });
    await act(async () => {
      result.current.mutate({ id: 'a1', status: 'applied' });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(statusOf(qc)).toBe('pending_review');
  });
});

describe('useConnectGmail', () => {
  it('only fetches the Google URL (the screen opens it)', async () => {
    mockApi.startGmailConnect.mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });
    const { wrapper } = setup([]);
    const { result } = await renderHook(() => useConnectGmail(), { wrapper });
    let url = '';
    await act(async () => {
      url = (await result.current.mutateAsync()).url;
    });
    expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth?x=1');
  });
});

describe('useUploadCv', () => {
  it('uploads the picked file and refreshes the profile', async () => {
    mockApi.uploadCv.mockResolvedValue({ characters: 1200 });
    const { qc, wrapper } = setup([]);
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useUploadCv(), { wrapper });
    const file = { uri: 'file:///cv.pdf', name: 'cv.pdf', mimeType: 'application/pdf' };
    await act(async () => {
      await result.current.mutateAsync(file);
    });
    expect(mockApi.uploadCv).toHaveBeenCalledWith(file);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.profile });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w mobile -- tests/lib/api-endpoints.test.ts tests/lib/secure-storage.test.ts tests/lib/query-client.test.ts tests/lib/session.test.tsx tests/hooks/api.test.tsx`
Expected: FAIL, five suites with `Cannot find module` for `@/lib/api/endpoints`, `@/lib/secure-storage`, `@/lib/query-client`, `@/lib/session` and `@/hooks/api`.

- [ ] **Step 3: Implement the endpoints**

Create `mobile/src/lib/api/endpoints.ts`:

```ts
import {
  MOBILE_GMAIL_RETURN,
  type AddJobLinkResult,
  type Analytics,
  type Application,
  type ApplicationDetail,
  type ApplicationStatus,
  type CvUploadResult,
  type FollowUp,
  type FollowUpWithJob,
  type GmailStatus,
  type JobFetch,
  type Profile,
  type ProfilePatch,
} from '@joblume/shared';
import type { CvFile } from '../cv-file';
import type { ApiClient } from './client';

/** React Native's FormData takes { uri, name, type } for a local file. */
export function cvFormData(file: CvFile): FormData {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  return form;
}

/** Same endpoints and shapes as web/src/lib/api/endpoints.ts, except the CV file and the Gmail return target. */
export function createApi(request: ApiClient) {
  return {
    getProfile: () => request<Profile>('/profile'),
    updateProfile: (patch: ProfilePatch) => request<Profile>('/profile', { method: 'PUT', json: patch }),
    uploadCv: (file: CvFile) => request<CvUploadResult>('/cv', { method: 'POST', formData: cvFormData(file) }),
    listApplications: (status?: ApplicationStatus) =>
      request<Application[]>(status ? `/applications?status=${encodeURIComponent(status)}` : '/applications'),
    getApplication: (id: string) => request<ApplicationDetail>(`/applications/${encodeURIComponent(id)}`),
    updateApplicationText: (id: string, patch: { tailored_cv_text?: string; cover_letter_text?: string }) =>
      request<Application>(`/applications/${encodeURIComponent(id)}`, { method: 'PATCH', json: patch }),
    setApplicationStatus: (id: string, status: ApplicationStatus) =>
      request<Application>(`/applications/${encodeURIComponent(id)}/status`, { method: 'PATCH', json: { status } }),
    getAnalytics: () => request<Analytics>('/analytics'),
    refreshJobs: () => request<{ queued: boolean }>('/jobs/refresh', { method: 'POST' }),
    addJobLink: (url: string) => request<AddJobLinkResult>('/jobs/from-url', { method: 'POST', json: { url } }),
    listJobFetches: () => request<JobFetch[]>('/jobs/fetches'),
    getGmailStatus: () => request<GmailStatus>('/gmail/status'),
    /** The phone always asks the server to send Google's callback back to the app. */
    startGmailConnect: () => request<{ url: string }>('/gmail/connect', { method: 'POST', json: { return: MOBILE_GMAIL_RETURN } }),
    disconnectGmail: () => request<{ connected: false }>('/gmail', { method: 'DELETE' }),
    sendApplication: (id: string, body: { to?: string; confirmGuess?: boolean }) =>
      request<Application>(`/applications/${encodeURIComponent(id)}/send`, { method: 'POST', json: body }),
    nextEmail: (id: string) =>
      request<{ exhausted: boolean; application: Application }>(`/applications/${encodeURIComponent(id)}/email/next`, { method: 'POST' }),
    setEmail: (id: string, email: string) =>
      request<Application>(`/applications/${encodeURIComponent(id)}/email`, { method: 'PUT', json: { email } }),
    listFollowUps: (status?: FollowUp['status']) =>
      request<FollowUpWithJob[]>(status ? `/follow-ups?status=${encodeURIComponent(status)}` : '/follow-ups'),
    updateFollowUp: (id: string, patch: { subject?: string; body?: string }) =>
      request<FollowUp>(`/follow-ups/${encodeURIComponent(id)}`, { method: 'PATCH', json: patch }),
    sendFollowUp: (id: string) => request<FollowUp>(`/follow-ups/${encodeURIComponent(id)}/send`, { method: 'POST' }),
    dismissFollowUp: (id: string) => request<FollowUp>(`/follow-ups/${encodeURIComponent(id)}/dismiss`, { method: 'POST' }),
  };
}

export type Api = ReturnType<typeof createApi>;
```

- [ ] **Step 4: Implement the SecureStore adapter and the Supabase client**

Create `mobile/src/lib/secure-storage.ts`:

```ts
/** The part of expo-secure-store this adapter uses (a fake in tests). */
export interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/** The storage interface Supabase JS accepts for its session. */
export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** SecureStore may refuse values over 2048 bytes, and a Supabase session is often larger, so values are split. */
export const CHUNK_SIZE = 1800;

/** SecureStore keys may only contain letters, digits, ".", "-" and "_". */
const safeKey = (key: string): string => key.replace(/[^A-Za-z0-9._-]/g, '_');

export function createChunkedStorage(store: KeyValueStore): AsyncStorageLike {
  async function readCount(base: string): Promise<number | null> {
    const raw = await store.getItemAsync(`${base}.count`);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  async function remove(base: string): Promise<void> {
    const count = await readCount(base);
    if (count !== null) {
      for (let i = 0; i < count; i += 1) await store.deleteItemAsync(`${base}.${i}`);
    }
    await store.deleteItemAsync(`${base}.count`);
  }

  return {
    async getItem(key) {
      const base = safeKey(key);
      const count = await readCount(base);
      if (count === null) return null;
      const parts: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const part = await store.getItemAsync(`${base}.${i}`);
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join('');
    },

    async setItem(key, value) {
      const base = safeKey(key);
      await remove(base);
      const count = Math.ceil(value.length / CHUNK_SIZE);
      for (let i = 0; i < count; i += 1) {
        await store.setItemAsync(`${base}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      // Written last, so a half-written value reads as "no session" instead of a corrupt one.
      await store.setItemAsync(`${base}.count`, String(count));
    },

    async removeItem(key) {
      await remove(safeKey(key));
    },
  };
}
```

Create `mobile/src/lib/supabase.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { getPublicEnv } from './env';
import { createChunkedStorage } from './secure-storage';

let client: SupabaseClient | undefined;

/** Supabase is used only to sign in and keep the session fresh. The session lives in SecureStore, nowhere else. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const env = getPublicEnv();
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: createChunkedStorage(SecureStore),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** Supabase's React Native guidance: refresh tokens only while the app is in the foreground. Returns the unsubscribe. */
export function watchAppStateForRefresh(auth: Pick<SupabaseClient['auth'], 'startAutoRefresh' | 'stopAutoRefresh'>): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void auth.startAutoRefresh();
    else void auth.stopAutoRefresh();
  });
  return () => sub.remove();
}
```

Create `mobile/src/lib/api/runtime.ts`:

```ts
import { getPublicEnv } from '../env';
import { getSupabase } from '../supabase';
import { createApiClient } from './client';
import { createApi, type Api } from './endpoints';

let api: Api | undefined;

/** The API the screens use: Bearer token from the current Supabase session. */
export function getApi(): Api {
  if (api) return api;
  const env = getPublicEnv();
  const supabase = getSupabase();
  api = createApi(
    createApiClient({
      baseUrl: env.apiUrl,
      getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
      // Local sign-out needs no network; the session listener then sends the user to /login.
      onUnauthorized: async () => {
        await supabase.auth.signOut({ scope: 'local' });
      },
    }),
  );
  return api;
}
```

- [ ] **Step 5: Implement the query client and the session provider**

Create `mobile/src/lib/query-client.ts`:

```ts
import { QueryClient, focusManager } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { ApiRequestError } from './api/client';

/** Same rule as the web: retry network and server errors twice, never a 4xx. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500) && failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: shouldRetry },
    },
  });
}

/** TanStack Query's "window focus" on a phone: the app coming back to the foreground. Returns the unsubscribe. */
export function watchAppFocus(): () => void {
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
    return () => sub.remove();
  });
  return () => focusManager.setEventListener(() => () => {});
}
```

Create `mobile/src/lib/session.tsx`:

```tsx
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type SessionStatus = 'loading' | 'signedIn' | 'signedOut';

export interface SessionValue {
  status: SessionStatus;
  email: string | null;
}

/** The two Supabase auth calls the provider needs (supabase.auth, or a fake in tests). */
export interface SessionSource {
  getSession(): Promise<{ data: { session: Session | null } }>;
  onAuthStateChange(cb: (event: string, session: Session | null) => void): { data: { subscription: { unsubscribe(): void } } };
}

const SessionContext = createContext<SessionValue>({ status: 'loading', email: null });

export function useSession(): SessionValue {
  return useContext(SessionContext);
}

/** Tracks the signed-in user. When the user changes or signs out, cached API data is dropped so nothing leaks between accounts. */
export function SessionProvider({ source, children }: { source: SessionSource; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState<SessionValue>({ status: 'loading', email: null });
  const userId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const apply = (session: Session | null) => {
      if (!active) return;
      const nextId = session?.user.id ?? null;
      if (userId.current !== undefined && userId.current !== nextId) queryClient.clear();
      userId.current = nextId;
      setValue(session ? { status: 'signedIn', email: session.user.email ?? null } : { status: 'signedOut', email: null });
    };
    void source.getSession().then(({ data }) => apply(data.session)).catch(() => apply(null));
    const { data } = source.onAuthStateChange((_event, session) => apply(session));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [source, queryClient]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** For tests and previews: a fixed session value. */
export function StaticSession({ value, children }: { value: SessionValue; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
```

- [ ] **Step 6: Implement the hooks**

Create `mobile/src/hooks/api.ts`:

```ts
import type { Application, ApplicationDetail, ApplicationStatus, FollowUp, ProfilePatch } from '@joblume/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApi } from '@/lib/api/runtime';
import { applyStatusLocal } from '@/lib/applications';
import type { CvFile } from '@/lib/cv-file';
import { hasRecentPendingFetch } from '@/lib/job-fetches';

/** Same query keys as web/src/hooks/api.ts. */
export const keys = {
  profile: ['profile'] as const,
  applications: ['applications'] as const,
  application: (id: string) => ['application', id] as const,
  analytics: ['analytics'] as const,
  gmail: ['gmail'] as const,
  followUps: ['follow-ups'] as const,
  jobFetches: ['job-fetches'] as const,
};

export function useProfile() {
  return useQuery({ queryKey: keys.profile, queryFn: () => getApi().getProfile() });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => getApi().updateProfile(patch),
    onSuccess: (profile) => {
      qc.setQueryData(keys.profile, profile);
    },
  });
}

export function useUploadCv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: CvFile) => getApi().uploadCv(file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.profile });
    },
  });
}

export function useApplications(options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: keys.applications,
    queryFn: () => getApi().listApplications(),
    refetchInterval: options.poll ? 60_000 : false,
    refetchOnWindowFocus: true,
  });
}

export function useApplication(id: string | null) {
  return useQuery({
    queryKey: keys.application(id ?? ''),
    queryFn: () => getApi().getApplication(id as string),
    enabled: id !== null,
  });
}

export function useUpdateApplicationText() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { tailored_cv_text?: string; cover_letter_text?: string } }) =>
      getApi().updateApplicationText(id, patch),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: keys.application(id) });
      void qc.invalidateQueries({ queryKey: keys.applications });
    },
  });
}

export function useSetStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicationStatus }) => getApi().setApplicationStatus(id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: keys.applications });
      await qc.cancelQueries({ queryKey: keys.application(id) });
      const previous = qc.getQueryData<Application[]>(keys.applications);
      const previousDetail = qc.getQueryData<ApplicationDetail>(keys.application(id));
      if (previous) qc.setQueryData(keys.applications, applyStatusLocal(previous, id, status));
      if (previousDetail) qc.setQueryData(keys.application(id), applyStatusLocal([previousDetail], id, status)[0]);
      return { previous, previousDetail };
    },
    onError: (_err, { id }, context) => {
      if (context?.previous) qc.setQueryData(keys.applications, context.previous);
      if (context?.previousDetail) qc.setQueryData(keys.application(id), context.previousDetail);
    },
    onSettled: (_data, _err, { id }) => {
      void qc.invalidateQueries({ queryKey: keys.applications });
      void qc.invalidateQueries({ queryKey: keys.application(id) });
      void qc.invalidateQueries({ queryKey: keys.analytics });
    },
  });
}

export function useAnalytics() {
  return useQuery({ queryKey: keys.analytics, queryFn: () => getApi().getAnalytics() });
}

export function useRefreshJobs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => getApi().refreshJobs(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.applications });
    },
  });
}

export function useJobFetches() {
  return useQuery({
    queryKey: keys.jobFetches,
    queryFn: () => getApi().listJobFetches(),
    // Poll faster while a link is still being read.
    refetchInterval: (query) => (hasRecentPendingFetch(query.state.data) ? 10_000 : 60_000),
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
  return useQuery({ queryKey: keys.gmail, queryFn: () => getApi().getGmailStatus() });
}

/** Only asks the server for the Google URL; the Settings screen opens it in the in-app browser. */
export function useConnectGmail() {
  return useMutation({ mutationFn: () => getApi().startGmailConnect() });
}

export function useDisconnectGmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => getApi().disconnectGmail(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.gmail });
    },
  });
}

export function useSendApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { to?: string; confirmGuess?: boolean } }) => getApi().sendApplication(id, body),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: keys.applications });
      void qc.invalidateQueries({ queryKey: keys.application(id) });
      void qc.invalidateQueries({ queryKey: keys.analytics });
    },
  });
}

export function useNextEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getApi().nextEmail(id),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: keys.application(id) });
      void qc.invalidateQueries({ queryKey: keys.applications });
    },
  });
}

export function useSetEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) => getApi().setEmail(id, email),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: keys.application(id) });
      void qc.invalidateQueries({ queryKey: keys.applications });
    },
  });
}

export function useFollowUps(status: FollowUp['status'] = 'pending_review') {
  return useQuery({
    queryKey: [...keys.followUps, status],
    queryFn: () => getApi().listFollowUps(status),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useUpdateFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { subject?: string; body?: string } }) => getApi().updateFollowUp(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.followUps });
    },
  });
}

export function useSendFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getApi().sendFollowUp(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.followUps });
      void qc.invalidateQueries({ queryKey: keys.applications });
    },
  });
}

export function useDismissFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getApi().dismissFollowUp(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.followUps });
    },
  });
}
```

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npm test -w mobile`
Expected: PASS, `Test Suites: 22 passed, 22 total`, `Tests: 180 passed, 180 total`.

Run: `npm run typecheck -w mobile`
Expected: exit code 0.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/lib/api/endpoints.ts mobile/src/lib/api/runtime.ts mobile/src/lib/secure-storage.ts mobile/src/lib/supabase.ts mobile/src/lib/query-client.ts mobile/src/lib/session.tsx mobile/src/hooks/api.ts mobile/tests/lib/api-endpoints.test.ts mobile/tests/lib/secure-storage.test.ts mobile/tests/lib/query-client.test.ts mobile/tests/lib/session.test.tsx mobile/tests/hooks/api.test.tsx
git commit -m "feat(mobile): API endpoints and hooks, Supabase session in SecureStore, session provider

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 5: Shared UI primitives

**Files:**
- Create: `mobile/src/components/ui/Button.tsx`, `Card.tsx`, `Badge.tsx`, `TextField.tsx`, `Checkbox.tsx`, `Chips.tsx`, `States.tsx`, `ScoreRing.tsx`, `OptionSheet.tsx`, `Screen.tsx`
- Test: `mobile/tests/components/ui.test.tsx`

**Interfaces:**
- Consumes: `colors`, `radius`, `space`, `font`, `cardShadow` (Task 2), `scoreTone` (Task 3).
- Produces (plain React Native, no UI kit; the accessibility props are what the tests and later tasks query by):
  - `Button({ label, onPress, variant?: 'primary' | 'outline' | 'ghost' | 'danger', size?: 'md' | 'sm', disabled?, busy?, style? })`: role `button`, name = `label`, disabled while `disabled || busy`.
  - `Card({ children, style? })`; `Section({ title, description?, children })`: a card with a header.
  - `Badge({ label, tone?: 'primary' | 'success' | 'warning' | 'danger' | 'secondary' | 'outline' })`: pill badge. `BadgeTone` type.
  - `TextField({ label, value, onChangeText, error?, hint?, multiline?, lines?, editable?, keyboardType?, autoCapitalize?, autoComplete?, secureTextEntry?, placeholder?, inputMode?, maxLength? })`: found with `getByLabelText(label)`; an `error` renders with role `alert`.
  - `Checkbox({ label, checked, onChange(next), disabled? })`: role `checkbox`, name = `label`, `checked` state.
  - `Chips<T extends string>({ options: readonly { value: T; label: string }[], value, onChange, role?: 'tab' | 'button', label })`: one selected chip (`selected` state).
  - `Loading({ label? })` (an activity indicator labelled `Loading`), `ErrorState({ message, onRetry? })` (role `alert` message plus a `Try again` button), `EmptyState({ title, description, action? })`, `Message({ kind: 'error' | 'success' | 'info', text })` (`error` has role `alert`).
  - `ScoreRing({ score, size? })`: labelled `Match score N out of 100` or `No match score`.
  - `OptionSheet<T extends string>({ visible, title, options, current?, onSelect, onClose })`: bottom sheet; the current option reads `<label> (current)` and only closes.
  - `Screen({ title?, subtitle?, children?, onRefresh?, refreshing? })`: safe-area page with a scroll view and optional pull-to-refresh.

Note on React Native Testing Library 14: `toHaveTextContent('...')` with a string matches the whole text exactly; use a regular expression for part of a text.

- [ ] **Step 1: Write the failing test**

Create `mobile/tests/components/ui.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Chips } from '@/components/ui/Chips';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { EmptyState, ErrorState, Loading } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';

describe('Button', () => {
  it('calls onPress when enabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is disabled and ignores presses when disabled or busy', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <Button label="Off" onPress={onPress} disabled />
        <Button label="Busy" onPress={onPress} busy />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Busy' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Off' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Checkbox', () => {
  function Controlled({ onChange }: { onChange(v: boolean): void }) {
    const [checked, setChecked] = useState(false);
    return (
      <Checkbox
        label="Send to this guessed address"
        checked={checked}
        onChange={(v) => {
          setChecked(v);
          onChange(v);
        }}
      />
    );
  }

  it('toggles and reports its state', async () => {
    const onChange = jest.fn();
    await render(<Controlled onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Send to this guessed address' });
    expect(box).not.toBeChecked();
    await fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('checkbox', { name: 'Send to this guessed address' })).toBeChecked();
  });
});

describe('Chips', () => {
  it('marks the selected chip and reports a new choice', async () => {
    const onChange = jest.fn();
    await render(
      <Chips label="Filter" value="all" onChange={onChange} options={[{ value: 'all', label: 'All' }, { value: 'high', label: '90%+' }]} />,
    );
    expect(screen.getByRole('button', { name: 'All' })).toBeSelected();
    expect(screen.getByRole('button', { name: '90%+' })).not.toBeSelected();
    await fireEvent.press(screen.getByRole('button', { name: '90%+' }));
    expect(onChange).toHaveBeenCalledWith('high');
  });
});

describe('TextField', () => {
  it('is found by its label and shows an error instead of the hint', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Recipient" value="a@b.co" onChangeText={onChangeText} hint="Hint" error="Bad address" />);
    expect(screen.getByLabelText('Recipient')).toHaveDisplayValue('a@b.co');
    await fireEvent.changeText(screen.getByLabelText('Recipient'), 'x@y.co');
    expect(onChangeText).toHaveBeenCalledWith('x@y.co');
    expect(screen.getByRole('alert')).toHaveTextContent('Bad address');
    expect(screen.queryByText('Hint')).toBeNull();
  });
});

describe('States', () => {
  it('ErrorState shows the message and retries', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState message="Cannot reach the server." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server.');
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('Loading and EmptyState render', async () => {
    await render(
      <>
        <Loading />
        <EmptyState title="Nothing here" description="Come back later." />
      </>,
    );
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByText('Nothing here')).toBeOnTheScreen();
  });
});

describe('ScoreRing and Badge', () => {
  it('labels the score for screen readers', async () => {
    await render(
      <>
        <ScoreRing score={92} />
        <ScoreRing score={null} />
        <Badge label="96% MATCH" tone="primary" />
      </>,
    );
    expect(screen.getByLabelText('Match score 92 out of 100')).toBeOnTheScreen();
    expect(screen.getByLabelText('No match score')).toBeOnTheScreen();
    expect(screen.getByText('96% MATCH')).toBeOnTheScreen();
  });
});

describe('OptionSheet', () => {
  it('selects another option and closes, and only closes for the current one', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    await render(
      <OptionSheet
        visible
        title="Move to"
        current="applied"
        options={[{ value: 'applied', label: 'Applied' }, { value: 'offer', label: 'Offer' }]}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Applied (current)' }));
    expect(onSelect).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Offer' }));
    expect(onSelect).toHaveBeenCalledWith('offer');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w mobile -- tests/components/ui.test.tsx`
Expected: FAIL with `Cannot find module '@/components/ui/Badge'`.

- [ ] **Step 3: Implement the primitives**

Create `mobile/src/components/ui/Button.tsx`:

```tsx
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, font, radius, space } from '@/theme';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress(): void;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  disabled?: boolean;
  /** Shows a spinner next to the label and blocks presses. */
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', size = 'md', disabled = false, busy = false, style }: ButtonProps) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [styles.base, styles[size], styles[variant], off && styles.off, pressed && !off && styles.pressed, style]}
    >
      {busy && <ActivityIndicator size="small" color={variant === 'primary' || variant === 'danger' ? colors.primaryText : colors.primary} />}
      <Text style={[styles.label, size === 'sm' && styles.labelSm, labelColor[variant]]}>{label}</Text>
    </Pressable>
  );
}

const labelColor = StyleSheet.create({
  primary: { color: colors.primaryText },
  danger: { color: colors.primaryText },
  outline: { color: colors.primary },
  ghost: { color: colors.secondaryText },
});

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2), borderRadius: radius.input, borderWidth: 1 },
  md: { minHeight: 44, paddingHorizontal: space(4) },
  sm: { minHeight: 36, paddingHorizontal: space(3) },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
  outline: { backgroundColor: colors.card, borderColor: colors.primary },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  off: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  label: { fontSize: font.body, fontWeight: '600' },
  labelSm: { fontSize: font.small },
});
```

Create `mobile/src/components/ui/Card.tsx`:

```tsx
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { cardShadow, colors, font, radius, space } from '@/theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A card with a heading and an optional one-line description, like the web CardHeader. */
export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      <View style={styles.body}>{children}</View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    gap: space(3),
    ...cardShadow,
  },
  title: { fontSize: font.heading, fontWeight: '600', color: colors.text },
  description: { fontSize: font.small, color: colors.muted },
  body: { gap: space(3) },
});
```

Create `mobile/src/components/ui/Badge.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '@/theme';

export type BadgeTone = 'primary' | 'success' | 'warning' | 'danger' | 'secondary' | 'outline';

const TONES: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft },
  success: { bg: colors.successSoft, fg: colors.success, border: colors.successSoft },
  warning: { bg: colors.warningSoft, fg: colors.warning, border: colors.warningSoft },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  secondary: { bg: colors.secondary, fg: colors.secondaryText, border: colors.secondary },
  outline: { bg: colors.card, fg: colors.secondaryText, border: colors.border },
};

/** A pill badge, as on the web. */
export function Badge({ label, tone = 'secondary' }: { label: string; tone?: BadgeTone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: space(2.5), paddingVertical: space(0.5) },
  text: { fontSize: font.tiny, fontWeight: '600' },
});
```

Create `mobile/src/components/ui/TextField.tsx`:

```tsx
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, font, radius, space } from '@/theme';

export interface TextFieldProps
  extends Pick<TextInputProps, 'keyboardType' | 'autoCapitalize' | 'autoComplete' | 'secureTextEntry' | 'placeholder' | 'inputMode' | 'maxLength'> {
  label: string;
  value: string;
  onChangeText(text: string): void;
  error?: string;
  hint?: string;
  multiline?: boolean;
  /** Visible height in lines for a multiline field. */
  lines?: number;
  editable?: boolean;
}

/** A labelled input. Tests find it with getByLabelText(label). */
export function TextField({ label, value, onChangeText, error, hint, multiline = false, lines = 6, editable = true, ...rest }: TextFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && { minHeight: lines * 20 + space(4) }, error ? styles.invalid : null]}
        {...rest}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space(1.5) },
  label: { fontSize: font.small, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.card,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    fontSize: font.body,
    color: colors.text,
  },
  invalid: { borderColor: colors.danger },
  error: { fontSize: font.small, color: colors.danger },
  hint: { fontSize: font.tiny, color: colors.muted },
});
```

Create `mobile/src/components/ui/Checkbox.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, space } from '@/theme';

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange(next: boolean): void;
  disabled?: boolean;
}

/** A tick box. Tests find it with getByRole('checkbox', { name: label }). */
export function Checkbox({ label, checked, onChange, disabled = false }: CheckboxProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={styles.row}
    >
      <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Text style={styles.tick}>✓</Text> : null}</View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2), minHeight: 40 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.primaryText, fontSize: font.small, fontWeight: '700' },
  label: { flex: 1, fontSize: font.body, color: colors.text },
});
```

Create `mobile/src/components/ui/Chips.tsx` (`NoInfer` makes `T` come from `options`, so `onChange={setState}` keeps the narrow type):

```tsx
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, font, radius, space } from '@/theme';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export interface ChipsProps<T extends string> {
  options: readonly ChipOption<T>[];
  value: NoInfer<T>;
  onChange(value: NoInfer<T>): void;
  /** 'tab' for segment switches (Pending / Ready / ...), 'button' for filter chips. */
  role?: 'tab' | 'button';
  label: string;
}

/** A horizontal row of pill chips with one selected, as in the mobile mockups. */
export function Chips<T extends string>({ options, value, onChange, role = 'button', label }: ChipsProps<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={label} contentContainerStyle={styles.row}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole={role}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, selected && styles.on]}
          >
            <Text style={[styles.text, selected && styles.textOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space(2), paddingVertical: space(1) },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: space(3.5), paddingVertical: space(2) },
  on: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { fontSize: font.small, color: colors.secondaryText, fontWeight: '500' },
  textOn: { color: colors.primaryText, fontWeight: '600' },
});
```

Create `mobile/src/components/ui/States.tsx`:

```tsx
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, font, space } from '@/theme';
import { Button } from './Button';

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator accessibilityLabel={label} color={colors.primary} size="large" />
    </View>
  );
}

/** Plain-language error with a retry button (network failures and server errors). */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text accessibilityRole="alert" style={styles.error}>
        {message}
      </Text>
      {onRetry ? <Button label="Try again" variant="outline" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {action}
    </View>
  );
}

/** A one-line result under a form: 'error' is announced as an alert. */
export function Message({ kind, text }: { kind: 'error' | 'success' | 'info'; text: string }) {
  return (
    <Text accessibilityRole={kind === 'error' ? 'alert' : 'text'} style={[styles.message, kindStyle[kind]]}>
      {text}
    </Text>
  );
}

const kindStyle = StyleSheet.create({
  error: { color: colors.danger },
  success: { color: colors.success },
  info: { color: colors.muted },
});

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(4), padding: space(6), minHeight: 200 },
  error: { fontSize: font.body, color: colors.danger, textAlign: 'center' },
  empty: { alignItems: 'center', gap: space(2), padding: space(8), borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 16 },
  title: { fontSize: font.heading, fontWeight: '600', color: colors.text, textAlign: 'center' },
  description: { fontSize: font.small, color: colors.muted, textAlign: 'center' },
  message: { fontSize: font.small },
});
```

Create `mobile/src/components/ui/ScoreRing.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { scoreTone } from '@/lib/applications';
import { colors } from '@/theme';

const TONE_COLOR = { high: colors.success, mid: colors.warning, low: colors.danger, none: colors.muted } as const;

/** The match score in a coloured ring. Same accessible label as the web ScoreRing. */
export function ScoreRing({ score, size = 44 }: { score: number | null; size?: number }) {
  const color = TONE_COLOR[scoreTone(score)];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={score === null ? 'No match score' : `Match score ${score} out of 100`}
      style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: color }]}
    >
      <Text style={[styles.text, { color, fontSize: Math.round(size / 3.2) }]}>{score ?? '–'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center', borderWidth: 4 },
  text: { fontWeight: '700' },
});
```

Create `mobile/src/components/ui/OptionSheet.tsx`:

```tsx
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '@/theme';

export interface SheetOption<T extends string> {
  value: T;
  label: string;
}

export interface OptionSheetProps<T extends string> {
  visible: boolean;
  title: string;
  options: readonly SheetOption<T>[];
  /** The option shown as current; pressing it just closes the sheet. */
  current?: T;
  onSelect(value: T): void;
  onClose(): void;
}

/** A bottom action sheet. Used instead of drag and drop to change an application's status. */
export function OptionSheet<T extends string>({ visible, title, options, current, onSelect, onClose }: OptionSheetProps<T>) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {options.map((o) => {
          const isCurrent = o.value === current;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              accessibilityState={{ selected: isCurrent }}
              onPress={() => {
                onClose();
                if (!isCurrent) onSelect(o.value);
              }}
              style={styles.option}
            >
              <Text style={[styles.optionText, isCurrent && styles.current]}>{isCurrent ? `${o.label} (current)` : o.label}</Text>
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.option}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), gap: space(1) },
  title: { fontSize: font.heading, fontWeight: '600', color: colors.text, marginBottom: space(2) },
  option: { minHeight: 48, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { fontSize: font.body, color: colors.text },
  current: { color: colors.muted },
  cancel: { fontSize: font.body, color: colors.primary, fontWeight: '600', textAlign: 'center' },
});
```

Create `mobile/src/components/ui/Screen.tsx`:

```tsx
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font, space } from '@/theme';

export interface ScreenProps {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  /** Pull-to-refresh: called when the user pulls; `refreshing` shows the spinner. */
  onRefresh?: () => void;
  refreshing?: boolean;
}

/** The page frame: light grey background, safe area, scrolling content with an optional pull-to-refresh. */
export function Screen({ title, subtitle, children, onRefresh, refreshing = false }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} /> : undefined}
      >
        {title ? (
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space(4), gap: space(4), paddingBottom: space(10) },
  header: { gap: space(1) },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: font.small, color: colors.muted },
});
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npm test -w mobile -- tests/components/ui.test.tsx`
Expected: PASS, `Tests: 9 passed, 9 total`.

Run: `npm test -w mobile && npm run typecheck -w mobile`
Expected: `Tests: 189 passed, 189 total`; typecheck exit code 0.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ui mobile/tests/components/ui.test.tsx
git commit -m "feat(mobile): UI primitives in the web design tokens (buttons, cards, pill badges, fields, chips, sheets)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 6: Auth gate, login, root layout and bottom tabs

**Files:**
- Create: `mobile/src/lib/auth-redirect.ts`
- Create: `mobile/src/components/auth/AuthGate.tsx`, `mobile/src/components/auth/AuthForm.tsx`, `mobile/src/components/AppProviders.tsx`
- Modify (replace whole file): `mobile/src/app/_layout.tsx`, `mobile/src/app/index.tsx`
- Create: `mobile/src/app/login.tsx`, `mobile/src/app/(tabs)/_layout.tsx`
- Create (temporary screens, replaced in Tasks 8, 12 and 15): `mobile/src/app/(tabs)/queue.tsx`, `tracker.tsx`, `analytics.tsx`, `settings.tsx`
- Test: `mobile/tests/lib/auth-redirect.test.ts`, `mobile/tests/components/auth-gate.test.tsx`, `mobile/tests/components/auth-form.test.tsx`

**Interfaces:**
- Consumes: `useSession`, `StaticSession`, `SessionProvider`, `SessionStatus` (Task 4), `getSupabase`, `watchAppStateForRefresh`, `createQueryClient`, `watchAppFocus`, `getPublicEnv` (Tasks 3 and 4), `useProfile`, `useApplications` (Task 4), `needsOnboarding`, `describeApiError` (Task 3), UI primitives (Task 5).
- Produces:
  - `decideAuthRedirect(firstSegment: string | undefined, status: SessionStatus): '/login' | '/queue' | null` (mirrors `web/src/lib/route-guard.ts`).
  - `AuthGate({ children })`: always renders the navigator, covers it with `Loading` while the session loads or a redirect is pending, and calls `router.replace('/login' | '/queue')`.
  - `AuthForm({ onSignIn(email, password): Promise<void>, onSignUp(email, password): Promise<{ needsConfirmation: boolean }> })`.
  - `AppProviders({ children })`: query client, foreground refetch, `SessionProvider` over `getSupabase().auth`, token refresh only in the foreground; shows the env error message if `mobile/.env` is missing values.
  - Routes: `/` redirects to `/queue`; `/login`; tabs `queue`, `tracker`, `analytics`, `settings` (Ionicons, pending count badge on Queue); the tabs layout redirects to `/onboarding` when `needsOnboarding(profile)`. The stack also declares `application/[id]` with a header (the route file arrives in Task 11; `/onboarding` arrives in Task 13 and `/gmail-return` in Task 14; until then Expo Router would show its "Unmatched route" page for them, which no test visits).

- [ ] **Step 1: Write the failing tests**

Create `mobile/tests/lib/auth-redirect.test.ts`:

```ts
import { decideAuthRedirect } from '@/lib/auth-redirect';

describe('decideAuthRedirect', () => {
  it.each([
    [undefined, 'signedOut', '/login'],
    ['(tabs)', 'signedOut', '/login'],
    ['application', 'signedOut', '/login'],
    ['gmail-return', 'signedOut', '/login'],
    ['login', 'signedOut', null],
    ['login', 'signedIn', '/queue'],
    ['(tabs)', 'signedIn', null],
    ['onboarding', 'signedIn', null],
    ['login', 'loading', null],
    ['(tabs)', 'loading', null],
  ] as const)('segment %s while %s -> %s', (segment, status, expected) => {
    expect(decideAuthRedirect(segment, status)).toBe(expected);
  });
});
```

Create `mobile/tests/components/auth-gate.test.tsx` (Expo Router is replaced by a fake router; the factory reads `mock*` variables lazily, which is why they are named that way):

```tsx
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockReplace = jest.fn();
let mockSegments: string[] = [];
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSegments: () => mockSegments,
}));

import { AuthGate } from '@/components/auth/AuthGate';
import { StaticSession, type SessionStatus } from '@/lib/session';

async function setup(status: SessionStatus, segments: string[]) {
  mockSegments = segments;
  await render(
    <StaticSession value={{ status, email: status === 'signedIn' ? 'me@example.com' : null }}>
      <AuthGate>
        <Text>App content</Text>
      </AuthGate>
    </StaticSession>,
  );
}

beforeEach(() => {
  mockReplace.mockClear();
});

describe('AuthGate', () => {
  it('sends a signed-out user to /login and covers the screen meanwhile', async () => {
    await setup('signedOut', ['(tabs)', 'queue']);
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
  });

  it('sends a signed-out user on the app root to /login', async () => {
    await setup('signedOut', []);
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('leaves a signed-out user on /login alone', async () => {
    await setup('signedOut', ['login']);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Loading')).toBeNull();
    expect(screen.getByText('App content')).toBeOnTheScreen();
  });

  it('moves a signed-in user off /login to the queue', async () => {
    await setup('signedIn', ['login']);
    expect(mockReplace).toHaveBeenCalledWith('/queue');
  });

  it('shows the app to a signed-in user without redirecting', async () => {
    await setup('signedIn', ['(tabs)', 'tracker']);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Loading')).toBeNull();
  });

  it('waits while the session is loading', async () => {
    await setup('loading', ['(tabs)', 'queue']);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
  });
});
```

Create `mobile/tests/components/auth-form.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AuthForm } from '@/components/auth/AuthForm';

async function setup(over: Partial<{ onSignIn: jest.Mock; onSignUp: jest.Mock }> = {}) {
  const onSignIn = over.onSignIn ?? jest.fn().mockResolvedValue(undefined);
  const onSignUp = over.onSignUp ?? jest.fn().mockResolvedValue({ needsConfirmation: false });
  await render(<AuthForm onSignIn={onSignIn} onSignUp={onSignUp} />);
  return { onSignIn, onSignUp };
}

async function fill(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
}

describe('AuthForm', () => {
  it('signs in with the trimmed email and the password', async () => {
    const { onSignIn } = await setup();
    await fill('  me@example.com ', 'password123');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSignIn).toHaveBeenCalledWith('me@example.com', 'password123');
  });

  it('shows field errors and calls nothing for bad input', async () => {
    const { onSignIn } = await setup();
    await fill('nope', 'short');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address')).toBeOnTheScreen();
    expect(screen.getByText('Use at least 8 characters')).toBeOnTheScreen();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it('shows the Supabase error message when sign-in fails', async () => {
    await setup({ onSignIn: jest.fn().mockRejectedValue(new Error('Invalid login credentials')) });
    await fill('me@example.com', 'password123');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
  });

  it('creates an account and asks to confirm the email when Supabase requires it', async () => {
    const { onSignUp } = await setup({ onSignUp: jest.fn().mockResolvedValue({ needsConfirmation: true }) });
    await fireEvent.press(screen.getByRole('tab', { name: 'Create account' }));
    await fill('me@example.com', 'password123');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(onSignUp).toHaveBeenCalledWith('me@example.com', 'password123');
    expect(await screen.findByText('Check your email to confirm your account, then sign in.')).toBeOnTheScreen();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w mobile -- tests/lib/auth-redirect.test.ts tests/components/auth-gate.test.tsx tests/components/auth-form.test.tsx`
Expected: FAIL with `Cannot find module '@/lib/auth-redirect'`, `'@/components/auth/AuthGate'` and `'@/components/auth/AuthForm'`.

- [ ] **Step 3: Implement the redirect rule, the gate and the form**

Create `mobile/src/lib/auth-redirect.ts`:

```ts
import type { SessionStatus } from './session';

/**
 * Where the auth gate should send the user, or null to stay. Mirrors web/src/lib/route-guard.ts:
 * signed out anywhere but /login goes to /login; signed in on /login goes to /queue. Nothing moves while the session loads.
 */
export function decideAuthRedirect(firstSegment: string | undefined, status: SessionStatus): '/login' | '/queue' | null {
  if (status === 'loading') return null;
  const onLogin = firstSegment === 'login';
  if (status === 'signedOut' && !onLogin) return '/login';
  if (status === 'signedIn' && onLogin) return '/queue';
  return null;
}
```

Create `mobile/src/components/auth/AuthGate.tsx`:

```tsx
import { useRouter, useSegments } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Loading } from '@/components/ui/States';
import { decideAuthRedirect } from '@/lib/auth-redirect';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

/**
 * Keeps signed-out users on /login and signed-in users off it. The navigator (children) always stays mounted,
 * because Expo Router can only navigate once the root layout has rendered it; a loading cover hides it meanwhile.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const target = decideAuthRedirect(segments[0], status);

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  const covered = status === 'loading' || target !== null;
  return (
    <View style={styles.fill}>
      {children}
      {covered ? (
        <View style={[StyleSheet.absoluteFill, styles.cover]}>
          <Loading />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cover: { backgroundColor: colors.background },
});
```

Create `mobile/src/components/auth/AuthForm.tsx`:

```tsx
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Chips } from '@/components/ui/Chips';
import { Message } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { space } from '@/theme';

export interface AuthFormProps {
  onSignIn(email: string, password: string): Promise<void>;
  onSignUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
}

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
});

type Mode = 'signin' | 'signup';
const MODES = [
  { value: 'signin', label: 'Sign in' },
  { value: 'signup', label: 'Create account' },
] as const;

/** Email and password only (Google sign-in is out of scope). Same rules and messages as the web form. */
export function AuthForm({ onSignIn, onSignUp }: AuthFormProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setMessage(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setErrors({ email: fields.email?.[0], password: fields.password?.[0] });
      return;
    }
    setErrors({});
    setPending(true);
    try {
      if (mode === 'signin') {
        await onSignIn(parsed.data.email, parsed.data.password);
      } else {
        const result = await onSignUp(parsed.data.email, parsed.data.password);
        if (result.needsConfirmation) setMessage({ kind: 'info', text: 'Check your email to confirm your account, then sign in.' });
      }
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
    } finally {
      setPending(false);
    }
  }

  const label = mode === 'signin' ? 'Sign in' : 'Create account';

  return (
    <View style={styles.form}>
      <Chips
        label="Account"
        role="tab"
        options={MODES}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setMessage(null);
          setErrors({});
        }}
      />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
      />
      {message ? <Message kind={message.kind} text={message.text} /> : null}
      <Button label={pending ? 'Please wait…' : label} onPress={() => void submit()} disabled={pending} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space(4) },
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test -w mobile -- tests/lib/auth-redirect.test.ts tests/components/auth-gate.test.tsx tests/components/auth-form.test.tsx`
Expected: PASS, `Tests: 20 passed, 20 total`.

- [ ] **Step 5: Wire the providers, the root layout, login and the tabs**

Create `mobile/src/components/AppProviders.tsx`:

```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ErrorState } from '@/components/ui/States';
import { getPublicEnv } from '@/lib/env';
import { createQueryClient, watchAppFocus } from '@/lib/query-client';
import { SessionProvider } from '@/lib/session';
import { getSupabase, watchAppStateForRefresh } from '@/lib/supabase';

function configProblem(): string | null {
  try {
    getPublicEnv();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'The app is not configured.';
  }
}

/** Query cache, foreground refetching, the Supabase session and token refresh, in that order. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [problem] = useState(configProblem);
  const [queryClient] = useState(createQueryClient);

  useEffect(() => watchAppFocus(), []);
  useEffect(() => (problem ? undefined : watchAppStateForRefresh(getSupabase().auth)), [problem]);

  if (problem) return <ErrorState message={problem} />;
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider source={getSupabase().auth}>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
```

Replace `mobile/src/app/_layout.tsx` with:

```tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProviders } from '@/components/AppProviders';
import { AuthGate } from '@/components/auth/AuthGate';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProviders>
        <AuthGate>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="application/[id]" options={{ headerShown: true, title: 'Application', headerTintColor: colors.primary }} />
          </Stack>
        </AuthGate>
      </AppProviders>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
```

Replace `mobile/src/app/index.tsx` with:

```tsx
import { Redirect } from 'expo-router';

/** The app root opens the queue; the auth gate sends signed-out users to /login first. */
export default function Index() {
  return <Redirect href="/queue" />;
}
```

Create `mobile/src/app/login.tsx`:

```tsx
import { StyleSheet, Text } from 'react-native';
import { AuthForm } from '@/components/auth/AuthForm';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { getSupabase } from '@/lib/supabase';
import { colors, font } from '@/theme';

/** After a successful sign-in the session listener flips to signed in and the auth gate moves on to /queue. */
export default function LoginScreen() {
  async function onSignIn(email: string, password: string) {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }

  async function onSignUp(email: string, password: string) {
    const { data, error } = await getSupabase().auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    return { needsConfirmation: !data.session };
  }

  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.brand}>
        JobLume
      </Text>
      <Text style={styles.tagline}>AI-tailored applications that you approve before anything is sent.</Text>
      <Card>
        <AuthForm onSignIn={onSignIn} onSignUp={onSignUp} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { fontSize: 32, fontWeight: '700', color: colors.primary, marginTop: 48 },
  tagline: { fontSize: font.body, color: colors.muted },
});
```

Create `mobile/src/app/(tabs)/_layout.tsx`:

```tsx
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { ErrorState, Loading } from '@/components/ui/States';
import { useApplications, useProfile } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { needsOnboarding } from '@/lib/onboarding';
import { colors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };

/** Bottom tabs as in the mockups. A user without a CV or roles is sent to onboarding first, like the web layout. */
export default function TabsLayout() {
  const profile = useProfile();
  const apps = useApplications();
  const pending = apps.data?.filter((a) => a.status === 'pending_review').length ?? 0;

  if (profile.isLoading) return <Loading />;
  if (profile.error) return <ErrorState message={describeApiError(profile.error)} onRetry={() => void profile.refetch()} />;
  if (profile.data && needsOnboarding(profile.data)) return <Redirect href="/onboarding" />;

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted }}>
      <Tabs.Screen
        name="queue"
        options={{ title: 'Queue', tabBarIcon: icon('file-tray-outline'), tabBarBadge: pending > 0 ? pending : undefined }}
      />
      <Tabs.Screen name="tracker" options={{ title: 'Tracker', tabBarIcon: icon('list-outline') }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics', tabBarIcon: icon('bar-chart-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings-outline') }} />
    </Tabs>
  );
}
```

Create the four temporary tab screens. `mobile/src/app/(tabs)/queue.tsx`:

```tsx
import { Screen } from '@/components/ui/Screen';

/** Temporary: replaced by the real screen in a later task. */
export default function QueueTab() {
  return <Screen title="Queue" />;
}
```

`mobile/src/app/(tabs)/tracker.tsx`:

```tsx
import { Screen } from '@/components/ui/Screen';

/** Temporary: replaced by the real screen in a later task. */
export default function TrackerTab() {
  return <Screen title="Tracker" />;
}
```

`mobile/src/app/(tabs)/analytics.tsx`:

```tsx
import { Screen } from '@/components/ui/Screen';

/** Temporary: replaced by the real screen in a later task. */
export default function AnalyticsTab() {
  return <Screen title="Analytics" />;
}
```

`mobile/src/app/(tabs)/settings.tsx`:

```tsx
import { Screen } from '@/components/ui/Screen';

/** Temporary: replaced by the real screen in a later task. */
export default function SettingsTab() {
  return <Screen title="Settings" />;
}
```

- [ ] **Step 6: Run everything and bundle**

Run: `npm test -w mobile && npm run typecheck -w mobile`
Expected: `Test Suites: 26 passed, 26 total`, `Tests: 209 passed, 209 total`; typecheck exit code 0.

Run: `cd mobile && CI=1 npx expo export --platform android --output-dir ../.superpowers/expo-export-check; cd ..`
Expected: `Android Bundled ...` and `Exported: ../.superpowers/expo-export-check` (Supabase, TanStack Query, SecureStore and the router all bundle).

- [ ] **Step 7: Commit**

```bash
git add mobile/src/lib/auth-redirect.ts mobile/src/components/auth mobile/src/components/AppProviders.tsx mobile/src/app mobile/tests/lib/auth-redirect.test.ts mobile/tests/components/auth-gate.test.tsx mobile/tests/components/auth-form.test.tsx
git commit -m "feat(mobile): email sign-in, auth gate to /login, root stack and bottom tabs with the onboarding redirect

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 7: Queue cards: application card, Add a job link, follow-up card

**Files:**
- Create: `mobile/tests/fixtures.ts` (test data builders used by every later component test)
- Create: `mobile/src/components/applications/ApplicationCard.tsx`
- Create: `mobile/src/components/jobs/AddJobLink.tsx`
- Create: `mobile/src/components/followups/FollowUpCard.tsx`, `mobile/src/components/followups/FollowUpItem.tsx`
- Test: `mobile/tests/components/queue-cards.test.tsx`

**Interfaces:**
- Consumes: `formatRelative`, `sourceLabel`, `STATUS_LABELS`, `formatShortDate`, `scoreTone`, `buildFollowUpPatch`, `addResultMessage`, `fetchSourceLabel`, `fetchStatusText`, `INVALID_LINK_MESSAGE`, `describeApiError` (Task 3), `useUpdateFollowUp`, `useSendFollowUp`, `useDismissFollowUp` (Task 4), `canonicalJobUrl` (shared), UI primitives (Task 5).
- Produces:
  - `tests/fixtures.ts`: `app(over?)`, `detail(over?)`, `followUp(over?)`, `profile(over?)`, `ok(data)` (a successful query result `{ data, isLoading: false, error: null, refetch, isRefetching: false }`), `type Mocked<T>` (`{ [K in keyof T]: jest.Mock }`, for modules replaced with `jest.mock`).
  - `ApplicationCard({ app, onOpen(id), now? })`: the "Details" button is named `Details for <title>`.
  - `AddJobLink({ fetches, pending, error, result, onAdd(url) })`: checks the link with `canonicalJobUrl` and only ever sends the canonical URL.
  - `FollowUpCard({ followUp, pending, error?, onSave(patch), onSend(), onDismiss() })` and `FollowUpItem({ followUp })` (the card wired to the follow-up mutations).

- [ ] **Step 1: Add the test fixtures**

Create `mobile/tests/fixtures.ts`:

```ts
import type { Application, ApplicationDetail, FollowUpWithJob, Profile } from '@joblume/shared';

/** Test data builders shared by the mobile tests. */
export const app = (over: Partial<Application> = {}): Application => ({
  id: 'a1',
  user_id: 'u1',
  job_id: 'j1',
  tailored_cv_text: 'Tailored CV text for the Data Analyst role at Acme, with SQL and Excel experience.',
  tailored_cv_url: 'u1/tailored/j1.pdf',
  cover_letter_text: 'Dear team, I would like to apply for the Data Analyst role at Acme.',
  match_score: 85,
  missing_keywords: [],
  hiring_manager_email: 'hr@acme.com',
  email_confidence: 90,
  email_source: 'hunter',
  email_candidates: [],
  apply_method: null,
  status: 'pending_review',
  applied_at: null,
  follow_up_at: null,
  created_at: '2026-10-18T10:00:00.000Z',
  job: { title: 'Data Analyst', company: 'Acme', location: 'Lagos', source: 'myjobmag', url: 'https://example.com/j', company_domain: null },
  ...over,
});

export const detail = (over: Partial<ApplicationDetail> = {}): ApplicationDetail => ({
  ...app(),
  cv_pdf_url: 'https://files.example.com/cv.pdf',
  ...over,
});

export const followUp = (over: Partial<FollowUpWithJob> = {}): FollowUpWithJob => ({
  id: 'f1',
  application_id: 'a1',
  subject: 'Following up on my application',
  body: 'Hello, I am following up on my application for the Data Analyst role. I remain very interested.',
  status: 'pending_review',
  created_at: '2026-10-18T10:00:00.000Z',
  sent_at: null,
  job: { title: 'Data Analyst', company: 'Acme' },
  ...over,
});

export const profile = (over: Partial<Profile> = {}): Profile => ({
  user_id: 'u1',
  base_cv_text: 'cv',
  base_cv_url: 'u1/base/cv.pdf',
  base_cv_filename: 'My CV.pdf',
  skills: ['SQL', 'Excel'],
  years_experience: 3,
  desired_roles: ['Data Analyst'],
  location: 'Lagos',
  salary_min: null,
  salary_max: null,
  apply_mode: 'manual',
  auto_threshold: 80,
  daily_cap: 10,
  auto_followup: false,
  updated_at: '2026-10-18T10:00:00.000Z',
  ...over,
});

/** A minimal successful TanStack Query result for mocked hooks. */
export const ok = <T,>(data: T) => ({ data, isLoading: false, error: null, refetch: jest.fn(), isRefetching: false });

/** A module replaced with jest.mock(path, () => ({ name: jest.fn(), ... })), typed for the test. */
export type Mocked<T> = { [K in keyof T]: jest.Mock };
```

- [ ] **Step 2: Write the failing test**

Create `mobile/tests/components/queue-cards.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ApplicationCard } from '@/components/applications/ApplicationCard';
import { FollowUpCard } from '@/components/followups/FollowUpCard';
import { AddJobLink } from '@/components/jobs/AddJobLink';
import { app, followUp } from '../fixtures';

describe('ApplicationCard', () => {
  it('shows the title, company, match badge, place, time, source and up to two keywords', async () => {
    const now = new Date('2026-10-18T12:00:00.000Z');
    await render(<ApplicationCard app={app({ match_score: 96, missing_keywords: ['Figma', 'UI/UX', 'Sketch'] })} onOpen={jest.fn()} now={now} />);
    expect(screen.getByText('Data Analyst')).toBeOnTheScreen();
    expect(screen.getByText('Acme')).toBeOnTheScreen();
    expect(screen.getByText('96% MATCH')).toBeOnTheScreen();
    expect(screen.getByText('Lagos')).toBeOnTheScreen();
    expect(screen.getByText('2 hours ago')).toBeOnTheScreen();
    expect(screen.getByText('MyJobMag')).toBeOnTheScreen();
    expect(screen.getByText('Figma')).toBeOnTheScreen();
    expect(screen.queryByText('Sketch')).toBeNull();
    expect(screen.getByText('+1')).toBeOnTheScreen();
  });

  it('opens the application from Details', async () => {
    const onOpen = jest.fn();
    await render(<ApplicationCard app={app({ id: 'a9' })} onOpen={onOpen} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Details for Data Analyst' }));
    expect(onOpen).toHaveBeenCalledWith('a9');
  });

  it('marks an approved application as ready to apply', async () => {
    await render(<ApplicationCard app={app({ status: 'approved' })} onOpen={jest.fn()} />);
    expect(screen.getByText('Ready to apply')).toBeOnTheScreen();
  });
});

describe('AddJobLink', () => {
  const base = { fetches: [], pending: false, error: null, result: null };

  it('refuses a link that is not a LinkedIn or Indeed job, without calling the server', async () => {
    const onAdd = jest.fn();
    await render(<AddJobLink {...base} onAdd={onAdd} />);
    await fireEvent.changeText(screen.getByLabelText('Add a job link'), 'https://www.glassdoor.com/job/123');
    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/not a LinkedIn or Indeed job link/);
  });

  it('sends the canonical link without tracking parameters', async () => {
    const onAdd = jest.fn();
    await render(<AddJobLink {...base} onAdd={onAdd} />);
    await fireEvent.changeText(screen.getByLabelText('Add a job link'), 'https://www.linkedin.com/jobs/view/4012345678/?trk=abc');
    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).toHaveBeenCalledWith('https://www.linkedin.com/jobs/view/4012345678/');
  });

  it('lists recent links with their status', async () => {
    await render(
      <AddJobLink
        {...base}
        onAdd={jest.fn()}
        result={{ queued: true }}
        fetches={[{ id: 'x', url: 'https://ng.indeed.com/viewjob?jk=0123456789abcdef', status: 'failed', reason: 'not_found', job_id: null, created_at: '', updated_at: '' }]}
      />,
    );
    expect(screen.getByText(/We are reading the job now/)).toBeOnTheScreen();
    expect(screen.getByText(/This job is no longer available/)).toBeOnTheScreen();
  });
});

describe('FollowUpCard', () => {
  const handlers = () => ({ onSave: jest.fn(), onSend: jest.fn(), onDismiss: jest.fn() });

  it('sends only when Send follow-up is tapped', async () => {
    const h = handlers();
    await render(<FollowUpCard followUp={followUp()} pending={false} {...h} />);
    expect(h.onSend).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Send follow-up' }));
    expect(h.onSend).toHaveBeenCalledTimes(1);
  });

  it('blocks sending until edits are saved, then saves the trimmed patch', async () => {
    const h = handlers();
    await render(<FollowUpCard followUp={followUp()} pending={false} {...h} />);
    await fireEvent.changeText(screen.getByLabelText('Subject'), '  A better subject  ');
    expect(screen.getByRole('button', { name: 'Send follow-up' })).toBeDisabled();
    expect(screen.getByText('Save your changes first.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(h.onSave).toHaveBeenCalledWith({ subject: 'A better subject' });
  });

  it('shows validation errors and dismisses', async () => {
    const h = handlers();
    await render(<FollowUpCard followUp={followUp()} pending={false} {...h} />);
    await fireEvent.changeText(screen.getByLabelText('Message'), 'Too short');
    expect(screen.getByText('The message must be at least 40 characters.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(h.onDismiss).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -w mobile -- tests/components/queue-cards.test.tsx`
Expected: FAIL with `Cannot find module '@/components/applications/ApplicationCard'`.

- [ ] **Step 4: Implement the cards**

Create `mobile/src/components/applications/ApplicationCard.tsx`:

```tsx
import type { Application } from '@joblume/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { scoreTone } from '@/lib/applications';
import { formatRelative, sourceLabel, STATUS_LABELS } from '@/lib/format';
import { colors, font, radius, space } from '@/theme';

const MAX_KEYWORDS = 2;
const MATCH_TONE = { high: 'success', mid: 'warning', low: 'danger', none: 'secondary' } as const;

/** A queue card as in the mobile home mockup: initial tile, title, company, match badge, place, time, source, keywords, Details. */
export function ApplicationCard({ app, onOpen, now }: { app: Application; onOpen(id: string): void; now?: Date }) {
  const title = app.job?.title ?? 'Untitled role';
  const company = app.job?.company ?? 'Unknown company';
  const keywords = app.missing_keywords.slice(0, MAX_KEYWORDS);
  const extra = app.missing_keywords.length - keywords.length;
  const posted = formatRelative(app.created_at, now);

  return (
    <Card>
      <View style={styles.top}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>{company.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.titles}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.company}>{company}</Text>
        </View>
        <Badge label={app.match_score === null ? 'NO SCORE' : `${app.match_score}% MATCH`} tone={MATCH_TONE[scoreTone(app.match_score)]} />
      </View>

      <View style={styles.meta}>
        {app.job?.location ? <Text style={styles.metaText}>{app.job.location}</Text> : null}
        {posted ? <Text style={styles.metaText}>{posted}</Text> : null}
        {app.job ? <Badge label={sourceLabel(app.job.source)} tone="outline" /> : null}
        {app.status !== 'pending_review' ? <Badge label={STATUS_LABELS[app.status]} tone={app.status === 'approved' ? 'primary' : 'secondary'} /> : null}
      </View>

      <View style={styles.bottom}>
        <View accessibilityLabel="Missing keywords" style={styles.keywords}>
          {keywords.map((k) => (
            <Badge key={k} label={k} tone="warning" />
          ))}
          {extra > 0 ? <Text style={styles.metaText}>{`+${extra}`}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Details for ${title}`} onPress={() => onOpen(app.id)} hitSlop={8}>
          <Text style={styles.details}>Details ›</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3) },
  logo: { width: 44, height: 44, borderRadius: radius.input, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: font.heading, fontWeight: '700', color: colors.primary },
  titles: { flex: 1, gap: 2 },
  title: { fontSize: font.body, fontWeight: '600', color: colors.text },
  company: { fontSize: font.small, color: colors.muted },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(3) },
  metaText: { fontSize: font.small, color: colors.muted },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space(3) },
  keywords: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(1.5), flex: 1 },
  details: { fontSize: font.body, color: colors.primary, fontWeight: '600' },
});
```

Create `mobile/src/components/jobs/AddJobLink.tsx`:

```tsx
import { canonicalJobUrl, type AddJobLinkResult, type JobFetch } from '@joblume/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Message } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { formatRelative } from '@/lib/format';
import { addResultMessage, fetchSourceLabel, fetchStatusText, INVALID_LINK_MESSAGE } from '@/lib/job-fetches';
import { colors, font, space } from '@/theme';

export interface AddJobLinkProps {
  fetches: JobFetch[];
  pending: boolean;
  error: string | null;
  result: AddJobLinkResult | null;
  onAdd(url: string): void;
}

/** "Add a job link" card: checks the link with the shared canonicalJobUrl before sending, then lists recent links. */
export function AddJobLink({ fetches, pending, error, result, onAdd }: AddJobLinkProps) {
  const [url, setUrl] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (result) setUrl('');
  }, [result]);

  function submit() {
    const link = canonicalJobUrl(url);
    if (!link) {
      setLocalError(INVALID_LINK_MESSAGE);
      return;
    }
    setLocalError(null);
    onAdd(link.url);
  }

  const shownError = localError ?? error;

  return (
    <Card>
      <TextField
        label="Add a job link"
        hint="Paste a LinkedIn or Indeed job link. We read that one page and prepare an application for you to review. You apply on the site yourself."
        placeholder="https://www.linkedin.com/jobs/view/…"
        value={url}
        onChangeText={(t) => {
          setUrl(t);
          setLocalError(null);
        }}
        keyboardType="url"
        autoCapitalize="none"
        maxLength={2048}
      />
      <Button label={pending ? 'Adding…' : 'Add'} onPress={submit} disabled={pending || url.trim() === ''} />
      {shownError ? <Message kind="error" text={shownError} /> : null}
      {!shownError && result ? <Message kind="info" text={addResultMessage(result)} /> : null}
      {fetches.length > 0 ? (
        <View accessibilityLabel="Recent job links" style={styles.list}>
          {fetches.map((f) => (
            <View key={f.id} style={styles.row}>
              <Text numberOfLines={1} style={styles.url}>
                <Text style={styles.source}>{fetchSourceLabel(f.url)} </Text>
                {f.url}
              </Text>
              <Text style={[styles.status, f.status === 'failed' && styles.failed]}>{`${fetchStatusText(f)} · ${formatRelative(f.updated_at)}`}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: space(2) },
  row: { gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space(2) },
  url: { fontSize: font.small, color: colors.muted },
  source: { fontWeight: '600', color: colors.text },
  status: { fontSize: font.small, color: colors.muted },
  failed: { color: colors.danger },
});
```

Create `mobile/src/components/followups/FollowUpCard.tsx`:

```tsx
import type { FollowUpWithJob } from '@joblume/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Message } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { buildFollowUpPatch } from '@/lib/follow-ups';
import { formatShortDate } from '@/lib/format';
import { colors, font, space } from '@/theme';

export interface FollowUpCardProps {
  followUp: FollowUpWithJob;
  pending: boolean;
  error?: string | null;
  onSave(patch: { subject?: string; body?: string }): void;
  onSend(): void;
  onDismiss(): void;
}

/** A follow-up draft. It is only sent when the user taps Send follow-up (or under Auto follow-up on the server). */
export function FollowUpCard({ followUp, pending, error, onSave, onSend, onDismiss }: FollowUpCardProps) {
  const [subject, setSubject] = useState(followUp.subject);
  const [body, setBody] = useState(followUp.body);

  useEffect(() => {
    setSubject(followUp.subject);
    setBody(followUp.body);
  }, [followUp.id, followUp.subject, followUp.body]);

  const edit = buildFollowUpPatch({ subject: followUp.subject, body: followUp.body }, { subject, body });
  const hasErrors = Object.keys(edit.errors).length > 0;

  return (
    <Card>
      <View>
        <Text style={styles.title}>{followUp.job ? `${followUp.job.title} at ${followUp.job.company}` : 'Application'}</Text>
        <Text style={styles.muted}>{`Draft created ${formatShortDate(followUp.created_at)}`}</Text>
      </View>
      <TextField label="Subject" value={subject} onChangeText={setSubject} error={edit.errors.subject} />
      <TextField label="Message" value={body} onChangeText={setBody} error={edit.errors.body} multiline lines={8} />
      <View style={styles.actions}>
        <Button label="Save changes" variant="outline" size="sm" disabled={!edit.dirty || hasErrors || pending} onPress={() => onSave(edit.patch)} />
        <Button label="Send follow-up" size="sm" disabled={edit.dirty || pending} onPress={onSend} />
        <Button label="Dismiss" variant="ghost" size="sm" disabled={pending} onPress={onDismiss} />
      </View>
      {edit.dirty ? <Text style={styles.muted}>Save your changes first.</Text> : null}
      {error ? <Message kind="error" text={error} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.body, fontWeight: '600', color: colors.text },
  muted: { fontSize: font.tiny, color: colors.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
});
```

Create `mobile/src/components/followups/FollowUpItem.tsx`:

```tsx
import type { FollowUpWithJob } from '@joblume/shared';
import { useDismissFollowUp, useSendFollowUp, useUpdateFollowUp } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { FollowUpCard } from './FollowUpCard';

/** A follow-up card wired to the API. */
export function FollowUpItem({ followUp }: { followUp: FollowUpWithJob }) {
  const update = useUpdateFollowUp();
  const send = useSendFollowUp();
  const dismiss = useDismissFollowUp();
  const error = update.error ?? send.error ?? dismiss.error;
  return (
    <FollowUpCard
      followUp={followUp}
      pending={update.isPending || send.isPending || dismiss.isPending}
      error={error ? describeApiError(error) : null}
      onSave={(patch) => update.mutate({ id: followUp.id, patch })}
      onSend={() => send.mutate(followUp.id)}
      onDismiss={() => dismiss.mutate(followUp.id)}
    />
  );
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npm test -w mobile -- tests/components/queue-cards.test.tsx`
Expected: PASS, `Tests: 9 passed, 9 total`.

Run: `npm test -w mobile && npm run typecheck -w mobile`
Expected: `Tests: 218 passed, 218 total`; typecheck exit code 0.

- [ ] **Step 6: Commit**

```bash
git add mobile/tests/fixtures.ts mobile/tests/components/queue-cards.test.tsx mobile/src/components/applications/ApplicationCard.tsx mobile/src/components/jobs/AddJobLink.tsx mobile/src/components/followups
git commit -m "feat(mobile): queue card, Add a job link card and follow-up draft card

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 8: Queue screen with search, filter chips, segments and pull-to-refresh

**Files:**
- Create: `mobile/src/lib/queue-filters.ts`
- Create: `mobile/src/components/queue/QueueScreen.tsx`
- Modify (replace whole file): `mobile/src/app/(tabs)/queue.tsx`
- Test: `mobile/tests/lib/queue-filters.test.ts`, `mobile/tests/components/queue-screen.test.tsx`

**Interfaces:**
- Consumes: `splitQueue`, `QueueTab`, `sourceLabel`, `describeApiError` (Task 3), `useApplications`, `useFollowUps`, `useJobFetches`, `useAddJobLink`, `useRefreshJobs`, `useSession` (Task 4), `ApplicationCard`, `AddJobLink`, `FollowUpItem` (Task 7), UI primitives (Task 5), fixtures (Task 7).
- Produces:
  - `QueueFilter = 'all' | 'high' | 'recent'`, `QUEUE_FILTERS` (labels `All`, `90%+`, `Recent`), `HIGH_MATCH = 90`, `RECENT_MS` (7 days), `matchesSearch(app, search): boolean` (title, company, location or source label; case-insensitive), `isHighMatch(app): boolean`, `filterQueue(apps, { filter, search, now? }): Application[]` (keeps the best-match order; Recent sorts newest first).
  - `QueueScreen()`: welcome line with the signed-in email, search box (`Search your queue`), In Queue / High Match tiles, `Check for new jobs`, segment tabs `Pending (n)`, `Ready (n)`, `Skipped (n)`, `Follow-ups (n)`, filter chips, cards (tap Details opens `/application/<id>`), the Add a job link card, and pull-to-refresh (applications, follow-ups and job links).

- [ ] **Step 1: Write the failing tests**

Create `mobile/tests/lib/queue-filters.test.ts`:

```ts
import { filterQueue, isHighMatch, matchesSearch, RECENT_MS } from '@/lib/queue-filters';
import { app } from '../fixtures';

const NOW = Date.parse('2026-10-19T12:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const apps = [
  app({ id: 'top', match_score: 96, created_at: daysAgo(10) }),
  app({ id: 'ninety', match_score: 90, created_at: daysAgo(1), job: { title: 'Frontend Engineer', company: 'Luminary AI', location: 'Remote', source: 'linkedin', url: 'https://x', company_domain: null } }),
  app({ id: 'mid', match_score: 79, created_at: daysAgo(2) }),
  app({ id: 'none', match_score: null, created_at: daysAgo(0.1) }),
];
const ids = (list: { id: string }[]) => list.map((a) => a.id);

describe('matchesSearch', () => {
  it('matches title, company, location and source label, ignoring case and spaces', () => {
    expect(matchesSearch(apps[1]!, '  frontend ')).toBe(true);
    expect(matchesSearch(apps[1]!, 'LUMINARY')).toBe(true);
    expect(matchesSearch(apps[1]!, 'remote')).toBe(true);
    expect(matchesSearch(apps[1]!, 'LinkedIn')).toBe(true);
    expect(matchesSearch(apps[1]!, 'acme')).toBe(false);
  });

  it('matches everything for a blank search and nothing searchable without a job', () => {
    expect(matchesSearch(app({ job: null }), '')).toBe(true);
    expect(matchesSearch(app({ job: null }), 'acme')).toBe(false);
  });
});

describe('filterQueue', () => {
  it('All keeps every application in the given order', () => {
    expect(ids(filterQueue(apps, { filter: 'all', search: '', now: NOW }))).toEqual(['top', 'ninety', 'mid', 'none']);
  });

  it('90%+ keeps scores of 90 and above only', () => {
    expect(ids(filterQueue(apps, { filter: 'high', search: '', now: NOW }))).toEqual(['top', 'ninety']);
    expect(isHighMatch({ match_score: 89 })).toBe(false);
  });

  it('Recent keeps the last 7 days, newest first', () => {
    expect(ids(filterQueue(apps, { filter: 'recent', search: '', now: NOW }))).toEqual(['none', 'ninety', 'mid']);
    const edge = app({ id: 'edge', created_at: new Date(NOW - RECENT_MS).toISOString() });
    expect(ids(filterQueue([edge, app({ id: 'bad', created_at: 'not a date' })], { filter: 'recent', search: '', now: NOW }))).toEqual(['edge']);
  });

  it('combines the search with the chip', () => {
    expect(ids(filterQueue(apps, { filter: 'high', search: 'acme', now: NOW }))).toEqual(['top']);
  });
});
```

Create `mobile/tests/components/queue-screen.test.tsx` (the hooks module is replaced by `jest.fn()`s and typed with `Mocked`):

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { app, followUp, ok, type Mocked } from '../fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mutation = () => ({ mutate: jest.fn(), isPending: false, isSuccess: false, error: null, data: undefined });
jest.mock('@/hooks/api', () => ({
  useApplications: jest.fn(),
  useFollowUps: jest.fn(),
  useJobFetches: jest.fn(),
  useAddJobLink: jest.fn(),
  useRefreshJobs: jest.fn(),
  useUpdateFollowUp: jest.fn(),
  useSendFollowUp: jest.fn(),
  useDismissFollowUp: jest.fn(),
}));

import { QueueScreen } from '@/components/queue/QueueScreen';
import * as hooks from '@/hooks/api';
import { StaticSession } from '@/lib/session';

const mockHooks = hooks as unknown as Mocked<typeof hooks>;

const recent = new Date(Date.now() - 2 * 3_600_000).toISOString();
const old = new Date(Date.now() - 20 * 86_400_000).toISOString();
const job = (title: string, company: string) => ({ title, company, location: 'Lagos', source: 'remotive', url: 'https://example.com/j', company_domain: null });

function setup() {
  mockHooks.useApplications.mockReturnValue(
    ok([
      app({ id: 'hi', match_score: 96, created_at: old, job: job('Senior Product Designer', 'TechFlow') }),
      app({ id: 'mid', match_score: 79, created_at: recent, job: job('Data Analyst', 'Acme') }),
      app({ id: 'ready', status: 'approved', match_score: 70, job: job('BI Analyst', 'Beta') }),
    ]),
  );
  mockHooks.useFollowUps.mockReturnValue(ok([followUp()]));
  mockHooks.useJobFetches.mockReturnValue(ok([]));
  for (const k of ['useAddJobLink', 'useRefreshJobs', 'useUpdateFollowUp', 'useSendFollowUp', 'useDismissFollowUp'] as const) {
    mockHooks[k].mockReturnValue(mutation());
  }
  return render(
    <StaticSession value={{ status: 'signedIn', email: 'me@example.com' }}>
      <QueueScreen />
    </StaticSession>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('QueueScreen filters', () => {
  it('shows the pending applications, best match first, with the counts', async () => {
    await setup();
    expect(screen.getByText('me@example.com')).toBeOnTheScreen();
    expect(screen.getByText('2 jobs')).toBeOnTheScreen();
    expect(screen.getByText('1 ≥ 90%')).toBeOnTheScreen();
    expect(screen.getByText('Senior Product Designer')).toBeOnTheScreen();
    expect(screen.getByText('Data Analyst')).toBeOnTheScreen();
    expect(screen.queryByText('BI Analyst')).toBeNull();
  });

  it('90%+ keeps only the high matches', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: '90%+' }));
    expect(screen.getByText('Senior Product Designer')).toBeOnTheScreen();
    expect(screen.queryByText('Data Analyst')).toBeNull();
  });

  it('Recent keeps only applications from the last 7 days', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Recent' }));
    expect(screen.getByText('Data Analyst')).toBeOnTheScreen();
    expect(screen.queryByText('Senior Product Designer')).toBeNull();
  });

  it('the search box narrows the list, and an empty result says so', async () => {
    await setup();
    await fireEvent.changeText(screen.getByLabelText('Search your queue'), 'acme');
    expect(screen.getByText('Data Analyst')).toBeOnTheScreen();
    expect(screen.queryByText('Senior Product Designer')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search your queue'), 'nothing like this');
    expect(screen.getByText('No matches for this filter')).toBeOnTheScreen();
  });

  it('switches to the Ready segment and opens an application', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('tab', { name: 'Ready (1)' }));
    expect(screen.getByText('BI Analyst')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Details for BI Analyst' }));
    expect(mockPush).toHaveBeenCalledWith('/application/ready');
  });

  it('shows the follow-up drafts as a segment', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('tab', { name: 'Follow-ups (1)' }));
    expect(screen.getByText('Data Analyst at Acme')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Send follow-up' })).toBeOnTheScreen();
  });

  it('shows a retry state when the list cannot load', async () => {
    mockHooks.useApplications.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x'), refetch: jest.fn() });
    mockHooks.useFollowUps.mockReturnValue(ok([]));
    mockHooks.useJobFetches.mockReturnValue(ok([]));
    for (const k of ['useAddJobLink', 'useRefreshJobs'] as const) mockHooks[k].mockReturnValue(mutation());
    await render(<QueueScreen />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w mobile -- tests/lib/queue-filters.test.ts tests/components/queue-screen.test.tsx`
Expected: FAIL with `Cannot find module '@/lib/queue-filters'` and `'@/components/queue/QueueScreen'`.

- [ ] **Step 3: Implement the filters and the screen**

Create `mobile/src/lib/queue-filters.ts`:

```ts
import type { Application } from '@joblume/shared';
import { sourceLabel } from './format';

/** The queue's filter chips (mobile home mockup): All, 90%+ and Recent. */
export type QueueFilter = 'all' | 'high' | 'recent';

export const QUEUE_FILTERS: readonly { value: QueueFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'high', label: '90%+' },
  { value: 'recent', label: 'Recent' },
];

export const HIGH_MATCH = 90;
/** "Recent" means prepared in the last 7 days. */
export const RECENT_MS = 7 * 86_400_000;

/** Case-insensitive match on the job title, company, location or source; a blank search matches everything. */
export function matchesSearch(app: Application, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (q === '') return true;
  const job = app.job;
  if (!job) return false;
  return [job.title, job.company, job.location, sourceLabel(job.source)].some((field) => field.toLowerCase().includes(q));
}

export const isHighMatch = (app: { match_score: number | null }): boolean => app.match_score !== null && app.match_score >= HIGH_MATCH;

/** Applies the search and the chip. Keeps the given order (best match first), except Recent which shows the newest first. */
export function filterQueue(apps: Application[], opts: { filter: QueueFilter; search: string; now?: number }): Application[] {
  const now = opts.now ?? Date.now();
  const searched = apps.filter((a) => matchesSearch(a, opts.search));
  if (opts.filter === 'high') return searched.filter(isHighMatch);
  if (opts.filter === 'recent') {
    return searched
      .filter((a) => {
        const created = Date.parse(a.created_at);
        return !Number.isNaN(created) && now - created <= RECENT_MS;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return searched;
}
```

Create `mobile/src/components/queue/QueueScreen.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ApplicationCard } from '@/components/applications/ApplicationCard';
import { FollowUpItem } from '@/components/followups/FollowUpItem';
import { AddJobLink } from '@/components/jobs/AddJobLink';
import { Button } from '@/components/ui/Button';
import { Chips } from '@/components/ui/Chips';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, Loading, Message } from '@/components/ui/States';
import { useAddJobLink, useApplications, useFollowUps, useJobFetches, useRefreshJobs } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { splitQueue, type QueueTab } from '@/lib/applications';
import { filterQueue, isHighMatch, QUEUE_FILTERS, type QueueFilter } from '@/lib/queue-filters';
import { useSession } from '@/lib/session';
import { colors, font, radius, space } from '@/theme';

type Segment = QueueTab | 'followups';

const EMPTY: Record<QueueTab, { title: string; description: string }> = {
  pending: {
    title: 'No applications to review yet',
    description: 'New jobs are checked every 6 hours. Make sure your CV and roles are set in Settings, then check for new jobs.',
  },
  ready: { title: 'Nothing is ready to apply', description: 'Approve an application from Pending and it will wait here until you send or mark it applied.' },
  skipped: { title: 'No skipped applications', description: 'Applications you skip appear here, and you can restore them.' },
};

/** Queue tab, following the mobile home mockup: search, stats, segments, filter chips, cards, pull-to-refresh. */
export function QueueScreen() {
  const router = useRouter();
  const { email } = useSession();
  const apps = useApplications({ poll: true });
  const followUps = useFollowUps('pending_review');
  const jobFetches = useJobFetches();
  const addLink = useAddJobLink();
  const refresh = useRefreshJobs();
  const [segment, setSegment] = useState<Segment>('pending');
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [search, setSearch] = useState('');
  const groups = useMemo(() => splitQueue(apps.data ?? []), [apps.data]);

  if (apps.isLoading) return <Loading />;
  if (apps.error) return <ErrorState message={describeApiError(apps.error)} onRetry={() => void apps.refetch()} />;

  const drafts = followUps.data ?? [];
  const segments = [
    { value: 'pending', label: `Pending (${groups.pending.length})` },
    { value: 'ready', label: `Ready (${groups.ready.length})` },
    { value: 'skipped', label: `Skipped (${groups.skipped.length})` },
    { value: 'followups', label: `Follow-ups (${drafts.length})` },
  ] as const;
  const shown = segment === 'followups' ? [] : filterQueue(groups[segment], { filter, search });
  const open = (id: string) => router.push(`/application/${id}`);
  const onRefresh = () => {
    void apps.refetch();
    void followUps.refetch();
    void jobFetches.refetch();
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={apps.isRefetching}>
      <View>
        <Text style={styles.welcome}>Welcome back,</Text>
        <Text style={styles.name}>{email ?? 'JobLume'}</Text>
      </View>
      <TextInput
        accessibilityLabel="Search your queue"
        placeholder="Search your queue..."
        placeholderTextColor={colors.muted}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        style={styles.search}
      />

      <View style={styles.stats}>
        <View style={[styles.stat, styles.statPrimary]}>
          <Text style={styles.statLabel}>In Queue</Text>
          <Text style={styles.statValue}>{`${groups.pending.length} jobs`}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>High Match</Text>
          <Text style={styles.statValue}>{`${groups.pending.filter(isHighMatch).length} ≥ 90%`}</Text>
        </View>
      </View>

      <Button label={refresh.isPending ? 'Checking…' : 'Check for new jobs'} size="sm" variant="outline" disabled={refresh.isPending} onPress={() => refresh.mutate()} />
      {refresh.isSuccess ? <Message kind="info" text="Checking for new jobs. New matches appear here within a few minutes." /> : null}
      {refresh.error ? <Message kind="error" text={describeApiError(refresh.error)} /> : null}

      <Chips label="Queue sections" role="tab" options={segments} value={segment} onChange={setSegment} />

      {segment === 'followups' ? (
        followUps.error ? (
          <ErrorState message={describeApiError(followUps.error)} onRetry={() => void followUps.refetch()} />
        ) : drafts.length === 0 ? (
          <EmptyState
            title="No follow-ups waiting"
            description="A follow-up draft appears here three days after you send an application, as long as you have not moved its card."
          />
        ) : (
          drafts.map((f) => <FollowUpItem key={f.id} followUp={f} />)
        )
      ) : (
        <>
          <Chips label="Filters" options={QUEUE_FILTERS} value={filter} onChange={setFilter} />
          <Text style={styles.section}>RECOMMENDED FOR YOU</Text>
          {groups[segment].length === 0 ? (
            <EmptyState title={EMPTY[segment].title} description={EMPTY[segment].description} />
          ) : shown.length === 0 ? (
            <EmptyState title="No matches for this filter" description="Try another filter or clear the search." />
          ) : (
            shown.map((a) => <ApplicationCard key={a.id} app={a} onOpen={open} />)
          )}
          <AddJobLink
            fetches={jobFetches.data ?? []}
            pending={addLink.isPending}
            error={addLink.error ? describeApiError(addLink.error) : null}
            result={addLink.data ?? null}
            onAdd={(url) => addLink.mutate(url)}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  welcome: { fontSize: font.small, color: colors.muted },
  name: { fontSize: font.heading, fontWeight: '600', color: colors.text },
  search: {
    minHeight: 44,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: space(3),
    fontSize: font.body,
    color: colors.text,
  },
  stats: { flexDirection: 'row', gap: space(3) },
  stat: { flex: 1, borderRadius: radius.card, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: space(3), gap: 2 },
  statPrimary: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  statLabel: { fontSize: font.small, color: colors.primary },
  statValue: { fontSize: font.heading, fontWeight: '700', color: colors.primary },
  section: { fontSize: font.small, letterSpacing: 1.5, color: colors.muted, fontWeight: '600' },
});
```

Replace `mobile/src/app/(tabs)/queue.tsx` with:

```tsx
import { QueueScreen } from '@/components/queue/QueueScreen';

export default function QueueTab() {
  return <QueueScreen />;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npm test -w mobile -- tests/lib/queue-filters.test.ts tests/components/queue-screen.test.tsx`
Expected: PASS, `Tests: 13 passed, 13 total`.

Run: `npm test -w mobile && npm run typecheck -w mobile`
Expected: `Tests: 231 passed, 231 total`; typecheck exit code 0.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/queue-filters.ts mobile/src/components/queue "mobile/src/app/(tabs)/queue.tsx" mobile/tests/lib/queue-filters.test.ts mobile/tests/components/queue-screen.test.tsx
git commit -m "feat(mobile): queue screen with search, All / 90%+ / Recent chips, segments incl. follow-ups, pull-to-refresh

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 9: Send by email section (no send without a tap, guess needs confirmation)

**Files:**
- Create: `mobile/src/components/applications/EmailSection.tsx`
- Test: `mobile/tests/components/email-section.test.tsx`

**Interfaces:**
- Consumes: `recipientInfo`, `sendDisabledReason`, `previewText` (Task 3), `Badge`, `Button`, `Checkbox`, `Message`, `TextField` (Task 5), `detail` fixture (Task 7).
- Produces: `EmailSection({ app: ApplicationDetail, gmail: GmailStatus | undefined, lockedReason?, pending, error?, notice?, onSend({ to?, confirmGuess? }), onNextEmail(), onOpenSettings() })`. `onSend` is called only from the `Send application` button, with `{ to }` or, for a guessed address whose box is ticked, `{ to, confirmGuess: true }`. Without Gmail it shows a `Connect Gmail` link (role `link`) that calls `onOpenSettings`.

- [ ] **Step 1: Write the failing test**

Create `mobile/tests/components/email-section.test.tsx`:

```tsx
import type { ApplicationDetail } from '@joblume/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { EmailSection, type EmailSectionProps } from '@/components/applications/EmailSection';
import { detail } from '../fixtures';

const connected = { configured: true, connected: true, email: 'me@gmail.com' };
const guess = (over: Partial<ApplicationDetail> = {}) =>
  detail({ status: 'approved', hiring_manager_email: 'careers@acme.com', email_source: 'guess', email_confidence: 30, ...over });

async function setup(over: Partial<EmailSectionProps> = {}) {
  const onSend = jest.fn();
  const onNextEmail = jest.fn();
  const onOpenSettings = jest.fn();
  const view = await render(
    <EmailSection
      app={detail({ status: 'approved' })}
      gmail={connected}
      pending={false}
      onSend={onSend}
      onNextEmail={onNextEmail}
      onOpenSettings={onOpenSettings}
      {...over}
    />,
  );
  return { onSend, onNextEmail, onOpenSettings, view };
}

const sendButton = () => screen.getByRole('button', { name: 'Send application' });

describe('EmailSection send flow', () => {
  it('never sends by itself: rendering, editing and ticking call nothing', async () => {
    const { onSend } = await setup({ app: guess() });
    await fireEvent.changeText(screen.getByLabelText('Recipient'), 'careers@acme.com');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Send to this guessed address' }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows the recipient, its confidence, the subject and a body preview', async () => {
    await setup();
    expect(screen.getByLabelText('Recipient')).toHaveDisplayValue('hr@acme.com');
    expect(screen.getByText('Found, high confidence')).toBeOnTheScreen();
    expect(screen.getByText('Subject: Application for Data Analyst')).toBeOnTheScreen();
    expect(screen.getByText(/I would like to apply for the Data Analyst role/)).toBeOnTheScreen();
    expect(screen.getByText('Your tailored CV (PDF) is attached.')).toBeOnTheScreen();
  });

  it('sends the recipient shown, with no other options, only when Send is tapped', async () => {
    const { onSend } = await setup();
    await fireEvent.press(sendButton());
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith({ to: 'hr@acme.com' });
  });

  it('requires confirming a guessed address before Send works', async () => {
    const { onSend } = await setup({ app: guess() });
    expect(screen.getByText('Guess, low confidence')).toBeOnTheScreen();
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText('Tick the box to send to this guessed address.')).toBeOnTheScreen();
    await fireEvent.press(sendButton());
    expect(onSend).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Send to this guessed address' }));
    expect(sendButton()).toBeEnabled();
    await fireEvent.press(sendButton());
    expect(onSend).toHaveBeenCalledWith({ to: 'careers@acme.com', confirmGuess: true });
  });

  it('treats a typed address as entered by the user, with no guess box', async () => {
    const { onSend } = await setup({ app: guess() });
    await fireEvent.changeText(screen.getByLabelText('Recipient'), 'jane@acme.com');
    expect(screen.getByText('Entered by you')).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: 'Send to this guessed address' })).toBeNull();
    await fireEvent.press(sendButton());
    expect(onSend).toHaveBeenCalledWith({ to: 'jane@acme.com' });
  });

  it('blocks an empty or invalid address with a reason', async () => {
    await setup();
    await fireEvent.changeText(screen.getByLabelText('Recipient'), '');
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText('Add a contact email first.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Recipient'), 'nope');
    expect(screen.getByText('Enter a valid email address.')).toBeOnTheScreen();
  });

  it('blocks sending without Gmail and offers Connect Gmail', async () => {
    const { onOpenSettings } = await setup({ gmail: { configured: true, connected: false, email: null } });
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText('Connect Gmail to send emails.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('link', { name: 'Connect Gmail' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('blocks sending while there are unsaved edits', async () => {
    await setup({ lockedReason: 'You have unsaved changes. Save them first so the copied letter and the PDF match.' });
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText(/unsaved changes/)).toBeOnTheScreen();
  });

  it('shows Sending… and disables both buttons while a request is in flight', async () => {
    await setup({ pending: true });
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Find another email' })).toBeDisabled();
  });

  it('asks for the next suggested address, and shows a notice and an error', async () => {
    const { onNextEmail } = await setup({ notice: 'No more suggested addresses. Paste one yourself.', error: 'Gmail could not send that email. Please try again.' });
    await fireEvent.press(screen.getByRole('button', { name: 'Find another email' }));
    expect(onNextEmail).toHaveBeenCalledTimes(1);
    expect(screen.getByText('No more suggested addresses. Paste one yourself.')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent('Gmail could not send that email. Please try again.');
  });

  it('resets the recipient and the guess box when the application changes', async () => {
    const { view } = await setup({ app: guess() });
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Send to this guessed address' }));
    await view.rerender(
      <EmailSection
        app={guess({ id: 'a2', hiring_manager_email: 'jobs@other.com' })}
        gmail={connected}
        pending={false}
        onSend={jest.fn()}
        onNextEmail={jest.fn()}
        onOpenSettings={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Recipient')).toHaveDisplayValue('jobs@other.com');
    expect(screen.getByRole('checkbox', { name: 'Send to this guessed address' })).not.toBeChecked();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w mobile -- tests/components/email-section.test.tsx`
Expected: FAIL with `Cannot find module '@/components/applications/EmailSection'`.

- [ ] **Step 3: Implement the section**

Create `mobile/src/components/applications/EmailSection.tsx`:

```tsx
import type { ApplicationDetail, GmailStatus } from '@joblume/shared';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Message } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { previewText } from '@/lib/applications';
import { recipientInfo, sendDisabledReason } from '@/lib/email-send';
import { colors, font, radius, space } from '@/theme';

export interface EmailSectionProps {
  app: ApplicationDetail;
  gmail: GmailStatus | undefined;
  lockedReason?: string;
  pending: boolean;
  error?: string | null;
  notice?: string | null;
  onSend(input: { to?: string; confirmGuess?: boolean }): void;
  onNextEmail(): void;
  onOpenSettings(): void;
}

/**
 * Send by email. Nothing is sent until the user taps Send application, and a guessed address
 * also needs the "Send to this guessed address" box ticked first (the server checks this again).
 */
export function EmailSection({ app, gmail, lockedReason, pending, error, notice, onSend, onNextEmail, onOpenSettings }: EmailSectionProps) {
  const stored = app.hiring_manager_email ?? '';
  const [email, setEmail] = useState(stored);
  const [guessConfirmed, setGuessConfirmed] = useState(false);

  useEffect(() => {
    setEmail(stored);
    setGuessConfirmed(false);
  }, [stored, app.id]);

  const info = recipientInfo(app, email);
  const gmailConnected = gmail?.connected === true;
  const reason = sendDisabledReason({ gmailConnected, email, isGuess: info.isGuess, guessConfirmed, locked: lockedReason });

  function submit() {
    onSend({ to: email.trim(), ...(info.isGuess && guessConfirmed ? { confirmGuess: true } : {}) });
  }

  return (
    <View accessibilityLabel="Send by email" style={styles.panel}>
      <Text accessibilityRole="header" style={styles.title}>
        Send by email
      </Text>

      {!gmailConnected ? (
        <View style={styles.row}>
          <Text style={styles.muted}>Gmail is not connected.</Text>
          <Pressable accessibilityRole="link" onPress={onOpenSettings} hitSlop={8}>
            <Text style={styles.link}>Connect Gmail</Text>
          </Pressable>
        </View>
      ) : null}

      {info.badge ? <Badge label={info.badge.label} tone={info.badge.tone} /> : null}
      <TextField label="Recipient" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Button label="Find another email" variant="outline" size="sm" onPress={onNextEmail} disabled={pending} />
      {info.isGuess ? <Checkbox label="Send to this guessed address" checked={guessConfirmed} onChange={setGuessConfirmed} /> : null}

      <View style={styles.preview}>
        <Text style={styles.muted}>{`Subject: Application for ${app.job?.title ?? 'the role'}`}</Text>
        <Text style={styles.muted}>{previewText(app.cover_letter_text, 240)}</Text>
        <Text style={styles.muted}>Your tailored CV (PDF) is attached.</Text>
      </View>

      <Button label={pending ? 'Sending…' : 'Send application'} onPress={submit} disabled={pending || reason !== null} />
      {reason ? <Text style={styles.muted}>{reason}</Text> : null}
      {notice ? <Message kind="info" text={notice} /> : null}
      {error ? <Message kind="error" text={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space(3), borderRadius: radius.card, borderWidth: 1, borderColor: colors.primarySoft, backgroundColor: colors.primarySoft, padding: space(4) },
  title: { fontSize: font.heading, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(2) },
  muted: { fontSize: font.small, color: colors.muted },
  link: { fontSize: font.small, color: colors.primary, fontWeight: '600' },
  preview: { gap: space(1) },
});
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npm test -w mobile -- tests/components/email-section.test.tsx`
Expected: PASS, `Tests: 11 passed, 11 total`.

Run: `npm test -w mobile && npm run typecheck -w mobile`
Expected: `Tests: 242 passed, 242 total`; typecheck exit code 0.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/applications/EmailSection.tsx mobile/tests/components/email-section.test.tsx
git commit -m "feat(mobile): Send by email section; sends only on tap and a guessed address needs the confirmation box

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 10: Assisted apply panel with safe links and PDF share

**Files:**
- Create: `mobile/src/lib/external.ts`, `mobile/src/lib/share-pdf.ts`
- Create: `mobile/src/components/applications/AssistedApplyPanel.tsx`
- Test: `mobile/tests/lib/external-and-share.test.ts`, `mobile/tests/components/assisted-apply-panel.test.tsx`

**Interfaces:**
- Consumes: `safeHttpUrl` (shared), `expo-file-system` (`File`, `Paths`), `expo-sharing`, `expo-clipboard`, `Button`, `Message` (Task 5), `detail` fixture (Task 7).
- Produces:
  - `openExternalUrl(raw: unknown, open?: (url) => Promise<unknown>): Promise<boolean>`: opens only http(s) URLs (default opener `Linking.openURL`).
  - `pdfFileName(job: { title; company } | null): string`, `SharePdfDeps { isAvailable(); download(url, fileName): Promise<string>; share(uri) }`, `SharePdfResult = 'shared' | 'invalid_url' | 'unavailable'`, `defaultSharePdfDeps`, `shareCvPdf(rawUrl, fileName, deps?): Promise<SharePdfResult>` (download errors are thrown).
  - `AssistedApplyActions { openUrl(url): Promise<boolean>; sharePdf(url, fileName): Promise<SharePdfResult>; copyText(text): Promise<unknown> }` and `AssistedApplyPanel({ app, onMarkApplied(), pending?, lockedReason?, actions? })` with buttons `1. Open job posting`, `2. Share CV PDF`, `3. Copy cover letter`, `4. Mark as applied`.

`expo-file-system` (SDK 58 API) downloads with `File.downloadFileAsync(url, new File(Paths.cache, name), { idempotent: true })` and returns a `File` whose `uri` is passed to `Sharing.shareAsync(uri, { mimeType: 'application/pdf', ... })`. Tests replace both modules with `jest.mock` because they are native.

- [ ] **Step 1: Write the failing tests**

Create `mobile/tests/lib/external-and-share.test.ts`:

```ts
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: {} }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

import { openExternalUrl } from '@/lib/external';
import { pdfFileName, shareCvPdf, type SharePdfDeps } from '@/lib/share-pdf';

describe('openExternalUrl', () => {
  it('opens http and https links', async () => {
    const open = jest.fn().mockResolvedValue(undefined);
    expect(await openExternalUrl('https://example.com/job?id=1', open)).toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.com/job?id=1');
  });

  it.each(['javascript:alert(1)', 'intent://x#Intent;end', 'file:///etc/hosts', 'not a url', null, undefined, 42])('never opens %p', async (raw) => {
    const open = jest.fn();
    expect(await openExternalUrl(raw, open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});

describe('pdfFileName', () => {
  it('names the file after the job, keeping safe characters only', () => {
    expect(pdfFileName({ title: 'Data Analyst', company: 'Acme' })).toBe('CV - Data Analyst - Acme.pdf');
    expect(pdfFileName({ title: 'C++ / Go Dev', company: 'Ünï Corp' })).toBe('CV - C Go Dev - n Corp.pdf');
    expect(pdfFileName(null)).toBe('CV.pdf');
  });
});

describe('shareCvPdf', () => {
  function deps(over: Partial<SharePdfDeps> = {}): SharePdfDeps & { [K in keyof SharePdfDeps]: jest.Mock } {
    return {
      isAvailable: jest.fn().mockResolvedValue(true),
      download: jest.fn().mockResolvedValue('file:///cache/CV.pdf'),
      share: jest.fn().mockResolvedValue(undefined),
      ...over,
    } as never;
  }

  it('downloads the PDF and opens the share sheet', async () => {
    const d = deps();
    expect(await shareCvPdf('https://files.example.com/cv.pdf?token=x', 'CV.pdf', d)).toBe('shared');
    expect(d.download).toHaveBeenCalledWith('https://files.example.com/cv.pdf?token=x', 'CV.pdf');
    expect(d.share).toHaveBeenCalledWith('file:///cache/CV.pdf');
  });

  it('refuses a missing or non-http URL without downloading', async () => {
    const d = deps();
    expect(await shareCvPdf(null, 'CV.pdf', d)).toBe('invalid_url');
    expect(await shareCvPdf('javascript:alert(1)', 'CV.pdf', d)).toBe('invalid_url');
    expect(d.download).not.toHaveBeenCalled();
  });

  it('reports when sharing is not available on the device', async () => {
    const d = deps({ isAvailable: jest.fn().mockResolvedValue(false) });
    expect(await shareCvPdf('https://files.example.com/cv.pdf', 'CV.pdf', d)).toBe('unavailable');
    expect(d.download).not.toHaveBeenCalled();
  });

  it('lets a download failure reach the caller', async () => {
    const d = deps({ download: jest.fn().mockRejectedValue(new Error('offline')) });
    await expect(shareCvPdf('https://files.example.com/cv.pdf', 'CV.pdf', d)).rejects.toThrow('offline');
    expect(d.share).not.toHaveBeenCalled();
  });
});
```

Create `mobile/tests/components/assisted-apply-panel.test.tsx`:

```tsx
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: {} }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { AssistedApplyPanel, type AssistedApplyActions } from '@/components/applications/AssistedApplyPanel';
import { detail } from '../fixtures';

function actions(over: Partial<AssistedApplyActions> = {}) {
  return {
    openUrl: jest.fn().mockResolvedValue(true),
    sharePdf: jest.fn().mockResolvedValue('shared'),
    copyText: jest.fn().mockResolvedValue(true),
    ...over,
  };
}

describe('AssistedApplyPanel', () => {
  it('opens the posting, shares the PDF and copies the letter, sending nothing', async () => {
    const a = actions();
    const onMarkApplied = jest.fn();
    await render(<AssistedApplyPanel app={detail({ status: 'approved' })} onMarkApplied={onMarkApplied} actions={a} />);
    await fireEvent.press(screen.getByRole('button', { name: '1. Open job posting' }));
    expect(a.openUrl).toHaveBeenCalledWith('https://example.com/j');
    await fireEvent.press(screen.getByRole('button', { name: '2. Share CV PDF' }));
    expect(a.sharePdf).toHaveBeenCalledWith('https://files.example.com/cv.pdf', 'CV - Data Analyst - Acme.pdf');
    await fireEvent.press(screen.getByRole('button', { name: '3. Copy cover letter' }));
    expect(a.copyText).toHaveBeenCalledWith('Dear team, I would like to apply for the Data Analyst role at Acme.');
    expect(await screen.findByText('Copied.')).toBeOnTheScreen();
    expect(onMarkApplied).not.toHaveBeenCalled();
  });

  it('marks as applied only on tap', async () => {
    const onMarkApplied = jest.fn();
    await render(<AssistedApplyPanel app={detail({ status: 'approved' })} onMarkApplied={onMarkApplied} actions={actions()} />);
    await fireEvent.press(screen.getByRole('button', { name: '4. Mark as applied' }));
    expect(onMarkApplied).toHaveBeenCalledTimes(1);
  });

  it('hides links that are not http(s)', async () => {
    await render(
      <AssistedApplyPanel
        app={detail({ cv_pdf_url: null, job: { title: 'X', company: 'Y', location: '', source: 'remotive', url: 'javascript:alert(1)', company_domain: null } })}
        onMarkApplied={jest.fn()}
        actions={actions()}
      />,
    );
    expect(screen.getByText('This job has no valid link.')).toBeOnTheScreen();
    expect(screen.getByText('The tailored CV PDF is not available yet.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '1. Open job posting' })).toBeNull();
  });

  it('explains a failed download or a phone without sharing', async () => {
    const a = actions({ sharePdf: jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('unavailable') });
    await render(<AssistedApplyPanel app={detail()} onMarkApplied={jest.fn()} actions={a} />);
    await fireEvent.press(screen.getByRole('button', { name: '2. Share CV PDF' }));
    expect(await screen.findByText('Could not download the CV PDF. Check your connection and try again.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '2. Share CV PDF' }));
    expect(await screen.findByText('Sharing is not available on this phone.')).toBeOnTheScreen();
  });

  it('shows only the lock reason while there are unsaved edits', async () => {
    await render(<AssistedApplyPanel app={detail()} onMarkApplied={jest.fn()} actions={actions()} lockedReason="You have unsaved changes." />);
    expect(screen.getByRole('alert')).toHaveTextContent('You have unsaved changes.');
    expect(screen.queryByRole('button', { name: '4. Mark as applied' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w mobile -- tests/lib/external-and-share.test.ts tests/components/assisted-apply-panel.test.tsx`
Expected: FAIL with `Cannot find module '@/lib/external'` and `'@/components/applications/AssistedApplyPanel'`.

- [ ] **Step 3: Implement the link opener, the PDF share and the panel**

Create `mobile/src/lib/external.ts`:

```ts
import { safeHttpUrl } from '@joblume/shared';
import { Linking } from 'react-native';

/** Opens a link in the phone's browser only when it is http(s). Returns false (and opens nothing) otherwise. */
export async function openExternalUrl(raw: unknown, open: (url: string) => Promise<unknown> = (url) => Linking.openURL(url)): Promise<boolean> {
  const url = safeHttpUrl(raw);
  if (!url) return false;
  await open(url);
  return true;
}
```

Create `mobile/src/lib/share-pdf.ts`:

```ts
import { safeHttpUrl } from '@joblume/shared';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export interface SharePdfDeps {
  isAvailable(): Promise<boolean>;
  /** Downloads the URL into the app cache under `fileName` and returns the local file uri. */
  download(url: string, fileName: string): Promise<string>;
  share(uri: string): Promise<void>;
}

export type SharePdfResult = 'shared' | 'invalid_url' | 'unavailable';

/** "CV - Data Analyst - Acme.pdf", keeping only safe characters. */
export function pdfFileName(job: { title: string; company: string } | null): string {
  const raw = job ? `CV - ${job.title} - ${job.company}` : 'CV';
  const clean = raw.replace(/[^A-Za-z0-9 ._-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${clean || 'CV'}.pdf`;
}

export const defaultSharePdfDeps: SharePdfDeps = {
  isAvailable: () => Sharing.isAvailableAsync(),
  download: async (url, fileName) => {
    const file = await File.downloadFileAsync(url, new File(Paths.cache, fileName), { idempotent: true });
    return file.uri;
  },
  share: (uri) => Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share your tailored CV', UTI: 'com.adobe.pdf' }),
};

/** Downloads the tailored CV PDF (a signed https URL from the API) and opens the share sheet. Download errors are thrown. */
export async function shareCvPdf(rawUrl: unknown, fileName: string, deps: SharePdfDeps = defaultSharePdfDeps): Promise<SharePdfResult> {
  const url = safeHttpUrl(rawUrl);
  if (!url) return 'invalid_url';
  if (!(await deps.isAvailable())) return 'unavailable';
  const uri = await deps.download(url, fileName);
  await deps.share(uri);
  return 'shared';
}
```

Create `mobile/src/components/applications/AssistedApplyPanel.tsx`:

```tsx
import { safeHttpUrl, type ApplicationDetail } from '@joblume/shared';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Message } from '@/components/ui/States';
import { openExternalUrl } from '@/lib/external';
import { pdfFileName, shareCvPdf, type SharePdfResult } from '@/lib/share-pdf';
import { colors, font, radius, space } from '@/theme';

export interface AssistedApplyActions {
  openUrl(url: string): Promise<boolean>;
  sharePdf(url: string, fileName: string): Promise<SharePdfResult>;
  copyText(text: string): Promise<unknown>;
}

const defaultActions: AssistedApplyActions = {
  openUrl: (url) => openExternalUrl(url),
  sharePdf: (url, fileName) => shareCvPdf(url, fileName),
  copyText: (text) => Clipboard.setStringAsync(text),
};

export interface AssistedApplyPanelProps {
  app: ApplicationDetail;
  onMarkApplied(): void;
  pending?: boolean;
  lockedReason?: string;
  actions?: AssistedApplyActions;
}

type Feedback = { kind: 'error' | 'success'; text: string } | null;

/** Apply on the employer's site. This path sends nothing: open the job, share the CV PDF, copy the letter, then mark it applied. */
export function AssistedApplyPanel({ app, onMarkApplied, pending = false, lockedReason, actions = defaultActions }: AssistedApplyPanelProps) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [sharing, setSharing] = useState(false);
  const jobUrl = safeHttpUrl(app.job?.url);
  const pdfUrl = safeHttpUrl(app.cv_pdf_url);

  async function share() {
    if (!pdfUrl) return;
    setSharing(true);
    setFeedback(null);
    try {
      const result = await actions.sharePdf(pdfUrl, pdfFileName(app.job));
      if (result === 'unavailable') setFeedback({ kind: 'error', text: 'Sharing is not available on this phone.' });
    } catch {
      setFeedback({ kind: 'error', text: 'Could not download the CV PDF. Check your connection and try again.' });
    } finally {
      setSharing(false);
    }
  }

  async function copy() {
    try {
      await actions.copyText(app.cover_letter_text ?? '');
      setFeedback({ kind: 'success', text: 'Copied.' });
    } catch {
      setFeedback({ kind: 'error', text: 'Could not copy. Select the text in the editor below and copy it yourself.' });
    }
  }

  return (
    <View accessibilityLabel="Apply" style={styles.panel}>
      <Text accessibilityRole="header" style={styles.title}>
        Or apply on the employer's site
      </Text>
      {lockedReason ? (
        <Message kind="error" text={lockedReason} />
      ) : (
        <>
          <Text style={styles.muted}>
            This path sends nothing for you. Open the job, attach your tailored CV, paste the cover letter, then mark it as applied here.
          </Text>
          {jobUrl ? (
            <Button label="1. Open job posting" variant="outline" size="sm" onPress={() => void actions.openUrl(jobUrl)} />
          ) : (
            <Text style={styles.muted}>This job has no valid link.</Text>
          )}
          {pdfUrl ? (
            <Button label="2. Share CV PDF" variant="outline" size="sm" busy={sharing} onPress={() => void share()} />
          ) : (
            <Text style={styles.muted}>The tailored CV PDF is not available yet.</Text>
          )}
          <Button label="3. Copy cover letter" variant="outline" size="sm" onPress={() => void copy()} />
          <Button label="4. Mark as applied" size="sm" disabled={pending} onPress={onMarkApplied} />
          {feedback ? <Message kind={feedback.kind} text={feedback.text} /> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space(3), borderRadius: radius.card, borderWidth: 1, borderColor: colors.primarySoft, backgroundColor: colors.primarySoft, padding: space(4) },
  title: { fontSize: font.heading, fontWeight: '600', color: colors.text },
  muted: { fontSize: font.small, color: colors.muted },
});
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npm test -w mobile -- tests/lib/external-and-share.test.ts tests/components/assisted-apply-panel.test.tsx`
Expected: PASS, `Tests: 18 passed, 18 total`.

Run: `npm test -w mobile && npm run typecheck -w mobile`
Expected: `Tests: 260 passed, 260 total`; typecheck exit code 0.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/external.ts mobile/src/lib/share-pdf.ts mobile/src/components/applications/AssistedApplyPanel.tsx mobile/tests/lib/external-and-share.test.ts mobile/tests/components/assisted-apply-panel.test.tsx
git commit -m "feat(mobile): assisted apply panel: open the posting (http(s) only), share the CV PDF, copy the letter

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 11: Job detail screen with status actions, editors and the follow-up card

**Files:**
- Create: `mobile/src/components/applications/StatusActions.tsx`
- Create: `mobile/src/components/applications/ApplicationDetailScreen.tsx`
- Create: `mobile/src/app/application/[id].tsx`
- Test: `mobile/tests/components/application-detail.test.tsx`

**Interfaces:**
- Consumes: `useApplication`, `useUpdateApplicationText`, `useSetStatus`, `useGmailStatus`, `useSendApplication`, `useNextEmail`, `useFollowUps` (Task 4), `buildTextPatch`, `sourceLabel`, `STATUS_LABELS`, `COLUMN_LABELS`, `describeApiError` (Task 3), `openExternalUrl` (Task 10), `EmailSection` (Task 9), `AssistedApplyPanel` (Task 10), `FollowUpItem` (Task 7), `OptionSheet`, `ScoreRing` and the other primitives (Task 5), fixtures (Task 7).
- Produces:
  - `MOVE_OPTIONS` (the five board columns with labels) and `StatusActions({ status, dirty, pending, onMove(status), onSkip() })`: pending shows `Approve & Apply` (disabled while `dirty`) and `Skip`; approved shows `Skip` and `Back to pending`; skipped shows `Restore`; applied, interviewing, rejected and offer show `Move to… (now <column>)`, which opens the action sheet.
  - `ApplicationDetailScreen({ id })`: score ring, source and status badges, `View posting`, missing keywords, status actions, for approved applications the email section and the assisted panel, the follow-up draft for this application (if any), the CV and cover letter editors with `Save changes`, and errors. Send, Skip and Mark as applied leave the screen on success (`router.back()`, or `/queue` when there is no history).
  - Route `/application/[id]`.

- [ ] **Step 1: Write the failing test**

Create `mobile/tests/components/application-detail.test.tsx`:

```tsx
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: {} }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/hooks/api', () => ({
  useApplication: jest.fn(),
  useUpdateApplicationText: jest.fn(),
  useSetStatus: jest.fn(),
  useGmailStatus: jest.fn(),
  useSendApplication: jest.fn(),
  useNextEmail: jest.fn(),
  useFollowUps: jest.fn(),
  useUpdateFollowUp: jest.fn(),
  useSendFollowUp: jest.fn(),
  useDismissFollowUp: jest.fn(),
}));

import type { ApplicationDetail } from '@joblume/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ApplicationDetailScreen } from '@/components/applications/ApplicationDetailScreen';
import { StatusActions } from '@/components/applications/StatusActions';
import * as hooks from '@/hooks/api';
import { detail, followUp, ok, type Mocked } from '../fixtures';

const mockHooks = hooks as unknown as Mocked<typeof hooks>;
const mutation = () => ({ mutate: jest.fn(), isPending: false, isSuccess: false, error: null, data: undefined });

function setup(data: ApplicationDetail, drafts = [followUp({ application_id: 'other' })]) {
  const m = {
    setStatus: mutation(),
    send: mutation(),
    next: mutation(),
    text: mutation(),
  };
  mockHooks.useApplication.mockReturnValue(ok(data));
  mockHooks.useGmailStatus.mockReturnValue(ok({ configured: true, connected: true, email: 'me@gmail.com' }));
  mockHooks.useFollowUps.mockReturnValue(ok(drafts));
  mockHooks.useSetStatus.mockReturnValue(m.setStatus);
  mockHooks.useSendApplication.mockReturnValue(m.send);
  mockHooks.useNextEmail.mockReturnValue(m.next);
  mockHooks.useUpdateApplicationText.mockReturnValue(m.text);
  for (const k of ['useUpdateFollowUp', 'useSendFollowUp', 'useDismissFollowUp'] as const) mockHooks[k].mockReturnValue(mutation());
  return m;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('StatusActions', () => {
  const props = { dirty: false, pending: false, onMove: jest.fn(), onSkip: jest.fn() };

  it('pending: Approve & Apply approves, Skip skips, and approving waits for saved edits', async () => {
    const onMove = jest.fn();
    const onSkip = jest.fn();
    const view = await render(<StatusActions {...props} status="pending_review" onMove={onMove} onSkip={onSkip} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Approve & Apply' }));
    expect(onMove).toHaveBeenCalledWith('approved');
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    await view.rerender(<StatusActions {...props} status="pending_review" dirty onMove={onMove} onSkip={onSkip} />);
    expect(screen.getByRole('button', { name: 'Approve & Apply' })).toBeDisabled();
    expect(screen.getByText('Save your changes before approving.')).toBeOnTheScreen();
  });

  it('approved: Back to pending; skipped: Restore', async () => {
    const onMove = jest.fn();
    const view = await render(<StatusActions {...props} status="approved" onMove={onMove} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back to pending' }));
    expect(onMove).toHaveBeenLastCalledWith('pending_review');
    await view.rerender(<StatusActions {...props} status="skipped" onMove={onMove} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Restore' }));
    expect(onMove).toHaveBeenLastCalledWith('pending_review');
  });

  it('applied: moves through the action sheet', async () => {
    const onMove = jest.fn();
    await render(<StatusActions {...props} status="applied" onMove={onMove} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Move to… (now Applied)' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Interviewing' }));
    expect(onMove).toHaveBeenCalledWith('interviewing');
  });
});

describe('ApplicationDetailScreen', () => {
  it('shows the match, keywords and texts of a pending application, with no send section', async () => {
    setup(detail({ match_score: 92, missing_keywords: ['Tableau'] }));
    await render(<ApplicationDetailScreen id="a1" />);
    expect(screen.getByLabelText('Match score 92 out of 100')).toBeOnTheScreen();
    expect(screen.getByText('Tableau')).toBeOnTheScreen();
    expect(screen.getByLabelText('Cover letter')).toHaveDisplayValue('Dear team, I would like to apply for the Data Analyst role at Acme.');
    expect(screen.queryByRole('button', { name: 'Send application' })).toBeNull();
  });

  it('approves only on tap', async () => {
    const m = setup(detail());
    await render(<ApplicationDetailScreen id="a1" />);
    expect(m.setStatus.mutate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Approve & Apply' }));
    expect(m.setStatus.mutate).toHaveBeenCalledWith({ id: 'a1', status: 'approved' });
  });

  it('an approved application shows the email and assisted panels and sends only on tap', async () => {
    const m = setup(detail({ status: 'approved' }));
    await render(<ApplicationDetailScreen id="a1" />);
    expect(m.send.mutate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Send application' }));
    expect(m.send.mutate).toHaveBeenCalledWith({ id: 'a1', body: { to: 'hr@acme.com' } }, expect.any(Object));
    expect(screen.getByRole('button', { name: '4. Mark as applied' })).toBeOnTheScreen();
  });

  it('locks sending and approving while the letter has unsaved edits, and saves the patch', async () => {
    const m = setup(detail({ status: 'approved' }));
    await render(<ApplicationDetailScreen id="a1" />);
    await fireEvent.changeText(screen.getByLabelText('Cover letter'), 'A new letter for Acme.');
    expect(screen.getByRole('button', { name: 'Send application' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(m.text.mutate).toHaveBeenCalledWith({ id: 'a1', patch: { cover_letter_text: 'A new letter for Acme.' } });
  });

  it('shows the follow-up draft for this application', async () => {
    setup(detail({ status: 'applied' }), [followUp({ application_id: 'a1', subject: 'Checking in on my application' })]);
    await render(<ApplicationDetailScreen id="a1" />);
    expect(screen.getByLabelText('Subject')).toHaveDisplayValue('Checking in on my application');
  });

  it('shows a retry state when the application cannot load', async () => {
    setup(detail());
    const refetch = jest.fn();
    mockHooks.useApplication.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x'), refetch });
    await render(<ApplicationDetailScreen id="a1" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w mobile -- tests/components/application-detail.test.tsx`
Expected: FAIL with `Cannot find module '@/components/applications/ApplicationDetailScreen'`.

- [ ] **Step 3: Implement the status actions, the screen and the route**

Create `mobile/src/components/applications/StatusActions.tsx`:

```tsx
import { KANBAN_COLUMNS, type ApplicationStatus, type KanbanColumn } from '@joblume/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { COLUMN_LABELS } from '@/lib/format';
import { colors, font, space } from '@/theme';

const APPLIED_FAMILY: ApplicationStatus[] = ['applied', 'interviewing', 'rejected', 'offer'];
export const MOVE_OPTIONS = KANBAN_COLUMNS.map((c) => ({ value: c, label: COLUMN_LABELS[c] }));

export interface StatusActionsProps {
  status: ApplicationStatus;
  /** True while the CV or letter has unsaved edits: approving is blocked until they are saved. */
  dirty: boolean;
  pending: boolean;
  onMove(status: ApplicationStatus): void;
  /** Skip moves the application to Skipped and leaves the screen. */
  onSkip(): void;
}

/** The status buttons of the job detail screen, same rules as the web dialog. Moving an applied card uses an action sheet. */
export function StatusActions({ status, dirty, pending, onMove, onSkip }: StatusActionsProps) {
  const [sheet, setSheet] = useState(false);

  if (status === 'pending_review') {
    return (
      <View style={styles.wrap}>
        <View style={styles.row}>
          <Button label="Approve & Apply" disabled={dirty || pending} onPress={() => onMove('approved')} />
          <Button label="Skip" variant="outline" disabled={pending} onPress={onSkip} />
        </View>
        {dirty ? <Text style={styles.muted}>Save your changes before approving.</Text> : null}
      </View>
    );
  }
  if (status === 'approved') {
    return (
      <View style={styles.row}>
        <Button label="Skip" variant="outline" disabled={pending} onPress={onSkip} />
        <Button label="Back to pending" variant="ghost" disabled={pending} onPress={() => onMove('pending_review')} />
      </View>
    );
  }
  if (status === 'skipped') {
    return <Button label="Restore" disabled={pending} onPress={() => onMove('pending_review')} />;
  }
  if (APPLIED_FAMILY.includes(status)) {
    return (
      <View style={styles.wrap}>
        <Button label={`Move to… (now ${COLUMN_LABELS[status as KanbanColumn]})`} variant="outline" disabled={pending} onPress={() => setSheet(true)} />
        <OptionSheet visible={sheet} title="Move to" options={MOVE_OPTIONS} current={status as KanbanColumn} onSelect={onMove} onClose={() => setSheet(false)} />
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  wrap: { gap: space(2) },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  muted: { fontSize: font.tiny, color: colors.muted },
});
```

Create `mobile/src/components/applications/ApplicationDetailScreen.tsx`:

```tsx
import type { ApplicationStatus } from '@joblume/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FollowUpItem } from '@/components/followups/FollowUpItem';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { ErrorState, Loading, Message } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { useApplication, useFollowUps, useGmailStatus, useNextEmail, useSendApplication, useSetStatus, useUpdateApplicationText } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { buildTextPatch } from '@/lib/applications';
import { openExternalUrl } from '@/lib/external';
import { sourceLabel, STATUS_LABELS } from '@/lib/format';
import { colors, font, space } from '@/theme';
import { AssistedApplyPanel } from './AssistedApplyPanel';
import { EmailSection } from './EmailSection';
import { StatusActions } from './StatusActions';

/** Job detail: match, keywords, status actions, email send, assisted apply, the CV and letter editors and any follow-up draft. */
export function ApplicationDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const detail = useApplication(id);
  const updateText = useUpdateApplicationText();
  const setStatus = useSetStatus();
  const gmail = useGmailStatus();
  const sendEmail = useSendApplication();
  const nextEmail = useNextEmail();
  const followUps = useFollowUps('pending_review');
  const [notice, setNotice] = useState<string | null>(null);
  const [cv, setCv] = useState('');
  const [letter, setLetter] = useState('');
  const data = detail.data;

  useEffect(() => {
    setCv(data?.tailored_cv_text ?? '');
    setLetter(data?.cover_letter_text ?? '');
    setNotice(null);
  }, [data?.id, data?.tailored_cv_text, data?.cover_letter_text]);

  if (detail.isLoading) return <Loading />;
  if (detail.error || !data) {
    return <ErrorState message={describeApiError(detail.error)} onRetry={() => void detail.refetch()} />;
  }

  const text = buildTextPatch({ cv: data.tailored_cv_text, letter: data.cover_letter_text }, { cv, letter });
  const lockedReason = text.dirty ? 'You have unsaved changes. Save them first so the copied letter and the PDF match.' : undefined;
  const emailError = sendEmail.error ?? nextEmail.error;
  const mutationError = updateText.error ?? setStatus.error;
  const draft = (followUps.data ?? []).find((f) => f.application_id === data.id);
  const move = (status: ApplicationStatus) => setStatus.mutate({ id: data.id, status });
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/queue');
  };

  return (
    <Screen>
      <View>
        <Text accessibilityRole="header" style={styles.title}>
          {data.job?.title ?? 'Application'}
        </Text>
        {data.job ? <Text style={styles.muted}>{`${data.job.company}${data.job.location ? ` · ${data.job.location}` : ''}`}</Text> : null}
      </View>

      <Card>
        <View style={styles.row}>
          <ScoreRing score={data.match_score} size={64} />
          <View style={styles.badges}>
            <Text style={styles.label}>MATCH PROBABILITY</Text>
            <View style={styles.row}>
              {data.job ? <Badge label={sourceLabel(data.job.source)} tone="outline" /> : null}
              <Badge label={STATUS_LABELS[data.status]} tone={data.status === 'approved' ? 'primary' : 'secondary'} />
            </View>
          </View>
        </View>
        <Button label="View posting" variant="ghost" size="sm" onPress={() => void openExternalUrl(data.job?.url)} disabled={!data.job?.url} />
      </Card>

      {data.missing_keywords.length > 0 ? (
        <Card>
          <Text style={styles.label}>Keywords this CV does not support</Text>
          <View style={styles.row}>
            {data.missing_keywords.map((k) => (
              <Badge key={k} label={k} tone="warning" />
            ))}
          </View>
        </Card>
      ) : null}

      <StatusActions
        status={data.status}
        dirty={text.dirty}
        pending={setStatus.isPending}
        onMove={move}
        onSkip={() => setStatus.mutate({ id: data.id, status: 'skipped' }, { onSuccess: leave })}
      />

      {data.status === 'approved' ? (
        <>
          <EmailSection
            app={data}
            gmail={gmail.data}
            lockedReason={lockedReason}
            pending={sendEmail.isPending || nextEmail.isPending}
            error={emailError ? describeApiError(emailError) : null}
            notice={notice}
            onSend={(body) => sendEmail.mutate({ id: data.id, body }, { onSuccess: leave })}
            onNextEmail={() =>
              nextEmail.mutate(data.id, {
                onSuccess: (result) => setNotice(result.exhausted ? 'No more suggested addresses. Paste one yourself.' : null),
              })
            }
            onOpenSettings={() => router.push('/settings')}
          />
          <AssistedApplyPanel
            app={data}
            pending={setStatus.isPending}
            lockedReason={lockedReason}
            onMarkApplied={() => setStatus.mutate({ id: data.id, status: 'applied' }, { onSuccess: leave })}
          />
        </>
      ) : null}

      {draft ? <FollowUpItem followUp={draft} /> : null}

      <Card>
        <TextField label="Tailored CV" value={cv} onChangeText={setCv} multiline lines={14} error={text.errors.cv} />
        <TextField label="Cover letter" value={letter} onChangeText={setLetter} multiline lines={10} error={text.errors.letter} />
        <Button
          label={updateText.isPending ? 'Saving…' : 'Save changes'}
          disabled={!text.dirty || Object.keys(text.errors).length > 0 || updateText.isPending}
          onPress={() => updateText.mutate({ id: data.id, patch: text.patch })}
        />
        <Text style={styles.muted}>Saving a CV change rebuilds the PDF.</Text>
        {updateText.isSuccess && !text.dirty ? <Message kind="success" text="Saved." /> : null}
      </Card>

      {mutationError ? <Message kind="error" text={describeApiError(mutationError)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.title, fontWeight: '700', color: colors.text },
  muted: { fontSize: font.small, color: colors.muted },
  label: { fontSize: font.tiny, fontWeight: '600', letterSpacing: 1, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(2) },
  badges: { flex: 1, gap: space(2) },
});
```

Create `mobile/src/app/application/[id].tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { ApplicationDetailScreen } from '@/components/applications/ApplicationDetailScreen';

export default function ApplicationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ApplicationDetailScreen id={String(id)} />;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npm test -w mobile -- tests/components/application-detail.test.tsx`
Expected: PASS, `Tests: 9 passed, 9 total`.

Run: `npm test -w mobile && npm run typecheck -w mobile`
Expected: `Tests: 269 passed, 269 total`; typecheck exit code 0.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/applications/StatusActions.tsx mobile/src/components/applications/ApplicationDetailScreen.tsx mobile/src/app/application mobile/tests/components/application-detail.test.tsx
git commit -m "feat(mobile): job detail with match ring, keywords, status actions, email and assisted panels, editors and follow-up

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 12: Tracker (status tabs, action sheet) and Analytics (real /analytics data)

**Files:**
- Create: `mobile/src/components/tracker/TrackerScreen.tsx`
- Create: `mobile/src/components/analytics/AnalyticsScreen.tsx`
- Modify (replace whole file): `mobile/src/app/(tabs)/tracker.tsx`, `mobile/src/app/(tabs)/analytics.tsx`
- Test: `mobile/tests/components/tracker-analytics.test.tsx`

**Interfaces:**
- Consumes: `useApplications`, `useSetStatus`, `useAnalytics` (Task 4), `groupByColumn`, `COLUMN_LABELS`, `formatRelative`, `formatPercent`, `formatScore`, `statusSegments`, `describeApiError` (Task 3), `matchesSearch` (Task 8), `OptionSheet`, `Chips` and the other primitives (Task 5), fixtures (Task 7).
- Produces:
  - `TrackerScreen()`: Total / Applied / Interviews / Offers tiles, `Search companies` box, status tabs `<Column> (n)` for the five board columns (Applied selected first, as in the mockup), cards with `Open <title>` and `Change status for <title>` buttons; the second opens the `Move to` sheet and calls `setStatus.mutate({ id, status })`. A refused move shows `<message> The card was moved back.` (the optimistic update in `useSetStatus` rolls back).
  - `StatusBars({ byStatus })` (one labelled bar per status with applications, labels `<Status>: <count>`) and `AnalyticsScreen()` (four KPI tiles and the bars, or an empty state with `Go to the review queue`).

- [ ] **Step 1: Write the failing test**

Create `mobile/tests/components/tracker-analytics.test.tsx`:

```tsx
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/hooks/api', () => ({ useApplications: jest.fn(), useSetStatus: jest.fn(), useAnalytics: jest.fn() }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { AnalyticsScreen } from '@/components/analytics/AnalyticsScreen';
import { TrackerScreen } from '@/components/tracker/TrackerScreen';
import * as hooks from '@/hooks/api';
import { app, ok, type Mocked } from '../fixtures';

const mockHooks = hooks as unknown as Mocked<typeof hooks>;
const job = (title: string, company: string) => ({ title, company, location: 'Remote', source: 'remotive', url: 'https://x', company_domain: null });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TrackerScreen', () => {
  function setup() {
    const setStatus = { mutate: jest.fn(), isPending: false, error: null };
    mockHooks.useSetStatus.mockReturnValue(setStatus);
    mockHooks.useApplications.mockReturnValue(
      ok([
        app({ id: 'a1', status: 'applied', match_score: 94, job: job('Senior Frontend Engineer', 'TechFlow') }),
        app({ id: 'a2', status: 'applied', match_score: 76, job: job('Solutions Architect', 'CloudNexus') }),
        app({ id: 'a3', status: 'interviewing', job: job('Staff Engineer', 'SecureLayer') }),
        app({ id: 'a4', status: 'approved', job: job('Ready Role', 'Beta') }),
      ]),
    );
    return setStatus;
  }

  it('shows the stats and the Applied tab first', async () => {
    setup();
    await render(<TrackerScreen />);
    expect(screen.getByText('TOTAL')).toBeOnTheScreen();
    expect(screen.getByText('Senior Frontend Engineer')).toBeOnTheScreen();
    expect(screen.getByText('94%')).toBeOnTheScreen();
    expect(screen.queryByText('Staff Engineer')).toBeNull();
  });

  it('switches status tabs and searches companies', async () => {
    setup();
    await render(<TrackerScreen />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Interviewing (1)' }));
    expect(screen.getByText('Staff Engineer')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Pending Review (1)' }));
    expect(screen.getByText('Ready Role')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Applied (2)' }));
    await fireEvent.changeText(screen.getByLabelText('Search companies'), 'cloud');
    expect(screen.getByText('Solutions Architect')).toBeOnTheScreen();
    expect(screen.queryByText('Senior Frontend Engineer')).toBeNull();
  });

  it('changes status through the action sheet instead of drag and drop', async () => {
    const setStatus = setup();
    await render(<TrackerScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Change status for Senior Frontend Engineer' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Offer' }));
    expect(setStatus.mutate).toHaveBeenCalledWith({ id: 'a1', status: 'offer' });
  });

  it('opens a card', async () => {
    setup();
    await render(<TrackerScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Open Solutions Architect' }));
    expect(mockPush).toHaveBeenCalledWith('/application/a2');
  });
});

describe('AnalyticsScreen', () => {
  const byStatus = { pending_review: 2, approved: 0, applied: 3, interviewing: 1, rejected: 0, offer: 0, skipped: 0 };

  it('shows the KPI tiles and one bar per status from the API', async () => {
    mockHooks.useAnalytics.mockReturnValue(ok({ total: 6, by_status: byStatus, applied_ever: 4, responded: 1, response_rate: 0.25, avg_match_score: 81.5 }));
    await render(<AnalyticsScreen />);
    expect(screen.getByText('6')).toBeOnTheScreen();
    expect(screen.getByText('25%')).toBeOnTheScreen();
    expect(screen.getByText('81.5')).toBeOnTheScreen();
    expect(screen.getByLabelText('Applied: 3')).toBeOnTheScreen();
    expect(screen.getByLabelText('Pending Review: 2')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/Offer:/)).toBeNull();
  });

  it('shows an empty state with no applications', async () => {
    mockHooks.useAnalytics.mockReturnValue(ok({ total: 0, by_status: { ...byStatus, pending_review: 0, applied: 0, interviewing: 0 }, applied_ever: 0, responded: 0, response_rate: 0, avg_match_score: null }));
    await render(<AnalyticsScreen />);
    expect(screen.getByText('No applications yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Go to the review queue' }));
    expect(mockPush).toHaveBeenCalledWith('/queue');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w mobile -- tests/components/tracker-analytics.test.tsx`
Expected: FAIL with `Cannot find module '@/components/analytics/AnalyticsScreen'`.

- [ ] **Step 3: Implement the screens and the tab routes**

Create `mobile/src/components/tracker/TrackerScreen.tsx`:

```tsx
import { KANBAN_COLUMNS, columnForStatus, type Application, type KanbanColumn } from '@joblume/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Chips } from '@/components/ui/Chips';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, Loading, Message } from '@/components/ui/States';
import { useApplications, useSetStatus } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { groupByColumn } from '@/lib/applications';
import { COLUMN_LABELS, formatRelative } from '@/lib/format';
import { matchesSearch } from '@/lib/queue-filters';
import { colors, font, radius, space } from '@/theme';

const TABS = KANBAN_COLUMNS.map((c) => ({ value: c, label: COLUMN_LABELS[c] }));

function TrackerCard({ app, onOpen, onMenu }: { app: Application; onOpen(): void; onMenu(): void }) {
  const title = app.job?.title ?? 'Untitled role';
  const column = columnForStatus(app.status);
  return (
    <Card>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${title}`} onPress={onOpen} style={styles.titles}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.muted}>{app.job?.company ?? 'Unknown company'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Change status for ${title}`} onPress={onMenu} hitSlop={12} style={styles.menu}>
          <Text style={styles.menuText}>⋮</Text>
        </Pressable>
      </View>
      <View style={styles.meta}>
        {app.job?.location ? <Text style={styles.muted}>{app.job.location}</Text> : null}
        <Text style={styles.muted}>{formatRelative(app.applied_at ?? app.created_at)}</Text>
      </View>
      <View style={styles.bottom}>
        {column ? <Badge label={COLUMN_LABELS[column]} tone="primary" /> : null}
        <Text style={styles.muted}>
          Match: <Text style={styles.score}>{app.match_score === null ? '–' : `${app.match_score}%`}</Text>
        </Text>
      </View>
    </Card>
  );
}

/** Tracker tab (mobile tracker mockup): stats, company search, status tabs, cards; status changes go through an action sheet. */
export function TrackerScreen() {
  const router = useRouter();
  const apps = useApplications({ poll: true });
  const setStatus = useSetStatus();
  const [tab, setTab] = useState<KanbanColumn>('applied');
  const [search, setSearch] = useState('');
  const [menuFor, setMenuFor] = useState<Application | null>(null);
  const items = apps.data ?? [];
  const groups = useMemo(() => groupByColumn(items), [items]);

  if (apps.isLoading) return <Loading />;
  if (apps.error) return <ErrorState message={describeApiError(apps.error)} onRetry={() => void apps.refetch()} />;

  const shown = groups[tab].filter((a) => matchesSearch(a, search));
  const stats = [
    { label: 'TOTAL', value: items.length },
    { label: 'APPLIED', value: items.filter((a) => a.status === 'applied').length },
    { label: 'INTERVIEWS', value: items.filter((a) => a.status === 'interviewing').length },
    { label: 'OFFERS', value: items.filter((a) => a.status === 'offer').length },
  ];

  return (
    <Screen title="Application Tracker" onRefresh={() => void apps.refetch()} refreshing={apps.isRefetching}>
      <View style={styles.stats}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
      <TextInput
        accessibilityLabel="Search companies"
        placeholder="Search companies..."
        placeholderTextColor={colors.muted}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        style={styles.search}
      />
      <Chips label="Status" role="tab" options={TABS.map((t) => ({ ...t, label: `${t.label} (${groups[t.value].length})` }))} value={tab} onChange={setTab} />
      {setStatus.error ? <Message kind="error" text={`${describeApiError(setStatus.error)} The card was moved back.`} /> : null}
      {items.length === 0 ? (
        <EmptyState title="Nothing to track yet" description="Applications appear here once your queue has matches." />
      ) : shown.length === 0 ? (
        <EmptyState title={`Nothing in ${COLUMN_LABELS[tab]}`} description="Change the status of a card with its ⋮ menu to move it here." />
      ) : (
        shown.map((a) => <TrackerCard key={a.id} app={a} onOpen={() => router.push(`/application/${a.id}`)} onMenu={() => setMenuFor(a)} />)
      )}
      <OptionSheet
        visible={menuFor !== null}
        title="Move to"
        options={TABS}
        current={menuFor ? (columnForStatus(menuFor.status) ?? undefined) : undefined}
        onSelect={(status) => {
          if (menuFor) setStatus.mutate({ id: menuFor.id, status });
        }}
        onClose={() => setMenuFor(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space(2) },
  stat: { flex: 1, alignItems: 'center', borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingVertical: space(3) },
  statValue: { fontSize: font.heading, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 10, color: colors.muted, letterSpacing: 0.5 },
  search: { minHeight: 44, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: space(3), fontSize: font.body, color: colors.text },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space(2) },
  titles: { flex: 1, gap: 2 },
  title: { fontSize: font.body, fontWeight: '600', color: colors.text },
  muted: { fontSize: font.small, color: colors.muted },
  menu: { paddingHorizontal: space(2) },
  menuText: { fontSize: font.heading, color: colors.muted },
  meta: { flexDirection: 'row', gap: space(3) },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space(3) },
  score: { color: colors.primary, fontWeight: '700' },
});
```

Create `mobile/src/components/analytics/AnalyticsScreen.tsx`:

```tsx
import type { ApplicationStatus } from '@joblume/shared';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card, Section } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/States';
import { useAnalytics } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { formatPercent, formatScore, statusSegments } from '@/lib/format';
import { colors, font, radius, space } from '@/theme';

const BAR_COLORS: Record<ApplicationStatus, string> = {
  pending_review: '#94A3B8',
  approved: '#0EA5E9',
  applied: colors.primary,
  interviewing: '#F59E0B',
  rejected: '#F43F5E',
  offer: '#10B981',
  skipped: '#3F3F46',
};

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </Card>
  );
}

/** One bar per status that has applications, from the real /analytics counts. */
export function StatusBars({ byStatus }: { byStatus: Record<ApplicationStatus, number> }) {
  const segments = statusSegments(byStatus);
  if (segments.length === 0) return null;
  return (
    <View style={styles.bars}>
      {segments.map((s) => (
        <View key={s.status} accessibilityLabel={`${s.label}: ${s.count}`} style={styles.barRow}>
          <View style={styles.barHead}>
            <Text style={styles.barLabel}>{s.label}</Text>
            <Text style={styles.barLabel}>{s.count}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${s.pct}%`, backgroundColor: BAR_COLORS[s.status] }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function AnalyticsScreen() {
  const router = useRouter();
  const analytics = useAnalytics();

  if (analytics.isLoading) return <Loading />;
  if (analytics.error) return <ErrorState message={describeApiError(analytics.error)} onRetry={() => void analytics.refetch()} />;
  const a = analytics.data;
  if (!a || a.total === 0) {
    return (
      <Screen title="Analytics">
        <EmptyState
          title="No applications yet"
          description="Numbers appear once your first applications are prepared."
          action={<Button label="Go to the review queue" variant="ghost" onPress={() => router.push('/queue')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen title="Performance Analytics" subtitle="How your applications are progressing." onRefresh={() => void analytics.refetch()} refreshing={analytics.isRefetching}>
      <View style={styles.grid}>
        <Tile label="TOTAL APPLICATIONS" value={String(a.total)} />
        <Tile label="APPLIED" value={String(a.applied_ever)} />
        <Tile label="RESPONSE RATE" value={formatPercent(a.response_rate)} note="Counts applications you moved past Applied (interviewing, rejected or offer)." />
        <Tile label="AVERAGE MATCH SCORE" value={formatScore(a.avg_match_score)} />
      </View>
      <Section title="Applications by status">
        <StatusBars byStatus={a.by_status} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  tile: { flexBasis: '47%', flexGrow: 1, gap: space(1) },
  tileLabel: { fontSize: font.tiny, fontWeight: '600', letterSpacing: 0.5, color: colors.muted },
  tileValue: { fontSize: 28, fontWeight: '700', color: colors.text },
  note: { fontSize: font.tiny, color: colors.muted },
  bars: { gap: space(3) },
  barRow: { gap: space(1) },
  barHead: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { fontSize: font.small, color: colors.secondaryText },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: colors.secondary, overflow: 'hidden' },
  fill: { height: 10, borderRadius: radius.pill },
});
```

Replace `mobile/src/app/(tabs)/tracker.tsx` with:

```tsx
import { TrackerScreen } from '@/components/tracker/TrackerScreen';

export default function TrackerTab() {
  return <TrackerScreen />;
}
```

Replace `mobile/src/app/(tabs)/analytics.tsx` with:

```tsx
import { AnalyticsScreen } from '@/components/analytics/AnalyticsScreen';

export default function AnalyticsTab() {
  return <AnalyticsScreen />;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npm test -w mobile -- tests/components/tracker-analytics.test.tsx`
Expected: PASS, `Tests: 6 passed, 6 total`.

Run: `npm test -w mobile && npm run typecheck -w mobile`
Expected: `Tests: 275 passed, 275 total`; typecheck exit code 0.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/tracker mobile/src/components/analytics "mobile/src/app/(tabs)/tracker.tsx" "mobile/src/app/(tabs)/analytics.tsx" mobile/tests/components/tracker-analytics.test.tsx
git commit -m "feat(mobile): tracker with status tabs and an action sheet for moves; analytics tiles and status bars

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 13: Onboarding with CV upload (document picker) and the preferences form

**Files:**
- Create: `mobile/src/components/cv/CvUpload.tsx`
- Create: `mobile/src/components/profile/ProfileForm.tsx`
- Create: `mobile/src/components/onboarding/OnboardingScreen.tsx`
- Create: `mobile/src/app/onboarding.tsx`
- Test: `mobile/tests/components/onboarding.test.tsx`

**Interfaces:**
- Consumes: `validateCvAsset`, `toCvFile`, `CV_MIME_TYPES`, `CvFile`, `buildProfilePatch`, `profileToFormValues`, `initialStep`, `describeApiError` (Task 3), `useProfile`, `useUploadCv`, `useUpdateProfile` (Task 4), primitives (Task 5), fixtures (Task 7), `expo-document-picker`.
- Produces:
  - `PickedDocument { uri; name; size?; mimeType? }`, `pickCvDocument(): Promise<PickedDocument | null>` (`DocumentPicker.getDocumentAsync({ type: CV_MIME_TYPES, copyToCacheDirectory: true, multiple: false })`; null when cancelled), `CvUpload({ onUpload(file: CvFile): Promise<void>, currentName?, pick? })` with the `Choose your CV` button.
  - `ProfileForm({ initial: ProfileFormValues, onSubmit(patch): Promise<void>, submitLabel, requireRoles? })`: fields `Roles you want`, `Skills`, location chips (`Any location`, `Lagos`, `Abuja`, `Remote`), `Years of experience`, `Minimum salary`, `Maximum salary`.
  - `OnboardingScreen({ pick? })`: steps CV, preferences (`Save and continue`), then `Go to my queue` (`router.replace('/queue')`). Route `/onboarding` (the tabs layout from Task 6 sends new users here).

- [ ] **Step 1: Write the failing test**

Create `mobile/tests/components/onboarding.test.tsx`:

```tsx
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@/hooks/api', () => ({ useProfile: jest.fn(), useUploadCv: jest.fn(), useUpdateProfile: jest.fn() }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { CvUpload } from '@/components/cv/CvUpload';
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen';
import { ProfileForm } from '@/components/profile/ProfileForm';
import * as hooks from '@/hooks/api';
import { ApiRequestError } from '@/lib/api/client';
import { ok, profile, type Mocked } from '../fixtures';

const mockHooks = hooks as unknown as Mocked<typeof hooks>;
const pdf = { uri: 'file:///cache/cv.pdf', name: 'cv.pdf', size: 2000, mimeType: 'application/pdf' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CvUpload', () => {
  it('uploads the picked PDF', async () => {
    const onUpload = jest.fn().mockResolvedValue(undefined);
    await render(<CvUpload onUpload={onUpload} pick={async () => pdf} currentName="old.pdf" />);
    expect(screen.getByText('Current CV: old.pdf')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose your CV' }));
    expect(onUpload).toHaveBeenCalledWith({ uri: pdf.uri, name: 'cv.pdf', mimeType: 'application/pdf' });
    expect(await screen.findByText('CV uploaded.')).toBeOnTheScreen();
  });

  it('refuses a wrong type or a large file without uploading', async () => {
    const onUpload = jest.fn();
    const pick = jest.fn().mockResolvedValueOnce({ ...pdf, name: 'cv.png' }).mockResolvedValueOnce({ ...pdf, size: 6 * 1024 * 1024 });
    await render(<CvUpload onUpload={onUpload} pick={pick} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose your CV' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Upload a PDF or DOCX file.');
    await fireEvent.press(screen.getByRole('button', { name: 'Choose your CV' }));
    expect(screen.getByRole('alert')).toHaveTextContent('That file is larger than 5 MB.');
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('does nothing when the picker is cancelled, and shows the server message on failure', async () => {
    const onUpload = jest.fn().mockRejectedValue(new ApiRequestError(400, 'cv_text_too_short'));
    const pick = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(pdf);
    await render(<CvUpload onUpload={onUpload} pick={pick} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose your CV' }));
    expect(onUpload).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose your CV' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Scanned images are not supported/);
  });
});

describe('ProfileForm', () => {
  const initial = { desiredRoles: '', skills: '', location: '' as const, yearsExperience: '', salaryMin: '', salaryMax: '' };

  it('requires a role when asked and submits the parsed patch', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<ProfileForm initial={initial} onSubmit={onSubmit} submitLabel="Save and continue" requireRoles />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save and continue' }));
    expect(screen.getByText('Add at least one role you are looking for.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Roles you want'), 'Data Analyst, BI Analyst');
    await fireEvent.press(screen.getByRole('button', { name: 'Lagos' }));
    await fireEvent.changeText(screen.getByLabelText('Years of experience'), '3');
    await fireEvent.press(screen.getByRole('button', { name: 'Save and continue' }));
    expect(onSubmit).toHaveBeenCalledWith({
      desired_roles: ['Data Analyst', 'BI Analyst'],
      skills: [],
      location: 'Lagos',
      years_experience: 3,
      salary_min: null,
      salary_max: null,
    });
    expect(await screen.findByText('Saved.')).toBeOnTheScreen();
  });

  it('explains a salary range the wrong way round', async () => {
    const onSubmit = jest.fn();
    await render(<ProfileForm initial={{ ...initial, desiredRoles: 'Analyst', salaryMin: '500', salaryMax: '100' }} onSubmit={onSubmit} submitLabel="Save preferences" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save preferences' }));
    expect(screen.getByText('Minimum salary cannot be higher than maximum salary.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('OnboardingScreen', () => {
  it('starts at the CV step, then preferences, then the queue', async () => {
    const upload = jest.fn().mockResolvedValue({ characters: 900 });
    const update = jest.fn().mockResolvedValue(profile());
    mockHooks.useProfile.mockReturnValue(ok(profile({ base_cv_url: null, desired_roles: [] })));
    mockHooks.useUploadCv.mockReturnValue({ mutateAsync: upload });
    mockHooks.useUpdateProfile.mockReturnValue({ mutateAsync: update });
    await render(<OnboardingScreen pick={async () => pdf} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose your CV' }));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('What are you looking for?')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Roles you want'), 'Data Analyst');
    await fireEvent.press(screen.getByRole('button', { name: 'Save and continue' }));
    expect(update).toHaveBeenCalledTimes(1);
    await fireEvent.press(await screen.findByRole('button', { name: 'Go to my queue' }));
    expect(mockReplace).toHaveBeenCalledWith('/queue');
  });

  it('skips the CV step when a CV is already stored', async () => {
    mockHooks.useProfile.mockReturnValue(ok(profile({ desired_roles: [] })));
    mockHooks.useUploadCv.mockReturnValue({ mutateAsync: jest.fn() });
    mockHooks.useUpdateProfile.mockReturnValue({ mutateAsync: jest.fn() });
    await render(<OnboardingScreen />);
    expect(screen.getByText('What are you looking for?')).toBeOnTheScreen();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w mobile -- tests/components/onboarding.test.tsx`
Expected: FAIL with `Cannot find module '@/components/cv/CvUpload'`.

- [ ] **Step 3: Implement the upload, the form, the screen and the route**

Create `mobile/src/components/cv/CvUpload.tsx`:

```tsx
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Message } from '@/components/ui/States';
import { describeApiError } from '@/lib/api/errors';
import { CV_MIME_TYPES, toCvFile, validateCvAsset, type CvFile } from '@/lib/cv-file';
import { colors, font, radius, space } from '@/theme';

export interface PickedDocument {
  uri: string;
  name: string;
  size?: number | null;
  mimeType?: string | null;
}

/** Opens the system file picker for a PDF or DOCX. Null when the user cancels. */
export async function pickCvDocument(): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: CV_MIME_TYPES, copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  return result.assets[0] ?? null;
}

export interface CvUploadProps {
  onUpload(file: CvFile): Promise<void>;
  currentName?: string | null;
  pick?: () => Promise<PickedDocument | null>;
}

/** Choose a CV with the document picker, check it like the web does, then upload it. */
export function CvUpload({ onUpload, currentName, pick = pickCvDocument }: CvUploadProps) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    if (status === 'uploading') return;
    let asset: PickedDocument | null;
    try {
      asset = await pick();
    } catch {
      setError('Could not open your files. Please try again.');
      return;
    }
    if (!asset) return;
    const problem = validateCvAsset(asset);
    if (problem) {
      setError(problem);
      setStatus('idle');
      return;
    }
    setError(null);
    setStatus('uploading');
    try {
      await onUpload(toCvFile(asset));
      setStatus('done');
    } catch (err) {
      setError(describeApiError(err));
      setStatus('idle');
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.drop}>
        <Text style={styles.strong}>{status === 'uploading' ? 'Uploading…' : 'Upload your CV'}</Text>
        <Text style={styles.muted}>PDF or DOCX, up to 5 MB, with selectable text</Text>
        <Button label={status === 'uploading' ? 'Uploading…' : 'Choose your CV'} onPress={() => void choose()} disabled={status === 'uploading'} />
      </View>
      {currentName ? <Text style={styles.muted}>{`Current CV: ${currentName}`}</Text> : null}
      {status === 'done' ? <Message kind="success" text="CV uploaded." /> : null}
      {error ? <Message kind="error" text={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space(3) },
  drop: { alignItems: 'center', gap: space(2), borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.card, padding: space(6), backgroundColor: colors.card },
  strong: { fontSize: font.body, fontWeight: '600', color: colors.text },
  muted: { fontSize: font.small, color: colors.muted, textAlign: 'center' },
});
```

Create `mobile/src/components/profile/ProfileForm.tsx`:

```tsx
import { LOCATIONS, type ProfilePatch } from '@joblume/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Chips } from '@/components/ui/Chips';
import { Message } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { describeApiError } from '@/lib/api/errors';
import { buildProfilePatch, type ProfileField, type ProfileFormValues } from '@/lib/profile-form';
import { colors, font, space } from '@/theme';

export interface ProfileFormProps {
  initial: ProfileFormValues;
  onSubmit(patch: ProfilePatch): Promise<void>;
  submitLabel: string;
  requireRoles?: boolean;
}

const LOCATION_OPTIONS = [{ value: '', label: 'Any location' }, ...LOCATIONS.map((l) => ({ value: l, label: l }))] as const;

/** Roles, skills, location, experience and salary, with the same validation as the web form. */
export function ProfileForm({ initial, onSubmit, submitLabel, requireRoles = false }: ProfileFormProps) {
  const [values, setValues] = useState<ProfileFormValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const set = <K extends ProfileField>(key: K, value: ProfileFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  };

  async function submit() {
    setServerError(null);
    setSaved(false);
    const result = buildProfilePatch(values, { requireRoles });
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
      <TextField
        label="Roles you want"
        hint="Separate roles with commas, for example Data Analyst, BI Analyst. Every word of a role must appear in a job title to match."
        value={values.desiredRoles}
        onChangeText={(t) => set('desiredRoles', t)}
        error={errors.desiredRoles}
      />
      <TextField label="Skills" hint="Separate skills with commas." value={values.skills} onChangeText={(t) => set('skills', t)} error={errors.skills} />
      <View style={styles.field}>
        <Text style={styles.label}>Location</Text>
        <Chips label="Location" options={LOCATION_OPTIONS} value={values.location} onChange={(l) => set('location', l)} />
      </View>
      <TextField label="Years of experience" keyboardType="number-pad" value={values.yearsExperience} onChangeText={(t) => set('yearsExperience', t)} error={errors.yearsExperience} />
      <TextField label="Minimum salary" keyboardType="number-pad" value={values.salaryMin} onChangeText={(t) => set('salaryMin', t)} error={errors.salaryMin} />
      <TextField label="Maximum salary" keyboardType="number-pad" value={values.salaryMax} onChangeText={(t) => set('salaryMax', t)} error={errors.salaryMax} />
      {serverError ? <Message kind="error" text={serverError} /> : null}
      {saved ? <Message kind="success" text="Saved." /> : null}
      <Button label={pending ? 'Saving…' : submitLabel} onPress={() => void submit()} disabled={pending} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space(4) },
  field: { gap: space(1.5) },
  label: { fontSize: font.small, fontWeight: '600', color: colors.text },
});
```

Create `mobile/src/components/onboarding/OnboardingScreen.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CvUpload, type PickedDocument } from '@/components/cv/CvUpload';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, Loading } from '@/components/ui/States';
import { useProfile, useUpdateProfile, useUploadCv } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { initialStep } from '@/lib/onboarding';
import { profileToFormValues } from '@/lib/profile-form';
import { colors, font, space } from '@/theme';

const STEPS = ['Upload your CV', 'Tell us what you want', 'All set'] as const;

/** Three steps, as on the web: CV upload, preferences (at least one role), then on to the queue. */
export function OnboardingScreen({ pick }: { pick?: () => Promise<PickedDocument | null> }) {
  const router = useRouter();
  const profile = useProfile();
  const uploadCv = useUploadCv();
  const updateProfile = useUpdateProfile();
  const [step, setStep] = useState<1 | 2 | 3 | null>(null);

  useEffect(() => {
    if (profile.data && step === null) setStep(initialStep(profile.data));
  }, [profile.data, step]);

  if (profile.error) return <ErrorState message={describeApiError(profile.error)} onRetry={() => void profile.refetch()} />;
  if (!profile.data || step === null) return <Loading />;

  return (
    <Screen title="Welcome to JobLume">
      <View accessibilityLabel="Progress" style={styles.steps}>
        {STEPS.map((label, i) => (
          <Text key={label} style={[styles.step, step === i + 1 && styles.current]}>{`${i + 1}. ${label}`}</Text>
        ))}
      </View>

      {step === 1 ? (
        <Section title="Upload your CV" description="We tailor a copy of this CV for each job. We never invent experience you do not have.">
          <CvUpload
            pick={pick}
            onUpload={async (file) => {
              await uploadCv.mutateAsync(file);
              setStep(2);
            }}
          />
        </Section>
      ) : null}

      {step === 2 ? (
        <Section title="What are you looking for?" description="We only prepare applications for jobs that match these roles and your location.">
          <ProfileForm
            initial={profileToFormValues(profile.data)}
            requireRoles
            submitLabel="Save and continue"
            onSubmit={async (patch) => {
              await updateProfile.mutateAsync(patch);
              setStep(3);
            }}
          />
        </Section>
      ) : null}

      {step === 3 ? (
        <Section
          title="You are ready"
          description="We are matching your profile against current jobs. The first prepared applications usually appear within a few minutes. Nothing is ever sent without your approval."
        >
          <Button label="Go to my queue" onPress={() => router.replace('/queue')} />
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  steps: { gap: space(1) },
  step: { fontSize: font.small, color: colors.muted },
  current: { color: colors.text, fontWeight: '700' },
});
```

Create `mobile/src/app/onboarding.tsx`:

```tsx
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen';

export default function OnboardingRoute() {
  return <OnboardingScreen />;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npm test -w mobile -- tests/components/onboarding.test.tsx`
Expected: PASS, `Tests: 7 passed, 7 total`.

Run: `npm test -w mobile && npm run typecheck -w mobile`
Expected: `Tests: 282 passed, 282 total`; typecheck exit code 0.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/cv mobile/src/components/profile/ProfileForm.tsx mobile/src/components/onboarding mobile/src/app/onboarding.tsx mobile/tests/components/onboarding.test.tsx
git commit -m "feat(mobile): onboarding with CV upload through the document picker and the preferences form

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 14: Gmail card, in-app browser connect and the joblume://gmail-return route

**Files:**
- Create: `mobile/src/lib/gmail-connect.ts`
- Create: `mobile/src/components/settings/GmailCard.tsx`, `mobile/src/components/settings/useGmailConnection.ts`
- Create: `mobile/src/app/gmail-return.tsx`
- Test: `mobile/tests/lib/gmail-connect.test.ts`, `mobile/tests/components/gmail-card.test.tsx`

**Interfaces:**
- Consumes: `MOBILE_GMAIL_RETURN` (Task 1), `parseGmailReturnUrl`, `describeGmailReason`, `GmailReturn`, `describeApiError` (Task 3), `keys`, `useGmailStatus`, `useConnectGmail`, `useDisconnectGmail` (Task 4), `Section`, `Button`, `Message` (Task 5), `expo-web-browser`.
- Produces:
  - `AuthSessionResult`, `GmailConnectDeps { start(); openAuth(url, returnUrl); refresh() }`, `connectGmail(deps): Promise<GmailReturn | null>`: opens only an https URL on `accounts.google.com`, passes `joblume://gmail-return` as the return URL, parses a `success` result and always refreshes the Gmail status afterwards.
  - `GmailCard({ status, connecting, disconnecting, error?, returned?, onConnect(), onDisconnect() })` (same states and wording as the web card).
  - `useGmailConnection(initialReturn: GmailReturn | null)`: returns exactly the `GmailCardProps` (`status`, `connecting`, `disconnecting`, `returned`, `error`, `onConnect`, `onDisconnect`), using `WebBrowser.openAuthSessionAsync(url, returnUrl)`.
  - Route `/gmail-return`: refreshes the Gmail status and redirects to `/settings?gmail=<status>&reason=<reason>` (Task 15 reads these).

How the return works: the server (Task 1) redirects the in-app browser to `joblume://gmail-return?status=...`. In a standalone build (scheme `joblume` from Task 2) Android hands that URL back to `openAuthSessionAsync` as `{ type: 'success', url }` and Expo Router may also open `/gmail-return`; both paths end on Settings with the same message. Expo Go cannot open the `joblume://` scheme, so there the browser just closes (`dismiss`) and the status refresh shows the new state. The manual checklist covers both.

- [ ] **Step 1: Write the failing tests**

Create `mobile/tests/lib/gmail-connect.test.ts`:

```ts
import { connectGmail, type GmailConnectDeps } from '@/lib/gmail-connect';

const GOOGLE = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=s';

function deps(over: Partial<GmailConnectDeps> = {}) {
  return {
    start: jest.fn().mockResolvedValue({ url: GOOGLE }),
    openAuth: jest.fn().mockResolvedValue({ type: 'success', url: 'joblume://gmail-return?status=connected' }),
    refresh: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('connectGmail', () => {
  it('opens Google with the app return link and reports a connection', async () => {
    const d = deps();
    expect(await connectGmail(d)).toEqual({ kind: 'connected' });
    expect(d.openAuth).toHaveBeenCalledWith(GOOGLE, 'joblume://gmail-return');
    expect(d.refresh).toHaveBeenCalledTimes(1);
  });

  it('reports the reason Google or the server gave', async () => {
    const d = deps({ openAuth: jest.fn().mockResolvedValue({ type: 'success', url: 'joblume://gmail-return?status=error&reason=denied' }) });
    expect(await connectGmail(d)).toEqual({ kind: 'error', reason: 'denied' });
  });

  it('returns null but still refreshes when the browser is closed without a redirect (Expo Go)', async () => {
    const d = deps({ openAuth: jest.fn().mockResolvedValue({ type: 'dismiss' }) });
    expect(await connectGmail(d)).toBeNull();
    expect(d.refresh).toHaveBeenCalledTimes(1);
  });

  it.each(['http://accounts.google.com/o/oauth2/v2/auth', 'https://evil.example/o/oauth2', 'javascript:alert(1)', 'nonsense'])(
    'never opens %s',
    async (url) => {
      const d = deps({ start: jest.fn().mockResolvedValue({ url }) });
      expect(await connectGmail(d)).toEqual({ kind: 'error', reason: 'unknown' });
      expect(d.openAuth).not.toHaveBeenCalled();
    },
  );

  it('refreshes even when the browser fails, and lets the error through', async () => {
    const d = deps({ openAuth: jest.fn().mockRejectedValue(new Error('no browser')) });
    await expect(connectGmail(d)).rejects.toThrow('no browser');
    expect(d.refresh).toHaveBeenCalledTimes(1);
  });
});
```

Create `mobile/tests/components/gmail-card.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GmailCard, type GmailCardProps } from '@/components/settings/GmailCard';

async function setup(over: Partial<GmailCardProps> = {}) {
  const onConnect = jest.fn();
  const onDisconnect = jest.fn();
  await render(
    <GmailCard status={{ configured: true, connected: false, email: null }} connecting={false} disconnecting={false} onConnect={onConnect} onDisconnect={onDisconnect} {...over} />,
  );
  return { onConnect, onDisconnect };
}

describe('GmailCard', () => {
  it('offers Connect Gmail when not connected', async () => {
    const { onConnect } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Connect Gmail' }));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('shows the connected address and disconnects', async () => {
    const { onDisconnect } = await setup({ status: { configured: true, connected: true, email: 'me@gmail.com' } });
    expect(screen.getByText('Connected as me@gmail.com')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Disconnect' }));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('explains a server without Gmail settings', async () => {
    await setup({ status: { configured: false, connected: false, email: null } });
    expect(screen.getByText(/not set up on this server/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Connect Gmail' })).toBeNull();
  });

  it('shows the result of coming back from Google', async () => {
    await setup({ returned: { kind: 'error', reason: 'missing_scope' } });
    expect(screen.getByRole('alert')).toHaveTextContent('JobLume needs permission to send email. Connect again and keep every box ticked.');
  });

  it('shows Opening Google… while connecting', async () => {
    await setup({ connecting: true });
    expect(screen.getByRole('button', { name: 'Opening Google…' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w mobile -- tests/lib/gmail-connect.test.ts tests/components/gmail-card.test.tsx`
Expected: FAIL with `Cannot find module '@/lib/gmail-connect'` and `'@/components/settings/GmailCard'`.

- [ ] **Step 3: Implement the connect flow, the card, the hook and the route**

Create `mobile/src/lib/gmail-connect.ts`:

```ts
import { MOBILE_GMAIL_RETURN } from '@joblume/shared';
import { parseGmailReturnUrl, type GmailReturn } from './gmail-return';

/** expo-web-browser's openAuthSessionAsync result, reduced to what we read. */
export type AuthSessionResult = { type: 'success'; url: string } | { type: string };

export interface GmailConnectDeps {
  /** POST /gmail/connect (with the app return target). */
  start(): Promise<{ url: string }>;
  /** Opens the consent page in the in-app browser and resolves when it closes or redirects to `returnUrl`. */
  openAuth(url: string, returnUrl: string): Promise<AuthSessionResult>;
  /** Re-reads GET /gmail/status. */
  refresh(): Promise<void>;
}

/**
 * Connect Gmail from the phone: ask the API for Google's consent URL, open it only if it is https on accounts.google.com,
 * read the joblume://gmail-return result, and always refresh the Gmail status afterwards (Expo Go cannot receive the
 * joblume:// redirect, so the refresh is what shows the new state there).
 */
export async function connectGmail(deps: GmailConnectDeps): Promise<GmailReturn | null> {
  const { url } = await deps.start();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'error', reason: 'unknown' };
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'accounts.google.com') return { kind: 'error', reason: 'unknown' };
  try {
    const result = await deps.openAuth(url, MOBILE_GMAIL_RETURN);
    return result.type === 'success' && 'url' in result ? parseGmailReturnUrl(result.url) : null;
  } finally {
    await deps.refresh();
  }
}
```

Create `mobile/src/components/settings/GmailCard.tsx`:

```tsx
import type { GmailStatus } from '@joblume/shared';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Card';
import { Message } from '@/components/ui/States';
import { describeGmailReason, type GmailReturn } from '@/lib/gmail-return';
import { colors, font, space } from '@/theme';

export interface GmailCardProps {
  status: GmailStatus | undefined;
  connecting: boolean;
  disconnecting: boolean;
  error?: string | null;
  returned?: GmailReturn | null;
  onConnect(): void;
  onDisconnect(): void;
}

/** Same states and wording as the web Gmail card. */
export function GmailCard({ status, connecting, disconnecting, error, returned, onConnect, onDisconnect }: GmailCardProps) {
  return (
    <Section
      title="Gmail"
      description="Connect Gmail so JobLume can send your applications and follow-ups from your own address. It can only send email; it cannot read your mail."
    >
      {returned?.kind === 'connected' ? <Message kind="success" text="Gmail connected." /> : null}
      {returned?.kind === 'error' ? <Message kind="error" text={describeGmailReason(returned.reason)} /> : null}
      {!status ? (
        <Text style={styles.muted}>Checking Gmail…</Text>
      ) : !status.configured ? (
        <Text style={styles.muted}>Gmail is not set up on this server yet. Follow docs/gmail-setup.md, then restart the server.</Text>
      ) : status.connected ? (
        <View style={styles.row}>
          <Text style={styles.text}>{`Connected as ${status.email ?? ''}`}</Text>
          <Button label={disconnecting ? 'Disconnecting…' : 'Disconnect'} variant="outline" size="sm" onPress={onDisconnect} disabled={disconnecting} />
        </View>
      ) : (
        <Button label={connecting ? 'Opening Google…' : 'Connect Gmail'} onPress={onConnect} disabled={connecting} />
      )}
      {error ? <Message kind="error" text={error} /> : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { gap: space(2) },
  text: { fontSize: font.body, color: colors.text },
  muted: { fontSize: font.small, color: colors.muted },
});
```

Create `mobile/src/components/settings/useGmailConnection.ts`:

```ts
import { useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { keys, useConnectGmail, useDisconnectGmail, useGmailStatus } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { connectGmail } from '@/lib/gmail-connect';
import type { GmailReturn } from '@/lib/gmail-return';

/** Everything the Settings screen needs for the Gmail card. `returned` can also come from the gmail-return route. */
export function useGmailConnection(initialReturn: GmailReturn | null) {
  const qc = useQueryClient();
  const status = useGmailStatus();
  const start = useConnectGmail();
  const disconnect = useDisconnectGmail();
  const [returned, setReturned] = useState<GmailReturn | null>(initialReturn);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialKey = initialReturn ? JSON.stringify(initialReturn) : '';

  useEffect(() => {
    if (initialReturn) setReturned(initialReturn);
  }, [initialKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    setConnecting(true);
    setError(null);
    setReturned(null);
    try {
      const result = await connectGmail({
        start: () => start.mutateAsync(),
        openAuth: (url, returnUrl) => WebBrowser.openAuthSessionAsync(url, returnUrl),
        refresh: () => qc.invalidateQueries({ queryKey: keys.gmail }),
      });
      setReturned(result);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setConnecting(false);
    }
  }

  return {
    status: status.data,
    connecting,
    disconnecting: disconnect.isPending,
    returned,
    error: error ?? (disconnect.error ? describeApiError(disconnect.error) : null),
    onConnect: () => void connect(),
    onDisconnect: () => disconnect.mutate(),
  };
}
```

Create `mobile/src/app/gmail-return.tsx`:

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { keys } from '@/hooks/api';

/**
 * joblume://gmail-return?status=...&reason=... lands here when the phone opens the app from the Gmail callback.
 * It refreshes the Gmail status and hands the result to Settings, which shows it.
 */
export default function GmailReturnRoute() {
  const qc = useQueryClient();
  const { status, reason } = useLocalSearchParams<{ status?: string; reason?: string }>();

  useEffect(() => {
    void qc.invalidateQueries({ queryKey: keys.gmail });
  }, [qc]);

  return <Redirect href={{ pathname: '/settings', params: { gmail: status ?? '', reason: reason ?? '' } }} />;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npm test -w mobile -- tests/lib/gmail-connect.test.ts tests/components/gmail-card.test.tsx`
Expected: PASS, `Tests: 13 passed, 13 total`.

Run: `npm test -w mobile && npm run typecheck -w mobile`
Expected: `Tests: 295 passed, 295 total`; typecheck exit code 0.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/gmail-connect.ts mobile/src/components/settings/GmailCard.tsx mobile/src/components/settings/useGmailConnection.ts mobile/src/app/gmail-return.tsx mobile/tests/lib/gmail-connect.test.ts mobile/tests/components/gmail-card.test.tsx
git commit -m "feat(mobile): connect Gmail in the in-app browser and return through joblume://gmail-return

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 15: Settings: CV, Gmail, preferences, apply mode, threshold, daily cap, sign out

**Files:**
- Create: `mobile/src/components/profile/SettingsForm.tsx`
- Create: `mobile/src/components/settings/SettingsScreen.tsx`
- Modify (replace whole file): `mobile/src/app/(tabs)/settings.tsx`
- Test: `mobile/tests/components/settings.test.tsx`

**Interfaces:**
- Consumes: `buildSettingsPatch`, `profileToFormValues`, `profileToSettingsValues`, `displayCvName`, `parseGmailReturn`, `describeApiError` (Task 3), `useProfile`, `useUploadCv`, `useUpdateProfile`, `useSession` (Task 4), `CvUpload`, `ProfileForm` (Task 13), `GmailCard`, `useGmailConnection` (Task 14), `getSupabase` (Task 4), primitives (Task 5), fixtures (Task 7).
- Produces:
  - `SettingsForm({ initial: SettingsValues, onSubmit(patch): Promise<void> })`: `Manual` / `Auto` chips with the web's Auto-mode explanation, `Auto-apply threshold`, `Daily application cap` (1 to 20), `Auto follow-up` box, `Save settings`.
  - `SettingsScreen({ onSignOut(): Promise<void> })`: Your CV, Gmail, Job preferences, Applying, Account (`Signed in as <email>`, `Sign out`). It reads `gmail` and `reason` from the route params set by `/gmail-return`.
  - The Settings tab signs out with `getSupabase().auth.signOut()` and clears the query cache; the session listener then flips to signed out and the auth gate shows `/login`.

- [ ] **Step 1: Write the failing test**

Create `mobile/tests/components/settings.test.tsx`:

```tsx
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));
jest.mock('@/hooks/api', () => ({
  keys: { gmail: ['gmail'] },
  useProfile: jest.fn(),
  useUploadCv: jest.fn(),
  useUpdateProfile: jest.fn(),
  useGmailStatus: jest.fn(),
  useConnectGmail: jest.fn(),
  useDisconnectGmail: jest.fn(),
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { SettingsForm } from '@/components/profile/SettingsForm';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import * as hooks from '@/hooks/api';
import { StaticSession } from '@/lib/session';
import { ok, profile, type Mocked } from '../fixtures';

const mockHooks = hooks as unknown as Mocked<typeof hooks>;
const openAuth = WebBrowser.openAuthSessionAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe('SettingsForm', () => {
  const initial = { applyMode: 'manual' as const, autoThreshold: '80', dailyCap: '10', autoFollowup: false };

  it('saves the apply mode, threshold, cap and follow-up choice', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<SettingsForm initial={initial} onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Auto' }));
    await fireEvent.changeText(screen.getByLabelText('Auto-apply threshold'), '90');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Auto follow-up' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save settings' }));
    expect(onSubmit).toHaveBeenCalledWith({ apply_mode: 'auto', auto_threshold: 90, daily_cap: 10, auto_followup: true });
    expect(await screen.findByText('Saved.')).toBeOnTheScreen();
  });

  it('keeps the daily cap between 1 and 20', async () => {
    const onSubmit = jest.fn();
    await render(<SettingsForm initial={initial} onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByLabelText('Daily application cap'), '21');
    await fireEvent.press(screen.getByRole('button', { name: 'Save settings' }));
    expect(screen.getByText('Enter a whole number between 1 and 20.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('SettingsScreen', () => {
  function setup(onSignOut = jest.fn().mockResolvedValue(undefined)) {
    const start = jest.fn().mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=s' });
    mockHooks.useProfile.mockReturnValue(ok(profile()));
    mockHooks.useUploadCv.mockReturnValue({ mutateAsync: jest.fn() });
    mockHooks.useUpdateProfile.mockReturnValue({ mutateAsync: jest.fn() });
    mockHooks.useGmailStatus.mockReturnValue(ok({ configured: true, connected: false, email: null }));
    mockHooks.useConnectGmail.mockReturnValue({ mutateAsync: start });
    mockHooks.useDisconnectGmail.mockReturnValue({ mutate: jest.fn(), isPending: false, error: null });
    const qc = new QueryClient();
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const view = render(
      <QueryClientProvider client={qc}>
        <StaticSession value={{ status: 'signedIn', email: 'me@example.com' }}>
          <SettingsScreen onSignOut={onSignOut} />
        </StaticSession>
      </QueryClientProvider>,
    );
    return { view, start, invalidate, onSignOut };
  }

  it('shows the CV, preferences and account', async () => {
    await setup().view;
    expect(screen.getByText('Current CV: My CV.pdf')).toBeOnTheScreen();
    expect(screen.getByLabelText('Roles you want')).toHaveDisplayValue('Data Analyst');
    expect(screen.getByText('Signed in as me@example.com')).toBeOnTheScreen();
  });

  it('connects Gmail in the in-app browser with the app return link and refreshes the status', async () => {
    openAuth.mockResolvedValue({ type: 'success', url: 'joblume://gmail-return?status=connected' });
    const { view, start, invalidate } = setup();
    await view;
    await fireEvent.press(screen.getByRole('button', { name: 'Connect Gmail' }));
    expect(start).toHaveBeenCalledTimes(1);
    expect(openAuth).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?state=s', 'joblume://gmail-return');
    expect(await screen.findByText('Gmail connected.')).toBeOnTheScreen();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['gmail'] });
  });

  it('shows the result handed over by the gmail-return route', async () => {
    mockParams = { gmail: 'error', reason: 'denied' };
    await setup().view;
    expect(screen.getByText(/You chose not to allow access/)).toBeOnTheScreen();
  });

  it('signs out', async () => {
    const { view, onSignOut } = setup();
    await view;
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w mobile -- tests/components/settings.test.tsx`
Expected: FAIL with `Cannot find module '@/components/profile/SettingsForm'`.

- [ ] **Step 3: Implement the form, the screen and the tab**

Create `mobile/src/components/profile/SettingsForm.tsx`:

```tsx
import type { ProfilePatch } from '@joblume/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Chips } from '@/components/ui/Chips';
import { Message } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { describeApiError } from '@/lib/api/errors';
import { buildSettingsPatch, type SettingsField, type SettingsValues } from '@/lib/profile-form';
import { colors, font, space } from '@/theme';

export interface SettingsFormProps {
  initial: SettingsValues;
  onSubmit(patch: ProfilePatch): Promise<void>;
}

const MODES = [
  { value: 'manual', label: 'Manual' },
  { value: 'auto', label: 'Auto' },
] as const;

/** Apply mode, auto threshold, daily cap and auto follow-up. The Auto rules are enforced by the server and unchanged. */
export function SettingsForm({ initial, onSubmit }: SettingsFormProps) {
  const [values, setValues] = useState<SettingsValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<SettingsField, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const set = <K extends SettingsField>(key: K, value: SettingsValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  };

  async function submit() {
    setServerError(null);
    setSaved(false);
    const result = buildSettingsPatch(values);
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
      <View style={styles.field}>
        <Text style={styles.label}>Apply mode</Text>
        <Chips label="Apply mode" options={MODES} value={values.applyMode} onChange={(m) => set('applyMode', m)} />
        <Text style={styles.hint}>
          Auto mode sends an application by email without a tap only when all of these are true: Gmail is connected, the job is from Remotive, MyJobMag or
          Jobberman, the contact email was found by Hunter (not guessed or pasted) with confidence 80 or more, the match score meets your threshold, and
          today's limit is not reached. Applications already in your queue are not sent.
        </Text>
      </View>
      <TextField label="Auto-apply threshold" keyboardType="number-pad" value={values.autoThreshold} onChangeText={(t) => set('autoThreshold', t)} error={errors.autoThreshold} />
      <TextField label="Daily application cap" keyboardType="number-pad" value={values.dailyCap} onChangeText={(t) => set('dailyCap', t)} error={errors.dailyCap} />
      <Checkbox label="Auto follow-up" checked={values.autoFollowup} onChange={(v) => set('autoFollowup', v)} />
      <Text style={styles.hint}>With this on, follow-up drafts are sent automatically three days after you apply instead of waiting for you.</Text>
      {serverError ? <Message kind="error" text={serverError} /> : null}
      {saved ? <Message kind="success" text="Saved." /> : null}
      <Button label={pending ? 'Saving…' : 'Save settings'} onPress={() => void submit()} disabled={pending} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space(4) },
  field: { gap: space(1.5) },
  label: { fontSize: font.small, fontWeight: '600', color: colors.text },
  hint: { fontSize: font.tiny, color: colors.muted },
});
```

Create `mobile/src/components/settings/SettingsScreen.tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { CvUpload } from '@/components/cv/CvUpload';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { SettingsForm } from '@/components/profile/SettingsForm';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, Loading, Message } from '@/components/ui/States';
import { useProfile, useUpdateProfile, useUploadCv } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { displayCvName } from '@/lib/cv-name';
import { parseGmailReturn } from '@/lib/gmail-return';
import { profileToFormValues, profileToSettingsValues } from '@/lib/profile-form';
import { useSession } from '@/lib/session';
import { colors, font } from '@/theme';
import { GmailCard } from './GmailCard';
import { useGmailConnection } from './useGmailConnection';

export interface SettingsScreenProps {
  /** Signs out of Supabase; the auth gate then shows /login. */
  onSignOut(): Promise<void>;
}

/** Settings tab: CV, Gmail, job preferences, apply mode and limits, and sign out. */
export function SettingsScreen({ onSignOut }: SettingsScreenProps) {
  const { email } = useSession();
  const params = useLocalSearchParams<{ gmail?: string; reason?: string }>();
  const profile = useProfile();
  const uploadCv = useUploadCv();
  const updateProfile = useUpdateProfile();
  const gmail = useGmailConnection(parseGmailReturn({ status: params.gmail, reason: params.reason }));
  const [signOutError, setSignOutError] = useState<string | null>(null);

  if (profile.isLoading) return <Loading />;
  if (profile.error || !profile.data) return <ErrorState message={describeApiError(profile.error)} onRetry={() => void profile.refetch()} />;
  const data = profile.data;

  async function signOut() {
    setSignOutError(null);
    try {
      await onSignOut();
    } catch {
      setSignOutError('Could not sign out. Please try again.');
    }
  }

  return (
    <Screen title="Settings" subtitle="Your CV, Gmail connection, job preferences and how applications are handled.">
      <Section title="Your CV" description="Replacing it finds matches for your latest CV. Applications already prepared keep the CV they were tailored from.">
        <CvUpload
          currentName={displayCvName(data)}
          onUpload={async (file) => {
            await uploadCv.mutateAsync(file);
          }}
        />
      </Section>

      <GmailCard {...gmail} />

      <Section title="Job preferences" description="Roles, location, skills and salary range.">
        <ProfileForm
          initial={profileToFormValues(data)}
          submitLabel="Save preferences"
          onSubmit={async (patch) => {
            await updateProfile.mutateAsync(patch);
          }}
        />
      </Section>

      <Section title="Applying" description="How applications are handled and how often.">
        <SettingsForm
          initial={profileToSettingsValues(data)}
          onSubmit={async (patch) => {
            await updateProfile.mutateAsync(patch);
          }}
        />
      </Section>

      <Section title="Account">
        {email ? <Text style={styles.text}>{`Signed in as ${email}`}</Text> : null}
        <Button label="Sign out" variant="danger" onPress={() => void signOut()} />
        {signOutError ? <Message kind="error" text={signOutError} /> : null}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: font.body, color: colors.text },
});
```

Replace `mobile/src/app/(tabs)/settings.tsx` with:

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { getSupabase } from '@/lib/supabase';

export default function SettingsTab() {
  const qc = useQueryClient();
  return (
    <SettingsScreen
      onSignOut={async () => {
        const { error } = await getSupabase().auth.signOut();
        if (error) throw error;
        qc.clear();
      }}
    />
  );
}
```

- [ ] **Step 4: Run the tests, the typecheck and a bundle**

Run: `npm test -w mobile -- tests/components/settings.test.tsx`
Expected: PASS, `Tests: 6 passed, 6 total`.

Run: `npm test -w mobile && npm run typecheck -w mobile`
Expected: `Test Suites: 38 passed, 38 total`, `Tests: 301 passed, 301 total`; typecheck exit code 0.

Run: `cd mobile && CI=1 npx expo export --platform android --output-dir ../.superpowers/expo-export-check; cd ..`
Expected: `Android Bundled ...` (about 1,370 modules) and `Exported: ../.superpowers/expo-export-check`.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/profile/SettingsForm.tsx mobile/src/components/settings/SettingsScreen.tsx "mobile/src/app/(tabs)/settings.tsx" mobile/tests/components/settings.test.tsx
git commit -m "feat(mobile): settings with CV, Gmail, preferences, apply mode, threshold, daily cap and sign out

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 16: Docs (README, phone checklist, EAS profile) and final verification

**Files:**
- Modify: `README.md`
- Create: `docs/phase5-manual-checklist.md`
- Create: `mobile/eas.json`

**Interfaces:**
- Consumes: everything above.
- Produces: setup and run instructions for the phone, the manual checklist, and an EAS `preview` profile that builds an installable APK later (once the API is deployed).

- [ ] **Step 1: Update the README**

In `README.md`, in Setup step 4, replace

```markdown
This is an npm workspace (`server`, `web`, `packages/shared`); the install also builds the shared package.
```

with

```markdown
This is an npm workspace (`server`, `web`, `mobile`, `packages/shared`); the install also builds the shared package.
```

Then insert this section directly before the line `## Getting a test token (API only, without the web app)`:

```markdown
## Mobile app (Phase 5)

An Android-first Expo app in `mobile/` (Expo SDK 58, Expo Router, React Native 0.88) with the same functions as the web dashboard: sign-in, the queue (search, All / 90%+ / Recent, Follow-ups, Add a job link, pull to refresh), job detail (approve, send by email, skip, assisted apply with PDF share), tracker, analytics, settings with Gmail, and onboarding with CV upload. It talks only to the Express API with your Supabase access token; Supabase JS is used only to sign in and refresh the session, which is kept in the phone's SecureStore. Nothing is sent without your tap, except under the existing Auto-mode rules on the server.

- **Configure:** copy `mobile/.env.example` to `mobile/.env` and set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_API_URL=http://<your PC's Wi-Fi IP>:4000` (not `localhost`; the phone is another device). Only these three public values go into the app.
- **Run on your phone:** install Expo Go from the Play Store, put the phone on the same Wi-Fi as the PC, run `npm run dev:server` and `npm run dev:mobile`, then scan the QR code with Expo Go. Windows must allow inbound TCP 4000 (and 8081 for the Metro bundler) on your private network; see `docs/phase5-manual-checklist.md`.
- **Gmail from the phone:** Settings, Connect Gmail opens Google in an in-app browser and the API sends you back to `joblume://gmail-return`. Google only accepts `http://localhost` or an https address as `GMAIL_REDIRECT_URI`, so while the API runs on your PC connect Gmail once from the web app on the PC; the phone then shows it connected (the connection belongs to your account, not the device).
- **Standalone APK (later):** `mobile/eas.json` has a `preview` profile that builds an APK with EAS Build. It needs a deployed https API first (out of scope for this phase); the steps are in the checklist.
- **Tests:** `npm test -w mobile` (Jest with jest-expo and React Native Testing Library, fakes only) and `npm run typecheck -w mobile`.
- **React version:** the repo-root override pins React `19.3.1`; Expo SDK 58 lists `19.3.0`. `mobile/package.json` excludes `react` and `react-dom` from `expo install --check`, and React Native 0.88 accepts `^19.3.0`, so there is one React for all workspaces.
- **Test it:** work through `docs/phase5-manual-checklist.md` on a real phone.

```

- [ ] **Step 2: Write the manual checklist**

Create `docs/phase5-manual-checklist.md`:

````markdown
# Phase 5 manual checklist (Android phone)

The automated tests use fakes only. This checklist runs the app on a real Android phone in Expo Go against the API on your PC and your real Supabase project. Use a second email address you own as the recipient for any sending test.

## Setup on the PC
- [ ] Find the PC's Wi-Fi address: open PowerShell and run `ipconfig`. Under "Wireless LAN adapter Wi-Fi" read "IPv4 Address", for example `192.168.1.20`. (Not the `vEthernet`/WSL adapter, and not `127.0.0.1`.) The address can change when the router restarts; check it again if the phone stops connecting.
- [ ] Allow the phone to reach the PC. In an **administrator** PowerShell run:
  `New-NetFirewallRule -DisplayName "JobLume API 4000" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private`
  and `New-NetFirewallRule -DisplayName "Expo Metro 8081" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow -Profile Private`.
  In Settings, Network & internet, Wi-Fi, your network, make sure the network profile is **Private** (the rules only apply there). Remove them later with `Remove-NetFirewallRule -DisplayName "JobLume API 4000"` and `Remove-NetFirewallRule -DisplayName "Expo Metro 8081"`.
- [ ] Copy `mobile/.env.example` to `mobile/.env` and fill in `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the same public values as `web/.env.local`) and `EXPO_PUBLIC_API_URL=http://<IPv4 Address>:4000`.
- [ ] Run `npm install`, then `npm run dev:server` in one terminal.
- [ ] On the phone's browser open `http://<IPv4 Address>:4000/health` and see `{"ok":true}`. If it does not load, fix the firewall or Wi-Fi before going on.

## Expo Go
- [ ] Install **Expo Go** from the Google Play Store. The phone and the PC must be on the same Wi-Fi (not a guest network that isolates devices).
- [ ] In a second terminal run `npm run dev:mobile`. A QR code appears. In Expo Go tap "Scan QR code" and scan it. The first bundle takes a minute.
- [ ] If Expo Go cannot connect, stop the command and run `cd mobile && npx expo start --lan` (or `--tunnel` as a last resort; the API address in `mobile/.env` must still be reachable from the phone).
- [ ] After changing `mobile/.env`, stop `dev:mobile` and start it again with `cd mobile && npx expo start --clear` so the new values are built in.

## Sign-in and gate
- [ ] The app opens on the JobLume sign-in screen. Wrong password shows Supabase's message; a valid account opens the Queue tab.
- [ ] Close Expo Go completely and open the app again: you are still signed in (the session is in SecureStore).
- [ ] A brand-new account (Create account) with email confirmation off lands on onboarding.

## Onboarding
- [ ] Step 1: Choose your CV opens the phone's file picker; a PNG is refused with "Upload a PDF or DOCX file."; a real PDF uploads and moves to step 2.
- [ ] Step 2: saving without a role says "Add at least one role you are looking for."; with roles it moves to step 3, and "Go to my queue" opens the Queue.

## Queue
- [ ] The welcome line shows your email; In Queue and High Match counts match the web.
- [ ] Search narrows the cards; 90%+ shows only scores of 90 and above; Recent shows the last 7 days.
- [ ] Pending, Ready, Skipped and Follow-ups segments match the web's tabs.
- [ ] Pull down to refresh: the spinner shows and the list reloads.
- [ ] Add a job link: a Glassdoor link is refused locally; a LinkedIn job link shows "We are reading the job now" and appears in the recent list.
- [ ] Turn on airplane mode and pull to refresh or reopen the tab: "Cannot reach the server. Check your connection and try again." with Try again. Turn it off and tap Try again.

## Job detail
- [ ] Details opens the job with the match ring, source and status badges, missing keywords, the CV and the cover letter.
- [ ] Edit the cover letter: Approve & Apply is disabled until you tap Save changes.
- [ ] Approve & Apply shows Send by email and the employer's-site panel. Nothing is sent yet.
- [ ] Send to your second address only after tapping Send application. The screen closes; the second inbox gets the email with the CV PDF.
- [ ] A guessed address keeps Send disabled until "Send to this guessed address" is ticked.
- [ ] Open job posting opens the phone's browser. Share CV PDF opens the Android share sheet with a PDF named `CV - <role> - <company>.pdf`. Copy cover letter says "Copied." and pasting elsewhere shows the letter.
- [ ] Mark as applied moves the card to Applied in the Tracker. Skip moves it to Skipped; Restore brings it back.

## Tracker and Analytics
- [ ] Tracker shows Total, Applied, Interviews and Offers, the status tabs and the cards. "Search companies" filters by company.
- [ ] The ⋮ button opens "Move to"; choosing Interviewing moves the card (and the web board shows the same).
- [ ] Analytics shows the same totals, response rate and average match as the web, and a bar per status.

## Settings and Gmail
- [ ] Replace the CV, change roles and location, switch Apply mode to Auto with a threshold and a daily cap (21 is refused), and save; reloading the web Settings shows the same values.
- [ ] Gmail with the API on your PC: connect Gmail once from the **web** Settings on the PC (Google accepts `http://localhost:4000/gmail/callback` there). The phone's Gmail card then shows "Connected as <address>" after a pull or reopening Settings. Disconnect on the phone works.
- [ ] Gmail from the phone (needs the API on an https address registered as `GMAIL_REDIRECT_URI`, so a deployed API or an https tunnel): Connect Gmail opens Google in the in-app browser. In a standalone APK you come back to Settings with "Gmail connected."; in Expo Go the `joblume://` link cannot open the app, so close the browser tab and the card refreshes to "Connected as ...".
- [ ] Sign out returns to the sign-in screen, and the queue of the next account shows none of the previous account's data.

## Safety
- [ ] Nothing was sent at any point without your tap on Send application or Send follow-up (except Auto mode, which follows the server's existing rules).
- [ ] `mobile/.env` is not in `git status`, and the only variables in it are the three `EXPO_PUBLIC_` values.

## Standalone APK with EAS Build (later, once the API is deployed)
- [ ] Deploy the API on an https address (see Deploying), set its `GMAIL_REDIRECT_URI` to `https://<api>/gmail/callback` and add that URI in the Google Cloud OAuth client.
- [ ] Install the CLI and sign in: `npm install -g eas-cli` then `eas login` (a free Expo account).
- [ ] From `mobile/`, link the project once: `eas init` (it writes the project id into `app.json`; commit that change).
- [ ] Set the public values for the build: `eas env:create --name EXPO_PUBLIC_API_URL --value https://<api> --environment preview --visibility plaintext`, and the same for `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] Build: `eas build --platform android --profile preview`. EAS installs from the repo root (npm workspaces), runs the `postinstall` that builds `@joblume/shared`, and prints a link to the `.apk` when done.
- [ ] Open the link on the phone, install the APK (allow "install unknown apps" for the browser), sign in, and repeat the Gmail-from-the-phone check: it returns to Settings with "Gmail connected.".
````

- [ ] **Step 3: Add the EAS profile**

Create `mobile/eas.json`:

```json
{
  "cli": { "version": ">= 25.0.0", "appVersionSource": "local" },
  "build": {
    "preview": {
      "distribution": "internal",
      "environment": "preview",
      "android": { "buildType": "apk" }
    },
    "production": {
      "environment": "production",
      "android": { "buildType": "app-bundle" }
    }
  }
}
```

- [ ] **Step 4: Final verification**

Run: `npm test`
Expected: every workspace passes: `@joblume/shared` (Vitest, including `tests/gmail.test.ts`), `server` (Vitest, including the new Gmail return tests), `web` (Vitest, unchanged) and `mobile` (`Test Suites: 38 passed, 38 total`, `Tests: 301 passed, 301 total`).

Run: `npm run typecheck`
Expected: exit code 0 for every workspace.

Run: `cd mobile && CI=1 npx expo export --platform android --output-dir ../.superpowers/expo-export-check && CI=1 npx expo install --check; cd ..`
Expected: `Exported: ../.superpowers/expo-export-check`, then `Dependencies are up to date`.

Run: `git status --short`
Expected: only the three files of this task, plus `?? "Joblume images/"`. No `mobile/.env`, `.expo/`, `expo-env.d.ts` or export output appears.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/phase5-manual-checklist.md mobile/eas.json
git commit -m "docs(mobile): phone setup, Phase 5 manual checklist (LAN IP, firewall, Expo Go, EAS APK) and EAS profile

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
