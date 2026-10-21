# Phase 7 manual checklist (reaching the employer)

The automated tests use fakes only. This checklist uses your real Supabase project and worker. You do not need to be technical: tick each box as you go.

## Before starting (do these in order)
- [ ] **Update the database first.** Open your Supabase project, go to the SQL editor, paste the whole of `supabase/migrations/0005_contacts.sql` and run it. It must finish without errors.
- [ ] Do the same with `supabase/migrations/0006_workingnomads.sql`. Do both BEFORE you start or restart the server or worker. The worker reads `applications.whatsapp_number`, and without 0006 every Working Nomads job fails to save.
- [ ] Also run `supabase/migrations/0008_jsearch_source.sql` (it lets jobs with source `jsearch` save). Run it BEFORE restarting the worker, or JSearch jobs with a direct employer link fail to save.
- [ ] In Table editor check that `applications` has a `whatsapp_number` column.
- [ ] Run `npm install` and then `npm run dev:server`.

## Fill in contacts for applications you already have
- [ ] Make sure your `.env` file is complete (the same one the server uses, with the Supabase URL and service-role key).
- [ ] Run `npm run backfill:contacts -w server -- --dry`. It only prints what it would do and changes nothing. Read the numbers it prints.
- [ ] If they look sensible, run `npm run backfill:contacts -w server` (the same command without `--dry`).
- [ ] It only fills applications that are waiting for review and have no email yet, or only a guessed one. It never replaces an address from the posting, Hunter or one you typed, and it never touches applications you already sent.

## In the app
- [ ] A card for a job that printed an email shows the "Email" apply badge; one with only a WhatsApp number shows "WhatsApp"; otherwise "Site".
- [ ] The "Has email" filter keeps only email cards.
- [ ] On a WhatsApp application the WhatsApp button opens a chat with the start of the cover letter filled in. Nothing is sent until you press send in WhatsApp.
- [ ] A cover letter with emoji near the 300th character still opens WhatsApp (no error page).

## After a restart
- [ ] When the worker starts, any source that has not scanned recently gets one extra scan. A source whose own scheduled scan is due within about five minutes is skipped.

## JSearch: which jobs are kept
JobLume keeps a JSearch result in two cases:
- **LinkedIn or Indeed:** the publisher is LinkedIn or Indeed and the link is that site's own job page (source `linkedin` / `indeed`, as before).
- **Direct employer link:** any other publisher, when JSearch marks an application link as direct (the first `apply_options` entry with `is_direct: true`, else `job_apply_link` when `job_apply_is_direct` is true) and that link is `https`, is not on LinkedIn or Indeed, and is not a known aggregator (JobLeads, Jobright, Glassdoor, ZipRecruiter, Jooble, Adzuna, Talent.com, Careerjet, Neuvoo, Learn4Good, bebee). These jobs get source `jsearch` and show the label "Employer link (JSearch)". The job link is the employer's own page.
- Everything else is dropped. Auto mode never sends `jsearch` jobs (you apply yourself, like LinkedIn and Indeed).
- [ ] Run `npm run diag:jsearch -w server -- "full stack developer remote"` (uses one request). The last line shows how many would be kept per category: linkedin, indeed, jsearch-direct, dropped. If jsearch-direct is 0 for every query, JSearch is not marking any link as direct for your searches.

## Troubleshooting JSearch
If a JSearch scan shows "failed", the scan status line now says why. Test the connection from your PC in PowerShell:

```
Test-NetConnection jsearch.p.rapidapi.com -Port 443
nslookup jsearch.p.rapidapi.com
```

