# JobLume Phase 1 (Core Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Node/TypeScript backend (API + worker) with a Supabase schema that scrapes real jobs from Remotive, MyJobMag and Jobberman, tailors each user's CV and cover letter per matching job with AI, renders a PDF, and exposes the resulting `pending_review` applications through an authenticated API.

**Architecture:** Two entry points in `/server`: `src/api` (Express, Supabase-JWT auth) and `src/worker` (BullMQ workers + 6-hourly scheduler) joined by Upstash Redis. Pure logic (dedupe, prefilter, parsers, prompt/JSON validation, PDF) lives in small modules that take their dependencies as arguments, so every unit is testable without network or database. Supabase Postgres holds data with RLS; the server uses the service-role key.

**Tech Stack:** Node 20+, TypeScript (NodeNext ESM), Express 4, BullMQ 5 + ioredis, Supabase JS v2, zod 3, cheerio, pdf-lib, pdf-parse, mammoth, multer 2, helmet, express-rate-limit 7, pino, Vitest + supertest, tsx.

## Global Constraints

- Stack is fixed: Express + TypeScript, Supabase (Postgres/Auth/Storage), BullMQ + Upstash Redis, Gemini primary with OpenAI `gpt-4o-mini` fallback. Do not swap libraries.
- Gemini model comes from env `GEMINI_MODEL` (required, no code default). `.env.example` suggests `gemini-2.5-flash`; verify against Google's current model list before first run.
- Nothing applies automatically in Phase 1. There is no apply action at all. Applications are created with `status = 'pending_review'`.
- Daily cap is at most 20 (`profiles.daily_cap` check `between 1 and 20`).
- Scrapers use user-agent rotation and a random 1000-3000 ms delay between detail requests.
- Remotive terms: keep the Remotive `url` and `source = 'remotive'` on every record so the UI can link back and attribute; call the API at most 4 times per day (6-hourly schedule).
- No mock or seed data in product code. Test fixtures are allowed in `server/tests/`.
- All secrets only via env, validated at boot with zod; the app refuses to start if one is missing.
- The service-role key never leaves the server.
- Auth is verified with `supabase.auth.getUser(token)` (works with both legacy and asymmetric JWT keys), so `SUPABASE_JWT_SECRET` is not used.
- AI never invents employers, titles, dates, qualifications or skills absent from the base CV.
- British English in the cover letter prompt.
- All shell commands use Git Bash syntax. Run server commands from `server/` unless stated.

## File Structure

```
.gitignore
.env.example
supabase/migrations/0001_init.sql
server/
  package.json  tsconfig.json  tsconfig.build.json  vitest.config.ts
  src/lib/        env.ts logger.ts crypto.ts errors.ts supabase.ts redis.ts http.ts html.ts
  src/db/types.ts
  src/domain/     jobs.ts prefilter.ts
  src/scrapers/   types.ts remotive.ts myjobmag.ts jobberman.ts index.ts
  src/services/
    jobs/repo.ts
    ai/           providers.ts generate.ts quota.ts tailor.ts
    cv/           parse.ts pdf.ts upload.ts
    storage.ts  applications.ts
  src/queues.ts
  src/worker/     scrape.ts match.ts tailor.ts index.ts
  src/api/        auth.ts errors.ts deps.ts app.ts repos.ts index.ts
  src/api/routes/ profile.ts cv.ts applications.ts jobs.ts
  tests/          (mirrors src) + tests/fixtures/
```

---

### Task 1: Server scaffold, env validation, logger

**Files:**
- Create: `.gitignore`, `.env.example`, `server/package.json`, `server/tsconfig.json`, `server/tsconfig.build.json`, `server/vitest.config.ts`
- Create: `server/src/lib/env.ts`, `server/src/lib/logger.ts`
- Test: `server/tests/lib/env.test.ts`
- Modify: `docs/superpowers/specs/2026-10-17-joblume-phase1-core-loop-design.md` (two small corrections)

**Interfaces:**
- Produces: `loadEnv(source: Record<string, string | undefined>): Env`, `getEnv(): Env` (memoised from `process.env`), `type Env`, `logger` (pino instance).

- [ ] **Step 1: Create the project files**

`.gitignore`:
```
node_modules/
dist/
.env
.env.*
!.env.example
*.log
.DS_Store
```

`server/package.json`:
```json
{
  "name": "joblume-server",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20.6" },
  "scripts": {
    "dev:api": "tsx watch --env-file=../.env src/api/index.ts",
    "dev:worker": "tsx watch --env-file=../.env src/worker/index.ts",
    "dev": "concurrently -n api,worker -c blue,magenta \"npm:dev:api\" \"npm:dev:worker\"",
    "build": "tsc -p tsconfig.build.json",
    "start:api": "node dist/api/index.js",
    "start:worker": "node dist/worker/index.js",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

`server/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "outDir": "dist", "rootDir": "src", "sourceMap": true },
  "include": ["src"]
}
```

`server/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
```

`.env.example` (repo root):
```
# --- Supabase (Project Settings > API) ---
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# --- AI ---
GEMINI_API_KEY=
# Verify against Google's current model list. Gemini 1.5 Flash has been retired.
GEMINI_MODEL=gemini-2.5-flash
# Optional fallback provider
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
# Soft daily cap on Gemini calls (free tier allows less than 1500). Keep below your real quota.
AI_DAILY_LIMIT=1400

# --- Queue (Upstash Redis, use the rediss:// URL) ---
UPSTASH_REDIS_URL=

# --- Security ---
# 32 random bytes as 64 hex chars: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=
WEB_ORIGIN=http://localhost:3000
PORT=4000

# --- Later phases (not used in Phase 1) ---
HUNTER_API_KEY=
APOLLO_API_KEY=
JSEARCH_API_KEY=
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
RESEND_API_KEY=
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
cd server
npm i express@4 cors helmet express-rate-limit@7 multer@2 zod@3 pino bullmq@5 ioredis @supabase/supabase-js cheerio pdf-lib pdf-parse@1 mammoth
npm i -D typescript tsx vitest supertest concurrently @types/node @types/express@4 @types/cors @types/multer @types/supertest @types/pdf-parse
```
Expected: installs without errors. `package.json` gains `dependencies` and `devDependencies`.

- [ ] **Step 3: Write the failing test** — `server/tests/lib/env.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/lib/env.js';

const valid = {
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  GEMINI_API_KEY: 'g',
  GEMINI_MODEL: 'gemini-2.5-flash',
  UPSTASH_REDIS_URL: 'rediss://default:pw@host.upstash.io:6379',
  ENCRYPTION_KEY: 'a'.repeat(64),
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('loadEnv', () => {
  it('parses a valid environment and applies defaults', () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(4000);
    expect(env.OPENAI_MODEL).toBe('gpt-4o-mini');
    expect(env.AI_DAILY_LIMIT).toBe(1400);
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it('treats blank optional values as undefined', () => {
    expect(loadEnv({ ...valid, OPENAI_API_KEY: '' }).OPENAI_API_KEY).toBeUndefined();
  });

  it('throws naming every missing variable', () => {
    const { GEMINI_API_KEY, ENCRYPTION_KEY, ...rest } = valid;
    expect(() => loadEnv(rest)).toThrowError(/GEMINI_API_KEY[\s\S]*ENCRYPTION_KEY/);
  });

  it('rejects an encryption key that is not 64 hex chars', () => {
    expect(() => loadEnv({ ...valid, ENCRYPTION_KEY: 'short' })).toThrowError(/ENCRYPTION_KEY/);
  });

  it('rejects a non-redis URL', () => {
    expect(() => loadEnv({ ...valid, UPSTASH_REDIS_URL: 'https://x' })).toThrowError(/UPSTASH_REDIS_URL/);
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `npx vitest run tests/lib/env.test.ts`
Expected: FAIL, cannot resolve `../../src/lib/env.js`.

- [ ] **Step 5: Implement** — `server/src/lib/env.ts`

```ts
import { z } from 'zod';

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = z.preprocess(blankToUndefined, z.string().min(1).optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(4000)),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1),
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.preprocess(blankToUndefined, z.string().min(1).default('gpt-4o-mini')),
  AI_DAILY_LIMIT: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(1400)),
  UPSTASH_REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must start with redis:// or rediss://'),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters (32 bytes)'),
  WEB_ORIGIN: z.string().url(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return result.data;
}

let cached: Env | undefined;
export function getEnv(): Env {
  cached ??= loadEnv(process.env);
  return cached;
}
```

`server/src/lib/logger.ts`:
```ts
import pino from 'pino';

export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
export type Logger = Pick<typeof logger, 'info' | 'warn' | 'error'>;
```

- [ ] **Step 6: Run the test and typecheck**

Run: `npx vitest run tests/lib/env.test.ts && npm run typecheck`
Expected: 5 tests PASS, typecheck exits 0.

- [ ] **Step 7: Correct the spec**

In `docs/superpowers/specs/2026-10-17-joblume-phase1-core-loop-design.md`:
- In section 6, replace "`company_domain` is derived from the apply URL or company website when available, otherwise null (resolved by the Phase 3 email finder)." with "`company_domain` is left null in Phase 1 (these boards expose no company website); the Phase 3 email finder resolves it."
- In section 14, remove `SUPABASE_JWT_SECRET` from the Phase 1 list and add after the list: "Auth is verified through `supabase.auth.getUser(token)`. `GEMINI_MODEL` is required with no code default; `.env.example` suggests `gemini-2.5-flash`."

- [ ] **Step 8: Commit**

```bash
cd ..
git add .gitignore .env.example server docs
git commit -m "feat(server): scaffold project with validated env and logger

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Supabase schema, RLS and storage bucket

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `server/src/db/types.ts`

**Interfaces:**
- Produces: `JobRow`, `ProfileRow`, `ApplicationRow`, `ApplicationStatus`, `ApplyMode` types, used by later tasks. Tables: `users`, `profiles`, `jobs`, `applications`, `email_logs`; bucket `cvs`.

- [ ] **Step 1: Write the migration** — `supabase/migrations/0001_init.sql`

```sql
create extension if not exists pgcrypto;

-- ---------- tables ----------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  gmail_refresh_token_enc text,           -- AES-256-GCM payload, written by the server only (Phase 3)
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  base_cv_text text,
  base_cv_url text,                        -- storage path inside bucket "cvs"
  skills jsonb not null default '[]'::jsonb,
  years_experience int check (years_experience between 0 and 60),
  desired_roles text[] not null default '{}',
  location text check (location in ('Lagos', 'Abuja', 'Remote')),
  salary_min int check (salary_min >= 0),
  salary_max int check (salary_max >= 0),
  apply_mode text not null default 'manual' check (apply_mode in ('manual', 'auto')),
  auto_threshold int not null default 80 check (auto_threshold between 0 and 100),
  daily_cap int not null default 20 check (daily_cap between 1 and 20),
  auto_followup boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company text not null,
  location text not null default '',
  description text not null default '',
  source text not null check (source in ('linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive')),
  url text not null,
  company_domain text,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);
create index jobs_url_idx on public.jobs (url);
create index jobs_created_at_idx on public.jobs (created_at desc);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  tailored_cv_text text,
  tailored_cv_url text,                    -- storage path inside bucket "cvs"
  cover_letter_text text,
  match_score int check (match_score between 0 and 100),
  missing_keywords text[] not null default '{}',
  hiring_manager_email text,
  email_confidence int check (email_confidence between 0 and 100),
  apply_method text check (apply_method in ('email', 'assisted', 'auto')),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'applied', 'interviewing', 'rejected', 'offer', 'skipped')),
  applied_at timestamptz,
  follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, job_id)
);
create index applications_user_status_idx on public.applications (user_id, status);

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  type text not null check (type in ('application', 'follow_up')),
  sent_at timestamptz not null default now(),
  gmail_message_id text
);

-- ---------- helpers ----------
create function public.applications_applied_today(uid uuid)
returns int language sql stable as $$
  select count(*)::int from public.applications
  where user_id = uid and applied_at >= date_trunc('day', now() at time zone 'utc');
$$;

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'full_name');
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- row level security ----------
alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.email_logs enable row level security;

-- users: own row, and never expose the encrypted Gmail token to clients
revoke all on public.users from anon, authenticated;
grant select (id, email, full_name, created_at) on public.users to authenticated;
grant update (full_name) on public.users to authenticated;
create policy users_select_own on public.users for select to authenticated using (id = auth.uid());
create policy users_update_own on public.users for update to authenticated using (id = auth.uid());

create policy profiles_select_own on public.profiles for select to authenticated using (user_id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (user_id = auth.uid());

create policy jobs_select_all on public.jobs for select to authenticated using (true);

create policy applications_select_own on public.applications for select to authenticated using (user_id = auth.uid());
create policy applications_update_own on public.applications for update to authenticated using (user_id = auth.uid());

create policy email_logs_select_own on public.email_logs for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid()));

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('cvs', 'cvs', false, 5242880)
on conflict (id) do nothing;

create policy cvs_select_own on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Apply it**

Either run `supabase db push` (Supabase CLI, linked project) or paste the file into the Supabase dashboard SQL editor and run it.
Expected: no errors.

- [ ] **Step 3: Verify the schema and RLS**

Run in the SQL editor:
```sql
select relname, relrowsecurity from pg_class
where relname in ('users','profiles','jobs','applications','email_logs') and relkind = 'r' order by relname;

select id, public from storage.buckets where id = 'cvs';
```
Expected: five rows, all `relrowsecurity = true`; one bucket row with `public = false`.

Then create a test user via Authentication > Users > Add user, and run:
```sql
select u.email, p.apply_mode, p.daily_cap from public.users u join public.profiles p on p.user_id = u.id;
```
Expected: a row for that user with `manual` and `20` (proves the signup trigger works).

- [ ] **Step 4: Write the row types** — `server/src/db/types.ts`

```ts
export type JobSourceName = 'linkedin' | 'indeed' | 'jobberman' | 'myjobmag' | 'remotive';
export type ApplyMode = 'manual' | 'auto';
export type ApplicationStatus =
  | 'pending_review' | 'approved' | 'applied' | 'interviewing' | 'rejected' | 'offer' | 'skipped';

export interface JobRow {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  source: JobSourceName;
  url: string;
  company_domain: string | null;
  dedupe_key: string;
  created_at: string;
}

export interface ProfileRow {
  user_id: string;
  base_cv_text: string | null;
  base_cv_url: string | null;
  skills: string[];
  years_experience: number | null;
  desired_roles: string[];
  location: 'Lagos' | 'Abuja' | 'Remote' | null;
  salary_min: number | null;
  salary_max: number | null;
  apply_mode: ApplyMode;
  auto_threshold: number;
  daily_cap: number;
  auto_followup: boolean;
  updated_at: string;
}

export interface ApplicationRow {
  id: string;
  user_id: string;
  job_id: string;
  tailored_cv_text: string | null;
  tailored_cv_url: string | null;
  cover_letter_text: string | null;
  match_score: number | null;
  missing_keywords: string[];
  hiring_manager_email: string | null;
  email_confidence: number | null;
  apply_method: 'email' | 'assisted' | 'auto' | null;
  status: ApplicationStatus;
  applied_at: string | null;
  follow_up_at: string | null;
  created_at: string;
}
```

- [ ] **Step 5: Typecheck and commit**

```bash
cd server && npm run typecheck && cd ..
git add supabase server/src/db
git commit -m "feat(db): add schema, RLS policies, signup trigger and cvs bucket

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: typecheck exits 0.

---

### Task 3: Core libraries (crypto, errors, clients, HTTP, HTML)

**Files:**
- Create: `server/src/lib/crypto.ts`, `errors.ts`, `supabase.ts`, `redis.ts`, `http.ts`, `html.ts`
- Test: `server/tests/lib/crypto.test.ts`, `http.test.ts`, `html.test.ts`

**Interfaces:**
- Produces:
  - `encrypt(plain: string, keyHex: string): string`, `decrypt(payload: string, keyHex: string): string`
  - `class ApiError extends Error { status: number; code: string }`, constructor `(status: number, code: string, message?: string)`
  - `createSupabaseAdmin(env: Pick<Env,'SUPABASE_URL'|'SUPABASE_SERVICE_ROLE_KEY'>): SupabaseClient`, `type Db = SupabaseClient`
  - `createRedis(url: string): Redis`
  - `USER_AGENTS: string[]`, `pickUserAgent(rand?: () => number): string`, `randomBetween(min: number, max: number, rand?: () => number): number`, `sleep(ms: number): Promise<void>`, `class HttpError extends Error { status: number }`, `type FetchText = (url: string) => Promise<string>`, `fetchText: FetchText`
  - `htmlToText(html: string): string`

- [ ] **Step 1: Write the failing tests**

`server/tests/lib/crypto.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '../../src/lib/crypto.js';

const key = 'ab'.repeat(32);

describe('crypto', () => {
  it('round-trips a value', () => {
    expect(decrypt(encrypt('refresh-token-123', key), key)).toBe('refresh-token-123');
  });

  it('produces a different payload each time (random IV)', () => {
    expect(encrypt('x', key)).not.toBe(encrypt('x', key));
  });

  it('fails with the wrong key', () => {
    const payload = encrypt('secret', key);
    expect(() => decrypt(payload, 'cd'.repeat(32))).toThrow();
  });

  it('fails when the payload is tampered with', () => {
    const [iv, tag, data] = encrypt('secret', key).split('.');
    const flipped = Buffer.from(data!, 'base64');
    flipped[0] = flipped[0]! ^ 0xff;
    expect(() => decrypt([iv, tag, flipped.toString('base64')].join('.'), key)).toThrow();
  });
});
```

`server/tests/lib/http.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError, fetchText, pickUserAgent, randomBetween, USER_AGENTS } from '../../src/lib/http.js';

afterEach(() => vi.unstubAllGlobals());

