# Phase 2 manual checklist

Run this once against your real Supabase project, server and web app. Automated tests cover the logic; only this checklist exercises real sign-in, real data and real browsers.

Setup: `npm install`, fill `.env` and `web/.env.local`, run `npm run dev`, open http://localhost:3000.

## Sign-in
- [ ] Visiting `/queue` while signed out redirects to `/login`.
- [ ] A wrong password shows an inline error and does not sign you in.
- [ ] Short password or bad email shows the validation message and sends nothing.
- [ ] Create account works (or tells you to confirm your email, depending on your Supabase setting).
- [ ] Signing in lands you on `/queue` (or `/onboarding` for a brand-new account).
- [ ] Visiting `/login` while signed in redirects away from it.
- [ ] Sign out, then sign in as a second user: nothing from the first user appears.
- [ ] Sign out returns to `/login`, and the browser Back button does not show the app.

## Onboarding
- [ ] A new account is sent to `/onboarding` from any page.
- [ ] A `.txt` file and a file over 5 MB are rejected with a clear message.
- [ ] A scanned (image-only) PDF shows the "could not read enough text" message.
- [ ] A real PDF and a real DOCX each upload and move you to step 2.
- [ ] Step 2 requires at least one role; a one-letter role and a salary range the wrong way round show messages.
- [ ] Finishing lands you on `/queue`, and the onboarding page is not forced again.

## Queue
- [ ] Within a few minutes of onboarding, cards appear with score, source, missing keywords and previews.
- [ ] "View posting" opens the job in a new tab.
- [ ] Opening a card shows the full tailored CV and cover letter and a working "Download CV PDF".
- [ ] Editing only the cover letter and saving works; the PDF is unchanged.
- [ ] Editing the CV and saving rebuilds the PDF (download it and check the change).
- [ ] A CV shorter than 50 characters or an empty cover letter is blocked with a message.
- [ ] Edit the cover letter without saving: Approve & Apply is disabled with a hint; after saving, approve, Copy, and the pasted text includes your edit.
- [ ] **Approve & Apply** moves the card to the "Ready to apply" tab and shows the apply panel.
- [ ] "Open job link", "Download CV PDF" and "Copy cover letter" (paste it somewhere to check) work.
- [ ] "Mark as applied" closes the panel and the card appears in Applied on the Tracker.
- [ ] **Skip** moves a card to the Skipped tab; **Restore** brings it back.
- [ ] "Check for new jobs" confirms it started; pressing it a fourth time within an hour shows the "too often" message.
- [ ] Open the tailored CV and compare it with your real CV: no employer, date, qualification or skill that you do not have.

## Tracker
- [ ] Columns show Pending Review, Applied, Interviewing, Rejected, Offer with correct counts; ready-to-apply cards sit in Pending Review with a badge.
- [ ] Dragging a card to another column moves it immediately and it stays after a page refresh.
- [ ] Stop the server, drag a card: it snaps back and an error message appears. Restart the server afterwards.
- [ ] Tab to a card title and press Enter: the detail opens.
- [ ] Clicking a card opens the same detail view; the "Move to" menu changes its column.
- [ ] Moving a card back to Pending Review clears its applied date.

## Analytics
- [ ] Before any application exists, an empty state is shown.
- [ ] Totals, applied count, response rate and average score match what you see on the Tracker.
- [ ] The status bar shows only statuses that have cards.

## Settings
- [ ] Replacing the CV works and shows the same error messages as onboarding.
- [ ] Preferences save and "Saved." appears; reloading shows the saved values.
- [ ] A daily cap of 21 and a threshold of 101 are rejected.
- [ ] Switching to Auto and saving works, and the note says it only stores the preference.

## Layout and safety
- [ ] At phone width (browser dev tools) the sidebar becomes a menu and nothing scrolls sideways except the Kanban board.
- [ ] No console errors during normal use.
- [ ] The page source and network tab never contain the Supabase service-role key.
