# Phase 5 manual checklist (Android phone)

The automated tests use fakes only. This checklist runs the app on a real Android phone in Expo Go against the API on your PC and your real Supabase project. Use a second email address you own as the recipient for any sending test.

## Known limits (read first)
- **Gmail connect from the phone cannot finish while the API runs on your PC.** Google only accepts `http://localhost` or an https address as the redirect (`GMAIL_REDIRECT_URI`). After you approve on Google, it redirects to `http://localhost:4000/gmail/callback` on the *phone*, where nothing is listening. Workaround: connect Gmail once from the **web** Settings on the PC. The connection is stored on the server against your account, so the phone shows it as connected and sending works from the phone.
- Expo Go cannot open `joblume://` links, so the return deep link only works in a standalone build. The app refreshes the Gmail status whenever the in-app browser closes.
- A **standalone APK** needs a deployed https API: an APK on your phone cannot reach `http://<PC IP>:4000` reliably, and the Gmail return flow needs https. See the last section.

## Setup on the PC
- [ ] Find the PC's Wi-Fi address: open PowerShell and run `ipconfig`. Under "Wireless LAN adapter Wi-Fi" read "IPv4 Address". That is the address you use below as `http://<your-pc-wifi-ip>:4000` (it is also the address Expo prints after `Metro: exp://`). (Not the `vEthernet`/WSL adapter, and not `127.0.0.1`.) The address can change when the router restarts; check it again if the phone stops connecting.
- [ ] Allow the phone to reach the PC. In an **administrator** PowerShell run:
  `New-NetFirewallRule -DisplayName "JobLume API 4000" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private`
  and `New-NetFirewallRule -DisplayName "Expo Metro 8081" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow -Profile Private`.
  In Settings, Network & internet, Wi-Fi, your network, make sure the network profile is **Private** (the rules only apply there). Remove them later with `Remove-NetFirewallRule -DisplayName "JobLume API 4000"` and `Remove-NetFirewallRule -DisplayName "Expo Metro 8081"`.
- [ ] Copy `mobile/.env.example` to `mobile/.env` and fill in `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the same public values as `web/.env.local`) and `EXPO_PUBLIC_API_URL=http://<IPv4 Address>:4000`. Never commit this file.
- [ ] Run `npm install`, then `npm run dev:server` in one terminal.
- [ ] On the phone's browser open `http://<IPv4 Address>:4000/health` and see `{"ok":true}`. If it does not load, fix the firewall or Wi-Fi before going on.

## Expo Go
- [ ] Install **Expo Go** from the Google Play Store. This app targets **Expo SDK 57**, so use an Expo Go that supports SDK 57 (Expo Go 57.x). The phone and the PC must be on the same Wi-Fi (not a guest network that isolates devices).
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