describe('helpers', () => {
  it('pickUserAgent picks by the random value', () => {
    expect(pickUserAgent(() => 0)).toBe(USER_AGENTS[0]);
    expect(pickUserAgent(() => 0.999)).toBe(USER_AGENTS[USER_AGENTS.length - 1]);
  });

  it('randomBetween stays within [min, max)', () => {
    expect(randomBetween(1000, 3000, () => 0)).toBe(1000);
    expect(randomBetween(1000, 3000, () => 0.9999)).toBe(2999);
  });
});

describe('fetchText', () => {
  it('returns the body and sends a rotating user agent', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('hello', { status: 200 }));
    vi.stubGlobal('fetch', fn);
    expect(await fetchText('https://example.com')).toBe('hello');
    const headers = (fn.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(USER_AGENTS).toContain(headers['user-agent']);
  });

  it('retries on 429 then succeeds', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fn);
    expect(await fetchText('https://example.com', { backoffMs: 1 })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws HttpError immediately on 404 without retrying', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fn);
    await expect(fetchText('https://example.com', { backoffMs: 1 })).rejects.toMatchObject({ status: 404 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retry budget on persistent 500s', async () => {
    const fn = vi.fn().mockImplementation(async () => new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fn);
    await expect(fetchText('https://example.com', { retries: 2, backoffMs: 1 })).rejects.toBeInstanceOf(HttpError);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
```

`server/tests/lib/html.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { htmlToText } from '../../src/lib/html.js';

describe('htmlToText', () => {
  it('keeps paragraphs and turns list items into bullets', () => {
    expect(htmlToText('<p>Hi</p><ul><li>a</li><li>b</li></ul>')).toBe('Hi\n• a\n• b');
  });

  it('turns <br> into newlines and drops scripts', () => {
    expect(htmlToText('one<br>two<script>alert(1)</script>')).toBe('one\ntwo');
  });

  it('decodes entities and collapses blank runs', () => {
    expect(htmlToText('<p>A&nbsp;&amp;&nbsp;B</p><p></p><p></p><p></p><p>C</p>')).toBe('A & B\n\nC');
  });
});
```

- [ ] **Step 2: Run them and confirm failure**

Run: `npx vitest run tests/lib`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`server/src/lib/crypto.ts`:
```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';

export function encrypt(plain: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload: string, keyHex: string): string {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  if (!iv || !tag || !data) throw new Error('Malformed encrypted payload');
  const decipher = createDecipheriv(ALGO, Buffer.from(keyHex, 'hex'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
```

`server/src/lib/errors.ts`:
```ts
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}
```

`server/src/lib/supabase.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './env.js';

export type Db = SupabaseClient;

export function createSupabaseAdmin(env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'>): Db {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

`server/src/lib/redis.ts`:
```ts
import { Redis } from 'ioredis';

/** BullMQ requires maxRetriesPerRequest: null. Create one connection per Worker/Queue consumer. */
export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: false });
}
```

`server/src/lib/http.ts`:
```ts
export const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0',
];

export const pickUserAgent = (rand: () => number = Math.random): string =>
  USER_AGENTS[Math.floor(rand() * USER_AGENTS.length)]!;

export const randomBetween = (min: number, max: number, rand: () => number = Math.random): number =>
  Math.floor(min + rand() * (max - min));

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class HttpError extends Error {
  constructor(public readonly status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

export type FetchText = (url: string) => Promise<string>;

interface FetchOptions {
  retries?: number;
  backoffMs?: number;
  timeoutMs?: number;
}

const retryable = (status: number) => status === 429 || status >= 500;

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const { retries = 2, backoffMs = 1500, timeoutMs = 30_000 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': pickUserAgent(), accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return await res.text();
      lastError = new HttpError(res.status, url);
      if (!retryable(res.status)) throw lastError;
    } catch (err) {
      if (err instanceof HttpError && !retryable(err.status)) throw err;
      lastError = err;
    }
    if (attempt < retries) await sleep(backoffMs * 2 ** attempt);
  }
  throw lastError;
}
```

`server/src/lib/html.ts`:
```ts
import * as cheerio from 'cheerio';

export function htmlToText(html: string): string {
  const $ = cheerio.load(`<div id="root">${html}</div>`, {}, false);
  $('script,style').remove();
  $('br').replaceWith('\n');
  $('p,div,h1,h2,h3,h4,h5,h6,tr').each((_, el) => {
    $(el).append('\n');
  });
  $('li').each((_, el) => {
    $(el).prepend('• ').append('\n');
  });
  return $('#root')
    .text()
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/lib && npm run typecheck`
Expected: all PASS, typecheck exits 0. If the `htmlToText` blank-run test differs by one newline, adjust only the implementation's regexes, not the expected strings.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): add crypto, http, html, supabase and redis helpers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Job domain (types, dedupe) and profile prefilter

**Files:**
- Create: `server/src/domain/jobs.ts`, `server/src/domain/prefilter.ts`
- Test: `server/tests/domain/jobs.test.ts`, `server/tests/domain/prefilter.test.ts`

**Interfaces:**
- Produces:
  - `type JobSource = JobSourceName` (re-export)
  - `interface JobStub { title: string; company: string; location: string; url: string; source: JobSource; description?: string }`
  - `interface NormalisedJob { title: string; company: string; location: string; description: string; source: JobSource; url: string; companyDomain: string | null }`
  - `dedupeKey(company: string, title: string): string`
  - `dedupeJobs(jobs: NormalisedJob[]): NormalisedJob[]` (first occurrence wins)
  - `interface MatchJob { title: string; location: string; source: JobSource }`
  - `interface MatchProfile { desired_roles: string[]; location: 'Lagos' | 'Abuja' | 'Remote' | null }`
  - `matchesProfile(job: MatchJob, profile: MatchProfile): boolean`

- [ ] **Step 1: Write the failing tests**

`server/tests/domain/jobs.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { dedupeJobs, dedupeKey, type NormalisedJob } from '../../src/domain/jobs.js';

const job = (over: Partial<NormalisedJob>): NormalisedJob => ({
  title: 'Backend Engineer',
  company: 'Acme Ltd',
  location: 'Lagos',
  description: 'd',
  source: 'myjobmag',
  url: 'https://x/1',
  companyDomain: null,
  ...over,
});

describe('dedupeKey', () => {
  it('ignores case, punctuation and company suffixes', () => {
    expect(dedupeKey('Acme Ltd.', 'Sr. Engineer')).toBe(dedupeKey('ACME Limited', 'Sr Engineer'));
  });

  it('strips Nigeria and legal suffixes from company only', () => {
    expect(dedupeKey('Viju Industries Nigeria Limited', 'Quality Assurance')).toBe('viju industries|quality assurance');
  });

  it('keeps different roles at the same company apart', () => {
    expect(dedupeKey('Acme', 'Data Analyst')).not.toBe(dedupeKey('Acme', 'Data Engineer'));
  });
});

describe('dedupeJobs', () => {
  it('keeps the first of each company+title', () => {
    const out = dedupeJobs([
      job({ url: 'https://x/1' }),
      job({ company: 'ACME Limited', url: 'https://x/2', source: 'jobberman' }),
      job({ title: 'Data Analyst', url: 'https://x/3' }),
    ]);
    expect(out.map((j) => j.url)).toEqual(['https://x/1', 'https://x/3']);
  });
});
```

`server/tests/domain/prefilter.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { matchesProfile } from '../../src/domain/prefilter.js';

const profile = { desired_roles: ['backend engineer'], location: 'Lagos' as const };

describe('matchesProfile', () => {
  it('passes when every role word is in the title', () => {
    expect(matchesProfile({ title: 'Senior Backend Engineer', location: 'Lagos', source: 'myjobmag' }, profile)).toBe(true);
  });

  it('fails when the title does not contain the role words', () => {
    expect(matchesProfile({ title: 'Marketing Manager', location: 'Lagos', source: 'myjobmag' }, profile)).toBe(false);
    expect(matchesProfile({ title: 'Frontend Engineer', location: 'Lagos', source: 'myjobmag' }, profile)).toBe(false);
  });

  it('fails when the user has no desired roles', () => {
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Lagos', source: 'myjobmag' }, { ...profile, desired_roles: [] })).toBe(false);
  });

  it('rejects a non-remote job in another city', () => {
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Abuja', source: 'myjobmag' }, profile)).toBe(false);
  });

  it('accepts Remotive and remote jobs for a Lagos user', () => {
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Worldwide', source: 'remotive' }, profile)).toBe(true);
    expect(matchesProfile({ title: 'Backend Engineer (Remote)', location: '', source: 'jobberman' }, profile)).toBe(true);
  });

  it('accepts a job with no location', () => {
    expect(matchesProfile({ title: 'Backend Engineer', location: '', source: 'myjobmag' }, profile)).toBe(true);
  });

  it('for a Remote user only accepts remote jobs', () => {
    const remoteUser = { ...profile, location: 'Remote' as const };
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Lagos', source: 'myjobmag' }, remoteUser)).toBe(false);
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Worldwide', source: 'remotive' }, remoteUser)).toBe(true);
  });

  it('with no location preference any location passes', () => {
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Kano', source: 'myjobmag' }, { ...profile, location: null })).toBe(true);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/domain`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`server/src/domain/jobs.ts`:
```ts
import type { JobSourceName } from '../db/types.js';

export type JobSource = JobSourceName;

export interface JobStub {
  title: string;
  company: string;
  location: string;
  url: string;
  source: JobSource;
  description?: string;
}

export interface NormalisedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  source: JobSource;
  url: string;
  companyDomain: string | null;
}

const COMPANY_SUFFIXES = new Set(['limited', 'ltd', 'nigeria', 'nig', 'ng', 'inc', 'llc', 'plc', 'co', 'company']);

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function dedupeKey(company: string, title: string): string {
  const c = clean(company)
    .split(' ')
    .filter((w) => w && !COMPANY_SUFFIXES.has(w))
    .join(' ');
  return `${c}|${clean(title)}`;
}

export function dedupeJobs(jobs: NormalisedJob[]): NormalisedJob[] {
  const seen = new Set<string>();
  const out: NormalisedJob[] = [];
  for (const job of jobs) {
    const key = dedupeKey(job.company, job.title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}
```

`server/src/domain/prefilter.ts`:
```ts
import type { JobSource } from './jobs.js';

export interface MatchJob {
  title: string;
  location: string;
  source: JobSource;
}

export interface MatchProfile {
  desired_roles: string[];
  location: 'Lagos' | 'Abuja' | 'Remote' | null;
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 1);

const isRemote = (job: MatchJob) => job.source === 'remotive' || /remote|work from home|anywhere/i.test(`${job.title} ${job.location}`);

function titleMatches(job: MatchJob, roles: string[]): boolean {
  const titleWords = new Set(words(job.title));
  return roles.some((role) => {
    const roleWords = words(role);
    return roleWords.length > 0 && roleWords.every((w) => titleWords.has(w));
  });
}

function locationMatches(job: MatchJob, preference: MatchProfile['location']): boolean {
  if (preference === null) return true;
  if (isRemote(job)) return true;
  if (preference === 'Remote') return false;
  if (job.location.trim() === '') return true;
  return job.location.toLowerCase().includes(preference.toLowerCase());
}

/** Cheap, free check run before spending an AI call. */
export function matchesProfile(job: MatchJob, profile: MatchProfile): boolean {
  if (profile.desired_roles.length === 0) return false;
  return titleMatches(job, profile.desired_roles) && locationMatches(job, profile.location);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/domain && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(domain): add job dedupe key and profile prefilter

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Scraper interface and Remotive scraper

**Files:**
- Create: `server/src/scrapers/types.ts`, `server/src/scrapers/remotive.ts`
- Test: `server/tests/scrapers/remotive.test.ts`
- Create: `server/tests/fixtures/remotive.json` (live capture, trimmed)

**Interfaces:**
- Consumes: `FetchText`, `htmlToText`, `JobStub`, `NormalisedJob`.
- Produces:
  - `interface Scraper { source: JobSource; list(): Promise<JobStub[]>; detail(stub: JobStub): Promise<NormalisedJob>; detailDelayMs?: [number, number] }`
  - `parseRemotive(json: string): JobStub[]` (each stub carries the full `description`)
  - `createRemotiveScraper(fetchText: FetchText): Scraper`

- [ ] **Step 1: Capture a real fixture**

Run from `server/`:
```bash
mkdir -p tests/fixtures
curl -s -A "Mozilla/5.0" "https://remotive.com/api/remote-jobs?limit=5" -o /tmp/remotive-raw.json
node -e "const j=require('/tmp/remotive-raw.json'); j.jobs=j.jobs.slice(0,3); require('fs').writeFileSync('tests/fixtures/remotive.json', JSON.stringify(j))"
```
Expected: `tests/fixtures/remotive.json` exists and contains 3 jobs. (Fields confirmed live: `url`, `title`, `company_name`, `candidate_required_location`, `description` as HTML.)

- [ ] **Step 2: Write the failing test** — `server/tests/scrapers/remotive.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createRemotiveScraper, parseRemotive } from '../../src/scrapers/remotive.js';

const fixture = readFileSync(new URL('../fixtures/remotive.json', import.meta.url), 'utf8');

describe('parseRemotive', () => {
  it('maps the live API shape to stubs', () => {
    const stubs = parseRemotive(fixture);
    expect(stubs).toHaveLength(3);
    for (const s of stubs) {
      expect(s.source).toBe('remotive');
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.company.length).toBeGreaterThan(0);
      expect(s.url).toMatch(/^https:\/\/remotive\.com\//);
      expect(s.description).not.toMatch(/<[a-z][\s\S]*>/i);
    }
  });

  it('falls back to "Remote" when no location is given', () => {
    const json = JSON.stringify({
      jobs: [{ url: 'https://remotive.com/x', title: 'T', company_name: 'C', candidate_required_location: '', description: '<p>d</p>' }],
    });
    expect(parseRemotive(json)[0]!.location).toBe('Remote');
  });

  it('skips entries missing a url, title or company', () => {
    const json = JSON.stringify({ jobs: [{ title: 'T', company_name: 'C' }, { url: 'u', company_name: 'C' }] });
    expect(parseRemotive(json)).toEqual([]);
  });
});

describe('createRemotiveScraper', () => {
  it('lists via the API and builds the detail without another request', async () => {
    const fetchText = vi.fn().mockResolvedValue(fixture);
    const scraper = createRemotiveScraper(fetchText);
    const [stub] = await scraper.list();
    expect(fetchText).toHaveBeenCalledWith('https://remotive.com/api/remote-jobs?limit=100');
    const job = await scraper.detail(stub!);
    expect(job).toMatchObject({ source: 'remotive', url: stub!.url, companyDomain: null });
    expect(job.description.length).toBeGreaterThan(20);
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(scraper.detailDelayMs).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `npx vitest run tests/scrapers/remotive.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement**

`server/src/scrapers/types.ts`:
```ts
import type { JobSource, JobStub, NormalisedJob } from '../domain/jobs.js';

export interface Scraper {
  source: JobSource;
  /** Cheap: one listing request. */
  list(): Promise<JobStub[]>;
  /** May cost one request per job. Only called for stubs not already stored. */
  detail(stub: JobStub): Promise<NormalisedJob>;
  /** Random delay range between detail calls. Omit when detail() makes no request. */
  detailDelayMs?: [min: number, max: number];
}
```

`server/src/scrapers/remotive.ts`:
```ts
import type { JobStub } from '../domain/jobs.js';
import type { FetchText } from '../lib/http.js';
import { htmlToText } from '../lib/html.js';
import type { Scraper } from './types.js';

const API_URL = 'https://remotive.com/api/remote-jobs?limit=100';

interface RemotiveJob {
  url?: string;
  title?: string;
  company_name?: string;
  candidate_required_location?: string;
  description?: string;
}

export function parseRemotive(json: string): JobStub[] {
  const data = JSON.parse(json) as { jobs?: RemotiveJob[] };
  const stubs: JobStub[] = [];
  for (const j of data.jobs ?? []) {
    if (!j.url || !j.title || !j.company_name) continue;
    stubs.push({
      title: j.title.trim(),
      company: j.company_name.trim(),
      location: j.candidate_required_location?.trim() || 'Remote',
      url: j.url,
      source: 'remotive',
      description: htmlToText(j.description ?? ''),
    });
  }
  return stubs;
}

export function createRemotiveScraper(fetchText: FetchText): Scraper {
  return {
    source: 'remotive',
    async list() {
      return parseRemotive(await fetchText(API_URL));
    },
    async detail(stub) {
      return {
        title: stub.title,
        company: stub.company,
        location: stub.location,
        description: stub.description ?? '',
        source: 'remotive',
        url: stub.url,
        companyDomain: null,
      };
    },
  };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/scrapers/remotive.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(scrapers): add scraper interface and Remotive scraper

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: MyJobMag scraper

**Files:**
- Create: `server/src/scrapers/myjobmag.ts`
- Test: `server/tests/scrapers/myjobmag.test.ts`
- Create: `server/tests/fixtures/myjobmag-list.html`, `myjobmag-detail.html` (live captures)

**Interfaces:**
- Consumes: `Scraper`, `FetchText`, `htmlToText`, `JobStub`.
- Produces: `parseMyJobMagList(html: string): JobStub[]`, `parseMyJobMagDetail(html: string): { description: string; location: string }`, `createMyJobMagScraper(fetchText: FetchText): Scraper`.

Markup facts observed live (2026-10-17): list cards are `li.job-list-li` containing `li.mag-b h2 a` (text "Role at Company", relative `href`) and `li.job-desc`; a trailing `li.job-list-li` with no `h2` is pagination. Detail pages have `ul.job-key-info li` rows (`.jkey-title` / `.jkey-info`) and one or more `.job-details` blocks.

- [ ] **Step 1: Capture real fixtures**

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
curl -s -L -A "$UA" "https://www.myjobmag.com/jobs" -o tests/fixtures/myjobmag-list.html
FIRST=$(grep -o 'href="/job/[^"]*"' tests/fixtures/myjobmag-list.html | head -1 | sed 's/href="//;s/"$//')
echo "$FIRST"
curl -s -L -A "$UA" "https://www.myjobmag.com$FIRST" -o tests/fixtures/myjobmag-detail.html
wc -c tests/fixtures/myjobmag-*.html
```
Expected: a `/job/...` path is printed and both files are non-empty (tens of KB).

- [ ] **Step 2: Write the failing test** — `server/tests/scrapers/myjobmag.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createMyJobMagScraper, parseMyJobMagDetail, parseMyJobMagList } from '../../src/scrapers/myjobmag.js';

const read = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const LIST_SNIPPET = `
<ul>
<li class="job-list-li"><ul>
  <li class="job-logo"><a href="/jobs-at/viju"><img alt="Viju"></a></li>
  <li class="job-info"><ul>
    <li class="mag-b"><h2><a href="/job/quality-assurance-viju-industries-nigeria-limited">Quality Assurance at Viju Industries Nigeria Limited</a></h2></li>
    <li class="job-desc">A leading firm in the beverage production industry</li>
  </ul></li>
</ul></li>
<li class="job-list-li" style="text-align:center;"><a href="/jobs?page=2">Next</a></li>
</ul>`;

const DETAIL_SNIPPET = `
<ul class="job-key-info">
  <li><span class="jkey-title">Job Type</span> <span class="jkey-info"><a>Full Time</a></span></li>
  <li><span class="jkey-title">Location</span> <span class="jkey-info"><a href='/jobs-location/abuja'>Abuja</a> , <a href='/jobs-location/ogun'>Ogun</a></span></li>
</ul>
<div class="job-details"><p><strong>About job</strong></p><ul><li>Run lab tests</li><li>Issue reports</li></ul></div>`;

describe('parseMyJobMagList', () => {
  it('extracts title, company, absolute url and teaser; skips the pagination item', () => {
    expect(parseMyJobMagList(LIST_SNIPPET)).toEqual([
      {
        title: 'Quality Assurance',
        company: 'Viju Industries Nigeria Limited',
        location: '',
        url: 'https://www.myjobmag.com/job/quality-assurance-viju-industries-nigeria-limited',
        source: 'myjobmag',
        description: 'A leading firm in the beverage production industry',
      },
    ]);
  });

  it('splits on the LAST " at " so titles containing "at" survive', () => {
    const html = `<li class="job-list-li"><li class="mag-b"><h2><a href="/job/x">Data Analyst at Scale at Acme Ltd</a></h2></li></li>`;
    const [stub] = parseMyJobMagList(html);
    expect(stub).toMatchObject({ title: 'Data Analyst at Scale', company: 'Acme Ltd' });
  });

  it('parses the live list page', () => {
    const stubs = parseMyJobMagList(read('myjobmag-list.html'));
    expect(stubs.length).toBeGreaterThan(5);
    for (const s of stubs) {
      expect(s.url).toMatch(/^https:\/\/www\.myjobmag\.com\/job\//);
      expect(s.title).not.toBe('');
      expect(s.company).not.toBe('');
    }
  });
});

describe('parseMyJobMagDetail', () => {
  it('extracts joined locations and the description text', () => {
    expect(parseMyJobMagDetail(DETAIL_SNIPPET)).toEqual({
      location: 'Abuja, Ogun',
      description: 'About job\n• Run lab tests\n• Issue reports',
    });
  });

  it('parses the live detail page', () => {
    const d = parseMyJobMagDetail(read('myjobmag-detail.html'));
    expect(d.description.length).toBeGreaterThan(100);
    expect(d.location).not.toBe('');
  });
});

describe('createMyJobMagScraper', () => {
  it('detail() fetches the page and merges location and description', async () => {
    const fetchText = vi.fn().mockResolvedValue(DETAIL_SNIPPET);
    const scraper = createMyJobMagScraper(fetchText);
    const stub = parseMyJobMagList(LIST_SNIPPET)[0]!;
    const job = await scraper.detail(stub);
    expect(fetchText).toHaveBeenCalledWith(stub.url);
    expect(job).toMatchObject({ location: 'Abuja, Ogun', source: 'myjobmag', companyDomain: null });
    expect(job.description).toContain('Run lab tests');
    expect(scraper.detailDelayMs).toEqual([1000, 3000]);
  });

  it('detail() falls back to the list teaser when the page has no description', async () => {
    const scraper = createMyJobMagScraper(vi.fn().mockResolvedValue('<html></html>'));
    const job = await scraper.detail(parseMyJobMagList(LIST_SNIPPET)[0]!);
    expect(job.description).toBe('A leading firm in the beverage production industry');
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `npx vitest run tests/scrapers/myjobmag.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement** — `server/src/scrapers/myjobmag.ts`

```ts
import * as cheerio from 'cheerio';
import type { JobStub } from '../domain/jobs.js';
import { htmlToText } from '../lib/html.js';
import type { FetchText } from '../lib/http.js';
import type { Scraper } from './types.js';

const BASE = 'https://www.myjobmag.com';
const LIST_URL = `${BASE}/jobs`;

export function parseMyJobMagList(html: string): JobStub[] {
  const $ = cheerio.load(html);
  const stubs: JobStub[] = [];
  $('li.job-list-li').each((_, li) => {
    const a = $(li).find('li.mag-b h2 a').first();
    const href = a.attr('href');
    if (!href) return;
    const text = a.text().replace(/\s+/g, ' ').trim();
    const idx = text.lastIndexOf(' at ');
    if (idx <= 0) return;
    const company = text.slice(idx + 4).trim();
    if (!company) return;
    stubs.push({
      title: text.slice(0, idx).trim(),
      company,
      location: '',
      url: new URL(href, BASE).toString(),
      source: 'myjobmag',
      description: $(li).find('li.job-desc').first().text().replace(/\s+/g, ' ').trim(),
    });
  });
  return stubs;
}

export function parseMyJobMagDetail(html: string): { description: string; location: string } {
  const $ = cheerio.load(html);
  let location = '';
  $('ul.job-key-info li').each((_, li) => {
    if ($(li).find('.jkey-title').first().text().trim().toLowerCase() !== 'location') return;
    const info = $(li).find('.jkey-info').first();
    const links = info.find('a').map((__, a) => $(a).text().trim()).get().filter(Boolean);
    location = links.length ? links.join(', ') : info.text().replace(/\s+/g, ' ').trim();
  });
  const description = $('.job-details')
    .map((_, el) => htmlToText($(el).html() ?? ''))
    .get()
    .join('\n\n')
    .trim();
  return { description, location };
}

export function createMyJobMagScraper(fetchText: FetchText): Scraper {
  return {
    source: 'myjobmag',
    detailDelayMs: [1000, 3000],
    async list() {
      return parseMyJobMagList(await fetchText(LIST_URL));
    },
    async detail(stub) {
      const { description, location } = parseMyJobMagDetail(await fetchText(stub.url));
      return {
        title: stub.title,
        company: stub.company,
        location: location || stub.location,
        description: description || stub.description || '',
        source: 'myjobmag',
        url: stub.url,
        companyDomain: null,
      };
    },
  };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/scrapers/myjobmag.test.ts && npm run typecheck`
Expected: PASS. If a live-fixture assertion fails, inspect the fixture (`grep -n "job-list-li" tests/fixtures/myjobmag-list.html | head`) and fix the selector in the parser; do not loosen the assertion.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(scrapers): add MyJobMag scraper with live fixtures

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Jobberman scraper and scraper registry

**Files:**
- Create: `server/src/scrapers/jobberman.ts`, `server/src/scrapers/index.ts`
- Test: `server/tests/scrapers/jobberman.test.ts`
- Create: `server/tests/fixtures/jobberman-list.html`, `jobberman-detail.html`

**Interfaces:**
- Consumes: `Scraper`, `FetchText`, `htmlToText`, `JobStub`.
- Produces:
  - `parseJobbermanList(html: string): JobStub[]`, `parseJobbermanDetail(html: string): { description: string }`, `createJobbermanScraper(fetchText: FetchText): Scraper`
  - `type ScrapeSource = 'remotive' | 'myjobmag' | 'jobberman'`
  - `SCRAPE_SOURCES: readonly ScrapeSource[]`
  - `SCRAPE_LIMITS: Record<ScrapeSource, number>` (max new jobs per run)
  - `createScrapers(fetchText: FetchText): Record<ScrapeSource, Scraper>`

Markup facts observed live: list cards `[data-cy="listing-cards-components"]`; title link `a[data-cy="listing-title-link"]` (absolute `href`, `title` attr); company is the `<p>` immediately after the title link's wrapping `<div>`; location is the first `span.rounded` chip. Detail pages embed `<script type="application/ld+json">` whose `@graph` contains a `JobPosting` with an HTML `description`.

- [ ] **Step 1: Capture real fixtures**

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
curl -s -L -A "$UA" "https://www.jobberman.com/jobs" -o tests/fixtures/jobberman-list.html
FIRST=$(grep -o 'https://www.jobberman.com/listings/[a-z0-9-]*' tests/fixtures/jobberman-list.html | head -1)
echo "$FIRST"
curl -s -L -A "$UA" "$FIRST" -o tests/fixtures/jobberman-detail.html
wc -c tests/fixtures/jobberman-*.html
```
Expected: a listing URL is printed; both files are non-empty (hundreds of KB).

- [ ] **Step 2: Write the failing test** — `server/tests/scrapers/jobberman.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createScrapers, SCRAPE_LIMITS, SCRAPE_SOURCES } from '../../src/scrapers/index.js';
import { createJobbermanScraper, parseJobbermanDetail, parseJobbermanList } from '../../src/scrapers/jobberman.js';

const read = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const LIST_SNIPPET = `
<div data-cy="listing-cards-components">
  <div class="flex-1"><div class="w-full">
    <div class="flex items-center">
      <a href="https://www.jobberman.com/listings/program-officer-z8xz28" data-cy="listing-title-link" title="Program Officer"><p>Program Officer</p></a>
    </div>
    <p class="text-sm text-blue-700"> Leadership Initiative for Youth Empowerment </p>
    <div class="flex flex-wrap mt-3">
      <span class="mb-3 px-3 py-1 rounded"> Lagos </span>
      <span class="mb-3 px-3 py-1 rounded">Full Time</span>
    </div>
  </div></div>
</div>
<div data-cy="listing-cards-components">
  <div class="flex items-center"><a href="https://www.jobberman.com/listings/x" data-cy="listing-title-link" title="No Company"></a></div>
</div>`;

const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
const DETAIL_SNIPPET = `<html><head>${ld({ '@context': 'https://schema.org', '@graph': [
  { '@type': 'WebPage', name: 'x' },
  { '@type': 'JobPosting', title: 'Program Officer', description: '<p><b>Responsibilities:</b></p><ul><li>Find donors</li></ul>' },
] })}</head></html>`;

describe('parseJobbermanList', () => {
  it('extracts title, company, location and url; skips cards without a company', () => {
    expect(parseJobbermanList(LIST_SNIPPET)).toEqual([
      {
        title: 'Program Officer',
        company: 'Leadership Initiative for Youth Empowerment',
        location: 'Lagos',
        url: 'https://www.jobberman.com/listings/program-officer-z8xz28',
        source: 'jobberman',
      },
    ]);
  });

  it('parses the live list page', () => {
    const stubs = parseJobbermanList(read('jobberman-list.html'));
    expect(stubs.length).toBeGreaterThan(5);
    for (const s of stubs) {
      expect(s.url).toMatch(/^https:\/\/www\.jobberman\.com\/listings\//);
      expect(s.title).not.toBe('');
      expect(s.company).not.toBe('');
    }
  });
});

describe('parseJobbermanDetail', () => {
  it('reads the JobPosting description from JSON-LD', () => {
    expect(parseJobbermanDetail(DETAIL_SNIPPET)).toEqual({ description: 'Responsibilities:\n• Find donors' });
  });

  it('returns an empty description when there is no JobPosting or the JSON is invalid', () => {
    expect(parseJobbermanDetail('<html></html>')).toEqual({ description: '' });
    expect(parseJobbermanDetail('<script type="application/ld+json">{oops</script>')).toEqual({ description: '' });
  });

  it('parses the live detail page', () => {
    expect(parseJobbermanDetail(read('jobberman-detail.html')).description.length).toBeGreaterThan(100);
  });
});

describe('createJobbermanScraper', () => {
  it('detail() fetches the listing page and returns the description', async () => {
    const fetchText = vi.fn().mockResolvedValue(DETAIL_SNIPPET);
    const scraper = createJobbermanScraper(fetchText);
    const stub = parseJobbermanList(LIST_SNIPPET)[0]!;
    const job = await scraper.detail(stub);
    expect(fetchText).toHaveBeenCalledWith(stub.url);
    expect(job).toMatchObject({ company: stub.company, location: 'Lagos', source: 'jobberman', companyDomain: null });
    expect(job.description).toContain('Find donors');
    expect(scraper.detailDelayMs).toEqual([1000, 3000]);
  });
});

describe('createScrapers', () => {
  it('registers every source with a positive limit', () => {
    const scrapers = createScrapers(vi.fn());
    for (const source of SCRAPE_SOURCES) {
      expect(scrapers[source].source).toBe(source);
      expect(SCRAPE_LIMITS[source]).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `npx vitest run tests/scrapers/jobberman.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement**

`server/src/scrapers/jobberman.ts`:
```ts
import * as cheerio from 'cheerio';
import type { JobStub } from '../domain/jobs.js';
import { htmlToText } from '../lib/html.js';
import type { FetchText } from '../lib/http.js';
import type { Scraper } from './types.js';

const LIST_URL = 'https://www.jobberman.com/jobs';

export function parseJobbermanList(html: string): JobStub[] {
  const $ = cheerio.load(html);
  const stubs: JobStub[] = [];
  $('[data-cy="listing-cards-components"]').each((_, card) => {
    const a = $(card).find('a[data-cy="listing-title-link"]').first();
    const href = a.attr('href');
    const title = (a.attr('title') || a.text()).replace(/\s+/g, ' ').trim();
    const company = a.closest('div').next('p').text().replace(/\s+/g, ' ').trim();
    if (!href || !title || !company) return;
    stubs.push({
      title,
      company,
      location: $(card).find('span.rounded').first().text().replace(/\s+/g, ' ').trim(),
      url: new URL(href, 'https://www.jobberman.com').toString(),
      source: 'jobberman',
    });
  });
  return stubs;
}

export function parseJobbermanDetail(html: string): { description: string } {
  const $ = cheerio.load(html);
  let description = '';
  $('script[type="application/ld+json"]').each((_, el) => {
    if (description) return;
    try {
      const json = JSON.parse($(el).contents().text()) as { '@graph'?: unknown[]; '@type'?: string; description?: string };
      const nodes = (json['@graph'] ?? [json]) as Array<{ '@type'?: string; description?: string }>;
      const posting = nodes.find((n) => n['@type'] === 'JobPosting' && n.description);
      if (posting?.description) description = htmlToText(posting.description);
    } catch {
      /* ignore malformed JSON-LD blocks */
    }
  });
  return { description };
}

export function createJobbermanScraper(fetchText: FetchText): Scraper {
  return {
    source: 'jobberman',
    detailDelayMs: [1000, 3000],
    async list() {
      return parseJobbermanList(await fetchText(LIST_URL));
    },
    async detail(stub) {
      const { description } = parseJobbermanDetail(await fetchText(stub.url));
      return {
        title: stub.title,
        company: stub.company,
        location: stub.location,
        description: description || stub.description || '',
        source: 'jobberman',
        url: stub.url,
        companyDomain: null,
      };
    },
  };
}
```

`server/src/scrapers/index.ts`:
```ts
import type { FetchText } from '../lib/http.js';
import { createJobbermanScraper } from './jobberman.js';
import { createMyJobMagScraper } from './myjobmag.js';
import { createRemotiveScraper } from './remotive.js';
import type { Scraper } from './types.js';

export const SCRAPE_SOURCES = ['remotive', 'myjobmag', 'jobberman'] as const;
export type ScrapeSource = (typeof SCRAPE_SOURCES)[number];

/** Max NEW jobs processed per run, to keep detail requests polite. */
export const SCRAPE_LIMITS: Record<ScrapeSource, number> = {
  remotive: 100,
  myjobmag: 25,
  jobberman: 25,
};

export function createScrapers(fetchText: FetchText): Record<ScrapeSource, Scraper> {
  return {
    remotive: createRemotiveScraper(fetchText),
    myjobmag: createMyJobMagScraper(fetchText),
    jobberman: createJobbermanScraper(fetchText),
  };
}
```

- [ ] **Step 5: Run all scraper tests and typecheck**

Run: `npx vitest run tests/scrapers && npm run typecheck`
Expected: PASS. Same rule as Task 6 if a live-fixture assertion fails: fix the selector, not the assertion.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(scrapers): add Jobberman scraper and source registry

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Job persistence and scrape orchestration

**Files:**
- Create: `server/src/services/jobs/repo.ts`, `server/src/worker/scrape.ts`
- Test: `server/tests/worker/scrape.test.ts`

**Interfaces:**
- Consumes: `Scraper`, `dedupeJobs`, `dedupeKey`, `NormalisedJob`, `Db`, `randomBetween`, `Logger`.
- Produces:
  - `findSeenUrls(db: Db, urls: string[]): Promise<Set<string>>`
  - `insertJobs(db: Db, jobs: NormalisedJob[]): Promise<string[]>` (ids of rows actually inserted)
  - `interface ScrapeDeps { scraper: Scraper; maxNew: number; findSeenUrls(urls: string[]): Promise<Set<string>>; insertJobs(jobs: NormalisedJob[]): Promise<string[]>; enqueueMatch(jobId: string): Promise<void>; sleep(ms: number): Promise<void>; log: Logger }`
  - `runScrape(d: ScrapeDeps): Promise<{ listed: number; fetched: number; inserted: number }>`

- [ ] **Step 1: Write the failing test** — `server/tests/worker/scrape.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import type { JobStub, NormalisedJob } from '../../src/domain/jobs.js';
import type { Scraper } from '../../src/scrapers/types.js';
import { runScrape, type ScrapeDeps } from '../../src/worker/scrape.js';

const stub = (n: number): JobStub => ({
  title: `Role ${n}`, company: `Co ${n}`, location: 'Lagos', url: `https://x/${n}`, source: 'myjobmag',
});
const full = (s: JobStub): NormalisedJob => ({ ...s, description: 'd', companyDomain: null });
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function makeDeps(over: Partial<ScrapeDeps> & { stubs?: JobStub[]; detail?: Scraper['detail'] } = {}) {
  const stubs = over.stubs ?? [stub(1), stub(2), stub(3)];
  const scraper: Scraper = {
    source: 'myjobmag',
    detailDelayMs: [1000, 3000],
    list: vi.fn().mockResolvedValue(stubs),
    detail: over.detail ?? vi.fn(async (s: JobStub) => full(s)),
  };
  const deps: ScrapeDeps = {
    scraper,
    maxNew: 25,
    findSeenUrls: vi.fn().mockResolvedValue(new Set<string>()),
    insertJobs: vi.fn(async (jobs: NormalisedJob[]) => jobs.map((j) => `id-${j.url}`)),
    enqueueMatch: vi.fn().mockResolvedValue(undefined),
    sleep: vi.fn().mockResolvedValue(undefined),
    log,
    ...over,
  };
  return deps;
}

describe('runScrape', () => {
  it('fetches details only for unseen urls, inserts them and enqueues a match per new job', async () => {
    const deps = makeDeps({ findSeenUrls: vi.fn().mockResolvedValue(new Set(['https://x/2'])) });
    const result = await runScrape(deps);
    expect(deps.scraper.detail).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ listed: 3, fetched: 2, inserted: 2 });
    expect(deps.enqueueMatch).toHaveBeenCalledWith('id-https://x/1');
    expect(deps.enqueueMatch).toHaveBeenCalledWith('id-https://x/3');
  });

  it('respects maxNew', async () => {
    const deps = makeDeps({ maxNew: 1 });
    expect((await runScrape(deps)).fetched).toBe(1);
  });

  it('sleeps between detail calls but not before the first', async () => {
    const deps = makeDeps();
    await runScrape(deps);
    expect(deps.sleep).toHaveBeenCalledTimes(2);
    const [ms] = (deps.sleep as ReturnType<typeof vi.fn>).mock.calls[0] as [number];
    expect(ms).toBeGreaterThanOrEqual(1000);
    expect(ms).toBeLessThan(3000);
  });

  it('does not sleep when the scraper declares no delay', async () => {
    const deps = makeDeps();
    delete deps.scraper.detailDelayMs;
    await runScrape(deps);
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it('keeps going when one detail request fails', async () => {
    const detail = vi.fn(async (s: JobStub) => {
      if (s.url === 'https://x/2') throw new Error('boom');
      return full(s);
    });
    const deps = makeDeps({ detail });
    const result = await runScrape(deps);
    expect(result).toEqual({ listed: 3, fetched: 2, inserted: 2 });
    expect(log.warn).toHaveBeenCalled();
  });

  it('collapses same company+title duplicates before inserting', async () => {
    const dup = { ...stub(1), url: 'https://x/9' };
    const deps = makeDeps({ stubs: [stub(1), dup] });
    await runScrape(deps);
    expect((deps.insertJobs as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toHaveLength(1);
  });

  it('does nothing when nothing is new', async () => {
    const deps = makeDeps({ findSeenUrls: vi.fn().mockResolvedValue(new Set(['https://x/1', 'https://x/2', 'https://x/3'])) });
    expect(await runScrape(deps)).toEqual({ listed: 3, fetched: 0, inserted: 0 });
    expect(deps.enqueueMatch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/worker/scrape.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`server/src/services/jobs/repo.ts`:
```ts
import { dedupeKey, type NormalisedJob } from '../../domain/jobs.js';
import type { Db } from '../../lib/supabase.js';

const URL_CHUNK = 50; // keeps the PostgREST query string short

export async function findSeenUrls(db: Db, urls: string[]): Promise<Set<string>> {
  const seen = new Set<string>();
  for (let i = 0; i < urls.length; i += URL_CHUNK) {
    const chunk = urls.slice(i, i + URL_CHUNK);
    const { data, error } = await db.from('jobs').select('url').in('url', chunk);
    if (error) throw error;
    for (const row of data ?? []) seen.add((row as { url: string }).url);
  }
  return seen;
}

/** Inserts new jobs; rows whose dedupe_key already exists are skipped. Returns ids of rows actually inserted. */
export async function insertJobs(db: Db, jobs: NormalisedJob[]): Promise<string[]> {
  if (jobs.length === 0) return [];
  const rows = jobs.map((j) => ({
    title: j.title,
    company: j.company,
    location: j.location,
    description: j.description,
    source: j.source,
    url: j.url,
    company_domain: j.companyDomain,
    dedupe_key: dedupeKey(j.company, j.title),
  }));
  const { data, error } = await db
    .from('jobs')
    .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    .select('id');
  if (error) throw error;
  return (data ?? []).map((r) => (r as { id: string }).id);
}
```

`server/src/worker/scrape.ts`:
```ts
import { dedupeJobs, type NormalisedJob } from '../domain/jobs.js';
import type { Logger } from '../lib/logger.js';
import { randomBetween } from '../lib/http.js';
import type { Scraper } from '../scrapers/types.js';

export interface ScrapeDeps {
  scraper: Scraper;
  maxNew: number;
  findSeenUrls(urls: string[]): Promise<Set<string>>;
  insertJobs(jobs: NormalisedJob[]): Promise<string[]>;
  enqueueMatch(jobId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  log: Logger;
}

export async function runScrape(d: ScrapeDeps): Promise<{ listed: number; fetched: number; inserted: number }> {
  const stubs = await d.scraper.list();
  const seen = await d.findSeenUrls(stubs.map((s) => s.url));
  const fresh = stubs.filter((s) => !seen.has(s.url)).slice(0, d.maxNew);

  const jobs: NormalisedJob[] = [];
  for (const [i, stub] of fresh.entries()) {
    const delay = d.scraper.detailDelayMs;
    if (i > 0 && delay) await d.sleep(randomBetween(delay[0], delay[1]));
    try {
      jobs.push(await d.scraper.detail(stub));
    } catch (err) {
      d.log.warn({ err, url: stub.url, source: d.scraper.source }, 'detail fetch failed, skipping job');
    }
  }

  const ids = await d.insertJobs(dedupeJobs(jobs));
  for (const id of ids) await d.enqueueMatch(id);
  d.log.info({ source: d.scraper.source, listed: stubs.length, fetched: jobs.length, inserted: ids.length }, 'scrape finished');
  return { listed: stubs.length, fetched: jobs.length, inserted: ids.length };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/worker/scrape.test.ts && npm run typecheck`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(worker): add job persistence and scrape orchestration

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: AI engine (providers, JSON validation, fallback, quota, tailoring prompt)

**Files:**
- Create: `server/src/services/ai/providers.ts`, `generate.ts`, `quota.ts`, `tailor.ts`
- Test: `server/tests/ai/providers.test.ts`, `generate.test.ts`, `quota.test.ts`, `tailor.test.ts`

**Interfaces:**
- Produces:
  - `interface Prompt { system: string; user: string }`, `type ProviderFn = (p: Prompt) => Promise<string>`
  - `class ProviderError extends Error { retryable: boolean; status?: number }`
  - `geminiProvider(cfg: { apiKey: string; model: string }, fetchImpl?: typeof fetch): ProviderFn`
  - `openaiProvider(cfg: { apiKey: string; model: string }, fetchImpl?: typeof fetch): ProviderFn`
  - `class QuotaExhaustedError extends Error`, `class InvalidOutputError extends Error`
  - `generateJson<T>(opts: { system: string; user: string; schema: z.ZodType<T, z.ZodTypeDef, unknown>; primary: ProviderFn; fallback?: ProviderFn }): Promise<{ data: T; provider: 'primary' | 'fallback' }>`
  - `createQuota(redis: Pick<Redis, 'incr' | 'expire'>, limit: number, now?: () => Date): { consume(): Promise<boolean> }`, `msUntilUtcMidnight(now?: Date): number`
  - `tailorSchema`, `type TailorResult = { tailored_cv_text: string; cover_letter_text: string; match_score_0_to_100: number; missing_keywords: string[] }`
  - `interface TailorInput { cvText: string; job: { title: string; company: string; location: string; description: string }; profile: { skills: string[]; yearsExperience: number | null; location: string | null } }`
  - `buildTailorPrompt(input: TailorInput): Prompt`
  - `createTailor(deps: { primary: ProviderFn; fallback?: ProviderFn }): (input: TailorInput) => Promise<TailorResult>`

- [ ] **Step 1: Write the failing tests**

`server/tests/ai/providers.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { geminiProvider, openaiProvider, ProviderError } from '../../src/services/ai/providers.js';

const prompt = { system: 'sys', user: 'usr' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('geminiProvider', () => {
  it('posts to the model endpoint with the api key header and returns the text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }));
    const out = await geminiProvider({ apiKey: 'K', model: 'gemini-x' }, fetchImpl as unknown as typeof fetch)(prompt);
    expect(out).toBe('{"a":1}');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent');
    expect((init as RequestInit).headers).toMatchObject({ 'x-goog-api-key': 'K' });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.contents[0].parts[0].text).toBe('usr');
  });

  it('marks 429 and 5xx as retryable, 400 as not', async () => {
    const run = (status: number) =>
      geminiProvider({ apiKey: 'K', model: 'm' }, vi.fn().mockResolvedValue(json({}, status)) as unknown as typeof fetch)(prompt);
    await expect(run(429)).rejects.toMatchObject({ retryable: true, status: 429 });
    await expect(run(503)).rejects.toMatchObject({ retryable: true });
    await expect(run(400)).rejects.toMatchObject({ retryable: false });
    await expect(run(400)).rejects.toBeInstanceOf(ProviderError);
  });

  it('treats an empty candidate list as a retryable failure', async () => {
    const p = geminiProvider({ apiKey: 'K', model: 'm' }, vi.fn().mockResolvedValue(json({ candidates: [] })) as unknown as typeof fetch);
    await expect(p(prompt)).rejects.toMatchObject({ retryable: true });
  });
});

describe('openaiProvider', () => {
  it('posts a json_object chat completion and returns the message content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ choices: [{ message: { content: '{"b":2}' } }] }));
    const out = await openaiProvider({ apiKey: 'S', model: 'gpt-4o-mini' }, fetchImpl as unknown as typeof fetch)(prompt);
    expect(out).toBe('{"b":2}');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer S' });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages).toEqual([{ role: 'system', content: 'sys' }, { role: 'user', content: 'usr' }]);
  });

  it('throws a ProviderError on HTTP failure', async () => {
    const p = openaiProvider({ apiKey: 'S', model: 'm' }, vi.fn().mockResolvedValue(json({}, 500)) as unknown as typeof fetch);
    await expect(p(prompt)).rejects.toMatchObject({ retryable: true, status: 500 });
  });
});
```

`server/tests/ai/generate.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { generateJson, InvalidOutputError, QuotaExhaustedError } from '../../src/services/ai/generate.js';
import { ProviderError, type ProviderFn } from '../../src/services/ai/providers.js';

const schema = z.object({ n: z.coerce.number() });
const base = { system: 's', user: 'u', schema };

describe('generateJson', () => {
  it('returns validated data from the primary provider', async () => {
    const primary: ProviderFn = vi.fn().mockResolvedValue('{"n": "5"}');
    expect(await generateJson({ ...base, primary })).toEqual({ data: { n: 5 }, provider: 'primary' });
  });

  it('strips markdown code fences', async () => {
    const primary: ProviderFn = vi.fn().mockResolvedValue('```json\n{"n":1}\n```');
    expect((await generateJson({ ...base, primary })).data.n).toBe(1);
  });

  it('retries once on invalid output, telling the model what was wrong', async () => {
    const primary = vi.fn<Parameters<ProviderFn>, ReturnType<ProviderFn>>()
      .mockResolvedValueOnce('not json at all')
      .mockResolvedValueOnce('{"n":2}');
    const res = await generateJson({ ...base, primary });
    expect(res).toEqual({ data: { n: 2 }, provider: 'primary' });
    expect(primary.mock.calls[1]![0].user).toContain('previous reply was invalid');
  });

  it('falls back when the primary fails with a ProviderError', async () => {
    const primary: ProviderFn = vi.fn().mockRejectedValue(new ProviderError('429', true, 429));
    const fallback: ProviderFn = vi.fn().mockResolvedValue('{"n":3}');
    expect(await generateJson({ ...base, primary, fallback })).toEqual({ data: { n: 3 }, provider: 'fallback' });
  });

  it('falls back when the primary stays invalid after its retry', async () => {
    const primary: ProviderFn = vi.fn().mockResolvedValue('nope');
    const fallback: ProviderFn = vi.fn().mockResolvedValue('{"n":4}');
    const res = await generateJson({ ...base, primary, fallback });
    expect(res.provider).toBe('fallback');
    expect(primary).toHaveBeenCalledTimes(2);
  });

  it('falls back when the primary quota is exhausted', async () => {
    const primary: ProviderFn = vi.fn().mockRejectedValue(new QuotaExhaustedError());
    const fallback: ProviderFn = vi.fn().mockResolvedValue('{"n":6}');
    expect((await generateJson({ ...base, primary, fallback })).provider).toBe('fallback');
  });

  it('rethrows QuotaExhaustedError when there is no fallback', async () => {
    const primary: ProviderFn = vi.fn().mockRejectedValue(new QuotaExhaustedError());
    await expect(generateJson({ ...base, primary })).rejects.toBeInstanceOf(QuotaExhaustedError);
  });

  it('throws InvalidOutputError when the only provider never returns valid JSON', async () => {
    const primary: ProviderFn = vi.fn().mockResolvedValue('nope');
    await expect(generateJson({ ...base, primary })).rejects.toBeInstanceOf(InvalidOutputError);
  });

  it('throws when both providers fail', async () => {
    const primary: ProviderFn = vi.fn().mockRejectedValue(new ProviderError('500', true, 500));
    const fallback: ProviderFn = vi.fn().mockRejectedValue(new ProviderError('500', true, 500));
    await expect(generateJson({ ...base, primary, fallback })).rejects.toBeInstanceOf(ProviderError);
  });
});
```

`server/tests/ai/quota.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createQuota, msUntilUtcMidnight } from '../../src/services/ai/quota.js';

function fakeRedis() {
  const store = new Map<string, number>();
  const expires = new Map<string, number>();
  return {
    expires,
    async incr(key: string) { const n = (store.get(key) ?? 0) + 1; store.set(key, n); return n; },
    async expire(key: string, seconds: number) { expires.set(key, seconds); return 1; },
  };
}

describe('createQuota', () => {
  it('allows up to the limit then refuses', async () => {
    const quota = createQuota(fakeRedis(), 2, () => new Date('2026-10-17T10:00:00Z'));
    expect(await quota.consume()).toBe(true);
    expect(await quota.consume()).toBe(true);
    expect(await quota.consume()).toBe(false);
  });

  it('uses a fresh counter on a new UTC day and sets an expiry on first use', async () => {
    const redis = fakeRedis();
    let day = '2026-10-17T23:59:00Z';
    const quota = createQuota(redis, 1, () => new Date(day));
    expect(await quota.consume()).toBe(true);
    expect(await quota.consume()).toBe(false);
    day = '2026-10-18T00:01:00Z';
    expect(await quota.consume()).toBe(true);
    expect(redis.expires.get('ai:gemini:2026-10-17')).toBe(172800);
  });
});

describe('msUntilUtcMidnight', () => {
  it('returns the time left in the UTC day', () => {
    expect(msUntilUtcMidnight(new Date('2026-10-17T23:00:00Z'))).toBe(3_600_000);
  });
});
```

`server/tests/ai/tailor.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { buildTailorPrompt, createTailor, tailorSchema, type TailorInput } from '../../src/services/ai/tailor.js';

const input: TailorInput = {
  cvText: 'JANE DOE\nBackend engineer. Built APIs in Node.js at Acme (2021-2024).',
  job: { title: 'Backend Engineer', company: 'Globex', location: 'Lagos', description: 'Node.js, PostgreSQL, Docker.' },
  profile: { skills: ['Node.js'], yearsExperience: 4, location: 'Lagos' },
};

const validReply = {
  tailored_cv_text: 'SUMMARY\n' + 'Backend engineer with Node.js experience. '.repeat(8),
  cover_letter_text: 'Dear Hiring Manager,\n' + 'I build reliable Node.js services. '.repeat(5),
  match_score_0_to_100: 72.4,
  missing_keywords: ['Docker'],
};

describe('buildTailorPrompt', () => {
  it('contains the truthfulness rule, the CV and the job', () => {
    const { system, user } = buildTailorPrompt(input);
    expect(system).toContain('Nigerian ATS expert');
    expect(system).toMatch(/do not invent/i);
    expect(system).toContain('British English');
    expect(system).toContain('tailored_cv_text');
    expect(user).toContain('Built APIs in Node.js at Acme');
    expect(user).toContain('Globex');
    expect(user).toContain('Node.js, PostgreSQL, Docker.');
  });

  it('truncates very long inputs', () => {
    const { user } = buildTailorPrompt({ ...input, cvText: 'x'.repeat(50_000), job: { ...input.job, description: 'y'.repeat(50_000) } });
    expect(user.length).toBeLessThan(20_000);
  });
});

describe('tailorSchema', () => {
  it('rounds and coerces the score and defaults missing_keywords', () => {
    const parsed = tailorSchema.parse({ ...validReply, match_score_0_to_100: '72.6', missing_keywords: undefined });
    expect(parsed.match_score_0_to_100).toBe(73);
    expect(parsed.missing_keywords).toEqual([]);
  });

  it('rejects out-of-range scores and tiny outputs', () => {
    expect(tailorSchema.safeParse({ ...validReply, match_score_0_to_100: 150 }).success).toBe(false);
    expect(tailorSchema.safeParse({ ...validReply, tailored_cv_text: 'short' }).success).toBe(false);
  });
});

describe('createTailor', () => {
  it('returns a validated result from the provider', async () => {
    const primary = vi.fn().mockResolvedValue(JSON.stringify(validReply));
    const result = await createTailor({ primary })(input);
    expect(result.match_score_0_to_100).toBe(72);
    expect(result.missing_keywords).toEqual(['Docker']);
    expect(primary).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/ai`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`server/src/services/ai/providers.ts`:
```ts
export interface Prompt {
  system: string;
  user: string;
}
export type ProviderFn = (p: Prompt) => Promise<string>;

export class ProviderError extends Error {
  constructor(message: string, public readonly retryable: boolean, public readonly status?: number) {
    super(message);
    this.name = 'ProviderError';
  }
}

const isRetryable = (status: number) => status === 429 || status >= 500;

interface ProviderConfig {
  apiKey: string;
  model: string;
}

export function geminiProvider(cfg: ProviderConfig, fetchImpl: typeof fetch = fetch): ProviderFn {
  return async ({ system, user }) => {
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new ProviderError(`gemini HTTP ${res.status}`, isRetryable(res.status), res.status);
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text) throw new ProviderError('gemini returned no candidates', true);
    return text;
  };
}

export function openaiProvider(cfg: ProviderConfig, fetchImpl: typeof fetch = fetch): ProviderFn {
  return async ({ system, user }) => {
    const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new ProviderError(`openai HTTP ${res.status}`, isRetryable(res.status), res.status);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new ProviderError('openai returned empty content', true);
    return text;
  };
}
```

`server/src/services/ai/generate.ts`:
```ts
import type { z } from 'zod';
import type { ProviderFn } from './providers.js';

export class QuotaExhaustedError extends Error {
  constructor() {
    super('AI daily quota exhausted');
    this.name = 'QuotaExhaustedError';
  }
}

export class InvalidOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOutputError';
  }
}

const stripFences = (raw: string) =>
  raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

async function attempt<T>(
  provider: ProviderFn,
  system: string,
  user: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T> {
  let prompt = user;
  let lastIssue = 'unknown';
  for (let i = 0; i < 2; i++) {
    const raw = await provider({ system, user: prompt });
    let problem: string;
    try {
      const parsed = schema.safeParse(JSON.parse(stripFences(raw)));
      if (parsed.success) return parsed.data;
      problem = parsed.error.issues.map((x) => `${x.path.join('.') || '(root)'}: ${x.message}`).join('; ');
    } catch (err) {
      problem = `not valid JSON (${(err as Error).message})`;
    }
    lastIssue = problem;
    prompt = `${user}\n\nYour previous reply was invalid: ${problem}. Reply again with ONLY valid JSON that matches the required structure.`;
  }
  throw new InvalidOutputError(`Model output failed validation twice: ${lastIssue}`);
}

export async function generateJson<T>(opts: {
  system: string;
  user: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  primary: ProviderFn;
  fallback?: ProviderFn;
}): Promise<{ data: T; provider: 'primary' | 'fallback' }> {
  try {
    return { data: await attempt(opts.primary, opts.system, opts.user, opts.schema), provider: 'primary' };
  } catch (err) {
    if (!opts.fallback) throw err;
    return { data: await attempt(opts.fallback, opts.system, opts.user, opts.schema), provider: 'fallback' };
  }
}
```

`server/src/services/ai/quota.ts`:
```ts
import type { Redis } from 'ioredis';

export function createQuota(redis: Pick<Redis, 'incr' | 'expire'>, limit: number, now: () => Date = () => new Date()) {
  return {
    /** Returns true if a call is still within today's (UTC) budget. */
    async consume(): Promise<boolean> {
      const key = `ai:gemini:${now().toISOString().slice(0, 10)}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 172_800);
      return count <= limit;
    },
  };
}

export function msUntilUtcMidnight(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}
```

`server/src/services/ai/tailor.ts`:
```ts
import { z } from 'zod';
import { generateJson } from './generate.js';
import type { ProviderFn, Prompt } from './providers.js';

export const tailorSchema = z.object({
  tailored_cv_text: z.string().min(200),
  cover_letter_text: z.string().min(100),
  match_score_0_to_100: z.coerce.number().min(0).max(100).transform((n) => Math.round(n)),
  missing_keywords: z.array(z.string()).default([]),
});

export type TailorResult = z.output<typeof tailorSchema>;

export interface TailorInput {
  cvText: string;
  job: { title: string; company: string; location: string; description: string };
  profile: { skills: string[]; yearsExperience: number | null; location: string | null };
}

const SYSTEM = `You are a Nigerian ATS expert and a senior recruiter. Rewrite the candidate's base CV for the job described by the user.

Rules:
- Keep everything truthful. Do not invent employers, job titles, dates, qualifications, certifications, metrics or skills that are not in the base CV.
- You may reorder, rephrase and emphasise existing content, and mirror the job's keywords only where the base CV genuinely supports them.
- Optimise for ATS: plain text, standard headings on their own line (SUMMARY, SKILLS, EXPERIENCE, EDUCATION, CERTIFICATIONS), bullet points that start with "- ", no tables, no emojis or other symbols. Put the candidate's name and contact details on the first lines, before any heading.
- Cover letter: British English, direct and human, three short paragraphs, specific to this role and company, grounded only in the base CV. No cliches, no generic openings, no exaggerated claims.
- missing_keywords: important keywords from the job description that the base CV does not support. Do not add them to the CV.
- match_score_0_to_100: an honest estimate of how well the base CV fits this job.

Reply with ONLY a JSON object, no other text:
{ "tailored_cv_text": string, "cover_letter_text": string, "match_score_0_to_100": number, "missing_keywords": string[] }`;

export function buildTailorPrompt({ cvText, job, profile }: TailorInput): Prompt {
  const user = [
    `JOB TITLE: ${job.title}`,
    `COMPANY: ${job.company}`,
    `LOCATION: ${job.location || 'Not stated'}`,
    `JOB DESCRIPTION:\n${job.description.slice(0, 6000)}`,
    '',
    `CANDIDATE PROFILE: ${profile.yearsExperience ?? 'unknown'} years of experience; preferred location ${profile.location ?? 'not stated'}; listed skills: ${profile.skills.join(', ') || 'none listed'}.`,
    '',
    `BASE CV:\n${cvText.slice(0, 12000)}`,
  ].join('\n');
  return { system: SYSTEM, user };
}

export function createTailor(deps: { primary: ProviderFn; fallback?: ProviderFn }) {
  return async (input: TailorInput): Promise<TailorResult> => {
    const { system, user } = buildTailorPrompt(input);
    const { data } = await generateJson({ system, user, schema: tailorSchema, ...deps });
    return data;
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/ai && npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(ai): add Gemini/OpenAI providers, validated JSON generation, quota and tailoring prompt

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: CV parsing, PDF rendering and storage

**Files:**
- Create: `server/src/services/cv/parse.ts`, `pdf.ts`, `upload.ts`, `server/src/services/storage.ts`, `server/src/types/pdf-parse.d.ts`
- Test: `server/tests/cv/parse.test.ts`, `pdf.test.ts`, `upload.test.ts`

**Interfaces:**
- Consumes: `ApiError`, `Db`.
- Produces:
  - `detectCvType(buf: Buffer): 'pdf' | 'docx' | null`, `extractCvText(buf: Buffer, type: 'pdf' | 'docx'): Promise<string>`
  - `sanitize(text: string): string`, `parseSections(text: string): CvSection[]`, `wrapText(text: string, measure: (s: string) => number, maxWidth: number): string[]`, `renderCvPdf(text: string): Promise<Uint8Array>`
  - `BUCKET = 'cvs'`, `uploadFile(db: Db, path: string, bytes: Uint8Array | Buffer, contentType: string): Promise<string>`, `createSignedUrl(db: Db, path: string, expiresInSeconds?: number): Promise<string>`
  - `interface CvUploadDeps { upload(path: string, bytes: Buffer, contentType: string): Promise<string>; setCv(userId: string, v: { text: string; path: string }): Promise<void> }`
  - `createCvService(deps: CvUploadDeps): { upload(userId: string, file: { buffer: Buffer }): Promise<{ characters: number }> }`

- [ ] **Step 1: Write the failing tests**

`server/tests/cv/pdf.test.ts`:
```ts
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { parseSections, renderCvPdf, sanitize, wrapText } from '../../src/services/cv/pdf.js';

const CV = `JANE DOE
jane@example.com | Lagos

SUMMARY
Backend engineer with four years of experience.

SKILLS
- Node.js
- PostgreSQL

EXPERIENCE
Acme Ltd, Backend Engineer (2021-2024)
- Built payment APIs handling 2M requests a day
`;

describe('sanitize', () => {
  it('maps naira and smart punctuation and strips unsupported glyphs', () => {
    expect(sanitize('Earned ₦500 – “great” 🚀')).toBe('Earned N500 - "great" ');
  });
  it('keeps accented latin letters and bullets', () => {
    expect(sanitize('café • ok')).toBe('café • ok');
  });
});

describe('parseSections', () => {
  it('keeps a header block then splits on known headings', () => {
    const sections = parseSections(CV);
    expect(sections.map((s) => s.heading)).toEqual([null, 'SUMMARY', 'SKILLS', 'EXPERIENCE']);
    expect(sections[0]!.lines[0]).toBe('JANE DOE');
    expect(sections[2]!.lines.filter(Boolean)).toEqual(['- Node.js', '- PostgreSQL']);
  });

  it('accepts headings written as "Skills:" in any case', () => {
    expect(parseSections('Name\nskills:\n- a').map((s) => s.heading)).toEqual([null, 'SKILLS']);
  });

  it('drops an empty header block', () => {
    expect(parseSections('SUMMARY\ntext').map((s) => s.heading)).toEqual(['SUMMARY']);
  });
});

describe('wrapText', () => {
  const measure = (s: string) => s.length;
  it('wraps on word boundaries', () => {
    expect(wrapText('aaa bbb ccc ddd', measure, 7)).toEqual(['aaa bbb', 'ccc ddd']);
  });
  it('hard-splits a word longer than the line', () => {
    expect(wrapText('abcdefghij', measure, 4)).toEqual(['abcd', 'efgh', 'ij']);
  });
});

describe('renderCvPdf', () => {
  it('produces a loadable PDF', async () => {
    const bytes = await renderCvPdf(CV);
    expect(Buffer.from(bytes.subarray(0, 4)).toString()).toBe('%PDF');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('paginates long content without dropping it', async () => {
    const long = 'EXPERIENCE\n' + Array.from({ length: 200 }, (_, i) => `- Delivered project number ${i}`).join('\n');
    expect((await PDFDocument.load(await renderCvPdf(long))).getPageCount()).toBeGreaterThan(1);
  });

  it('does not throw on characters outside the PDF font', async () => {
    await expect(renderCvPdf('SUMMARY\nEarned ₦5m 🚀 日本')).resolves.toBeInstanceOf(Uint8Array);
  });
});
```

`server/tests/cv/parse.test.ts`:
```ts
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { detectCvType, extractCvText } from '../../src/services/cv/parse.js';

async function makePdf(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText(text, { x: 50, y: 700, size: 12, font });
  return Buffer.from(await pdf.save());
}

describe('detectCvType', () => {
  it('detects PDF and DOCX by magic bytes', () => {
    expect(detectCvType(Buffer.from('%PDF-1.7 ...'))).toBe('pdf');
    expect(detectCvType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe('docx');
  });
  it('rejects anything else', () => {
    expect(detectCvType(Buffer.from('MZ executable'))).toBeNull();
    expect(detectCvType(Buffer.alloc(0))).toBeNull();
  });
});

describe('extractCvText', () => {
  it('extracts text from a PDF', async () => {
    const text = await extractCvText(await makePdf('Senior Backend Engineer in Lagos'), 'pdf');
    expect(text).toContain('Senior Backend Engineer in Lagos');
  });
});
```

`server/tests/cv/upload.test.ts`:
```ts
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { createCvService } from '../../src/services/cv/upload.js';

async function makePdf(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage();
  text.split('\n').forEach((line, i) => page.drawText(line, { x: 40, y: 780 - i * 14, size: 10, font }));
  return Buffer.from(await pdf.save());
}

const longText = Array.from({ length: 20 }, (_, i) => `Line ${i}: experienced engineer building reliable systems.`).join('\n');

describe('createCvService', () => {
  it('stores the file under the user folder and saves the parsed text', async () => {
    const deps = {
      upload: vi.fn().mockResolvedValue('user-1/base-cv.pdf'),
      setCv: vi.fn().mockResolvedValue(undefined),
    };
    const svc = createCvService(deps);
    const result = await svc.upload('user-1', { buffer: await makePdf(longText) });
    expect(deps.upload).toHaveBeenCalledWith('user-1/base-cv.pdf', expect.any(Buffer), 'application/pdf');
    expect(deps.setCv).toHaveBeenCalledWith('user-1', { text: expect.stringContaining('experienced engineer'), path: 'user-1/base-cv.pdf' });
    expect(result.characters).toBeGreaterThan(200);
  });

  it('rejects unsupported files with 400', async () => {
    const svc = createCvService({ upload: vi.fn(), setCv: vi.fn() });
    await expect(svc.upload('u', { buffer: Buffer.from('not a cv') })).rejects.toMatchObject({ status: 400, code: 'unsupported_file_type' });
  });

  it('rejects a CV with too little extractable text with 422', async () => {
    const svc = createCvService({ upload: vi.fn(), setCv: vi.fn() });
    await expect(svc.upload('u', { buffer: await makePdf('hi') })).rejects.toMatchObject({ status: 422, code: 'cv_text_too_short' });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/cv`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`server/src/types/pdf-parse.d.ts`:
```ts
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult { text: string; numpages: number }
  export default function pdfParse(data: Buffer): Promise<PdfParseResult>;
}
```

`server/src/services/cv/parse.ts`:
```ts
import mammoth from 'mammoth';
// Import the inner module: pdf-parse's index.js runs a debug routine that reads a missing test file under ESM.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export type CvFileType = 'pdf' | 'docx';

export function detectCvType(buf: Buffer): CvFileType | null {
  if (buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'docx';
  return null;
}

export async function extractCvText(buf: Buffer, type: CvFileType): Promise<string> {
  const raw = type === 'pdf' ? (await pdfParse(buf)).text : (await mammoth.extractRawText({ buffer: buf })).value;
  return raw.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
```

`server/src/services/cv/pdf.ts`:
```ts
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface CvSection {
  heading: string | null;
  lines: string[];
}

const HEADING = /^(professional summary|summary|profile|key skills|skills|work experience|professional experience|experience|education|certifications|projects)\s*:?$/i;

/** Standard PDF fonts only encode WinAnsi; map common glyphs and drop the rest. */
export function sanitize(text: string): string {
  return text
    .replace(/₦/g, 'N')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA1-\xFF•]/g, '');
}

export function parseSections(text: string): CvSection[] {
  const sections: CvSection[] = [{ heading: null, lines: [] }];
  for (const raw of sanitize(text).split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (HEADING.test(line.trim())) {
      sections.push({ heading: line.trim().replace(/:$/, '').toUpperCase(), lines: [] });
    } else {
      sections[sections.length - 1]!.lines.push(line);
    }
  }
  return sections.filter((s) => s.heading !== null || s.lines.some((l) => l.trim() !== ''));
}

export function wrapText(text: string, measure: (s: string) => number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  const push = () => {
    if (current) lines.push(current);
    current = '';
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (measure(w) > maxWidth) {
      let cut = w.length - 1;
      while (cut > 1 && measure(w.slice(0, cut)) > maxWidth) cut--;
      push();
      lines.push(w.slice(0, cut));
      w = w.slice(cut);
    }
    const candidate = current ? `${current} ${w}` : w;
    if (measure(candidate) <= maxWidth) current = candidate;
    else {
      push();
      current = w;
    }
  }
  push();
  return lines;
}

export async function renderCvPdf(text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 50;
  const contentW = W - 2 * M;
  const ink = rgb(0.1, 0.1, 0.1);
  const accent = rgb(0.42, 0.36, 0.91);

  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ensure = (needed: number) => {
    if (y - needed < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const draw = (t: string, o: { font?: typeof regular; size?: number; x?: number; color?: ReturnType<typeof rgb>; lead?: number } = {}) => {
    const size = o.size ?? 10;
    const lead = o.lead ?? size * 1.4;
    ensure(lead);
    y -= lead;
    page.drawText(t, { x: o.x ?? M, y, size, font: o.font ?? regular, color: o.color ?? ink });
  };

  for (const section of parseSections(text)) {
    if (section.heading) {
      y -= 8;
      ensure(28);
      draw(section.heading, { font: bold, size: 11, color: accent });
      page.drawLine({ start: { x: M, y: y - 3 }, end: { x: W - M, y: y - 3 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
      y -= 4;
    }
    let first = true;
    for (const raw of section.lines) {
      const line = raw.trim();
      if (!line) {
        y -= 4;
        continue;
      }
      if (!section.heading && first) {
        first = false;
        for (const l of wrapText(line, (s) => bold.widthOfTextAtSize(s, 16), contentW)) draw(l, { font: bold, size: 16, lead: 20 });
        continue;
      }
      first = false;
      const bullet = /^[-•]\s+/.test(line);
      const body = bullet ? line.replace(/^[-•]\s+/, '') : line;
      const indent = bullet ? 14 : 0;
      wrapText(body, (s) => regular.widthOfTextAtSize(s, 10), contentW - indent).forEach((l, i) => {
        if (bullet && i === 0) {
          ensure(14);
          page.drawText('•', { x: M + 3, y: y - 14, size: 10, font: regular, color: ink });
        }
        draw(l, { x: M + indent });
      });
    }
  }
  return pdf.save();
}
```

`server/src/services/storage.ts`:
```ts
import type { Db } from '../lib/supabase.js';

export const BUCKET = 'cvs';

export async function uploadFile(db: Db, path: string, bytes: Uint8Array | Buffer, contentType: string): Promise<string> {
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

export async function createSignedUrl(db: Db, path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw error ?? new Error('Could not sign URL');
  return data.signedUrl;
}
```

`server/src/services/cv/upload.ts`:
```ts
import { ApiError } from '../../lib/errors.js';
import { detectCvType, extractCvText } from './parse.js';

export interface CvUploadDeps {
  upload(path: string, bytes: Buffer, contentType: string): Promise<string>;
  setCv(userId: string, value: { text: string; path: string }): Promise<void>;
}

const CONTENT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

const MIN_CV_CHARS = 200;

export function createCvService(deps: CvUploadDeps) {
  return {
    async upload(userId: string, file: { buffer: Buffer }): Promise<{ characters: number }> {
      const type = detectCvType(file.buffer);
      if (!type) throw new ApiError(400, 'unsupported_file_type', 'Upload a PDF or DOCX file');
      const text = await extractCvText(file.buffer, type);
      if (text.length < MIN_CV_CHARS) {
        throw new ApiError(422, 'cv_text_too_short', 'Could not read enough text from this file. Scanned images are not supported.');
      }
      const path = await deps.upload(`${userId}/base-cv.${type}`, file.buffer, CONTENT_TYPES[type]);
      await deps.setCv(userId, { text, path });
      return { characters: text.length };
    },
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/cv && npm run typecheck`
Expected: all PASS. The DOCX path is not unit-tested; it is covered by the manual check in Task 13.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(cv): add CV parsing, PDF rendering, storage helpers and upload service

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Queues, match and tailor workers

**Files:**
- Create: `server/src/queues.ts`, `server/src/worker/match.ts`, `server/src/worker/tailor.ts`
- Test: `server/tests/worker/match.test.ts`, `server/tests/worker/tailor.test.ts`

**Interfaces:**
- Consumes: `matchesProfile`, `JobRow`, `ProfileRow`, `TailorResult`, `TailorInput`, `renderCvPdf`.
- Produces:
  - `QUEUES`, `type ScrapeJobData = { source: ScrapeSource }`, `type MatchJobData = { kind: 'job'; jobId: string } | { kind: 'user'; userId: string }`, `type TailorJobData = { userId: string; jobId: string }`, `createQueues(connection: Redis)`, `type Queues`
  - `tailorJobId(userId: string, jobId: string): string`
  - `interface MatchDeps { loadJob(id: string): Promise<JobRow | null>; loadCandidates(): Promise<ProfileRow[]>; loadProfile(userId: string): Promise<ProfileRow | null>; loadRecentJobs(days: number, limit: number): Promise<JobRow[]>; existingJobIds(userId: string, jobIds: string[]): Promise<Set<string>>; enqueueTailor(userId: string, jobId: string): Promise<void> }`
  - `matchJob(jobId: string, d: MatchDeps): Promise<number>`, `matchUser(userId: string, d: MatchDeps): Promise<number>` (return the number enqueued)
  - `interface TailorDeps { loadJob(id: string): Promise<JobRow | null>; loadProfile(userId: string): Promise<ProfileRow | null>; applicationExists(userId: string, jobId: string): Promise<boolean>; tailor(input: TailorInput): Promise<TailorResult>; renderPdf(text: string): Promise<Uint8Array>; uploadPdf(path: string, bytes: Uint8Array): Promise<string>; insertApplication(row: NewApplication): Promise<void> }`
  - `interface NewApplication { user_id: string; job_id: string; tailored_cv_text: string; tailored_cv_url: string; cover_letter_text: string; match_score: number; missing_keywords: string[]; status: 'pending_review' }`
  - `runTailor(data: TailorJobData, d: TailorDeps): Promise<'created' | 'skipped'>`

- [ ] **Step 1: Write the failing tests**

`server/tests/worker/match.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import type { JobRow, ProfileRow } from '../../src/db/types.js';
import { matchJob, matchUser, type MatchDeps } from '../../src/worker/match.js';

const job = (over: Partial<JobRow> = {}): JobRow => ({
  id: 'j1', title: 'Backend Engineer', company: 'Acme', location: 'Lagos', description: 'd', source: 'myjobmag',
  url: 'https://x/1', company_domain: null, dedupe_key: 'acme|backend engineer', created_at: '2026-10-17T00:00:00Z', ...over,
});
const profile = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  user_id: 'u1', base_cv_text: 'cv', base_cv_url: 'p', skills: [], years_experience: 3, desired_roles: ['backend engineer'],
  location: 'Lagos', salary_min: null, salary_max: null, apply_mode: 'manual', auto_threshold: 80, daily_cap: 20,
  auto_followup: false, updated_at: '', ...over,
});

function deps(over: Partial<MatchDeps> = {}): MatchDeps {
  return {
    loadJob: vi.fn().mockResolvedValue(job()),
    loadCandidates: vi.fn().mockResolvedValue([profile()]),
    loadProfile: vi.fn().mockResolvedValue(profile()),
    loadRecentJobs: vi.fn().mockResolvedValue([job()]),
    existingJobIds: vi.fn().mockResolvedValue(new Set<string>()),
    enqueueTailor: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('matchJob', () => {
  it('enqueues a tailor job for each matching candidate only', async () => {
    const d = deps({
      loadCandidates: vi.fn().mockResolvedValue([
        profile({ user_id: 'u1' }),
        profile({ user_id: 'u2', desired_roles: ['nurse'] }),
        profile({ user_id: 'u3', location: 'Abuja' }),
      ]),
    });
    expect(await matchJob('j1', d)).toBe(1);
    expect(d.enqueueTailor).toHaveBeenCalledWith('u1', 'j1');
    expect(d.enqueueTailor).toHaveBeenCalledTimes(1);
  });

  it('returns 0 when the job no longer exists', async () => {
    const d = deps({ loadJob: vi.fn().mockResolvedValue(null) });
    expect(await matchJob('gone', d)).toBe(0);
  });
});

describe('matchUser', () => {
  it('enqueues recent matching jobs the user has no application for, capped at 30', async () => {
    const jobs = Array.from({ length: 40 }, (_, i) => job({ id: `j${i}` }));
    const d = deps({ loadRecentJobs: vi.fn().mockResolvedValue(jobs), existingJobIds: vi.fn().mockResolvedValue(new Set(['j0'])) });
    expect(await matchUser('u1', d)).toBe(30);
    expect(d.enqueueTailor).not.toHaveBeenCalledWith('u1', 'j0');
    expect(d.loadRecentJobs).toHaveBeenCalledWith(7, 200);
  });

  it('does nothing without a CV or desired roles', async () => {
    expect(await matchUser('u1', deps({ loadProfile: vi.fn().mockResolvedValue(profile({ base_cv_text: null })) }))).toBe(0);
    expect(await matchUser('u1', deps({ loadProfile: vi.fn().mockResolvedValue(profile({ desired_roles: [] })) }))).toBe(0);
  });
});
```

`server/tests/worker/tailor.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import type { JobRow, ProfileRow } from '../../src/db/types.js';
import { tailorJobId } from '../../src/queues.js';
import { runTailor, type TailorDeps } from '../../src/worker/tailor.js';

const job: JobRow = {
  id: 'j1', title: 'Backend Engineer', company: 'Acme', location: 'Lagos', description: 'Node.js', source: 'myjobmag',
  url: 'https://x/1', company_domain: null, dedupe_key: 'k', created_at: '',
};
const profile: ProfileRow = {
  user_id: 'u1', base_cv_text: 'My CV text', base_cv_url: 'u1/base-cv.pdf', skills: ['Node.js'], years_experience: 4,
  desired_roles: ['backend engineer'], location: 'Lagos', salary_min: null, salary_max: null, apply_mode: 'manual',
  auto_threshold: 80, daily_cap: 20, auto_followup: false, updated_at: '',
};
const result = { tailored_cv_text: 'TAILORED', cover_letter_text: 'LETTER', match_score_0_to_100: 77, missing_keywords: ['Docker'] };

function deps(over: Partial<TailorDeps> = {}): TailorDeps {
  return {
    loadJob: vi.fn().mockResolvedValue(job),
    loadProfile: vi.fn().mockResolvedValue(profile),
    applicationExists: vi.fn().mockResolvedValue(false),
    tailor: vi.fn().mockResolvedValue(result),
    renderPdf: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    uploadPdf: vi.fn(async (path: string) => path),
    insertApplication: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('tailorJobId', () => {
  it('is deterministic and contains no colon (BullMQ forbids it)', () => {
    expect(tailorJobId('u1', 'j1')).toBe('tailor-u1-j1');
    expect(tailorJobId('u1', 'j1')).not.toContain(':');
  });
});

describe('runTailor', () => {
  it('tailors, renders, uploads and inserts a pending_review application', async () => {
    const d = deps();
    expect(await runTailor({ userId: 'u1', jobId: 'j1' }, d)).toBe('created');
    expect(d.tailor).toHaveBeenCalledWith({
      cvText: 'My CV text',
      job: { title: 'Backend Engineer', company: 'Acme', location: 'Lagos', description: 'Node.js' },
      profile: { skills: ['Node.js'], yearsExperience: 4, location: 'Lagos' },
    });
    expect(d.renderPdf).toHaveBeenCalledWith('TAILORED');
    expect(d.uploadPdf).toHaveBeenCalledWith('u1/tailored/j1.pdf', expect.any(Uint8Array));
    expect(d.insertApplication).toHaveBeenCalledWith({
      user_id: 'u1', job_id: 'j1', tailored_cv_text: 'TAILORED', tailored_cv_url: 'u1/tailored/j1.pdf',
      cover_letter_text: 'LETTER', match_score: 77, missing_keywords: ['Docker'], status: 'pending_review',
    });
  });

  it('skips without calling the AI when an application already exists', async () => {
    const d = deps({ applicationExists: vi.fn().mockResolvedValue(true) });
    expect(await runTailor({ userId: 'u1', jobId: 'j1' }, d)).toBe('skipped');
    expect(d.tailor).not.toHaveBeenCalled();
  });

  it.each([
    ['job missing', { loadJob: vi.fn().mockResolvedValue(null) }],
    ['profile missing', { loadProfile: vi.fn().mockResolvedValue(null) }],
    ['no base CV', { loadProfile: vi.fn().mockResolvedValue({ ...profile, base_cv_text: null }) }],
  ])('skips when %s', async (_name, over) => {
    const d = deps(over);
    expect(await runTailor({ userId: 'u1', jobId: 'j1' }, d)).toBe('skipped');
    expect(d.tailor).not.toHaveBeenCalled();
  });

  it('propagates AI failures so BullMQ can retry or delay', async () => {
    const d = deps({ tailor: vi.fn().mockRejectedValue(new Error('ai down')) });
    await expect(runTailor({ userId: 'u1', jobId: 'j1' }, d)).rejects.toThrow('ai down');
    expect(d.insertApplication).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/worker/match.test.ts tests/worker/tailor.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`server/src/queues.ts`:
```ts
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { ScrapeSource } from './scrapers/index.js';

export const QUEUES = { scrape: 'scrape', match: 'match', tailor: 'tailor' } as const;

export type ScrapeJobData = { source: ScrapeSource };
export type MatchJobData = { kind: 'job'; jobId: string } | { kind: 'user'; userId: string };
export type TailorJobData = { userId: string; jobId: string };

/** BullMQ forbids ":" in custom job ids. Deterministic id = one tailor job per (user, job). */
export const tailorJobId = (userId: string, jobId: string) => `tailor-${userId}-${jobId}`;

export function createQueues(connection: Redis) {
  const opts = {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 30_000 },
      removeOnComplete: { age: 86_400, count: 1000 },
      removeOnFail: { age: 604_800 },
    },
  };
  return {
    scrape: new Queue<ScrapeJobData>(QUEUES.scrape, opts),
    match: new Queue<MatchJobData>(QUEUES.match, opts),
    tailor: new Queue<TailorJobData>(QUEUES.tailor, opts),
  };
}

export type Queues = ReturnType<typeof createQueues>;
```

`server/src/worker/match.ts`:
```ts
import type { JobRow, ProfileRow } from '../db/types.js';
import { matchesProfile } from '../domain/prefilter.js';

export interface MatchDeps {
  loadJob(id: string): Promise<JobRow | null>;
  /** Profiles that have a base CV and at least one desired role. */
  loadCandidates(): Promise<ProfileRow[]>;
  loadProfile(userId: string): Promise<ProfileRow | null>;
  loadRecentJobs(days: number, limit: number): Promise<JobRow[]>;
  existingJobIds(userId: string, jobIds: string[]): Promise<Set<string>>;
  enqueueTailor(userId: string, jobId: string): Promise<void>;
}

const MAX_PER_USER_RUN = 30;

/** A new job arrived: queue tailoring for every user it plausibly fits. */
export async function matchJob(jobId: string, d: MatchDeps): Promise<number> {
  const job = await d.loadJob(jobId);
  if (!job) return 0;
  let count = 0;
  for (const profile of await d.loadCandidates()) {
    if (!matchesProfile(job, profile)) continue;
    await d.enqueueTailor(profile.user_id, job.id);
    count++;
  }
  return count;
}

/** A user set up or changed their profile: catch them up on jobs from the last 7 days. */
export async function matchUser(userId: string, d: MatchDeps): Promise<number> {
  const profile = await d.loadProfile(userId);
  if (!profile || !profile.base_cv_text || profile.desired_roles.length === 0) return 0;
  const recent = await d.loadRecentJobs(7, 200);
  const done = await d.existingJobIds(userId, recent.map((j) => j.id));
  const todo = recent.filter((j) => !done.has(j.id) && matchesProfile(j, profile)).slice(0, MAX_PER_USER_RUN);
  for (const job of todo) await d.enqueueTailor(userId, job.id);
  return todo.length;
}
```

`server/src/worker/tailor.ts`:
```ts
import type { JobRow, ProfileRow } from '../db/types.js';
import type { TailorInput, TailorResult } from '../services/ai/tailor.js';
import type { TailorJobData } from '../queues.js';

export interface NewApplication {
  user_id: string;
  job_id: string;
  tailored_cv_text: string;
  tailored_cv_url: string;
  cover_letter_text: string;
  match_score: number;
  missing_keywords: string[];
  status: 'pending_review';
}

export interface TailorDeps {
  loadJob(id: string): Promise<JobRow | null>;
  loadProfile(userId: string): Promise<ProfileRow | null>;
  applicationExists(userId: string, jobId: string): Promise<boolean>;
  tailor(input: TailorInput): Promise<TailorResult>;
  renderPdf(text: string): Promise<Uint8Array>;
  uploadPdf(path: string, bytes: Uint8Array): Promise<string>;
  insertApplication(row: NewApplication): Promise<void>;
}

export async function runTailor({ userId, jobId }: TailorJobData, d: TailorDeps): Promise<'created' | 'skipped'> {
  if (await d.applicationExists(userId, jobId)) return 'skipped';
  const [job, profile] = await Promise.all([d.loadJob(jobId), d.loadProfile(userId)]);
  if (!job || !profile || !profile.base_cv_text) return 'skipped';

  const result = await d.tailor({
    cvText: profile.base_cv_text,
    job: { title: job.title, company: job.company, location: job.location, description: job.description },
    profile: { skills: profile.skills, yearsExperience: profile.years_experience, location: profile.location },
  });

  const pdf = await d.renderPdf(result.tailored_cv_text);
  const path = await d.uploadPdf(`${userId}/tailored/${jobId}.pdf`, pdf);

  await d.insertApplication({
    user_id: userId,
    job_id: jobId,
    tailored_cv_text: result.tailored_cv_text,
    tailored_cv_url: path,
    cover_letter_text: result.cover_letter_text,
    match_score: result.match_score_0_to_100,
    missing_keywords: result.missing_keywords,
    status: 'pending_review',
  });
  return 'created';
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/worker && npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(worker): add queues plus match and tailor job logic

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Worker process (wiring, Supabase repos, scheduler)

**Files:**
- Create: `server/src/worker/index.ts`, `server/src/worker/repos.ts`

**Interfaces:**
- Consumes: everything from Tasks 3 to 11.
- Produces: runnable worker process (`npm run dev:worker`). `repos.ts` exports `createWorkerRepos(db: Db)` returning the Supabase-backed pieces used by the deps objects.

This task is wiring only. The logic it connects is covered by Tasks 8 to 11, and the wiring is verified by the live smoke test in Step 4.

- [ ] **Step 1: Write the Supabase-backed repos** — `server/src/worker/repos.ts`

```ts
import type { JobRow, ProfileRow } from '../db/types.js';
import type { Db } from '../lib/supabase.js';
import type { NewApplication } from './tailor.js';

export function createWorkerRepos(db: Db) {
  return {
    async loadJob(id: string): Promise<JobRow | null> {
      const { data, error } = await db.from('jobs').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return (data as JobRow | null) ?? null;
    },

    async loadProfile(userId: string): Promise<ProfileRow | null> {
      const { data, error } = await db.from('profiles').select('*').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return (data as ProfileRow | null) ?? null;
    },

    async loadCandidates(): Promise<ProfileRow[]> {
      const { data, error } = await db
        .from('profiles')
        .select('*')
        .not('base_cv_text', 'is', null)
        .not('desired_roles', 'eq', '{}');
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },

    async loadRecentJobs(days: number, limit: number): Promise<JobRow[]> {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await db
        .from('jobs')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as JobRow[];
    },

    async existingJobIds(userId: string, jobIds: string[]): Promise<Set<string>> {
      if (jobIds.length === 0) return new Set();
      const { data, error } = await db.from('applications').select('job_id').eq('user_id', userId).in('job_id', jobIds);
      if (error) throw error;
      return new Set((data ?? []).map((r) => (r as { job_id: string }).job_id));
    },

    async applicationExists(userId: string, jobId: string): Promise<boolean> {
      const { count, error } = await db
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('job_id', jobId);
      if (error) throw error;
      return (count ?? 0) > 0;
    },

    async insertApplication(row: NewApplication): Promise<void> {
      const { error } = await db.from('applications').insert(row);
      // 23505 = unique_violation: another worker created it first, which is fine.
      if (error && error.code !== '23505') throw error;
    },
  };
}
```

- [ ] **Step 2: Write the worker entry** — `server/src/worker/index.ts`

```ts
import { DelayedError, Worker } from 'bullmq';
import { getEnv } from '../lib/env.js';
import { fetchText, sleep } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';
import { createSupabaseAdmin } from '../lib/supabase.js';
import {
  QUEUES, createQueues, tailorJobId,
  type MatchJobData, type ScrapeJobData, type TailorJobData,
} from '../queues.js';
import { SCRAPE_LIMITS, SCRAPE_SOURCES, createScrapers } from '../scrapers/index.js';
import { geminiProvider, openaiProvider } from '../services/ai/providers.js';
import { QuotaExhaustedError } from '../services/ai/generate.js';
import { createQuota, msUntilUtcMidnight } from '../services/ai/quota.js';
import { createTailor } from '../services/ai/tailor.js';
import { renderCvPdf } from '../services/cv/pdf.js';
import { findSeenUrls, insertJobs } from '../services/jobs/repo.js';
import { uploadFile } from '../services/storage.js';
import { matchJob, matchUser } from './match.js';
import { createWorkerRepos } from './repos.js';
import { runScrape } from './scrape.js';
import { runTailor } from './tailor.js';

const SIX_HOURS = 6 * 60 * 60 * 1000;

// Upstash free tier counts every Redis command. Poll idle queues rarely to stay inside the free allowance.
const idleTuning = { drainDelay: 60, stalledInterval: 120_000 } as const;

async function main() {
  const env = getEnv();
  const db = createSupabaseAdmin(env);
  const repos = createWorkerRepos(db);
  const queues = createQueues(createRedis(env.UPSTASH_REDIS_URL));
  const scrapers = createScrapers(fetchText);

  const quota = createQuota(createRedis(env.UPSTASH_REDIS_URL), env.AI_DAILY_LIMIT);
  const gemini = geminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
  const primary: typeof gemini = async (p) => {
    if (!(await quota.consume())) throw new QuotaExhaustedError();
    return gemini(p);
  };
  const fallback = env.OPENAI_API_KEY
    ? openaiProvider({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL })
    : undefined;
  const tailor = createTailor({ primary, fallback });

  const enqueueTailor = async (userId: string, jobId: string) => {
    await queues.tailor.add('tailor', { userId, jobId }, { jobId: tailorJobId(userId, jobId) });
  };
  const matchDeps = { ...repos, enqueueTailor };

  const scrapeWorker = new Worker<ScrapeJobData>(
    QUEUES.scrape,
    async (job) => {
      const { source } = job.data;
      return runScrape({
        scraper: scrapers[source],
        maxNew: SCRAPE_LIMITS[source],
        findSeenUrls: (urls) => findSeenUrls(db, urls),
        insertJobs: (jobs) => insertJobs(db, jobs),
        enqueueMatch: async (jobId) => {
          await queues.match.add('match', { kind: 'job', jobId }, { jobId: `match-job-${jobId}` });
        },
        sleep,
        log: logger,
      });
    },
    { connection: createRedis(env.UPSTASH_REDIS_URL), concurrency: 1, ...idleTuning },
  );

  const matchWorker = new Worker<MatchJobData>(
    QUEUES.match,
    async (job) => (job.data.kind === 'job' ? matchJob(job.data.jobId, matchDeps) : matchUser(job.data.userId, matchDeps)),
    { connection: createRedis(env.UPSTASH_REDIS_URL), concurrency: 2, ...idleTuning },
  );

  const tailorWorker = new Worker<TailorJobData>(
    QUEUES.tailor,
    async (job, token) => {
      try {
        return await runTailor(job.data, {
          ...repos,
          tailor,
          renderPdf: renderCvPdf,
          uploadPdf: (path, bytes) => uploadFile(db, path, bytes, 'application/pdf'),
        });
      } catch (err) {
        if (err instanceof QuotaExhaustedError) {
          // No fallback provider and today's budget is spent: wait for tomorrow instead of failing.
          await job.moveToDelayed(Date.now() + msUntilUtcMidnight(), token);
          throw new DelayedError();
        }
        throw err;
      }
    },
    {
      connection: createRedis(env.UPSTASH_REDIS_URL),
      concurrency: 2,
      limiter: { max: 10, duration: 60_000 }, // about 10 AI calls a minute
      ...idleTuning,
    },
  );

  for (const w of [scrapeWorker, matchWorker, tailorWorker]) {
    w.on('failed', (job, err) => logger.error({ queue: w.name, jobId: job?.id, err }, 'job failed'));
    w.on('error', (err) => logger.error({ queue: w.name, err }, 'worker error'));
  }

  for (const source of SCRAPE_SOURCES) {
    await queues.scrape.upsertJobScheduler(`scrape-${source}`, { every: SIX_HOURS }, { name: 'scrape', data: { source } });
    await queues.scrape.add('scrape', { source }, { jobId: `boot-${source}-${Date.now()}` });
  }
  logger.info({ sources: SCRAPE_SOURCES }, 'worker started; scraping every 6 hours');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await Promise.all([scrapeWorker.close(), matchWorker.close(), tailorWorker.close()]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'worker failed to start');
  process.exit(1);
});
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0. Fix any type errors in the wiring before continuing.

- [ ] **Step 4: Live smoke test of the worker**

Prerequisites: copy `.env.example` to `.env` at the repo root and fill in Supabase, Gemini and Upstash values (generate `ENCRYPTION_KEY` with the command in `.env.example`). A test user must exist (Task 2 Step 3) with a CV text and desired roles. Set them in the SQL editor:
```sql
update public.profiles
set base_cv_text = '<paste 300+ characters of a real CV>', desired_roles = array['<a role that exists in current listings>'], location = 'Lagos'
where user_id = '<test user id>';
```
Run: `npm run dev:worker`
Expected log lines within about a minute: `worker started`, then `scrape finished` for each source with `inserted` greater than 0 (first run). In the SQL editor:
```sql
select source, count(*) from public.jobs group by source;
select status, match_score, left(cover_letter_text, 80) from public.applications;
```
Expected: jobs for all three sources; at least one `pending_review` application with a score and cover-letter text (may take a few minutes at about 10 AI calls a minute). Stop with Ctrl+C and confirm a clean `shutting down` log.

If a source reports `inserted: 0` on the first run, inspect the error log lines; selectors are covered by Tasks 6 and 7 fixtures, so check for blocking (HTTP 403) first.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(worker): wire scrape, match and tailor workers with 6-hourly scheduler

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: API (auth, profile, CV upload, applications, refresh)

**Files:**
- Create: `server/src/api/auth.ts`, `errors.ts`, `deps.ts`, `app.ts`, `repos.ts`, `index.ts`
- Create: `server/src/api/routes/profile.ts`, `cv.ts`, `applications.ts`, `jobs.ts`
- Create: `server/src/services/applications.ts`
- Test: `server/tests/api/app.test.ts`, `server/tests/services/applications.test.ts`

**Interfaces:**
- Consumes: `ApiError`, `createCvService`, `renderCvPdf`, `uploadFile`, `createSignedUrl`, `ProfileRow`, `ApplicationRow`, `ApplicationStatus`.
- Produces:
  - `interface AuthUser { id: string; email: string | null }`, `type GetUser = (token: string) => Promise<AuthUser | null>`, `requireAuth(getUser: GetUser): RequestHandler`
  - `type ProfilePatch` (zod-validated body), `profilePatchSchema`
  - `interface ProfileRepo { get(userId: string): Promise<ProfileRow | null>; update(userId: string, patch: ProfilePatch): Promise<ProfileRow> }`
  - `interface ApplicationWithJob extends ApplicationRow { job: { title: string; company: string; location: string; source: string; url: string; company_domain: string | null } | null }`
  - `interface ApplicationsRepo { list(userId: string, status?: ApplicationStatus): Promise<ApplicationWithJob[]>; get(userId: string, id: string): Promise<ApplicationWithJob | null>; update(userId: string, id: string, patch: Record<string, unknown>): Promise<ApplicationWithJob | null> }`
  - `createApplicationsService(deps: { repo: ApplicationsRepo; renderPdf(text: string): Promise<Uint8Array>; uploadPdf(path: string, bytes: Uint8Array): Promise<string>; signUrl(path: string): Promise<string> }): ApplicationsService`
  - `interface ApplicationsService { list(userId, status?): Promise<ApplicationWithJob[]>; get(userId, id): Promise<(ApplicationWithJob & { cv_pdf_url: string | null }) | null>; update(userId, id, patch: { tailored_cv_text?: string; cover_letter_text?: string }): Promise<ApplicationWithJob | null> }`
  - `interface JobsService { refresh(userId: string): Promise<void>; rematch(userId: string): Promise<void> }`
  - `createApp(d: AppDeps): Express`

- [ ] **Step 1: Write the failing tests**

`server/tests/services/applications.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createApplicationsService } from '../../src/services/applications.js';
import type { ApplicationWithJob } from '../../src/api/deps.js';

const app: ApplicationWithJob = {
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'OLD', tailored_cv_url: 'u1/tailored/j1.pdf',
  cover_letter_text: 'LETTER', match_score: 70, missing_keywords: [], hiring_manager_email: null, email_confidence: null,
  apply_method: null, status: 'pending_review', applied_at: null, follow_up_at: null, created_at: '', job: null,
};

function make(over: Partial<Parameters<typeof createApplicationsService>[0]> = {}) {
  const repo = {
    list: vi.fn().mockResolvedValue([app]),
    get: vi.fn().mockResolvedValue(app),
    update: vi.fn().mockResolvedValue({ ...app, tailored_cv_text: 'NEW' }),
  };
  const deps = {
    repo,
    renderPdf: vi.fn().mockResolvedValue(new Uint8Array([9])),
    uploadPdf: vi.fn(async (p: string) => p),
    signUrl: vi.fn().mockResolvedValue('https://signed/url'),
    ...over,
  };
  return { svc: createApplicationsService(deps), deps, repo };
}

describe('applications service', () => {
  it('get() adds a signed pdf url', async () => {
    const { svc } = make();
    expect((await svc.get('u1', 'a1'))!.cv_pdf_url).toBe('https://signed/url');
  });

  it('get() returns null for an unknown application and does not sign', async () => {
    const { svc, deps } = make({ repo: { list: vi.fn(), get: vi.fn().mockResolvedValue(null), update: vi.fn() } });
    expect(await svc.get('u1', 'nope')).toBeNull();
    expect(deps.signUrl).not.toHaveBeenCalled();
  });

  it('update() with changed CV text re-renders and re-uploads the PDF', async () => {
    const { svc, deps, repo } = make();
    await svc.update('u1', 'a1', { tailored_cv_text: 'NEW' });
    expect(deps.renderPdf).toHaveBeenCalledWith('NEW');
    expect(deps.uploadPdf).toHaveBeenCalledWith('u1/tailored/j1.pdf', expect.any(Uint8Array));
    expect(repo.update).toHaveBeenCalledWith('u1', 'a1', { tailored_cv_text: 'NEW', tailored_cv_url: 'u1/tailored/j1.pdf' });
  });

  it('update() with only the cover letter does not touch the PDF', async () => {
    const { svc, deps, repo } = make();
    await svc.update('u1', 'a1', { cover_letter_text: 'NEW LETTER' });
    expect(deps.renderPdf).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith('u1', 'a1', { cover_letter_text: 'NEW LETTER' });
  });

  it('update() on an unknown application returns null without writing', async () => {
    const { svc, repo } = make({ repo: { list: vi.fn(), get: vi.fn().mockResolvedValue(null), update: vi.fn() } });
    expect(await svc.update('u1', 'nope', { cover_letter_text: 'x' })).toBeNull();
    expect(repo.update).not.toHaveBeenCalled();
  });
});
```

`server/tests/api/app.test.ts`:
```ts
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import type { AppDeps } from '../../src/api/deps.js';
import { ApiError } from '../../src/lib/errors.js';

const profile = {
  user_id: 'u1', base_cv_text: null, base_cv_url: null, skills: [], years_experience: null, desired_roles: [],
  location: null, salary_min: null, salary_max: null, apply_mode: 'manual', auto_threshold: 80, daily_cap: 20,
  auto_followup: false, updated_at: '',
};

function makeDeps(over: Partial<AppDeps> = {}): AppDeps {
  return {
    webOrigin: 'http://localhost:3000',
    getUser: vi.fn(async (t: string) => (t === 'good' ? { id: 'u1', email: 'a@b.c' } : null)),
    profiles: { get: vi.fn().mockResolvedValue(profile), update: vi.fn(async (_id, patch) => ({ ...profile, ...patch })) },
    cv: { upload: vi.fn().mockResolvedValue({ characters: 1234 }) },
    applications: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
    },
    jobs: { refresh: vi.fn().mockResolvedValue(undefined), rematch: vi.fn().mockResolvedValue(undefined) },
    ...over,
  };
}
const authed = (app: ReturnType<typeof createApp>) => ({
  get: (u: string) => request(app).get(u).set('authorization', 'Bearer good'),
  put: (u: string) => request(app).put(u).set('authorization', 'Bearer good'),
  patch: (u: string) => request(app).patch(u).set('authorization', 'Bearer good'),
  post: (u: string) => request(app).post(u).set('authorization', 'Bearer good'),
});

describe('auth', () => {
  it('serves /health without a token', async () => {
    expect((await request(createApp(makeDeps())).get('/health')).body).toEqual({ ok: true });
  });
  it('rejects a missing or invalid token with 401', async () => {
    const app = createApp(makeDeps());
    expect((await request(app).get('/profile')).status).toBe(401);
    expect((await request(app).get('/profile').set('authorization', 'Bearer bad')).status).toBe(401);
  });
});

describe('profile', () => {
  it('GET /profile returns the profile for the token user', async () => {
    const deps = makeDeps();
    const res = await authed(createApp(deps)).get('/profile');
    expect(res.status).toBe(200);
    expect(deps.profiles.get).toHaveBeenCalledWith('u1');
  });

  it('PUT /profile validates, updates and triggers a rematch', async () => {
    const deps = makeDeps();
    const body = { desired_roles: ['backend engineer'], location: 'Lagos', skills: ['Node.js'], years_experience: 4, apply_mode: 'auto', daily_cap: 15 };
    const res = await authed(createApp(deps)).put('/profile').send(body);
    expect(res.status).toBe(200);
    expect(deps.profiles.update).toHaveBeenCalledWith('u1', body);
    expect(deps.jobs.rematch).toHaveBeenCalledWith('u1');
  });

  it.each([
    ['unknown location', { location: 'Kano' }],
    ['daily cap above 20', { daily_cap: 21 }],
    ['threshold above 100', { auto_threshold: 101 }],
    ['bad apply mode', { apply_mode: 'yolo' }],
    ['negative experience', { years_experience: -1 }],
    ['extra field', { user_id: 'someone-else' }],
  ])('PUT /profile rejects %s with 400', async (_n, body) => {
    const deps = makeDeps();
    const res = await authed(createApp(deps)).put('/profile').send(body);
    expect(res.status).toBe(400);
    expect(deps.profiles.update).not.toHaveBeenCalled();
  });
});

describe('cv upload', () => {
  it('400 when no file is attached', async () => {
    expect((await authed(createApp(makeDeps())).post('/cv')).status).toBe(400);
  });

  it('passes the file to the service and triggers a rematch', async () => {
    const deps = makeDeps();
    const res = await authed(createApp(deps)).post('/cv').attach('file', Buffer.from('%PDF-1.7 hello'), 'cv.pdf');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ characters: 1234 });
    expect(deps.cv.upload).toHaveBeenCalledWith('u1', { buffer: expect.any(Buffer) });
    expect(deps.jobs.rematch).toHaveBeenCalledWith('u1');
  });

  it('413 when the file is over 5 MB', async () => {
    const res = await authed(createApp(makeDeps())).post('/cv').attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'big.pdf');
    expect(res.status).toBe(413);
  });

  it('maps service ApiErrors to their status', async () => {
    const deps = makeDeps({ cv: { upload: vi.fn().mockRejectedValue(new ApiError(400, 'unsupported_file_type')) } });
    const res = await authed(createApp(deps)).post('/cv').attach('file', Buffer.from('nope'), 'x.txt');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unsupported_file_type');
  });
});

describe('applications', () => {
  it('GET /applications passes a valid status filter', async () => {
    const deps = makeDeps();
    await authed(createApp(deps)).get('/applications?status=pending_review');
    expect(deps.applications.list).toHaveBeenCalledWith('u1', 'pending_review');
  });

  it('GET /applications rejects an unknown status with 400', async () => {
    expect((await authed(createApp(makeDeps())).get('/applications?status=bogus')).status).toBe(400);
  });

  it('GET /applications/:id returns 404 when not found', async () => {
    expect((await authed(createApp(makeDeps())).get('/applications/abc')).status).toBe(404);
  });

  it('PATCH /applications/:id only accepts the two text fields', async () => {
    const deps = makeDeps({ applications: { list: vi.fn(), get: vi.fn(), update: vi.fn().mockResolvedValue({ id: 'a1' } as never) } });
    const ok = await authed(createApp(deps)).patch('/applications/a1').send({ cover_letter_text: 'hi there' });
    expect(ok.status).toBe(200);
    expect(deps.applications.update).toHaveBeenCalledWith('u1', 'a1', { cover_letter_text: 'hi there' });
    expect((await authed(createApp(deps)).patch('/applications/a1').send({ status: 'applied' })).status).toBe(400);
    expect((await authed(createApp(deps)).patch('/applications/a1').send({})).status).toBe(400);
  });
});

describe('jobs refresh', () => {
  it('POST /jobs/refresh triggers a refresh and answers 202', async () => {
    const deps = makeDeps();
    const res = await authed(createApp(deps)).post('/jobs/refresh');
    expect(res.status).toBe(202);
    expect(deps.jobs.refresh).toHaveBeenCalledWith('u1');
  });

  it('rate limits to 3 refreshes per hour per user', async () => {
    const app = createApp(makeDeps());
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await authed(app).post('/jobs/refresh')).status);
    expect(statuses).toEqual([202, 202, 202, 429]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/api tests/services`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the API layer**

`server/src/api/deps.ts`:
```ts
import { z } from 'zod';
import type { ApplicationRow, ApplicationStatus, ProfileRow } from '../db/types.js';
import type { GetUser } from './auth.js';

export const profilePatchSchema = z
  .object({
    skills: z.array(z.string().trim().min(1).max(60)).max(100),
    years_experience: z.number().int().min(0).max(60).nullable(),
    desired_roles: z.array(z.string().trim().min(2).max(80)).max(20),
    location: z.enum(['Lagos', 'Abuja', 'Remote']).nullable(),
    salary_min: z.number().int().min(0).nullable(),
    salary_max: z.number().int().min(0).nullable(),
    apply_mode: z.enum(['manual', 'auto']),
    auto_threshold: z.number().int().min(0).max(100),
    daily_cap: z.number().int().min(1).max(20),
    auto_followup: z.boolean(),
  })
  .partial()
  .strict();
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export interface ProfileRepo {
  get(userId: string): Promise<ProfileRow | null>;
  update(userId: string, patch: ProfilePatch): Promise<ProfileRow>;
}

export interface ApplicationWithJob extends ApplicationRow {
  job: { title: string; company: string; location: string; source: string; url: string; company_domain: string | null } | null;
}

export interface ApplicationsRepo {
  list(userId: string, status?: ApplicationStatus): Promise<ApplicationWithJob[]>;
  get(userId: string, id: string): Promise<ApplicationWithJob | null>;
  update(userId: string, id: string, patch: Record<string, unknown>): Promise<ApplicationWithJob | null>;
}

export interface ApplicationsService {
  list(userId: string, status?: ApplicationStatus): Promise<ApplicationWithJob[]>;
  get(userId: string, id: string): Promise<(ApplicationWithJob & { cv_pdf_url: string | null }) | null>;
  update(userId: string, id: string, patch: { tailored_cv_text?: string; cover_letter_text?: string }): Promise<ApplicationWithJob | null>;
}

export interface JobsService {
  refresh(userId: string): Promise<void>;
  rematch(userId: string): Promise<void>;
}

export interface AppDeps {
  webOrigin: string;
  getUser: GetUser;
  profiles: ProfileRepo;
  cv: { upload(userId: string, file: { buffer: Buffer }): Promise<{ characters: number }> };
  applications: ApplicationsService;
  jobs: JobsService;
}
```

`server/src/api/auth.ts`:
```ts
import type { RequestHandler } from 'express';

export interface AuthUser {
  id: string;
  email: string | null;
}
export type GetUser = (token: string) => Promise<AuthUser | null>;

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function requireAuth(getUser: GetUser): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer (.+)$/i.exec(req.header('authorization') ?? '');
    if (!match) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      const user = await getUser(match[1]!);
      if (!user) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}
```

`server/src/api/errors.ts`:
```ts
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'invalid_request', details: err.flatten() });
  } else if (err instanceof multer.MulterError) {
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code.toLowerCase() });
  } else if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.code, message: err.message });
  } else {
    logger.error({ err }, 'unhandled error');
    res.status(500).json({ error: 'internal_error' });
  }
};
```

`server/src/api/routes/profile.ts`:
```ts
import { Router } from 'express';
import { asyncHandler } from '../errors.js';
import { profilePatchSchema, type AppDeps } from '../deps.js';
import { ApiError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export function profileRoutes(d: Pick<AppDeps, 'profiles' | 'jobs'>) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const profile = await d.profiles.get(req.user!.id);
    if (!profile) throw new ApiError(404, 'profile_not_found');
    res.json(profile);
  }));

  router.put('/', asyncHandler(async (req, res) => {
    const patch = profilePatchSchema.parse(req.body);
    const updated = await d.profiles.update(req.user!.id, patch);
    d.jobs.rematch(req.user!.id).catch((err) => logger.warn({ err }, 'rematch after profile update failed'));
    res.json(updated);
  }));

  return router;
}
```

`server/src/api/routes/cv.ts`:
```ts
import { Router } from 'express';
import multer from 'multer';
import { ApiError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

export function cvRoutes(d: Pick<AppDeps, 'cv' | 'jobs'>) {
  const router = Router();
  router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'file_required', 'Attach a file in the "file" field');
    const result = await d.cv.upload(req.user!.id, { buffer: req.file.buffer });
    d.jobs.rematch(req.user!.id).catch((err) => logger.warn({ err }, 'rematch after CV upload failed'));
    res.json(result);
  }));
  return router;
}
```

`server/src/api/routes/applications.ts`:
```ts
import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../../lib/errors.js';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

