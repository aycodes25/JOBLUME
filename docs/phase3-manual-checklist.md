# Phase 3 manual checklist

Run this against your real services. Automated tests use fakes; only this checklist exercises Google, Hunter and the real database. Use a **second email address you own** as the recipient, so nothing is sent to a real employer while testing.

## Setup
- [ ] Apply `supabase/migrations/0002_email.sql` in the Supabase SQL editor (run it once; it fails with "already exists" if repeated). Then run: `select column_name from information_schema.columns where table_name = 'applications' and column_name in ('email_source','email_candidates');` and see both rows.
- [ ] Follow `docs/gmail-setup.md`, fill `.env` (and `HUNTER_API_KEY` if you have one), run `npm install` and `npm run dev`.

## Gmail connection
- [ ] Settings shows a Connect Gmail button (not "not set up").
- [ ] Connecting shows the Google warning screen, then returns to Settings with "Gmail connected." and "Connected as <your address>".
- [ ] Reloading Settings still shows it connected, and the address is correct.
- [ ] Disconnect works; Connect again works; in Supabase the `users.gmail_refresh_token_enc` value is long unreadable text, not a token.
- [ ] Connecting with the send permission box unticked shows the "needs permission to send email" message.

## Contact email
- [ ] A newly prepared application gets a contact email shortly after (queue card detail, after Approve & Apply).
- [ ] With a Hunter key: a company Hunter knows shows "Found" with a confidence badge; the same company on a second application does not use another search (check `company_contacts` has one row).
- [ ] Without a key, or for an unknown company, you see "Guess, low confidence" role addresses (careers@, jobs@, hr@, recruitment@) or no address at all.
- [ ] "Find another email" steps through the suggestions, then says there are no more.
- [ ] Typing your own address shows "Entered by you".

## Sending
- [ ] Open an application, click Approve & Apply. The Email section appears above the assisted steps.
- [ ] Type your second address as the recipient and click Send application. The sheet closes and the card is in Applied on the Tracker.
- [ ] In the second inbox: subject is `Application for <role>`, the body is your cover letter, a PDF named `CV - <role>.pdf` is attached and opens, and the sender is your Gmail.
- [ ] Double-clicking Send does not send two emails.
- [ ] A guessed address cannot be sent until the "Send to this guessed address" box is ticked.
- [ ] With unsaved edits in the letter, Send is disabled with "Save your changes first".
- [ ] Set your daily limit to 1 in Settings, send one application, then try a second: it says you reached today's limit. Set it back.
- [ ] In Supabase `email_logs` has one `sent` row with a thread id; `applications` shows `apply_method = email`, the recipient and `follow_up_at` three days ahead.

## Follow-ups
- [ ] In Supabase set the sent application's `follow_up_at` to a time in the past, for example `update applications set follow_up_at = now() - interval '1 minute' where id = '<id>';`
- [ ] Within an hour (the scan runs hourly) a draft appears in the queue's Follow-ups tab, subject `Re: Application for <role>`, British English, mentions the application date.
- [ ] Edit the draft, Save, then Send follow-up. In the second inbox the message arrives in the SAME conversation as the original. If it arrives as a new conversation, note it: Gmail rewrote the message id (see the design notes) and threading needs a follow-up fix.
- [ ] Move another applied card to Interviewing before its draft is sent: sending that draft is refused and the draft disappears.
- [ ] Turn on Auto follow-up, make another application due: its follow-up sends itself after a few seconds, and appears as sent.

## Auto mode
- [ ] Set Apply mode to Auto with a threshold you can meet. For a new application with a Hunter address of confidence 80 or more and a high enough score, the email sends by itself within about 30 seconds and the card becomes Applied with apply method `auto`.
- [ ] An application with a guessed address, a score below the threshold, or a LinkedIn/Indeed source is NOT sent.
- [ ] Applications that were already in your queue before you switched to Auto are not sent.

## Safety
- [ ] The browser never shows a token (check the network tab for `/gmail/status`: only connected and email).
- [ ] A second account cannot see the first account's follow-ups or send its applications.
- [ ] After revoking JobLume at https://myaccount.google.com/permissions, the next send says to reconnect Gmail, and Settings offers Connect Gmail again.
