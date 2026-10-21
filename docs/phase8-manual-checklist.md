# Phase 8 manual checklist (autofill extension)

The automated tests use fakes and saved copies of real forms. This checklist uses your real Supabase project, Chrome and live job pages. You do not need to be technical: tick each box as you go. Nothing here submits an application unless you press Submit yourself, so use a posting you do not mind opening.

## Before starting (do these in order)
- [ ] **Update the database first.** Open your Supabase project, go to the SQL editor and run any of `supabase/migrations/0005_contacts.sql` and `0006_workingnomads.sql` you have not run yet, then paste the whole of `supabase/migrations/0007_contact_profile.sql` and run it. Each must finish without errors. Do this BEFORE you start or restart the server.
- [ ] In Table editor check that `profiles` now has the columns `phone`, `city`, `linkedin_url`, `github_url` and `portfolio_url`.
- [ ] Run `npm install`, then `npm run dev` (server and web).
- [ ] Run `npm run build:extension`. It must finish with "Built ...extension\dist". If you use JobLume at a web address (not localhost), follow `docs/extension-setup.md` step 2 first (set `EXTENSION_JOBLUME_ORIGINS` and `EXTENSION_STORAGE_HOST`).

## Settings (web and phone app)
- [ ] Web: Settings shows a card "Contact details for application forms". Enter your full name, phone, city and links, press **Save contact details**: it says "Saved." Reload: the values are still there.
- [ ] A link that starts with `http://` is refused with a message; a phone with letters is refused.
- [ ] Phone app: the same section appears in Settings with the same boxes and saves the same way.
- [ ] Clearing a box and saving removes it.

## Load the extension (Chrome, Edge or Brave)
- [ ] Open `chrome://extensions` and switch on **Developer mode**.
- [ ] Press **Load unpacked** and choose the `extension\dist` folder. A card "JobLume Autofill" appears with no red "Errors" button.
- [ ] Reload the JobLume web page and open an application in the "apply on the employer's site" panel: the button **Fill the form with the JobLume extension** is visible. (With the extension switched off at `chrome://extensions` it is replaced by an "Install the extension" link.)
- [ ] The toolbar icon opens a small popup that says nothing is waiting, with a **Setup help** link.

## Try each platform on a real posting
For each platform, open a real, public job in JobLume's queue if you have one, or any public posting you like. Open its application in JobLume and press the button. The job opens in a new tab.

- [ ] **Greenhouse** (`job-boards.greenhouse.io` or `boards.greenhouse.io`): first name, last name, email, phone and your LinkedIn answer are filled; the CV is attached under Resume/CV; the cover letter is attached as `cover-letter.txt`. The country box, custom questions and every "Voluntary Self-Identification" box are empty. Nothing was submitted. Verified against a saved real form.
- [ ] **Lever** (`jobs.lever.co/.../apply`): full name, email, phone, current location, the LinkedIn, GitHub and portfolio boxes are filled; the CV is attached. "Current company", the demographic questions and the consent tick box are untouched. The location box may show suggestions: pick one if the page asks. Verified against saved real forms.
- [ ] **Ashby** (`jobs.ashbyhq.com/.../application`): name, email and the LinkedIn question are filled; the CV is attached to the Resume box (not the "autofill from resume" button at the top). Location, yes/no questions and essay answers are untouched. Verified against a saved copy of one live rendered page only. If you land on the job description first, click **Application** yourself: the extension tries again when the page changes.
- [ ] **Workable** (`apply.workable.com/.../apply/`): first name, last name, email, the cover letter box, the CV and the LinkedIn and GitHub questions are filled. Summary, salary, notice period and yes/no questions are untouched. Phone and city are **UNVERIFIED against a live form** (the posting we saved had no phone box): note whether your posting has those boxes and whether they were filled.
- [ ] On every platform a banner appears: "JobLume filled N fields. Review every answer, then submit yourself." It can be dismissed with the x. Filled boxes have a light blue outline.
- [ ] Back in the JobLume tab a green message says how many fields were filled. The application is **not** marked as applied.
- [ ] Type something into a box first, then press the button again from JobLume: that box keeps your text.
- [ ] The toolbar popup, opened on the job tab before the fill, says "Ready to fill: <job title> at <company>"; after the fill it says nothing is waiting. **Clear** removes a waiting fill.
- [ ] Close the job tab before the form appears, then open the same job by hand: nothing is filled (the data was forgotten).
- [ ] A job whose link starts with `http://` shows a message instead of opening (the extension only accepts `https`).
- [ ] A Workday, iCIMS or SmartRecruiters posting: nothing is filled and nothing breaks (not covered).

## Safety spot checks
- [ ] Open a job from JobLume, then in the same tab go to a different company's posting on the same platform (for example change the company in the address): nothing is filled there and the popup still shows the original job waiting (until it expires or you clear it).
- [ ] Attaching the CV uploads it to the employer's form before you press Submit: check the company on the page before pressing the button in JobLume.
- [ ] The signed CV link is not strictly single use on the server (valid for about an hour); do not share it. A localhost build trusts any local app on port 3000 (low impact); the build prints a warning for it.
- [ ] On a form with a "Gender", "Race", "Veteran", "Disability", "visa sponsorship", "work authorization", "citizenship", "date of birth", "criminal record", "salary" or "How did you hear about us" box, that box stays empty.
- [ ] No button was clicked for you (the Submit button is still waiting for you).
- [ ] In `chrome://extensions` the card's "Details" page lists site access only for the five employer hosts, your JobLume address and your Supabase host, and the permissions list shows only "storage" (no "Read your browsing history" / tabs permission).

## What to do when a platform changes
Employer sites change their forms from time to time. If a platform stops filling a box that used to work:
1. Open the form in Chrome, right-click the box, choose **Inspect**, and note its `id`, `name` and label text.
2. Compare with the adapter in `extension/src/adapters/<platform>.ts` (the comment at the top says what was seen and when).
3. Save a copy of the new form as a fixture (see `extension/tests/fixtures/`), update the adapter and its test in `extension/tests/adapters/`, run `npm test -w joblume-extension`, rebuild and press the reload arrow on the extension's card at `chrome://extensions`.
4. Until then, fill that platform's form by hand with the existing "Open job link", "Download CV PDF" and "Copy cover letter" steps. They are unchanged.

## Not verified from the build machine
- The extension has not been loaded into a real Chrome by the developer who built it. Chrome accepting the manifest (including the `http://localhost:3000/*` pattern and `all_frames`) is checked by you in the "Load unpacked" box above.
- The Workable phone and city boxes and the Lever and Ashby cover letter boxes were not present in the saved forms; they use documented field names and label search only.