const statusSchema = z.enum(['pending_review', 'approved', 'applied', 'interviewing', 'rejected', 'offer', 'skipped']);
const patchSchema = z
  .object({ tailored_cv_text: z.string().min(50).max(30_000), cover_letter_text: z.string().min(20).max(10_000) })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide tailored_cv_text and/or cover_letter_text');

export function applicationRoutes(d: Pick<AppDeps, 'applications'>) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const status = req.query.status === undefined ? undefined : statusSchema.parse(req.query.status);
    res.json(await d.applications.list(req.user!.id, status));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const app = await d.applications.get(req.user!.id, req.params.id!);
    if (!app) throw new ApiError(404, 'application_not_found');
    res.json(app);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const patch = patchSchema.parse(req.body);
    const app = await d.applications.update(req.user!.id, req.params.id!, patch);
    if (!app) throw new ApiError(404, 'application_not_found');
    res.json(app);
  }));

  return router;
}
```

`server/src/api/routes/jobs.ts`:
```ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

export function jobRoutes(d: Pick<AppDeps, 'jobs'>) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 3,
    keyGenerator: (req) => req.user!.id,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited' },
  });
  router.post('/refresh', limiter, asyncHandler(async (req, res) => {
    await d.jobs.refresh(req.user!.id);
    res.status(202).json({ queued: true });
  }));
  return router;
}
```

`server/src/api/app.ts`:
```ts
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { requireAuth } from './auth.js';
import type { AppDeps } from './deps.js';
import { errorHandler } from './errors.js';
import { applicationRoutes } from './routes/applications.js';
import { cvRoutes } from './routes/cv.js';
import { jobRoutes } from './routes/jobs.js';
import { profileRoutes } from './routes/profile.js';

