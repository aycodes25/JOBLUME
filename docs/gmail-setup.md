# Setting up Gmail sending

JobLume sends applications and follow-ups from your own Gmail address. Google needs a one-time setup. It takes about 15 minutes. JobLume only asks for permission to **send** email, never to read it.

## 1. Create a Google Cloud project
1. Go to https://console.cloud.google.com and sign in with the Google account you want to send from.
2. Click the project picker at the top, then **New project**. Name it `JobLume` and click **Create**.

## 2. Turn on the Gmail API
1. Open **APIs & Services**, then **Library**.
2. Search for **Gmail API**, open it and click **Enable**.

## 3. Set up the consent screen
Google calls this the **OAuth consent screen**. In newer consoles it sits under **Google Auth Platform** with Branding, Audience and Data Access pages.
1. Choose **External** as the user type.
2. App name `JobLume`, your email as the support and developer contact.
3. Under **Data access** (or **Scopes**), add these scopes: `openid`, `email` and `https://www.googleapis.com/auth/gmail.send`. Add nothing else.
4. Under **Audience** (or **Test users**), add your own Gmail address.
5. **Publish the app** (set the publishing status to **In production**).
   - Why: while an app is in Testing status, Google expires its refresh token after 7 days, and JobLume would keep asking you to reconnect.
   - Publishing without Google's verification is fine for personal use. You will see a "Google hasn't verified this app" warning when you connect. Only you will ever see it.

## 4. Create the OAuth client
1. Open **Credentials** (or **Clients**), then **Create credentials**, then **OAuth client ID**.
2. Application type: **Web application**. Name it `JobLume local`.
3. Under **Authorized redirect URIs** add exactly: `http://localhost:4000/gmail/callback`
4. Click **Create** and copy the **Client ID** and **Client secret**.

## 5. Put the values in `.env`
In the repo-root `.env` file:
~~~
GMAIL_CLIENT_ID=<your client id>
GMAIL_CLIENT_SECRET=<your client secret>
GMAIL_REDIRECT_URI=http://localhost:4000/gmail/callback
~~~
Restart `npm run dev`.

## 6. Connect from JobLume
1. Open **Settings** and click **Connect Gmail**.
2. On the warning screen click **Advanced**, then **Go to JobLume (unsafe)**. Keep every permission box ticked, then **Continue**.
3. You return to Settings and see "Connected as your address".

## Hunter (optional, finds contact emails)
Sign up at https://hunter.io, copy your API key from the dashboard into `HUNTER_API_KEY`. The free plan allows about 25 searches a month; JobLume caches each company for 30 days and stops at `HUNTER_MONTHLY_LIMIT` (default 25). Without a key JobLume still suggests role addresses like `careers@` as clearly marked guesses when it knows the company's website.

## When you deploy
Add the deployed API address to **Authorized redirect URIs** (for example `https://your-api.example.com/gmail/callback`) and set `GMAIL_REDIRECT_URI` to the same value.

## Troubleshooting
| Message | Cause and fix |
|---|---|
| Google shows `redirect_uri_mismatch` | The redirect URI in Google must match `GMAIL_REDIRECT_URI` exactly, including `http` or `https` and the port. |
| Settings says "Gmail is not set up on this server" | One of the three `GMAIL_` values is missing. Fill them in and restart. |
| "JobLume needs permission to send email" | You unticked the send permission. Connect again and keep every box ticked. |
| "Google did not return a long-lived token" | Remove JobLume at https://myaccount.google.com/permissions, then connect again. |
| JobLume asks you to reconnect after about a week | The consent screen is still in Testing status. Publish it to production (step 3.5). |
