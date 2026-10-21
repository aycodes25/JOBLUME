# JobLume Autofill extension: setup

The extension fills the standard fields of employer application forms from the details in JobLume: name, email, phone, city, LinkedIn, GitHub and website links, your tailored CV and your cover letter. It works on Greenhouse, Lever, Ashby and Workable forms in Chrome, Edge and Brave on a computer. **It never submits anything.** You review every answer and press Submit yourself.

It never fills custom questions, passwords, or anything about gender, race, ethnicity, veterans, disability, visa or work authorization, citizenship, pronouns, sexual orientation, age or date of birth, criminal history, religion, ID numbers, salary or referrals, and it never overwrites a box that already has text.

## 0. Update the database first
In your Supabase project open the SQL editor and run, in this order, any of these you have not run yet: `supabase/migrations/0005_contacts.sql`, `0006_workingnomads.sql`, and then `0007_contact_profile.sql` (paste the whole file and run it). Do this before starting the server.

## 1. Fill in your contact details
Open JobLume, go to **Settings**, and complete **Contact details for application forms** (full name, phone, city and links; links must start with `https://`). Save.

## 2. Build the extension
From the JobLume folder, in a terminal:

```bash
npm install
npm run build:extension
```

This creates the folder `extension/dist`. (It is rebuilt from scratch every time and is not stored in git.)

### Tell the extension where your JobLume lives
By default it only trusts `http://localhost:3000` (the app on your own computer) and allows the CV to be downloaded from any `*.supabase.co` host (the build prints a warning about this). Trusting `localhost` also means any local app running on port 3000 on your computer could ask the extension to open a job and fill it; the impact is low, but the build warns about it and you should leave `localhost` out of builds you use for real applications once your app has a web address. When you use the app at a web address, set both values before building:

```powershell
# PowerShell (Windows)
$env:EXTENSION_JOBLUME_ORIGINS = "https://your-app.vercel.app,http://localhost:3000"
$env:EXTENSION_STORAGE_HOST = "abcd1234.supabase.co"
npm run build:extension
```

```bash
# Git Bash, macOS or Linux
EXTENSION_JOBLUME_ORIGINS="https://your-app.vercel.app,http://localhost:3000" EXTENSION_STORAGE_HOST="abcd1234.supabase.co" npm run build:extension
```

- `EXTENSION_JOBLUME_ORIGINS`: the address(es) of your JobLume web app, comma separated, no path and no trailing slash. Add your deployed address here later, then build again. Only `https` addresses are accepted, apart from `localhost`.
- `EXTENSION_STORAGE_HOST`: the host name of your Supabase project, with no `https://` and no path. Take it from the `SUPABASE_URL` line of your `.env` file: if it is `https://abcd1234.supabase.co`, the value is `abcd1234.supabase.co`. Copy only that one line; never paste or share the keys in the same file (the service-role key is a secret). The CV is only downloaded from this host.

These values only last for the current terminal window. After changing either one, build again and press the reload arrow on the extension's card at `chrome://extensions`.

## 3. Load it into the browser
1. Open `chrome://extensions` (in Edge `edge://extensions`, in Brave `brave://extensions`).
2. Switch on **Developer mode** (top right).
3. Press **Load unpacked** and choose the `extension\dist` folder inside the JobLume folder.
4. Optional: pin the JobLume Autofill icon from the puzzle-piece menu.

## 4. Use it
1. In JobLume open an application whose email is missing (the "apply on the employer's site" panel).
2. Press **Fill the form with the JobLume extension**. If you see "Install the extension" instead, the extension is not installed, is switched off, or does not trust this address (see step 2).
3. The job opens in a new tab. If it leads to a Greenhouse, Lever, Ashby or Workable form, the extension fills it after a moment and shows a banner: "JobLume filled N fields. Review every answer, then submit yourself."
4. Check every answer, answer the custom questions yourself, then submit on the employer's site.
5. Back in JobLume press **Mark as applied**. The extension never does this for you.

The extension remembers what to fill for 30 minutes, only in the tab it opened, and forgets it after a fill or when the tab closes. The form is only filled for the job the extension opened, and for the same company: if you move that tab to another employer's posting, nothing is filled there. (When the job is on the employer's own website, the extension fills the first Greenhouse, Lever, Ashby or Workable form that tab reaches and then sticks to that company.)

**Before you press Submit:** attaching the CV uploads the file to the employer's form straight away, not when you submit. Check the page is the right company before the extension finishes, and remove the file yourself if you do not want to apply. The toolbar icon shows what is waiting in the current tab and has a **Clear** button.

## Honest limits
- The extension has not been loaded into a real Chrome by the person who built it. Follow `docs/phase8-manual-checklist.md` and report anything that fails.
- Greenhouse and Lever were checked against saved copies of real forms. Ashby and Workable were each checked against a single live posting.
- On Workable the phone and city boxes are unverified against a live form (the posting we checked had neither); they may stay empty.
- Employer sites change their markup. When that happens an adapter can stop filling a box until it is updated.
- Workday, iCIMS, SmartRecruiters and employers' own custom forms are not covered; the extension does nothing there.
- It is loaded unpacked, not installed from the Chrome Web Store.

## When something does not work
- **No button in JobLume:** reload the page; check the build used your app's address (`EXTENSION_JOBLUME_ORIGINS`); check the extension is switched on at `chrome://extensions`.
- **Nothing is filled:** the page may not be one of the four supported forms (many "Apply" links go to Workday, iCIMS and others, which are not covered). Open the form's own page and wait up to 15 seconds.
- **Some boxes stay empty:** the form may have changed its markup, or the box is a custom question. Fill those yourself. If a whole platform stops working, see "What to do when a platform changes" in `docs/phase8-manual-checklist.md`.
- **The CV was not attached:** the signed CV link lasts one hour; press the button again from JobLume. Note the link is not strictly single use on the server: anyone who holds it can download your CV for about an hour. The extension itself fetches it only once.