export function createApp(d: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: d.webOrigin }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use(requireAuth(d.getUser));
  app.use(rateLimit({ windowMs: 60_000, limit: 120, keyGenerator: (req) => req.user!.id, standardHeaders: true, legacyHeaders: false }));

  app.use('/profile', profileRoutes(d));
  app.use('/cv', cvRoutes(d));
  app.use('/applications', applicationRoutes(d));
  app.use('/jobs', jobRoutes(d));

  app.use(errorHandler);
  return app;
}
```

`server/src/services/applications.ts`:
```ts
import type { ApplicationStatus } from '../db/types.js';
import type { ApplicationsRepo, ApplicationsService } from '../api/deps.js';

export function createApplicationsService(deps: {
  repo: ApplicationsRepo;
  renderPdf(text: string): Promise<Uint8Array>;
  uploadPdf(path: string, bytes: Uint8Array): Promise<string>;
  signUrl(path: string): Promise<string>;
}): ApplicationsService {
  return {
    list: (userId: string, status?: ApplicationStatus) => deps.repo.list(userId, status),

    async get(userId, id) {
      const app = await deps.repo.get(userId, id);
      if (!app) return null;
      return { ...app, cv_pdf_url: app.tailored_cv_url ? await deps.signUrl(app.tailored_cv_url) : null };
    },

    async update(userId, id, patch) {
      const existing = await deps.repo.get(userId, id);
      if (!existing) return null;
      const changes: Record<string, unknown> = { ...patch };
      if (patch.tailored_cv_text !== undefined && patch.tailored_cv_text !== existing.tailored_cv_text) {
        const pdf = await deps.renderPdf(patch.tailored_cv_text);
        changes.tailored_cv_url = await deps.uploadPdf(`${userId}/tailored/${existing.job_id}.pdf`, pdf);
      }
      return deps.repo.update(userId, id, changes);
    },
  };
}
```

`server/src/api/repos.ts`:
```ts
import type { ApplicationStatus, ProfileRow } from '../db/types.js';
import type { Db } from '../lib/supabase.js';
import type { ApplicationWithJob, ApplicationsRepo, ProfilePatch, ProfileRepo } from './deps.js';