`TcpTestSucceeded : True` and an address from nslookup mean the network is fine. The reasons mean:
- **Could not find the site's address (DNS)** (`network_dns`): your PC cannot look up jsearch.p.rapidapi.com. Check the internet, try another DNS (for example 1.1.1.1 or 8.8.8.8), or turn off a VPN or filter.
- **The site refused the connection** (`network_refused`): something answered but would not accept it, usually a firewall or proxy.
- **The connection was cut off** (`network_reset`): the connection dropped part way, often a firewall, antivirus or flaky network.
- **The connection timed out** (`network_timeout`): nothing came back in time. Port 443 may be blocked, or the network is very slow.
- **Secure connection failed** (`network_tls`): the secure (HTTPS) check failed. Antivirus HTTPS scanning or a company proxy is the usual cause; also check the PC date and time.
- **Could not reach the site** (`network`): a network error with no known code. The worker log has a line "JSearch could not be reached" with the full cause (no key).
- **JSearch says that request was not found** (`jsearch_http_404`) or **JSearch answered with an error (NNN)** (`jsearch_http_NNN`): JSearch was reached and answered with that HTTP status. A 404 means the request path or your subscription is wrong; it is not a network problem, so the DNS and port tests above will pass. The worker log line "JSearch answered with an error status" shows the status, the request path and the first 200 characters of the reply (never the key).
- **The JSearch address this app uses no longer exists** (`jsearch_endpoint_missing`): a 404 whose reply says the endpoint "does not exist". JSearch removed the old `/search` address (RapidAPI answers `Endpoint '/search' does not exist`). JobLume now uses `/search-v2` by default. If you see this reason, you are on the old path (`JSEARCH_SEARCH_PATH=/search`) or the provider no longer offers the path you chose. Other 404s stay `jsearch_http_404` (wrong subscription or request).
- **JSearch refused the API key** means the key reached JSearch but was rejected: check the key and that you subscribed to the JSearch API on RapidAPI.

### Two ways to get a JSearch key
JSearch is run by OpenWeb Ninja (formerly Letscrape) and is sold in two places. The key only works with the provider it came from:
- **RapidAPI** (default): open the JSearch API on rapidapi.com, subscribe your app to a plan (Basic is the free one), and copy the app's `X-RapidAPI-Key`. Use `JSEARCH_PROVIDER=rapidapi` (or leave it unset). The worker calls `https://jsearch.p.rapidapi.com/search` with the `x-rapidapi-key` and `x-rapidapi-host` headers.
- **OpenWeb Ninja**: create an account on openwebninja.com, subscribe to JSearch and copy the API key from the developer portal. Set `JSEARCH_PROVIDER=openwebninja`. The worker then calls `https://api.openwebninja.com/jsearch/search` with an `x-api-key` header. Unverified: the URL path (it answers 401 to an unknown key) and the `x-api-key` header (shown in OpenWeb Ninja's own sample) are confirmed, but the exact query parameters and response fields of that `/search` endpoint could not be checked against its docs (the docs show a newer `/search-v2`). If it fails, read the status in the scan line and the worker log, then switch back.

Check the RapidAPI subscription: on rapidapi.com open the JSearch API, go to Pricing and confirm your plan (Basic) shows as "Subscribed" for the same app whose key you pasted (My Apps, then the app, then Authorization). A key from an app that is not subscribed to JSearch, or a key from OpenWeb Ninja used with `JSEARCH_PROVIDER=rapidapi` (or the reverse), gives a 401, 403 or 404.

### The JSearch address change (legacy /search to /search-v2)
OpenWeb Ninja's docs call `/search` legacy and list `GET https://api.openwebninja.com/jsearch/search-v2` (header `x-api-key`) as current. `/search-v2` has no `page` parameter and returns `data` as an object holding a `jobs` list (the old reply had `data` as the list itself). JobLume reads both shapes and sends `page` only on the legacy path.

Settings in `server/.env`:
- `JSEARCH_SEARCH_PATH=/search-v2` (default) or `/search` (legacy).
- `JSEARCH_PROVIDER=rapidapi` (default) or `openwebninja`. A key from app.openwebninja.com goes with `JSEARCH_PROVIDER=openwebninja`; a key from rapidapi.com goes with `rapidapi`. They are not interchangeable.

Test one request from your PC (uses one request of the monthly allowance, saves nothing, never prints the key):
```
npm run diag:jsearch -w server -- --path=/search-v2
npm run diag:jsearch -w server -- --path=/search-v2 --provider=openwebninja
npm run diag:jsearch -w server -- --path=/search
```
It prints the provider, the path used, the HTTP outcome, the results summary, the field names of the first result and, for a v2 reply, the field names of the reply's `data` object (names only, never job text).

**Unverified:** (1) whether the RapidAPI listing exposes `/search-v2` at all. Only the OpenWeb Ninja docs describe it; run the first command above to find out, and if RapidAPI answers 404 "does not exist" for `/search-v2`, use an OpenWeb Ninja key with `JSEARCH_PROVIDER=openwebninja`. (2) The name of the pagination cursor field inside `data`. JobLume only fetches the first page and does not use a cursor, so nothing depends on it; the diag output will show its name.

Restarting `npm run dev` retries a failed source after 10 minutes (a refused key is not retried until its normal interval).
