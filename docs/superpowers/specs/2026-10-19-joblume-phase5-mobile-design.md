# Joblume Phase 5: Expo mobile app

## 1. Goal
An Android-first Expo app with the same functions as the web dashboard, following the two Visily mobile mockups (`Joblume images/visily-mobile-home.jpg`, `visily-mobile-tracker.jpg`) and the web screens for the rest. Nothing sends without the user's tap on Send / Approve & Apply, except under the existing Auto-mode rules (server-side, unchanged).

## 2. Decisions
| Topic | Decision |
|---|---|
| Scope | Everything the web has: sign-in, queue, job detail (approve, email send, skip, assisted apply), tracker, analytics, settings (profile, apply mode, Gmail), onboarding with CV upload, follow-ups, paste-a-job-link. |
| Run | Expo Go for development against the PC's Wi-Fi address (`EXPO_PUBLIC_API_URL=http://<pc-lan-ip>:4000`). Standalone APK through EAS Build later; it needs a deployed API (out of scope for this phase). |
| Data access | Through the Express API only, with the Supabase user's access token (same as web). Supabase JS is used only for email+password sign-in and session refresh. |
| Server changes | Minimal: allow the app origin in CORS if needed, and a mobile return path for the Gmail callback (section 5). Nothing else. |
| Out of scope | Push notifications, deploying the API, iOS builds, offline mode, Google sign-in. |

## 3. Structure
- New workspace `mobile/` (Expo SDK current stable, Expo Router, TypeScript strict, React 19 as pinned at the repo root). Root `package.json` adds the workspace and `dev:mobile` (`expo start`).
- `@joblume/shared` supplies types and `canonicalJobUrl`. The mobile app never imports server code. Metro must resolve the monorepo (watchFolders / `unstable_enablePackageExports` as the current Expo monorepo guide requires).
- State: TanStack Query (same keys and endpoint shapes as `web/src/hooks/api.ts`; copy the API client pattern, do not import from `web`). Session: `expo-secure-store` storage adapter for Supabase.
- Navigation: Expo Router, bottom tabs (Queue, Tracker, Analytics, Settings) as in the mockups; stack screens for job detail and onboarding; auth gate redirecting to `/login` when signed out.
- Styling: the web design tokens (blue primary, light grey background, white rounded cards, pill badges), in a small `theme.ts`; plain React Native components (no UI kit).

## 4. Screens
Login (email+password). Queue (search box, filter chips All / 90%+ / Recent, cards with match badge, source, time, "Add a job link" card, pull-to-refresh, Follow-ups as a segment). Job detail (match ring, keywords, CV preview, cover letter editor, email section with recipient, Find another email, guess confirmation, Send, Skip, Back to pending, assisted-apply panel with open-posting and PDF share, follow-up card). Tracker (status tabs and cards; status change via an action sheet instead of drag and drop). Analytics (KPI cards and status bars from real `/analytics` data only). Settings (profile form, apply mode and threshold, daily cap, Gmail card, sign out). Onboarding (CV upload with `expo-document-picker`, preferences). Only data the API returns is shown.

## 5. Gmail connect from the phone
The server callback currently redirects to `WEB_ORIGIN`. Add an optional `return` target to `POST /gmail/connect` (allow-listed to `joblume://gmail-return`, never an arbitrary URL, kept inside the signed OAuth state) so the callback redirects to `joblume://gmail-return?status=...` when the flow started from the app. The app opens the Google URL with `expo-web-browser` and refreshes Gmail status on return. The Google redirect URI is unchanged.

## 6. Errors and safety
Same plain-language messages as the web (`describeApiError` equivalent). Network failures show a retry state. Tokens only in SecureStore. No secrets in the bundle: only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`. External links open only http(s) URLs.

## 7. Testing
Vitest or Jest (jest-expo) unit tests for pure logic and the API client, with fakes. Component tests with React Native Testing Library for the send flow (no send without tap, guess needs confirmation), the auth gate, and the queue filters. A manual checklist `docs/phase5-manual-checklist.md` for the phone. Server: tests for the allow-listed return target and signed state.