const APP_SELECT = '*, job:jobs(title, company, location, source, url, company_domain)';

export function createProfileRepo(db: Db): ProfileRepo {
  return {
    async get(userId) {
      const { data, error } = await db.from('profiles').select('*').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return (data as ProfileRow | null) ?? null;
    },
    async update(userId, patch: ProfilePatch) {
      const { data, error } = await db
        .from('profiles')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .select('*')
        .single();
      if (error) throw error;
      return data as ProfileRow;
    },
  };
}

export function createApplicationsRepo(db: Db): ApplicationsRepo {
  return {
    async list(userId, status?: ApplicationStatus) {
      let q = db.from('applications').select(APP_SELECT).eq('user_id', userId).order('match_score', { ascending: false, nullsFirst: false });
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ApplicationWithJob[];
    },
    async get(userId, id) {
      const { data, error } = await db.from('applications').select(APP_SELECT).eq('user_id', userId).eq('id', id).maybeSingle();
      if (error) throw error;
      return (data as unknown as ApplicationWithJob | null) ?? null;
    },
    async update(userId, id, patch) {
      const { data, error } = await db
        .from('applications')
        .update(patch)
        .eq('user_id', userId)
        .eq('id', id)
        .select(APP_SELECT)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ApplicationWithJob | null) ?? null;
    },
  };
}

export async function setCv(db: Db, userId: string, v: { text: string; path: string }): Promise<void> {
  const { error } = await db
    .from('profiles')
    .update({ base_cv_text: v.text, base_cv_url: v.path, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw error;
}
```

`server/src/api/index.ts`:
```ts
import { getEnv } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';
import { createSupabaseAdmin } from '../lib/supabase.js';
import { createQueues } from '../queues.js';
import { SCRAPE_SOURCES } from '../scrapers/index.js';
import { createApplicationsService } from '../services/applications.js';
import { renderCvPdf } from '../services/cv/pdf.js';
import { createCvService } from '../services/cv/upload.js';
import { createSignedUrl, uploadFile } from '../services/storage.js';
import { createApp } from './app.js';
import { createApplicationsRepo, createProfileRepo, setCv } from './repos.js';

const env = getEnv();
const db = createSupabaseAdmin(env);
const queues = createQueues(createRedis(env.UPSTASH_REDIS_URL));

const hourBucket = () => Math.floor(Date.now() / 3_600_000);
const fiveMinBucket = () => Math.floor(Date.now() / 300_000);

const jobs = {
  async rematch(userId: string) {
    await queues.match.add('match', { kind: 'user', userId }, { jobId: `rematch-${userId}-${fiveMinBucket()}` });
  },
  async refresh(userId: string) {
    for (const source of SCRAPE_SOURCES) {
      await queues.scrape.add('scrape', { source }, { jobId: `refresh-${source}-${hourBucket()}` });
    }
    await jobs.rematch(userId);
  },
};

const app = createApp({
  webOrigin: env.WEB_ORIGIN,
  getUser: async (token) => {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },
  profiles: createProfileRepo(db),
  cv: createCvService({
    upload: (path, bytes, contentType) => uploadFile(db, path, bytes, contentType),
    setCv: (userId, v) => setCv(db, userId, v),
  }),
  applications: createApplicationsService({
    repo: createApplicationsRepo(db),
    renderPdf: renderCvPdf,
    uploadPdf: (path, bytes) => uploadFile(db, path, bytes, 'application/pdf'),
    signUrl: (path) => createSignedUrl(db, path),
  }),
  jobs,
});

app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'api listening'));
```

- [ ] **Step 4: Run all tests and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: every test file PASSES and typecheck exits 0.
Notes if something fails:
- The 413 test sends a 5 MB + 1 byte body; if multer reports `LIMIT_FILE_SIZE` as a different status, fix `errorHandler`, not the test.
- The rate-limit test relies on the per-user key; the 4th call must be `429` and the other three `202`.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(api): add authenticated profile, CV upload, applications and refresh endpoints

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: End-to-end verification and README

**Files:**
- Create: `README.md`
- Modify: none (verification task)

- [ ] **Step 1: Run the full automated suite and a production build**

Run from `server/`:
```bash
npm test && npm run typecheck && npm run build
```
Expected: all tests PASS, typecheck exits 0, `dist/api/index.js` and `dist/worker/index.js` exist.

- [ ] **Step 2: Live end-to-end check against your Supabase project**

1. Fill `.env` (repo root) as in Task 12 Step 4. Set Supabase Auth > Providers so Email sign-in is enabled.
2. Start both processes: `cd server && npm run dev`. Expected: logs `api listening` and `worker started`.
3. Get an access token for your test user (replace values):
```bash
curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "content-type: application/json" \
  -d '{"email":"<test email>","password":"<test password>"}'
```
Copy `access_token` into `TOKEN`.
4. Unauthenticated request is refused: `curl -i localhost:4000/profile` returns `401`.
5. Set preferences:
```bash
curl -s -X PUT localhost:4000/profile -H "authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"desired_roles":["<role present in live listings>"],"location":"Lagos","skills":["<skill>"],"years_experience":4}'
```
Expected: JSON profile with your values.
6. Upload a real PDF CV: `curl -s -X POST localhost:4000/cv -H "authorization: Bearer $TOKEN" -F "file=@/path/to/cv.pdf"`. Expected: `{"characters": <number over 200>}`. Repeat once with a real `.docx` to cover the DOCX path. Expected: same shape. Upload a `.txt` file: expected `400 unsupported_file_type`.
7. Wait a few minutes, then: `curl -s "localhost:4000/applications?status=pending_review" -H "authorization: Bearer $TOKEN"`. Expected: a list with `match_score`, `cover_letter_text`, `tailored_cv_text`, `missing_keywords` and a nested `job`.
8. Open one: `curl -s localhost:4000/applications/<id> -H "authorization: Bearer $TOKEN"`. Expected: `cv_pdf_url` present. Download it and open the PDF; confirm it is readable and contains only content traceable to your CV (spot-check for invented employers or dates).
9. Edit: `curl -s -X PATCH localhost:4000/applications/<id> -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"cover_letter_text":"Edited letter text for testing the update."}'`. Expected: updated record.

If any check fails, use superpowers:systematic-debugging before changing code.

- [ ] **Step 3: Write the README** — `README.md`

````markdown
# JobLume

Semi-automatic job application platform. Phase 1 (this repo state): backend that finds jobs and prepares tailored applications for your review. See `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Phase 1 setup

1. Create a Supabase project. Run `supabase/migrations/0001_init.sql` (CLI `supabase db push`, or the SQL editor).
2. Copy `.env.example` to `.env` and fill in Supabase, Gemini and Upstash values. `GEMINI_MODEL` must be a model currently offered by Google.
3. `cd server && npm install && npm run dev` starts the API (port 4000) and the worker together.

## Deploying

- API: Render (free) with start command `npm run start:api` after `npm run build`.
- Worker: an always-on host (Railway, Fly.io or a small VPS) with start command `npm run start:worker`. Render's free tier sleeps, so it cannot run the worker's schedule.
- Both processes use the same environment variables.

## Notes

- Nothing is sent or applied in Phase 1.
- Remotive jobs must keep their link back and source attribution when shown in the UI.
- Free-tier limits: Upstash counts Redis commands (the worker polls idle queues sparingly); Gemini free quota is lower than the `AI_DAILY_LIMIT` soft cap, so set the cap below your real quota.
````

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add README with Phase 1 setup and deployment notes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

**Spec coverage (spec section → task):** repo layout §3 → Tasks 1-13; data flow §4 → Tasks 8, 11, 12; data model §5 (changes, RLS, daily-cap helper) → Task 2; scrapers §6 → Tasks 5-8 (company_domain null per Task 1 spec correction); AI tailoring §7 (prompt, zod, retry, fallback, limiter, pre-filter, quota) → Tasks 4, 9, 11, 12; PDF §8 → Task 10; API §9 (profile, cv, applications list/get/patch, refresh) → Task 13; security §10 → Tasks 1, 3, 13; testing §11 → every task; definition of done §12 → Tasks 12 and 14; env §14 → Task 1.

**Known limits to be aware of:**
- Selectors for MyJobMag and Jobberman were verified against live markup on 2026-10-17; the live-fixture tests will fail loudly if either site changes. Re-capture fixtures (Task 6/7 Step 1) when that happens.
- DOCX parsing is verified manually (Task 14 Step 2), not by a unit test.
- The Supabase wiring in `worker/repos.ts` and `api/repos.ts` is verified by the live checks in Tasks 12 and 14, not by unit tests.
- The per-day application cap is a SQL helper (`applications_applied_today`) now; enforcement happens in Phase 3 when applying exists.
