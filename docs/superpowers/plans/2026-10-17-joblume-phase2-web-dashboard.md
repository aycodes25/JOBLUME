# JobLume Phase 2 (Web Dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js 14 dashboard (sign-in, onboarding, review queue with assisted apply, Kanban tracker, analytics, settings) backed by two new server endpoints, in an npm-workspaces monorepo with a shared types/schemas package.

**Architecture:** The repo becomes an npm workspace (`packages/shared`, `server`, `web`). `@joblume/shared` (compiled to `dist`) holds status values, the profile settings schema, API response types and a URL-safety helper; both server and web import it. The web app talks to the Express API only (Bearer token from the Supabase session) through a small typed client, with TanStack Query for data and dnd-kit for the Kanban. Pure logic (status side effects, analytics, grouping, form patches, error mapping) lives in small tested modules; components stay thin.

**Tech Stack:** Node 20+, TypeScript, npm workspaces, Next.js 14 (App Router), React 18, Tailwind CSS 3, shadcn-style Radix components, `@supabase/ssr`, TanStack Query 5, dnd-kit, zod 3, Vitest + React Testing Library + jsdom (web) and Vitest + supertest (server).

## Global Constraints

- Application statuses are exactly: `pending_review`, `approved`, `applied`, `interviewing`, `rejected`, `offer`, `skipped`.
- Kanban columns, in order: Pending Review | Applied | Interviewing | Rejected | Offer. `approved` shows inside the Pending Review column with a "Ready to apply" badge; `skipped` is only in the Skipped tab of the queue.
- Approve & Apply in Phase 2 is **assisted apply only**: set status `approved`, then show a panel with Open job link, Download CV PDF, Copy cover letter and Mark as applied. Nothing is ever sent by the app. No Gmail, email-finding, "Find another email", follow-up sending, Google sign-in or mobile code in this phase.
- All web data access goes through the Express API with `Authorization: Bearer <access token>`. The web app never queries Supabase tables and never imports server code.
- The browser may hold only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_API_URL`. The service-role key never reaches the web app.
- Links to jobs or PDFs render only when the URL scheme is `http` or `https`, with `target="_blank"` and `rel="noopener noreferrer"`. Job descriptions, CVs and cover letters render as plain text; never use `dangerouslySetInnerHTML`.
- Server rules (from the Phase 1 spec, still binding): the user id always comes from the verified token; every query is scoped to that user; applications are written by the server only; zod validation on every input; non-UUID ids answer 404.
- `PATCH /applications/:id/status` side effects: to `applied`, set `applied_at = now`, `follow_up_at = now + 3 days` and `apply_method = 'assisted'` (only when `apply_method` is empty); to `interviewing`/`rejected`/`offer`, do the same only when `applied_at` is empty; to `pending_review`/`approved`/`skipped`, clear `applied_at` and `follow_up_at`; moving between applied-family statuses keeps the original `applied_at`. Manual marking is not blocked by the daily cap.
- `GET /analytics` returns `{ total, by_status, applied_ever, responded, response_rate, avg_match_score }` with `applied_ever = applied + interviewing + rejected + offer`, `responded = interviewing + rejected + offer`, `response_rate = responded / applied_ever` (0 when `applied_ever` is 0), `avg_match_score` ignoring null scores (null when none).
- `GET /applications` defaults to a limit of 200.
- Theme: dark only, background `#0A0A0A`, accent `#6C5CE7`, Linear-like. Layout must work down to phone width (sidebar collapses to a menu).
- Error mapping in the web client: 401 signs out and redirects to `/login`; 400 shows field messages; 413/422 (CV) show plain-language messages; 429 shows "try again later"; 5xx shows a retryable message; network failure shows an offline message.
- The queue refetches on window focus and every 60 seconds.
- Relative imports inside `packages/shared` use `.js` extensions (NodeNext). Web uses the `@/` alias for `web/src`.
- Commit messages end with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never commit anything under `.superpowers/`, `node_modules/`, `dist/` or `.next/`.
- All shell commands use Git Bash syntax from the repo root unless stated.

## File Structure

```
package.json                                  (new: workspaces + root scripts)
packages/shared/
  package.json tsconfig.json tsconfig.build.json vitest.config.ts
  src/index.ts status.ts profile.ts api-types.ts links.ts
  tests/status.test.ts profile.test.ts links.test.ts
server/src/services/application-status.ts     (planStatusChange)
server/src/services/analytics.ts              (computeAnalytics)
server/src/api/routes/analytics.ts
web/
  package.json tsconfig.json next.config.mjs postcss.config.mjs tailwind.config.ts
  vitest.config.ts vitest.setup.ts .env.example .gitignore middleware.ts
  src/app/ layout.tsx globals.css page.tsx providers.tsx login/page.tsx
           (app)/layout.tsx (app)/queue/page.tsx (app)/tracker/page.tsx
           (app)/analytics/page.tsx (app)/settings/page.tsx (app)/onboarding/page.tsx
  src/lib/ utils.ts env.ts route-guard.ts onboarding.ts applications.ts format.ts profile-form.ts
  src/lib/supabase/ client.ts middleware.ts
  src/lib/api/ client.ts errors.ts endpoints.ts runtime.ts
  src/hooks/api.ts
  src/components/ui/        button input label textarea card badge tabs dialog skeleton
  src/components/common/    SafeLink ErrorState EmptyState PageSkeleton
  src/components/auth/AuthForm.tsx
  src/components/layout/    NavLinks AppShell
  src/components/cv/CvUpload.tsx
  src/components/profile/   ProfileForm SettingsForm
  src/components/applications/ ScoreRing ApplicationCard AssistedApplyPanel ApplicationDetail
  src/components/tracker/KanbanBoard.tsx
  src/components/analytics/ StatusBar
  tests/ (mirrors src)
docs/phase2-manual-checklist.md
```

---

### Task 1: Workspaces, shared package, server refactor

**Files:**
- Create: `package.json` (repo root)
- Create: `packages/shared/package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`
- Create: `packages/shared/src/index.ts`, `status.ts`, `profile.ts`, `api-types.ts`, `links.ts`
- Create: `packages/shared/tests/status.test.ts`, `profile.test.ts`, `links.test.ts`
- Modify: `server/package.json`, `server/src/db/types.ts`, `server/src/api/deps.ts`, `server/src/api/routes/applications.ts`
- Create: `server/tests/api/shared-compat.test.ts`
- Delete: `server/package-lock.json`, `server/node_modules` (reinstalled at the root)

**Interfaces:**
- Produces (package `@joblume/shared`, imported as `from '@joblume/shared'`):
  - `APPLICATION_STATUSES` (readonly tuple), `type ApplicationStatus`, `KANBAN_COLUMNS` (readonly tuple), `type KanbanColumn`, `isApplicationStatus(v: unknown): v is ApplicationStatus`, `columnForStatus(s: ApplicationStatus): KanbanColumn | null`
  - `LOCATIONS` (`['Lagos','Abuja','Remote']`), `profilePatchSchema` (zod), `type ProfilePatch`
  - `safeHttpUrl(raw: unknown): string | null`
  - Types: `Profile`, `JobSummary`, `Application`, `ApplicationDetail`, `Analytics`, `CvUploadResult`

- [ ] **Step 1: Write the failing shared tests**

`packages/shared/tests/status.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { APPLICATION_STATUSES, KANBAN_COLUMNS, columnForStatus, isApplicationStatus } from '../src/index.js';

describe('statuses', () => {
  it('lists the seven statuses the database allows', () => {
    expect([...APPLICATION_STATUSES]).toEqual([
      'pending_review', 'approved', 'applied', 'interviewing', 'rejected', 'offer', 'skipped',
    ]);
  });

  it('the type guard accepts only known statuses', () => {
    expect(isApplicationStatus('applied')).toBe(true);
    expect(isApplicationStatus('done')).toBe(false);
    expect(isApplicationStatus(5)).toBe(false);
    expect(isApplicationStatus(undefined)).toBe(false);
  });

  it('maps statuses to kanban columns', () => {
    expect([...KANBAN_COLUMNS]).toEqual(['pending_review', 'applied', 'interviewing', 'rejected', 'offer']);
    expect(columnForStatus('approved')).toBe('pending_review');
    expect(columnForStatus('skipped')).toBeNull();
    for (const column of KANBAN_COLUMNS) expect(columnForStatus(column)).toBe(column);
  });
});
```

`packages/shared/tests/profile.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { LOCATIONS, profilePatchSchema } from '../src/index.js';

describe('profilePatchSchema', () => {
  it('accepts a valid partial update', () => {
    const body = { desired_roles: ['data analyst'], location: 'Lagos', skills: ['SQL'], years_experience: 3, daily_cap: 15 };
    expect(profilePatchSchema.parse(body)).toEqual(body);
  });

  it('exposes the three allowed locations', () => {
    expect([...LOCATIONS]).toEqual(['Lagos', 'Abuja', 'Remote']);
  });

  it.each([
    ['unknown location', { location: 'Kano' }],
    ['daily cap above 20', { daily_cap: 21 }],
    ['daily cap below 1', { daily_cap: 0 }],
    ['threshold above 100', { auto_threshold: 101 }],
    ['bad apply mode', { apply_mode: 'yolo' }],
    ['negative experience', { years_experience: -1 }],
    ['extra field', { user_id: 'someone-else' }],
    ['empty body', {}],
    ['salary min above max', { salary_min: 500000, salary_max: 100000 }],
  ])('rejects %s', (_name, body) => {
    expect(profilePatchSchema.safeParse(body).success).toBe(false);
  });

  it('accepts equal salary bounds and null location', () => {
    expect(profilePatchSchema.safeParse({ salary_min: 100, salary_max: 100 }).success).toBe(true);
    expect(profilePatchSchema.safeParse({ location: null }).success).toBe(true);
  });
});
```

`packages/shared/tests/links.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { safeHttpUrl } from '../src/index.js';

describe('safeHttpUrl', () => {
  it('accepts http and https URLs and returns the normalised string', () => {
    expect(safeHttpUrl('https://example.com/job/1')).toBe('https://example.com/job/1');
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com/');
  });

  it.each([
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['file scheme', 'file:///etc/passwd'],
    ['relative path', '/jobs/1'],
    ['empty string', ''],
    ['garbage', 'not a url'],
  ])('rejects %s', (_name, raw) => {
    expect(safeHttpUrl(raw)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl(42)).toBeNull();
  });
});
```

- [ ] **Step 2: Create the package files (tests will still fail: no source yet)**

First read `server/package.json` and note the exact version ranges it uses for `zod`, `typescript` and `vitest`; use the SAME ranges below (replace `<ZOD>`, `<TS>`, `<VITEST>`).

`packages/shared/package.json`:
```json
{
  "name": "@joblume/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": { "zod": "<ZOD>" },
  "devDependencies": { "typescript": "<TS>", "vitest": "<VITEST>" }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

`packages/shared/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`packages/shared/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['tests/**/*.test.ts'], environment: 'node' } });
```

Root `package.json` (repo root; `web` is added to `workspaces` in Task 4):
```json
{
  "name": "joblume",
  "private": true,
  "workspaces": ["packages/*", "server"],
  "scripts": {
    "build:shared": "npm run build -w @joblume/shared",
    "postinstall": "npm run build:shared",
    "dev:server": "npm run dev -w server",
    "dev:web": "npm run dev -w web",
    "typecheck": "npm run build:shared && npm run typecheck --workspaces --if-present",
    "test": "npm run build:shared && npm test --workspaces --if-present",
    "build": "npm run build:shared && npm run build -w server"
  }
}
```

- [ ] **Step 3: Implement the shared source**

`packages/shared/src/status.ts`:
```ts
export const APPLICATION_STATUSES = [
  'pending_review',
  'approved',
  'applied',
  'interviewing',
  'rejected',
  'offer',
  'skipped',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const KANBAN_COLUMNS = ['pending_review', 'applied', 'interviewing', 'rejected', 'offer'] as const;
export type KanbanColumn = (typeof KANBAN_COLUMNS)[number];

export const isApplicationStatus = (v: unknown): v is ApplicationStatus =>
  typeof v === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(v);

/** The board column a status is shown in, or null when it is not on the board (skipped). */
export function columnForStatus(status: ApplicationStatus): KanbanColumn | null {
  if (status === 'approved') return 'pending_review';
  if (status === 'skipped') return null;
  return status;
}
```

`packages/shared/src/profile.ts`:
```ts
import { z } from 'zod';

export const LOCATIONS = ['Lagos', 'Abuja', 'Remote'] as const;

export const profilePatchSchema = z
  .object({
    skills: z.array(z.string().trim().min(1).max(60)).max(100),
    years_experience: z.number().int().min(0).max(60).nullable(),
    desired_roles: z.array(z.string().trim().min(2).max(80)).max(20),
    location: z.enum(LOCATIONS).nullable(),
    salary_min: z.number().int().min(0).nullable(),
    salary_max: z.number().int().min(0).nullable(),
    apply_mode: z.enum(['manual', 'auto']),
    auto_threshold: z.number().int().min(0).max(100),
    daily_cap: z.number().int().min(1).max(20),
    auto_followup: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update')
  .refine(
    (v) => v.salary_min == null || v.salary_max == null || v.salary_min <= v.salary_max,
    { message: 'salary_min must not exceed salary_max', path: ['salary_min'] },
  );

export type ProfilePatch = z.infer<typeof profilePatchSchema>;
```

`packages/shared/src/links.ts`:
```ts
/** Returns a normalised http(s) URL, or null for anything else (javascript:, data:, relative, garbage). */
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
```

`packages/shared/src/api-types.ts`:
```ts
import type { ApplicationStatus } from './status.js';

export interface Profile {
  user_id: string;
  base_cv_text: string | null;
  base_cv_url: string | null;
  skills: string[];
  years_experience: number | null;
  desired_roles: string[];
  location: 'Lagos' | 'Abuja' | 'Remote' | null;
  salary_min: number | null;
  salary_max: number | null;
  apply_mode: 'manual' | 'auto';
  auto_threshold: number;
  daily_cap: number;
  auto_followup: boolean;
  updated_at: string;
}

export interface JobSummary {
  title: string;
  company: string;
  location: string;
  source: string;
  url: string;
  company_domain: string | null;
}

export interface Application {
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
  job: JobSummary | null;
}

export interface ApplicationDetail extends Application {
  cv_pdf_url: string | null;
}

export interface Analytics {
  total: number;
  by_status: Record<ApplicationStatus, number>;
  applied_ever: number;
  responded: number;
  response_rate: number;
  avg_match_score: number | null;
}

export interface CvUploadResult {
  characters: number;
}
```

`packages/shared/src/index.ts`:
```ts
export * from './status.js';
export * from './profile.js';
export * from './links.js';
export * from './api-types.js';
```

- [ ] **Step 4: Move the install to the root workspace**

```bash
rm -rf server/node_modules server/package-lock.json
npm install
ls packages/shared/dist/index.js
```
Expected: a root `node_modules/` and root `package-lock.json` appear, the `postinstall` builds the shared package, and `packages/shared/dist/index.js` exists. If `npm install` complains about the `postinstall` building before TypeScript is available, run `npm install` a second time; report it.

Then run the shared tests: `npm test -w @joblume/shared`. Expected: all pass (status 3, profile 15, links about 13).

- [ ] **Step 5: Point the server at the shared package**

Edit `server/package.json`:
- add `"@joblume/shared": "*"` to `dependencies`;
- add these scripts alongside the existing ones (so a direct `npm test` inside `server/` always sees a fresh shared build): `"pretest": "npm run build:shared --prefix ..", "pretypecheck": "npm run build:shared --prefix ..", "prebuild": "npm run build:shared --prefix .."`.

Edit `server/src/db/types.ts`: delete the local `ApplicationStatus` type and instead start the file with
```ts
import type { ApplicationStatus } from '@joblume/shared';
export type { ApplicationStatus };
```
(keep every other type in the file exactly as is; they already use the name `ApplicationStatus`).

Edit `server/src/api/deps.ts`: remove the local `profilePatchSchema`/`ProfilePatch` definitions and the now-unused `zod` import, and add
```ts
import { profilePatchSchema, type ProfilePatch } from '@joblume/shared';
export { profilePatchSchema };
export type { ProfilePatch };
```
(other imports and interfaces unchanged).

Edit `server/src/api/routes/applications.ts`: replace the local `statusSchema` line with `const statusSchema = z.enum(APPLICATION_STATUSES);` and add `import { APPLICATION_STATUSES } from '@joblume/shared';`.

Create `server/tests/api/shared-compat.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Application, Profile } from '@joblume/shared';
import type { ApplicationWithJob } from '../../src/api/deps.js';
import type { ProfileRow } from '../../src/db/types.js';

describe('shared contract', () => {
  it('server rows are assignable to the shared API types (checked by the typecheck step)', () => {
    const application = (row: ApplicationWithJob): Application => row;
    const profile = (row: ProfileRow): Profile => row;
    expect(typeof application).toBe('function');
    expect(typeof profile).toBe('function');
  });
});
```

- [ ] **Step 6: Verify the whole workspace**

Run: `npm run typecheck && npm test`
Expected: typecheck exits 0 for shared and server; tests pass for shared and server (server: all 165 previous tests plus the new one). If the type assignment in `shared-compat.test.ts` fails, fix the shared types (not the server) so they describe what the server really returns.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json packages server
git status --short | head
git commit -m "feat: convert to npm workspaces with a shared types and schemas package

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: `git status` shows no `node_modules`, `dist` or `.superpowers` entries staged.

---

### Task 2: Server: status transitions endpoint

**Files:**
- Create: `server/src/services/application-status.ts`
- Modify: `server/src/api/deps.ts`, `server/src/services/applications.ts`, `server/src/api/routes/applications.ts`
- Modify (fixtures only): `server/tests/api/app.test.ts`
- Test: `server/tests/services/application-status.test.ts`, `server/tests/services/applications-status.test.ts`, `server/tests/api/status.test.ts`
- Modify: `docs/superpowers/specs/2026-10-17-joblume-phase2-web-dashboard-design.md` (one clarification)

**Interfaces:**
- Consumes: `ApplicationStatus`, `APPLICATION_STATUSES` from `@joblume/shared`; existing `ApplicationsRepo.get/update`.
- Produces:
  - `interface StatusSnapshot { status: ApplicationStatus; applied_at: string | null; follow_up_at: string | null; apply_method: 'email' | 'assisted' | 'auto' | null }`
  - `FOLLOW_UP_DAYS = 3`
  - `planStatusChange(existing: StatusSnapshot, next: ApplicationStatus, now: Date): Record<string, unknown>`
  - `ApplicationsService.setStatus(userId: string, id: string, status: ApplicationStatus): Promise<ApplicationWithJob | null>`
  - `createApplicationsService` gains an optional dep `now?: () => Date`
  - Route `PATCH /applications/:id/status`, body `{ status }`

- [ ] **Step 1: Write the failing tests**

`server/tests/services/application-status.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FOLLOW_UP_DAYS, planStatusChange, type StatusSnapshot } from '../../src/services/application-status.js';

const pending: StatusSnapshot = { status: 'pending_review', applied_at: null, follow_up_at: null, apply_method: null };
const applied: StatusSnapshot = {
  status: 'applied',
  applied_at: '2026-10-18T09:00:00.000Z',
  follow_up_at: '2026-10-21T09:00:00.000Z',
  apply_method: 'assisted',
};
const now = new Date('2026-10-20T10:00:00.000Z');

describe('planStatusChange', () => {
  it('uses a three day follow-up window', () => {
    expect(FOLLOW_UP_DAYS).toBe(3);
  });

  it('applied from pending stamps applied_at, follow_up_at (+3 days) and assisted', () => {
    expect(planStatusChange(pending, 'applied', now)).toEqual({
      status: 'applied',
      applied_at: '2026-10-20T10:00:00.000Z',
      follow_up_at: '2026-10-23T10:00:00.000Z',
      apply_method: 'assisted',
    });
  });

  it.each(['interviewing', 'rejected', 'offer'] as const)('%s without applied_at also stamps it', (next) => {
    expect(planStatusChange(pending, next, now)).toEqual({
      status: next,
      applied_at: '2026-10-20T10:00:00.000Z',
      follow_up_at: '2026-10-23T10:00:00.000Z',
      apply_method: 'assisted',
    });
  });

  it('keeps the original timestamps when moving between applied-family statuses', () => {
    expect(planStatusChange(applied, 'interviewing', now)).toEqual({ status: 'interviewing' });
    expect(planStatusChange(applied, 'applied', now)).toEqual({ status: 'applied' });
  });

  it('does not overwrite an existing apply_method', () => {
    const emailed: StatusSnapshot = { ...pending, apply_method: 'email' };
    expect(planStatusChange(emailed, 'applied', now)).toEqual({
      status: 'applied',
      applied_at: '2026-10-20T10:00:00.000Z',
      follow_up_at: '2026-10-23T10:00:00.000Z',
    });
  });

  it.each(['pending_review', 'approved', 'skipped'] as const)('%s clears the applied timestamps', (next) => {
    expect(planStatusChange(applied, next, now)).toEqual({ status: next, applied_at: null, follow_up_at: null });
  });

  it('approved and skipped from pending also write explicit nulls', () => {
    expect(planStatusChange(pending, 'approved', now)).toEqual({ status: 'approved', applied_at: null, follow_up_at: null });
  });
});
```

`server/tests/services/applications-status.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationWithJob } from '../../src/api/deps.js';
import { createApplicationsService } from '../../src/services/applications.js';

const existing: ApplicationWithJob = {
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'CV', tailored_cv_url: 'u1/tailored/j1.pdf',
  cover_letter_text: 'LETTER', match_score: 70, missing_keywords: [], hiring_manager_email: null, email_confidence: null,
  apply_method: null, status: 'pending_review', applied_at: null, follow_up_at: null, created_at: '', job: null,
};

function make(get = vi.fn().mockResolvedValue(existing)) {
  const repo = { list: vi.fn(), get, update: vi.fn().mockResolvedValue({ ...existing, status: 'applied' }) };
  const svc = createApplicationsService({
    repo,
    renderPdf: vi.fn(),
    uploadPdf: vi.fn(),
    signUrl: vi.fn(),
    now: () => new Date('2026-10-20T10:00:00.000Z'),
  });
  return { svc, repo };
}

describe('applications service setStatus', () => {
  it('reads the application for that user, applies the planned changes and returns the updated row', async () => {
    const { svc, repo } = make();
    const result = await svc.setStatus('u1', 'a1', 'applied');
    expect(repo.get).toHaveBeenCalledWith('u1', 'a1');
    expect(repo.update).toHaveBeenCalledWith('u1', 'a1', {
      status: 'applied',
      applied_at: '2026-10-20T10:00:00.000Z',
      follow_up_at: '2026-10-23T10:00:00.000Z',
      apply_method: 'assisted',
    });
    expect(result?.status).toBe('applied');
  });

  it('returns null and writes nothing for an unknown application', async () => {
    const { svc, repo } = make(vi.fn().mockResolvedValue(null));
    expect(await svc.setStatus('u1', 'nope', 'applied')).toBeNull();
    expect(repo.update).not.toHaveBeenCalled();
  });
});
```

`server/tests/api/status.test.ts`:
```ts
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import type { AppDeps } from '../../src/api/deps.js';

const ID = '3f2b8c1e-5d4a-4b7e-9c11-2a6f0d9e8b77';

function makeDeps(setStatus = vi.fn().mockResolvedValue({ id: ID, status: 'applied' })): AppDeps {
  return {
    webOrigin: 'http://localhost:3000',
    getUser: vi.fn(async (t: string) => (t === 'good' ? { id: 'u1', email: 'a@b.c' } : null)),
    profiles: { get: vi.fn(), update: vi.fn() },
    cv: { upload: vi.fn() },
    applications: { list: vi.fn(), get: vi.fn(), update: vi.fn(), setStatus, analytics: vi.fn() } as never,
    jobs: { refresh: vi.fn(), rematch: vi.fn() },
  };
}
const patch = (app: ReturnType<typeof createApp>, path: string) =>
  request(app).patch(path).set('authorization', 'Bearer good');

describe('PATCH /applications/:id/status', () => {
  it('requires a token', async () => {
    const res = await request(createApp(makeDeps())).patch(`/applications/${ID}/status`).send({ status: 'applied' });
    expect(res.status).toBe(401);
  });

  it('passes the token user, id and status to the service and returns the application', async () => {
    const deps = makeDeps();
    const res = await patch(createApp(deps), `/applications/${ID}/status`).send({ status: 'applied' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: ID, status: 'applied' });
    expect(deps.applications.setStatus).toHaveBeenCalledWith('u1', ID, 'applied');
  });

  it.each([
    ['unknown status', { status: 'done' }],
    ['missing status', {}],
    ['extra field', { status: 'applied', applied_at: '2020-01-01' }],
  ])('rejects %s with 400', async (_n, body) => {
    const deps = makeDeps();
    const res = await patch(createApp(deps), `/applications/${ID}/status`).send(body);
    expect(res.status).toBe(400);
    expect(deps.applications.setStatus).not.toHaveBeenCalled();
  });

  it('answers 404 for a non-UUID id without calling the service', async () => {
    const deps = makeDeps();
    const res = await patch(createApp(deps), '/applications/abc/status').send({ status: 'applied' });
    expect(res.status).toBe(404);
    expect(deps.applications.setStatus).not.toHaveBeenCalled();
  });

  it('answers 404 when the service finds no such application for this user', async () => {
    const res = await patch(createApp(makeDeps(vi.fn().mockResolvedValue(null))), `/applications/${ID}/status`).send({ status: 'applied' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('application_not_found');
  });
});
```

- [ ] **Step 2: Run them and confirm failure**

Run (from `server/`): `npx vitest run tests/services/application-status.test.ts tests/services/applications-status.test.ts tests/api/status.test.ts`
Expected: FAIL (module not found / `setStatus` not a function / 404 on the route).

- [ ] **Step 3: Implement the pure rules** — `server/src/services/application-status.ts`

```ts
import type { ApplicationStatus } from '@joblume/shared';

export interface StatusSnapshot {
  status: ApplicationStatus;
  applied_at: string | null;
  follow_up_at: string | null;
  apply_method: 'email' | 'assisted' | 'auto' | null;
}

export const FOLLOW_UP_DAYS = 3;

const APPLIED_FAMILY = new Set<ApplicationStatus>(['applied', 'interviewing', 'rejected', 'offer']);

/** Returns the column changes for moving an application to `next`. Pure: no I/O. */
export function planStatusChange(existing: StatusSnapshot, next: ApplicationStatus, now: Date): Record<string, unknown> {
  const changes: Record<string, unknown> = { status: next };
  if (APPLIED_FAMILY.has(next)) {
    if (existing.applied_at === null) {
      changes.applied_at = now.toISOString();
      changes.follow_up_at = new Date(now.getTime() + FOLLOW_UP_DAYS * 86_400_000).toISOString();
      if (existing.apply_method === null) changes.apply_method = 'assisted';
    }
  } else {
    changes.applied_at = null;
    changes.follow_up_at = null;
  }
  return changes;
}
```

- [ ] **Step 4: Wire the service, interface and route**

In `server/src/api/deps.ts`, add `ApplicationStatus` to the existing `../db/types.js` import if it is not already imported, and add to `ApplicationsService`:
```ts
  setStatus(userId: string, id: string, status: ApplicationStatus): Promise<ApplicationWithJob | null>;
```

In `server/src/services/applications.ts`: add the import `import { planStatusChange } from './application-status.js';`, add `now?: () => Date;` to the deps parameter type, and add this method to the returned object (after `update`):
```ts
    async setStatus(userId, id, status) {
      const existing = await deps.repo.get(userId, id);
      if (!existing) return null;
      const now = deps.now ? deps.now() : new Date();
      return deps.repo.update(userId, id, planStatusChange(existing, status, now));
    },
```

In `server/src/api/routes/applications.ts`, add below the other schemas:
```ts
const statusBodySchema = z.object({ status: statusSchema }).strict();
```
and this route (before `return router;`):
```ts
  router.patch('/:id/status', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { status } = statusBodySchema.parse(req.body);
    const app = await d.applications.setStatus(req.user!.id, id, status);
    if (!app) throw new ApiError(404, 'application_not_found');
    res.json(app);
  }));
```

- [ ] **Step 5: Keep existing test fixtures compiling**

Run `npm run typecheck`. Existing fixtures that build an `ApplicationsService` object (in `server/tests/api/app.test.ts`, in `makeDeps` and in the PATCH test's `applications:` override) now lack `setStatus`; add `setStatus: vi.fn()` to those objects. Do not change any assertion. (Task 3 will add `analytics` the same way.)

- [ ] **Step 6: Run the tests and the full suite**

Run: `npx vitest run tests/services/application-status.test.ts tests/services/applications-status.test.ts tests/api/status.test.ts` then `npx vitest run` and `npm run typecheck`
Expected: new tests PASS (7 + 11 + 2 + 7 cases in the three files), the full server suite passes, typecheck exits 0.

- [ ] **Step 7: Clarify the spec and commit**

In `docs/superpowers/specs/2026-10-17-joblume-phase2-web-dashboard-design.md`, section 5, first bullet, change `apply_method = 'assisted'` to `apply_method = 'assisted'` followed by ` (only when it is empty)`.

```bash
git add server docs
git commit -m "feat(server): add PATCH /applications/:id/status with applied-timestamp rules

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Server: analytics endpoint and list limit

**Files:**
- Create: `server/src/services/analytics.ts`, `server/src/api/routes/analytics.ts`
- Modify: `server/src/api/deps.ts`, `server/src/api/repos.ts`, `server/src/services/applications.ts`, `server/src/api/app.ts`
- Modify (fixtures only): `server/tests/api/app.test.ts`, `server/tests/api/status.test.ts`, `server/tests/services/applications.test.ts`, `server/tests/services/applications-status.test.ts`
- Test: `server/tests/services/analytics.test.ts`, `server/tests/api/analytics.test.ts`

**Interfaces:**
- Consumes: `Analytics`, `APPLICATION_STATUSES`, `ApplicationStatus` from `@joblume/shared`.
- Produces:
  - `interface AnalyticsRow { status: ApplicationStatus; match_score: number | null }`
  - `computeAnalytics(rows: AnalyticsRow[]): Analytics`
  - `ApplicationsRepo.listForAnalytics(userId: string): Promise<AnalyticsRow[]>`
  - `ApplicationsService.analytics(userId: string): Promise<Analytics>`
  - Route `GET /analytics`

- [ ] **Step 1: Write the failing tests**

`server/tests/services/analytics.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationWithJob } from '../../src/api/deps.js';
import { computeAnalytics, type AnalyticsRow } from '../../src/services/analytics.js';
import { createApplicationsService } from '../../src/services/applications.js';

const row = (status: AnalyticsRow['status'], match_score: number | null = null): AnalyticsRow => ({ status, match_score });

describe('computeAnalytics', () => {
  it('returns zeros and a null average for no applications', () => {
    expect(computeAnalytics([])).toEqual({
      total: 0,
      by_status: { pending_review: 0, approved: 0, applied: 0, interviewing: 0, rejected: 0, offer: 0, skipped: 0 },
      applied_ever: 0,
      responded: 0,
      response_rate: 0,
      avg_match_score: null,
    });
  });

  it('counts per status and derives applied_ever, responded and response_rate', () => {
    const a = computeAnalytics([
      row('pending_review', 80), row('approved', 60), row('skipped', 10),
      row('applied', 70), row('applied', 50), row('interviewing', 90), row('rejected', 40), row('offer', 100),
    ]);
    expect(a.total).toBe(8);
    expect(a.by_status.applied).toBe(2);
    expect(a.applied_ever).toBe(5);
    expect(a.responded).toBe(3);
    expect(a.response_rate).toBeCloseTo(3 / 5);
  });

  it('averages only non-null scores and rounds to one decimal', () => {
    expect(computeAnalytics([row('applied', 70), row('applied', 71), row('applied', null)]).avg_match_score).toBe(70.5);
    expect(computeAnalytics([row('applied', 10), row('applied', 10), row('applied', 11)]).avg_match_score).toBe(10.3);
    expect(computeAnalytics([row('applied', null)]).avg_match_score).toBeNull();
  });

  it('response_rate is 0 when nothing has been applied to', () => {
    expect(computeAnalytics([row('pending_review', 50), row('approved', 50)]).response_rate).toBe(0);
  });
});

describe('applications service analytics', () => {
  it('reads only the requesting user rows and computes from them', async () => {
    const repo = {
      list: vi.fn(), get: vi.fn(), update: vi.fn(),
      listForAnalytics: vi.fn().mockResolvedValue([row('applied', 80), row('offer', 60)]),
    };
    const svc = createApplicationsService({ repo, renderPdf: vi.fn(), uploadPdf: vi.fn(), signUrl: vi.fn() });
    const result = await svc.analytics('u1');
    expect(repo.listForAnalytics).toHaveBeenCalledWith('u1');
    expect(result.total).toBe(2);
    expect(result.responded).toBe(1);
  });
});

export type _Unused = ApplicationWithJob;
```
(The last export line only keeps the type import used; remove both it and the unused import if the compiler does not need them.)

`server/tests/api/analytics.test.ts`:
```ts
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import type { AppDeps } from '../../src/api/deps.js';

const payload = {
  total: 2,
  by_status: { pending_review: 1, approved: 0, applied: 1, interviewing: 0, rejected: 0, offer: 0, skipped: 0 },
  applied_ever: 1, responded: 0, response_rate: 0, avg_match_score: 65,
};

function makeDeps(analytics = vi.fn().mockResolvedValue(payload)): AppDeps {
  return {
    webOrigin: 'http://localhost:3000',
    getUser: vi.fn(async (t: string) => (t === 'good' ? { id: 'u1', email: 'a@b.c' } : null)),
    profiles: { get: vi.fn(), update: vi.fn() },
    cv: { upload: vi.fn() },
    applications: { list: vi.fn(), get: vi.fn(), update: vi.fn(), setStatus: vi.fn(), analytics } as never,
    jobs: { refresh: vi.fn(), rematch: vi.fn() },
  };
}

describe('GET /analytics', () => {
  it('requires a token', async () => {
    expect((await request(createApp(makeDeps())).get('/analytics')).status).toBe(401);
  });

  it('returns the analytics for the token user only', async () => {
    const deps = makeDeps();
    const res = await request(createApp(deps)).get('/analytics').set('authorization', 'Bearer good');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(payload);
    expect(deps.applications.analytics).toHaveBeenCalledWith('u1');
  });
});
```

- [ ] **Step 2: Run them and confirm failure**

Run (from `server/`): `npx vitest run tests/services/analytics.test.ts tests/api/analytics.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the calculation** — `server/src/services/analytics.ts`

```ts
import { APPLICATION_STATUSES, type Analytics, type ApplicationStatus } from '@joblume/shared';

export interface AnalyticsRow {
  status: ApplicationStatus;
  match_score: number | null;
}

export function computeAnalytics(rows: AnalyticsRow[]): Analytics {
  const by_status = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
  let scoreSum = 0;
  let scoreCount = 0;
  for (const r of rows) {
    by_status[r.status] += 1;
    if (r.match_score !== null) {
      scoreSum += r.match_score;
      scoreCount += 1;
    }
  }
  const responded = by_status.interviewing + by_status.rejected + by_status.offer;
  const applied_ever = by_status.applied + responded;
  return {
    total: rows.length,
    by_status,
    applied_ever,
    responded,
    response_rate: applied_ever === 0 ? 0 : responded / applied_ever,
    avg_match_score: scoreCount === 0 ? null : Math.round((scoreSum / scoreCount) * 10) / 10,
  };
}
```

- [ ] **Step 4: Wire repo, service, route and the list limit**

`server/src/api/deps.ts`: add imports `import type { Analytics } from '@joblume/shared';` and `import type { AnalyticsRow } from '../services/analytics.js';`; add to `ApplicationsRepo`:
```ts
  listForAnalytics(userId: string): Promise<AnalyticsRow[]>;
```
and to `ApplicationsService`:
```ts
  analytics(userId: string): Promise<Analytics>;
```

`server/src/api/repos.ts`: import `type { AnalyticsRow } from '../services/analytics.js'`; in `createApplicationsRepo` add `.limit(200)` to the `list` query (after `.order(...)`, before the status filter) and add:
```ts
    async listForAnalytics(userId) {
      const { data, error } = await db.from('applications').select('status, match_score').eq('user_id', userId);
      if (error) throw error;
      return (data ?? []) as AnalyticsRow[];
    },
```

`server/src/services/applications.ts`: add `import { computeAnalytics } from './analytics.js';` and the method
```ts
    async analytics(userId) {
      return computeAnalytics(await deps.repo.listForAnalytics(userId));
    },
```

`server/src/api/routes/analytics.ts`:
```ts
import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

export function analyticsRoutes(d: Pick<AppDeps, 'applications'>) {
  const router = Router();
  router.get('/', asyncHandler(async (req, res) => {
    res.json(await d.applications.analytics(req.user!.id));
  }));
  return router;
}
```

`server/src/api/app.ts`: `import { analyticsRoutes } from './routes/analytics.js';` and mount `app.use('/analytics', analyticsRoutes(d));` next to the other routes.

- [ ] **Step 5: Keep existing fixtures compiling**

Run `npm run typecheck`. Add `analytics: vi.fn()` to the `applications` fixture objects in `server/tests/api/app.test.ts` and `server/tests/api/status.test.ts`, and `listForAnalytics: vi.fn()` to the repo fakes in `server/tests/services/applications.test.ts` and `server/tests/services/applications-status.test.ts`. Do not change assertions.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/services/analytics.test.ts tests/api/analytics.test.ts`, then `npx vitest run` and `npm run typecheck`
Expected: all PASS, typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat(server): add GET /analytics and cap application lists at 200

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Web scaffold: Next.js, Tailwind theme, UI primitives, test setup

**Files:**
- Modify: root `package.json` (add `web` to workspaces)
- Create: `web/package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `vitest.config.ts`, `vitest.setup.ts`, `.env.example`, `.gitignore`
- Create: `web/src/app/layout.tsx`, `globals.css`, `page.tsx`
- Create: `web/src/lib/utils.ts`
- Create: `web/src/components/ui/button.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`, `card.tsx`, `badge.tsx`, `tabs.tsx`, `dialog.tsx`, `skeleton.tsx`
- Test: `web/tests/ui/button.test.tsx`, `web/tests/lib/utils.test.ts`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string`; shadcn-style components `Button` (variants `default|secondary|outline|ghost|destructive`, sizes `default|sm|lg|icon`, `asChild`), `Input`, `Label`, `Textarea`, `Card/CardHeader/CardTitle/CardDescription/CardContent`, `Badge` (variants `default|secondary|outline|success|warning|destructive`), `Tabs/TabsList/TabsTrigger/TabsContent`, `Dialog/DialogContent/DialogHeader/DialogTitle/DialogDescription` (content is a right-hand sheet), `Skeleton`.

- [ ] **Step 1: Create the workspace and install dependencies**

Edit root `package.json`: change `"workspaces"` to `["packages/*", "server", "web"]`, and change the `"build"` script to `"npm run build:shared && npm run build -w server && npm run build -w web"`.

Create `web/package.json`:
```json
{
  "name": "web",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "predev": "npm run build:shared --prefix ..",
    "dev": "next dev -p 3000",
    "prebuild": "npm run build:shared --prefix ..",
    "build": "next build",
    "start": "next start -p 3000",
    "pretypecheck": "npm run build:shared --prefix ..",
    "typecheck": "tsc --noEmit",
    "pretest": "npm run build:shared --prefix ..",
    "test": "vitest run"
  }
}
```

Run (repo root):
```bash
npm install -w web next@14 react@18 react-dom@18 @joblume/shared@"*" zod @supabase/ssr @supabase/supabase-js @tanstack/react-query@5 @dnd-kit/core class-variance-authority clsx tailwind-merge lucide-react @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-label
npm install -D -w web typescript tailwindcss@3 postcss autoprefixer @types/react@18 @types/react-dom@18 @types/node vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```
Expected: installs succeed. If `next build` later fails because the installed TypeScript major is too new for Next 14, pin it for the web workspace with `npm install -D -w web typescript@5` and report that.

- [ ] **Step 2: Configuration files**

`web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src", "tests", "middleware.ts", "vitest.config.ts", "vitest.setup.ts", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`web/next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@joblume/shared'],
};

export default nextConfig;
```

`web/postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`web/tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
    },
  },
  plugins: [],
};

export default config;
```

`web/vitest.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
  },
});
```

`web/vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
```

`web/.env.example`:
```
# Public values only. These are visible in the browser.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:4000
```

`web/.gitignore`:
```
.next/
next-env.d.ts
.env.local
```

- [ ] **Step 3: Global styles, root layout, home redirect**

`web/src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 0 0% 4%;            /* #0A0A0A */
  --foreground: 0 0% 96%;
  --card: 0 0% 7%;
  --card-foreground: 0 0% 96%;
  --primary: 247 74% 63%;           /* #6C5CE7 */
  --primary-foreground: 0 0% 100%;
  --secondary: 0 0% 12%;
  --secondary-foreground: 0 0% 90%;
  --muted: 0 0% 12%;
  --muted-foreground: 0 0% 62%;
  --accent: 0 0% 15%;
  --accent-foreground: 0 0% 96%;
  --destructive: 0 72% 55%;
  --destructive-foreground: 0 0% 100%;
  --border: 0 0% 17%;
  --input: 0 0% 17%;
  --ring: 247 74% 63%;
  --radius: 0.5rem;
  color-scheme: dark;
}

* { border-color: hsl(var(--border)); }

body {
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
```

`web/src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'JobLume',
  description: 'AI-assisted job applications you approve before anything is sent',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
```

`web/src/app/page.tsx`:
```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/queue');
}
```

- [ ] **Step 4: Write the failing tests**

`web/tests/lib/utils.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('joins class names and drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });

  it('lets the later Tailwind class win a conflict', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});
```

`web/tests/ui/button.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders its label with the primary variant by default', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain('bg-primary');
  });

  it('applies the outline variant', () => {
    render(<Button variant="outline">Cancel</Button>);
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('border');
  });

  it('renders the child element when asChild is set', () => {
    render(<Button asChild><a href="/x">Go</a></Button>);
    expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute('href', '/x');
  });

  it('is disabled when the disabled prop is set', () => {
    render(<Button disabled>Nope</Button>);
    expect(screen.getByRole('button', { name: 'Nope' })).toBeDisabled();
  });
});
```

- [ ] **Step 5: Run and confirm failure**

Run: `npm test -w web`
Expected: FAIL, modules `@/lib/utils` and `@/components/ui/button` not found.

- [ ] **Step 6: Implement the helper and UI primitives**

`web/src/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

`web/src/components/ui/button.tsx`:
```tsx
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-border bg-transparent hover:bg-accent',
        ghost: 'hover:bg-accent',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: { default: 'h-9 px-4 py-2', sm: 'h-8 px-3 text-xs', lg: 'h-10 px-6', icon: 'h-9 w-9' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

`web/src/components/ui/input.tsx`:
```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
```

`web/src/components/ui/label.tsx`:
```tsx
import * as LabelPrimitive from '@radix-ui/react-label';
import * as React from 'react';
import { cn } from '@/lib/utils';

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium leading-none', className)} {...props} />
));
Label.displayName = 'Label';

export { Label };
```

`web/src/components/ui/textarea.tsx`:
```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Textarea };
```

`web/src/components/ui/card.tsx`:
```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-sm', className)} {...props} />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col space-y-1.5 p-5', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
```

`web/src/components/ui/badge.tsx`:
```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/20 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-muted-foreground',
        success: 'border-transparent bg-emerald-500/15 text-emerald-400',
        warning: 'border-transparent bg-amber-500/15 text-amber-400',
        destructive: 'border-transparent bg-destructive/20 text-red-400',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
```

`web/src/components/ui/tabs.tsx`:
```tsx
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground', className)}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-4 focus-visible:outline-none', className)} {...props} />
));
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
```

`web/src/components/ui/dialog.tsx`:
```tsx
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed right-0 top-0 z-50 h-full w-full max-w-3xl overflow-y-auto border-l border-border bg-background p-6 shadow-xl focus:outline-none',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mb-4 flex flex-col space-y-1.5 pr-8', className)} {...props} />
);

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-none', className)} {...props} />
));
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
DialogDescription.displayName = 'DialogDescription';

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription };
```

`web/src/components/ui/skeleton.tsx`:
```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

export { Skeleton };
```

- [ ] **Step 7: Verify**

Run: `npm test -w web && npm run typecheck -w web && npm run build -w web`
Expected: 6 tests PASS; typecheck exits 0; `next build` succeeds (it compiles the home redirect; the `/queue` target does not exist yet and that is fine). Fix any version-compatibility problems minimally and report them.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json web
git status --short | head
git commit -m "feat(web): scaffold Next.js app with dark theme, UI primitives and test setup

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: no `.next`, `node_modules` or `next-env.d.ts` staged.

---

### Task 5: Web: env, Supabase clients, route guard, API client

**Files:**
- Create: `web/src/lib/env.ts`, `web/src/lib/route-guard.ts`
- Create: `web/src/lib/supabase/client.ts`, `web/src/lib/supabase/middleware.ts`
- Create: `web/middleware.ts`
- Create: `web/src/lib/api/client.ts`, `web/src/lib/api/errors.ts`, `web/src/lib/api/endpoints.ts`, `web/src/lib/api/runtime.ts`
- Test: `web/tests/lib/route-guard.test.ts`, `web/tests/lib/api-client.test.ts`, `web/tests/lib/api-errors.test.ts`, `web/tests/lib/api-endpoints.test.ts`

**Interfaces:**
- Produces:
  - `getPublicEnv(): { supabaseUrl: string; supabaseAnonKey: string; apiUrl: string }` (throws a clear error when a variable is missing; `apiUrl` has no trailing slash)
  - `decideRedirect(pathname: string, hasUser: boolean): '/login' | '/queue' | null`
  - `createBrowserSupabase(): SupabaseClient` (singleton)
  - `class ApiRequestError extends Error { status: number; code: string; details?: unknown }`
  - `createApiClient(opts: { baseUrl: string; getToken(): Promise<string | null>; onUnauthorized(): void | Promise<void>; fetchImpl?: typeof fetch }): ApiClient` where `type ApiClient = <T>(path: string, init?: { method?: string; json?: unknown; formData?: FormData }) => Promise<T>`
  - `describeApiError(err: unknown): string`
  - `createApi(request: ApiClient)` returning `{ getProfile, updateProfile, uploadCv, listApplications, getApplication, updateApplicationText, setApplicationStatus, getAnalytics, refreshJobs }`; `type Api`
  - `getApi(): Api` (runtime singleton using the browser Supabase session)

- [ ] **Step 1: Write the failing tests**

`web/tests/lib/route-guard.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { decideRedirect } from '@/lib/route-guard';

describe('decideRedirect', () => {
  it('sends signed-out visitors to /login from any app page', () => {
    expect(decideRedirect('/queue', false)).toBe('/login');
    expect(decideRedirect('/settings', false)).toBe('/login');
    expect(decideRedirect('/', false)).toBe('/login');
  });

  it('lets signed-out visitors see /login', () => {
    expect(decideRedirect('/login', false)).toBeNull();
  });

  it('sends signed-in users away from /login', () => {
    expect(decideRedirect('/login', true)).toBe('/queue');
  });

  it('lets signed-in users through everywhere else', () => {
    expect(decideRedirect('/queue', true)).toBeNull();
    expect(decideRedirect('/onboarding', true)).toBeNull();
  });
});
```

`web/tests/lib/api-client.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, createApiClient } from '@/lib/api/client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function make(over: Partial<Parameters<typeof createApiClient>[0]> = {}) {
  const fetchImpl = vi.fn();
  const onUnauthorized = vi.fn();
  const request = createApiClient({
    baseUrl: 'http://api.test',
    getToken: async () => 'tok',
    onUnauthorized,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    ...over,
  });
  return { request, fetchImpl, onUnauthorized };
}

describe('createApiClient', () => {
  it('sends the bearer token and returns parsed JSON', async () => {
    const { request, fetchImpl } = make();
    fetchImpl.mockResolvedValue(json({ a: 1 }));
    expect(await request('/x')).toEqual({ a: 1 });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('http://api.test/x');
    expect((init as RequestInit).method).toBe('GET');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer tok' });
  });

  it('sends a JSON body with a content-type header', async () => {
    const { request, fetchImpl } = make();
    fetchImpl.mockResolvedValue(json({ ok: true }));
    await request('/p', { method: 'PUT', json: { a: 1 } });
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
  });

  it('sends FormData without setting a content-type header', async () => {
    const { request, fetchImpl } = make();
    fetchImpl.mockResolvedValue(json({ characters: 10 }));
    const form = new FormData();
    form.append('file', new Blob(['x']), 'cv.pdf');
    await request('/cv', { method: 'POST', formData: form });
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBe(form);
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined();
  });

  it('calls onUnauthorized and throws a 401 error when the server answers 401', async () => {
    const { request, fetchImpl, onUnauthorized } = make();
    fetchImpl.mockResolvedValue(json({ error: 'unauthorized' }, 401));
    await expect(request('/x')).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not call the server when there is no token', async () => {
    const { request, fetchImpl, onUnauthorized } = make({ getToken: async () => null });
    await expect(request('/x')).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('maps an error body to an ApiRequestError with code, message and details', async () => {
    const { request, fetchImpl } = make();
    fetchImpl.mockResolvedValue(json({ error: 'invalid_request', message: 'bad', details: { fieldErrors: { a: ['x'] } } }, 400));
    const err = await request('/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 400, code: 'invalid_request', message: 'bad', details: { fieldErrors: { a: ['x'] } } });
  });

  it('turns a network failure into a status 0 network_error', async () => {
    const { request, fetchImpl } = make();
    fetchImpl.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(request('/x')).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });

  it('returns null for an empty successful body', async () => {
    const { request, fetchImpl } = make();
    fetchImpl.mockResolvedValue(new Response('', { status: 200 }));
    expect(await request('/x')).toBeNull();
  });

  it('uses http_error as the code when the error body is not JSON', async () => {
    const { request, fetchImpl } = make();
    fetchImpl.mockResolvedValue(new Response('<html>oops</html>', { status: 502 }));
    await expect(request('/x')).rejects.toMatchObject({ status: 502, code: 'http_error' });
  });
});
```

`web/tests/lib/api-errors.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '@/lib/api/client';
import { describeApiError } from '@/lib/api/errors';

const e = (status: number, code: string) => new ApiRequestError(status, code);

describe('describeApiError', () => {
  it.each([
    [e(0, 'network_error'), /cannot reach the server/i],
    [e(400, 'unsupported_file_type'), /pdf or docx/i],
    [e(422, 'cv_text_too_short'), /scanned/i],
    [e(422, 'unreadable_file'), /re-export/i],
    [e(400, 'file_required'), /choose a file/i],
    [e(413, 'limit_file_size'), /5 mb/i],
    [e(413, 'payload_too_large'), /5 mb|too large/i],
    [e(429, 'rate_limited'), /too often/i],
    [e(404, 'application_not_found'), /no longer exists/i],
    [e(400, 'invalid_request'), /invalid/i],
    [e(500, 'internal_error'), /server had a problem/i],
    [e(503, 'http_error'), /server had a problem/i],
    [e(418, 'teapot'), /could not be completed/i],
  ])('explains %# in plain language', (err, pattern) => {
    expect(describeApiError(err)).toMatch(pattern);
  });

  it('falls back to a generic message for unknown errors', () => {
    expect(describeApiError(new Error('boom'))).toMatch(/something went wrong/i);
    expect(describeApiError('x')).toMatch(/something went wrong/i);
  });
});
```

`web/tests/lib/api-endpoints.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@/lib/api/client';
import { createApi } from '@/lib/api/endpoints';

function make() {
  const request = vi.fn().mockResolvedValue({});
  return { api: createApi(request as unknown as ApiClient), request };
}

describe('createApi', () => {
  it('getProfile / updateProfile', async () => {
    const { api, request } = make();
    await api.getProfile();
    expect(request).toHaveBeenLastCalledWith('/profile');
    await api.updateProfile({ location: 'Lagos' });
    expect(request).toHaveBeenLastCalledWith('/profile', { method: 'PUT', json: { location: 'Lagos' } });
  });

  it('uploadCv posts the file as multipart form data', async () => {
    const { api, request } = make();
    const file = new File(['x'], 'cv.pdf', { type: 'application/pdf' });
    await api.uploadCv(file);
    const [path, init] = request.mock.calls[0]!;
    expect(path).toBe('/cv');
    expect(init.method).toBe('POST');
    expect((init.formData as FormData).get('file')).toBe(file);
  });

  it('listApplications with and without a status filter', async () => {
    const { api, request } = make();
    await api.listApplications();
    expect(request).toHaveBeenLastCalledWith('/applications');
    await api.listApplications('pending_review');
    expect(request).toHaveBeenLastCalledWith('/applications?status=pending_review');
  });

  it('getApplication encodes the id', async () => {
    const { api, request } = make();
    await api.getApplication('a/b');
    expect(request).toHaveBeenLastCalledWith('/applications/a%2Fb');
  });

  it('updateApplicationText patches only what it is given', async () => {
    const { api, request } = make();
    await api.updateApplicationText('abc', { cover_letter_text: 'hi' });
    expect(request).toHaveBeenLastCalledWith('/applications/abc', { method: 'PATCH', json: { cover_letter_text: 'hi' } });
  });

  it('setApplicationStatus patches /status', async () => {
    const { api, request } = make();
    await api.setApplicationStatus('abc', 'applied');
    expect(request).toHaveBeenLastCalledWith('/applications/abc/status', { method: 'PATCH', json: { status: 'applied' } });
  });

  it('getAnalytics and refreshJobs', async () => {
    const { api, request } = make();
    await api.getAnalytics();
    expect(request).toHaveBeenLastCalledWith('/analytics');
    await api.refreshJobs();
    expect(request).toHaveBeenLastCalledWith('/jobs/refresh', { method: 'POST' });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -w web -- tests/lib`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement env and route guard**

`web/src/lib/env.ts`:
```ts
/** Public configuration. Each variable is referenced literally so Next.js can inline it into the browser bundle. */
export function getPublicEnv(): { supabaseUrl: string; supabaseAnonKey: string; apiUrl: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!supabaseUrl || !supabaseAnonKey || !apiUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_API_URL. Copy web/.env.example to web/.env.local and fill it in.');
  }
  return { supabaseUrl, supabaseAnonKey, apiUrl: apiUrl.replace(/\/+$/, '') };
}
```

`web/src/lib/route-guard.ts`:
```ts
/** Where the middleware should redirect, or null to continue. */
export function decideRedirect(pathname: string, hasUser: boolean): '/login' | '/queue' | null {
  const onLogin = pathname === '/login';
  if (!hasUser && !onLogin) return '/login';
  if (hasUser && onLogin) return '/queue';
  return null;
}
```

- [ ] **Step 4: Implement the API client, errors and endpoints**

`web/src/lib/api/client.ts`:
```ts
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = 'ApiRequestError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken(): Promise<string | null>;
  onUnauthorized(): void | Promise<void>;
  fetchImpl?: typeof fetch;
}

export interface RequestInitLite {
  method?: string;
  json?: unknown;
  formData?: FormData;
}

export type ApiClient = <T>(path: string, init?: RequestInitLite) => Promise<T>;

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const doFetch: typeof fetch = opts.fetchImpl ?? ((...args) => fetch(...args));

  return async function request<T>(path: string, init: RequestInitLite = {}): Promise<T> {
    const token = await opts.getToken();
    if (!token) {
      await opts.onUnauthorized();
      throw new ApiRequestError(401, 'unauthorized');
    }

    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    let body: BodyInit | undefined;
    if (init.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(init.json);
    } else if (init.formData) {
      body = init.formData;
    }

    let res: Response;
    try {
      res = await doFetch(`${opts.baseUrl}${path}`, { method: init.method ?? 'GET', headers, body });
    } catch {
      throw new ApiRequestError(0, 'network_error', 'Network request failed');
    }

    if (res.status === 401) {
      await opts.onUnauthorized();
      throw new ApiRequestError(401, 'unauthorized');
    }

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      const errBody = (data ?? {}) as { error?: string; message?: string; details?: unknown };
      throw new ApiRequestError(res.status, errBody.error ?? 'http_error', errBody.message, errBody.details);
    }
    return data as T;
  };
}
```

`web/src/lib/api/errors.ts`:
```ts
import { ApiRequestError } from './client';

/** Plain-language message for an error from the API client. */
export function describeApiError(err: unknown): string {
  if (!(err instanceof ApiRequestError)) return 'Something went wrong. Please try again.';
  switch (err.code) {
    case 'network_error':
      return 'Cannot reach the server. Check your connection and try again.';
    case 'unsupported_file_type':
      return 'That file type is not supported. Upload a PDF or DOCX.';
    case 'cv_text_too_short':
      return 'We could not read enough text from that file. Scanned images are not supported; upload a PDF or DOCX with selectable text.';
    case 'unreadable_file':
      return 'We could not open that file. Re-export it as a PDF or DOCX and try again.';
    case 'file_required':
      return 'Choose a file to upload.';
    case 'limit_file_size':
    case 'payload_too_large':
      return 'That file is larger than 5 MB.';
    case 'rate_limited':
      return 'You are doing that too often. Try again later.';
    case 'application_not_found':
      return 'That application no longer exists.';
    case 'invalid_request':
      return 'Some fields are invalid. Check the form and try again.';
  }
  if (err.status === 413) return 'That file is larger than 5 MB.';
  if (err.status === 429) return 'You are doing that too often. Try again later.';
  if (err.status >= 500) return 'The server had a problem. Please try again in a moment.';
  return 'The request could not be completed.';
}
```

`web/src/lib/api/endpoints.ts`:
```ts
import type {
  Analytics,
  Application,
  ApplicationDetail,
  ApplicationStatus,
  CvUploadResult,
  Profile,
  ProfilePatch,
} from '@joblume/shared';
import type { ApiClient } from './client';

export function createApi(request: ApiClient) {
  return {
    getProfile: () => request<Profile>('/profile'),
    updateProfile: (patch: ProfilePatch) => request<Profile>('/profile', { method: 'PUT', json: patch }),
    uploadCv: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return request<CvUploadResult>('/cv', { method: 'POST', formData: form });
    },
    listApplications: (status?: ApplicationStatus) =>
      request<Application[]>(status ? `/applications?status=${encodeURIComponent(status)}` : '/applications'),
    getApplication: (id: string) => request<ApplicationDetail>(`/applications/${encodeURIComponent(id)}`),
    updateApplicationText: (id: string, patch: { tailored_cv_text?: string; cover_letter_text?: string }) =>
      request<Application>(`/applications/${encodeURIComponent(id)}`, { method: 'PATCH', json: patch }),
    setApplicationStatus: (id: string, status: ApplicationStatus) =>
      request<Application>(`/applications/${encodeURIComponent(id)}/status`, { method: 'PATCH', json: { status } }),
    getAnalytics: () => request<Analytics>('/analytics'),
    refreshJobs: () => request<{ queued: boolean }>('/jobs/refresh', { method: 'POST' }),
  };
}

export type Api = ReturnType<typeof createApi>;
```

- [ ] **Step 5: Implement the Supabase clients, middleware and runtime**

`web/src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPublicEnv } from '../env';

let client: SupabaseClient | undefined;

export function createBrowserSupabase(): SupabaseClient {
  if (!client) {
    const env = getPublicEnv();
    client = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return client;
}
```

`web/src/lib/supabase/middleware.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getPublicEnv } from '../env';

/** Refreshes the session cookie and returns the verified user (or null). */
export async function updateSession(request: NextRequest) {
  const env = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { response, user };
}
```

`web/middleware.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { decideRedirect } from '@/lib/route-guard';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const target = decideRedirect(request.nextUrl.pathname, user !== null);
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

`web/src/lib/api/runtime.ts`:
```ts
import { getPublicEnv } from '../env';
import { createBrowserSupabase } from '../supabase/client';
import { createApiClient } from './client';
import { createApi, type Api } from './endpoints';

let api: Api | undefined;

/** The API used by the browser UI: Bearer token from the current Supabase session. */
export function getApi(): Api {
  if (api) return api;
  const env = getPublicEnv();
  const supabase = createBrowserSupabase();
  api = createApi(
    createApiClient({
      baseUrl: env.apiUrl,
      getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
      onUnauthorized: async () => {
        await supabase.auth.signOut();
        window.location.assign('/login');
      },
    }),
  );
  return api;
}
```

- [ ] **Step 6: Verify**

Run: `npm test -w web && npm run typecheck -w web && npm run build -w web`
Expected: all web tests PASS (route-guard 4, api-client 9, api-errors 14, api-endpoints 7, plus Task 4's 6); typecheck exits 0; `next build` succeeds. The middleware needs the `NEXT_PUBLIC_*` variables only at request time, not at build time; if the build fails because of them, report it.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(web): add session middleware, route guard and typed API client with error mapping

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 6: Web: application helpers and data hooks

**Files:**
- Create: `web/src/lib/applications.ts`, `web/src/hooks/api.ts`, `web/src/app/providers.tsx`
- Modify: `web/src/app/layout.tsx`
- Test: `web/tests/lib/applications.test.ts`, `web/tests/hooks/use-set-status.test.tsx`

**Interfaces:**
- Consumes: `Application`, `ApplicationDetail`, `ApplicationStatus`, `KanbanColumn`, `KANBAN_COLUMNS`, `columnForStatus` from `@joblume/shared`; `getApi` from `@/lib/api/runtime`; `ApiRequestError`.
- Produces (`@/lib/applications`):
  - `type QueueTab = 'pending' | 'ready' | 'skipped'`
  - `sortByScore<T extends { match_score: number | null; created_at: string }>(items: T[]): T[]` (score descending, nulls last, ties newest first; does not mutate)
  - `queueTab(status: ApplicationStatus): QueueTab | null`
  - `splitQueue(apps: Application[]): Record<QueueTab, Application[]>`
  - `groupByColumn(apps: Application[]): Record<KanbanColumn, Application[]>`
  - `applyStatusLocal<T extends Application>(apps: T[], id: string, status: ApplicationStatus, now?: Date): T[]`
  - `resolveDrop(apps: Application[], activeId: string, overId: string | null): ApplicationStatus | null`
  - `previewText(text: string | null, max?: number): string`
  - `scoreTone(score: number | null): 'high' | 'mid' | 'low' | 'none'`
  - `MIN_CV_CHARS = 50`, `buildTextPatch(original: { cv: string | null; letter: string | null }, current: { cv: string; letter: string }): { patch: { tailored_cv_text?: string; cover_letter_text?: string }; errors: { cv?: string; letter?: string }; dirty: boolean }`
- Produces (`@/hooks/api`): `keys` (`profile`, `applications`, `application(id)`, `analytics`), `useProfile`, `useUpdateProfile`, `useUploadCv`, `useApplications(options?: { poll?: boolean })`, `useApplication(id: string | null)`, `useUpdateApplicationText`, `useSetStatus` (optimistic with rollback), `useAnalytics`, `useRefreshJobs`.
- Produces: `Providers` component (TanStack `QueryClientProvider`).

- [ ] **Step 1: Write the failing tests**

`web/tests/lib/applications.test.ts`:
```ts
import type { Application } from '@joblume/shared';
import { describe, expect, it } from 'vitest';
import {
  applyStatusLocal, buildTextPatch, groupByColumn, previewText, queueTab, resolveDrop, scoreTone, sortByScore, splitQueue,
} from '@/lib/applications';

const app = (over: Partial<Application> = {}): Application => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'cv', tailored_cv_url: null, cover_letter_text: 'letter',
  match_score: 70, missing_keywords: [], hiring_manager_email: null, email_confidence: null, apply_method: null,
  status: 'pending_review', applied_at: null, follow_up_at: null, created_at: '2026-10-01T00:00:00.000Z', job: null, ...over,
});

describe('sortByScore', () => {
  it('orders by score descending, nulls last, ties newest first, without mutating', () => {
    const input = [
      app({ id: 'low', match_score: 40 }),
      app({ id: 'none', match_score: null }),
      app({ id: 'old90', match_score: 90, created_at: '2026-10-01T00:00:00.000Z' }),
      app({ id: 'new90', match_score: 90, created_at: '2026-10-05T00:00:00.000Z' }),
    ];
    const copy = [...input];
    expect(sortByScore(input).map((a) => a.id)).toEqual(['new90', 'old90', 'low', 'none']);
    expect(input).toEqual(copy);
  });
});

describe('queue tabs', () => {
  it('maps statuses to tabs', () => {
    expect(queueTab('pending_review')).toBe('pending');
    expect(queueTab('approved')).toBe('ready');
    expect(queueTab('skipped')).toBe('skipped');
    expect(queueTab('applied')).toBeNull();
  });

  it('splits and sorts applications into tabs and ignores the applied family', () => {
    const groups = splitQueue([
      app({ id: 'p1', match_score: 50 }),
      app({ id: 'p2', match_score: 80 }),
      app({ id: 'r1', status: 'approved' }),
      app({ id: 's1', status: 'skipped' }),
      app({ id: 'x', status: 'applied' }),
    ]);
    expect(groups.pending.map((a) => a.id)).toEqual(['p2', 'p1']);
    expect(groups.ready.map((a) => a.id)).toEqual(['r1']);
    expect(groups.skipped.map((a) => a.id)).toEqual(['s1']);
  });
});

describe('groupByColumn', () => {
  it('puts approved in Pending Review, drops skipped, keeps every column key', () => {
    const groups = groupByColumn([
      app({ id: 'a', status: 'pending_review' }),
      app({ id: 'b', status: 'approved' }),
      app({ id: 'c', status: 'skipped' }),
      app({ id: 'd', status: 'applied' }),
      app({ id: 'e', status: 'offer' }),
    ]);
    expect(Object.keys(groups)).toEqual(['pending_review', 'applied', 'interviewing', 'rejected', 'offer']);
    expect(groups.pending_review.map((x) => x.id).sort()).toEqual(['a', 'b']);
    expect(groups.applied.map((x) => x.id)).toEqual(['d']);
    expect(groups.interviewing).toEqual([]);
    expect(groups.offer.map((x) => x.id)).toEqual(['e']);
  });
});

describe('applyStatusLocal', () => {
  const now = new Date('2026-10-20T10:00:00.000Z');

  it('mirrors the server: applied stamps times and assisted', () => {
    const [out] = applyStatusLocal([app()], 'a1', 'applied', now);
    expect(out).toMatchObject({
      status: 'applied', applied_at: '2026-10-20T10:00:00.000Z', follow_up_at: '2026-10-23T10:00:00.000Z', apply_method: 'assisted',
    });
  });

  it('keeps the original timestamps between applied-family statuses', () => {
    const applied = app({ status: 'applied', applied_at: '2026-10-18T00:00:00.000Z', follow_up_at: '2026-10-21T00:00:00.000Z', apply_method: 'assisted' });
    const [out] = applyStatusLocal([applied], 'a1', 'interviewing', now);
    expect(out).toMatchObject({ status: 'interviewing', applied_at: '2026-10-18T00:00:00.000Z', follow_up_at: '2026-10-21T00:00:00.000Z' });
  });

  it('clears the timestamps when moving back to pending, approved or skipped', () => {
    const applied = app({ status: 'applied', applied_at: '2026-10-18T00:00:00.000Z', follow_up_at: '2026-10-21T00:00:00.000Z' });
    expect(applyStatusLocal([applied], 'a1', 'pending_review', now)[0]).toMatchObject({ status: 'pending_review', applied_at: null, follow_up_at: null });
    expect(applyStatusLocal([applied], 'a1', 'skipped', now)[0]).toMatchObject({ applied_at: null, follow_up_at: null });
  });

  it('leaves other applications alone and does not mutate the input', () => {
    const input = [app({ id: 'a1' }), app({ id: 'a2' })];
    const out = applyStatusLocal(input, 'a1', 'applied', now);
    expect(out[1]).toBe(input[1]);
    expect(input[0]!.status).toBe('pending_review');
  });
});

describe('resolveDrop', () => {
  const apps = [app({ id: 'a1', status: 'pending_review' }), app({ id: 'a2', status: 'approved' }), app({ id: 'a3', status: 'applied' })];

  it('returns the target column status when dropped on a different column', () => {
    expect(resolveDrop(apps, 'a1', 'applied')).toBe('applied');
    expect(resolveDrop(apps, 'a3', 'offer')).toBe('offer');
  });

  it('returns null when dropped on its own column (approved counts as Pending Review)', () => {
    expect(resolveDrop(apps, 'a3', 'applied')).toBeNull();
    expect(resolveDrop(apps, 'a2', 'pending_review')).toBeNull();
  });

  it('returns null for a missing drop target, an unknown card or a non-column target', () => {
    expect(resolveDrop(apps, 'a1', null)).toBeNull();
    expect(resolveDrop(apps, 'nope', 'applied')).toBeNull();
    expect(resolveDrop(apps, 'a1', 'a3')).toBeNull();
    expect(resolveDrop(apps, 'a1', 'skipped')).toBeNull();
  });
});

describe('previewText', () => {
  it('collapses whitespace and truncates with an ellipsis', () => {
    expect(previewText('  one\n\n two   three ')).toBe('one two three');
    expect(previewText('abcdefghij', 5)).toBe('abcde…');
    expect(previewText('abcde', 5)).toBe('abcde');
    expect(previewText(null)).toBe('');
  });
});

describe('scoreTone', () => {
  it('buckets scores', () => {
    expect(scoreTone(null)).toBe('none');
    expect(scoreTone(75)).toBe('high');
    expect(scoreTone(74)).toBe('mid');
    expect(scoreTone(50)).toBe('mid');
    expect(scoreTone(49)).toBe('low');
  });
});

describe('buildTextPatch', () => {
  const original = { cv: 'x'.repeat(60), letter: 'Dear team' };

  it('is not dirty when nothing changed', () => {
    expect(buildTextPatch(original, { cv: original.cv, letter: original.letter })).toEqual({ patch: {}, errors: {}, dirty: false });
  });

  it('patches only the changed fields', () => {
    const r = buildTextPatch(original, { cv: original.cv, letter: 'Hello team' });
    expect(r.patch).toEqual({ cover_letter_text: 'Hello team' });
    expect(r.dirty).toBe(true);
    expect(r.errors).toEqual({});
  });

  it('flags a changed CV that is too short and a changed letter that is blank', () => {
    const r = buildTextPatch(original, { cv: 'short', letter: '   ' });
    expect(r.errors.cv).toMatch(/at least 50/);
    expect(r.errors.letter).toMatch(/cannot be empty/);
  });

  it('flags text over the server limits', () => {
    const r = buildTextPatch(original, { cv: 'x'.repeat(30_001), letter: 'y'.repeat(10_001) });
    expect(r.errors.cv).toMatch(/too long/);
    expect(r.errors.letter).toMatch(/too long/);
  });

  it('treats null originals as empty text', () => {
    const r = buildTextPatch({ cv: null, letter: null }, { cv: '', letter: 'Hi' });
    expect(r.patch).toEqual({ cover_letter_text: 'Hi' });
  });
});
```

`web/tests/hooks/use-set-status.test.tsx`:
```tsx
import type { Application } from '@joblume/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setApplicationStatus } = vi.hoisted(() => ({ setApplicationStatus: vi.fn() }));
vi.mock('@/lib/api/runtime', () => ({ getApi: () => ({ setApplicationStatus }) }));

import { keys, useSetStatus } from '@/hooks/api';

const app = (over: Partial<Application> = {}): Application => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'cv', tailored_cv_url: null, cover_letter_text: 'l',
  match_score: 70, missing_keywords: [], hiring_manager_email: null, email_confidence: null, apply_method: null,
  status: 'pending_review', applied_at: null, follow_up_at: null, created_at: '2026-10-01T00:00:00.000Z', job: null, ...over,
});

function setup(initial: Application[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData(keys.applications, initial);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
}

const statusOf = (qc: QueryClient) => (qc.getQueryData(keys.applications) as Application[])[0]!.status;

beforeEach(() => setApplicationStatus.mockReset());

describe('useSetStatus', () => {
  it('updates the cached list before the server answers', async () => {
    let resolve!: (v: unknown) => void;
    setApplicationStatus.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { qc, wrapper } = setup([app()]);
    const { result } = renderHook(() => useSetStatus(), { wrapper });

    act(() => { result.current.mutate({ id: 'a1', status: 'applied' }); });
    await waitFor(() => expect(statusOf(qc)).toBe('applied'));
    expect(setApplicationStatus).toHaveBeenCalledWith('a1', 'applied');
    resolve({});
  });

  it('rolls the list back when the server refuses', async () => {
    setApplicationStatus.mockRejectedValue(new Error('refused'));
    const { qc, wrapper } = setup([app()]);
    const { result } = renderHook(() => useSetStatus(), { wrapper });

    act(() => { result.current.mutate({ id: 'a1', status: 'applied' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(statusOf(qc)).toBe('pending_review');
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -w web -- tests/lib/applications.test.ts tests/hooks`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the helpers** — `web/src/lib/applications.ts`

```ts
import {
  KANBAN_COLUMNS,
  columnForStatus,
  type Application,
  type ApplicationStatus,
  type KanbanColumn,
} from '@joblume/shared';

export type QueueTab = 'pending' | 'ready' | 'skipped';

export function sortByScore<T extends { match_score: number | null; created_at: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => (b.match_score ?? -1) - (a.match_score ?? -1) || b.created_at.localeCompare(a.created_at),
  );
}

export function queueTab(status: ApplicationStatus): QueueTab | null {
  if (status === 'pending_review') return 'pending';
  if (status === 'approved') return 'ready';
  if (status === 'skipped') return 'skipped';
  return null;
}

export function splitQueue(apps: Application[]): Record<QueueTab, Application[]> {
  const out: Record<QueueTab, Application[]> = { pending: [], ready: [], skipped: [] };
  for (const app of sortByScore(apps)) {
    const tab = queueTab(app.status);
    if (tab) out[tab].push(app);
  }
  return out;
}

export function groupByColumn(apps: Application[]): Record<KanbanColumn, Application[]> {
  const out = Object.fromEntries(KANBAN_COLUMNS.map((c) => [c, [] as Application[]])) as Record<KanbanColumn, Application[]>;
  for (const app of sortByScore(apps)) {
    const column = columnForStatus(app.status);
    if (column) out[column].push(app);
  }
  return out;
}

const APPLIED_FAMILY: ApplicationStatus[] = ['applied', 'interviewing', 'rejected', 'offer'];
const FOLLOW_UP_MS = 3 * 86_400_000;

/** Mirrors the server's status side effects so optimistic updates look right until the server answers. */
export function applyStatusLocal<T extends Application>(apps: T[], id: string, status: ApplicationStatus, now: Date = new Date()): T[] {
  return apps.map((app) => {
    if (app.id !== id) return app;
    if (!APPLIED_FAMILY.includes(status)) return { ...app, status, applied_at: null, follow_up_at: null };
    if (app.applied_at) return { ...app, status };
    return {
      ...app,
      status,
      applied_at: now.toISOString(),
      follow_up_at: new Date(now.getTime() + FOLLOW_UP_MS).toISOString(),
      apply_method: app.apply_method ?? 'assisted',
    };
  });
}

/** The status to set when `activeId` is dropped on `overId`, or null when nothing should change. */
export function resolveDrop(apps: Application[], activeId: string, overId: string | null): ApplicationStatus | null {
  if (!overId || !(KANBAN_COLUMNS as readonly string[]).includes(overId)) return null;
  const app = apps.find((a) => a.id === activeId);
  if (!app) return null;
  const target = overId as KanbanColumn;
  return columnForStatus(app.status) === target ? null : target;
}

export function previewText(text: string | null, max = 220): string {
  const collapsed = (text ?? '').replace(/\s+/g, ' ').trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max).trimEnd()}…`;
}

export function scoreTone(score: number | null): 'high' | 'mid' | 'low' | 'none' {
  if (score === null) return 'none';
  if (score >= 75) return 'high';
  if (score >= 50) return 'mid';
  return 'low';
}

export const MIN_CV_CHARS = 50;
const MAX_CV_CHARS = 30_000;
const MAX_LETTER_CHARS = 10_000;

export function buildTextPatch(
  original: { cv: string | null; letter: string | null },
  current: { cv: string; letter: string },
): {
  patch: { tailored_cv_text?: string; cover_letter_text?: string };
  errors: { cv?: string; letter?: string };
  dirty: boolean;
} {
  const patch: { tailored_cv_text?: string; cover_letter_text?: string } = {};
  const errors: { cv?: string; letter?: string } = {};

  if (current.cv !== (original.cv ?? '')) {
    patch.tailored_cv_text = current.cv;
    if (current.cv.length < MIN_CV_CHARS) errors.cv = `The CV must be at least ${MIN_CV_CHARS} characters.`;
    else if (current.cv.length > MAX_CV_CHARS) errors.cv = 'The CV is too long.';
  }
  if (current.letter !== (original.letter ?? '')) {
    patch.cover_letter_text = current.letter;
    if (current.letter.trim() === '') errors.letter = 'The cover letter cannot be empty.';
    else if (current.letter.length > MAX_LETTER_CHARS) errors.letter = 'The cover letter is too long.';
  }
  return { patch, errors, dirty: Object.keys(patch).length > 0 };
}
```

- [ ] **Step 4: Implement the hooks and providers**

`web/src/hooks/api.ts`:
```ts
'use client';

import type { Application, ApplicationDetail, ApplicationStatus, ProfilePatch } from '@joblume/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApi } from '@/lib/api/runtime';
import { applyStatusLocal } from '@/lib/applications';

export const keys = {
  profile: ['profile'] as const,
  applications: ['applications'] as const,
  application: (id: string) => ['application', id] as const,
  analytics: ['analytics'] as const,
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
    mutationFn: (file: File) => getApi().uploadCv(file),
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
```

`web/src/app/providers.tsx`:
```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiRequestError } from '@/lib/api/client';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: (failureCount, error) =>
              !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500) && failureCount < 2,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Edit `web/src/app/layout.tsx`: add `import { Providers } from './providers';` and wrap the body content: `<Providers>{children}</Providers>` inside `<body ...>`.

- [ ] **Step 5: Verify**

Run: `npm test -w web && npm run typecheck -w web && npm run build -w web`
Expected: all PASS (applications about 21 tests, hook tests 2), typecheck exits 0, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): add application helpers, data hooks with optimistic status updates and providers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Web: sign-in, route shell and onboarding gate

**Files:**
- Create: `web/src/components/common/SafeLink.tsx`, `ErrorState.tsx`, `EmptyState.tsx`, `PageSkeleton.tsx`
- Create: `web/src/components/auth/AuthForm.tsx`, `web/src/app/login/page.tsx`
- Create: `web/src/components/layout/NavLinks.tsx`, `AppShell.tsx`
- Create: `web/src/lib/onboarding.ts`, `web/src/app/(app)/layout.tsx`
- Test: `web/tests/components/safe-link.test.tsx`, `auth-form.test.tsx`, `nav-links.test.tsx`, `app-shell.test.tsx`, `web/tests/lib/onboarding.test.ts`

**Interfaces:**
- Consumes: `safeHttpUrl` from `@joblume/shared`; `useProfile` from `@/hooks/api`; `createBrowserSupabase`.
- Produces:
  - `SafeLink({ href, className?, children, fallback? })` renders an `<a target="_blank" rel="noopener noreferrer">` for http(s) URLs, otherwise `fallback` (default nothing)
  - `ErrorState({ message, onRetry? })` (role `alert`), `EmptyState({ title, description?, action? })`, `PageSkeleton()`
  - `AuthForm({ onSignIn, onSignUp })` with tabs "Sign in" and "Create account"
  - `NavLinks({ onNavigate? })`, `AppShell({ email, onSignOut, children })`
  - `needsOnboarding(profile: Pick<Profile, 'base_cv_url' | 'desired_roles'>): boolean`, `initialStep(profile: Pick<Profile, 'base_cv_url'>): 1 | 2`

- [ ] **Step 1: Write the failing tests**

`web/tests/components/safe-link.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafeLink } from '@/components/common/SafeLink';

describe('SafeLink', () => {
  it('renders an external anchor for an https URL', () => {
    render(<SafeLink href="https://example.com/job/1">View posting</SafeLink>);
    const link = screen.getByRole('link', { name: 'View posting' });
    expect(link).toHaveAttribute('href', 'https://example.com/job/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', '/relative', '', null, undefined])('renders only the fallback for %s', (href) => {
    render(<SafeLink href={href as string} fallback={<span>no link</span>}>View posting</SafeLink>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('no link')).toBeInTheDocument();
  });
});
```

`web/tests/components/auth-form.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthForm } from '@/components/auth/AuthForm';

function setup(over: Partial<React.ComponentProps<typeof AuthForm>> = {}) {
  const onSignIn = vi.fn().mockResolvedValue(undefined);
  const onSignUp = vi.fn().mockResolvedValue({ needsConfirmation: true });
  render(<AuthForm onSignIn={onSignIn} onSignUp={onSignUp} {...over} />);
  return { onSignIn, onSignUp, user: userEvent.setup() };
}

describe('AuthForm', () => {
  it('shows validation errors and calls nothing for a bad email and short password', async () => {
    const { onSignIn, user } = setup();
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it('signs in with the trimmed email and the password', async () => {
    const { onSignIn, user } = setup();
    await user.type(screen.getByLabelText('Email'), '  me@example.com ');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSignIn).toHaveBeenCalledWith('me@example.com', 'correct-horse');
  });

  it('shows the error message when sign in fails', async () => {
    const { user } = setup({ onSignIn: vi.fn().mockRejectedValue(new Error('Invalid login credentials')) });
    await user.type(screen.getByLabelText('Email'), 'me@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
  });

  it('switches to Create account and asks the user to confirm their email', async () => {
    const { onSignUp, user } = setup();
    await user.click(screen.getByRole('tab', { name: 'Create account' }));
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(onSignUp).toHaveBeenCalledWith('new@example.com', 'correct-horse');
    expect(await screen.findByRole('status')).toHaveTextContent(/check your email/i);
  });

  it('shows no confirmation message when sign up already signed the user in', async () => {
    const { user } = setup({ onSignUp: vi.fn().mockResolvedValue({ needsConfirmation: false }) });
    await user.click(screen.getByRole('tab', { name: 'Create account' }));
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
```

`web/tests/components/nav-links.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state } = vi.hoisted(() => ({ state: { pathname: '/queue' } }));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));

import { NavLinks } from '@/components/layout/NavLinks';

beforeEach(() => { state.pathname = '/queue'; });

describe('NavLinks', () => {
  it('lists the four sections', () => {
    render(<NavLinks />);
    for (const name of ['Queue', 'Tracker', 'Analytics', 'Settings']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('marks only the current section', () => {
    state.pathname = '/tracker';
    render(<NavLinks />);
    expect(screen.getByRole('link', { name: 'Tracker' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Queue' })).not.toHaveAttribute('aria-current');
  });

  it('treats nested paths as inside the section', () => {
    state.pathname = '/settings/profile';
    render(<NavLinks />);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  });
});
```

`web/tests/components/app-shell.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/queue' }));

import { AppShell } from '@/components/layout/AppShell';

describe('AppShell', () => {
  it('shows the signed-in email and signs out', async () => {
    const onSignOut = vi.fn();
    render(<AppShell email="me@example.com" onSignOut={onSignOut}><p>content</p></AppShell>);
    expect(screen.getByText('me@example.com')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('opens and closes the mobile menu', async () => {
    const user = userEvent.setup();
    render(<AppShell email={null} onSignOut={() => {}}><p>content</p></AppShell>);
    expect(screen.getAllByRole('link', { name: 'Queue' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('link', { name: 'Queue' })).toHaveLength(2);

    await user.click(screen.getAllByRole('link', { name: 'Tracker' })[1]!);
    expect(screen.getAllByRole('link', { name: 'Queue' })).toHaveLength(1);
  });
});
```

`web/tests/lib/onboarding.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { initialStep, needsOnboarding } from '@/lib/onboarding';

describe('needsOnboarding', () => {
  it('is true without a CV or without desired roles', () => {
    expect(needsOnboarding({ base_cv_url: null, desired_roles: ['analyst'] })).toBe(true);
    expect(needsOnboarding({ base_cv_url: 'u/base-cv.pdf', desired_roles: [] })).toBe(true);
    expect(needsOnboarding({ base_cv_url: null, desired_roles: [] })).toBe(true);
  });

  it('is false once there is a CV and at least one role', () => {
    expect(needsOnboarding({ base_cv_url: 'u/base-cv.pdf', desired_roles: ['analyst'] })).toBe(false);
  });
});

describe('initialStep', () => {
  it('starts at the CV step without a CV and at the profile step with one', () => {
    expect(initialStep({ base_cv_url: null })).toBe(1);
    expect(initialStep({ base_cv_url: 'u/base-cv.pdf' })).toBe(2);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -w web -- tests/components tests/lib/onboarding.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the common components and onboarding helpers**

`web/src/components/common/SafeLink.tsx`:
```tsx
import { safeHttpUrl } from '@joblume/shared';
import type { ReactNode } from 'react';

export interface SafeLinkProps {
  href: string | null | undefined;
  className?: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/** External link that only renders for http(s) URLs. Anything else shows `fallback`. */
export function SafeLink({ href, className, children, fallback = null }: SafeLinkProps) {
  const url = safeHttpUrl(href);
  if (!url) return <>{fallback}</>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
```

`web/src/components/common/ErrorState.tsx`:
```tsx
import { Button } from '@/components/ui/button';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <p>{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
```

`web/src/components/common/EmptyState.tsx`:
```tsx
import type { ReactNode } from 'react';

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-10 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
```

`web/src/components/common/PageSkeleton.tsx`:
```tsx
import { Skeleton } from '@/components/ui/skeleton';

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}
```

`web/src/lib/onboarding.ts`:
```ts
import type { Profile } from '@joblume/shared';

/** A user needs onboarding until they have a stored CV and at least one desired role. */
export function needsOnboarding(profile: Pick<Profile, 'base_cv_url' | 'desired_roles'>): boolean {
  return !profile.base_cv_url || profile.desired_roles.length === 0;
}

export function initialStep(profile: Pick<Profile, 'base_cv_url'>): 1 | 2 {
  return profile.base_cv_url ? 2 : 1;
}
```

- [ ] **Step 4: Implement the auth form and login page**

`web/src/components/auth/AuthForm.tsx`:
```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface AuthFormProps {
  onSignIn(email: string, password: string): Promise<void>;
  onSignUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
}

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
});

type Mode = 'signin' | 'signup';

export function AuthForm({ onSignIn, onSignUp }: AuthFormProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
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
        if (result.needsConfirmation) {
          setMessage({ kind: 'info', text: 'Check your email to confirm your account, then sign in.' });
        }
      }
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
    } finally {
      setPending(false);
    }
  }

  const label = mode === 'signin' ? 'Sign in' : 'Create account';

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Account" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(['signin', 'signup'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === m ? 'bg-background shadow' : 'text-muted-foreground'}`}
            onClick={() => {
              setMode(m);
              setMessage(null);
              setErrors({});
            }}
          >
            {m === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {errors.email && (
            <p id="email-error" role="alert" className="text-sm text-destructive">
              {errors.email}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? 'password-error' : undefined}
          />
          {errors.password && (
            <p id="password-error" role="alert" className="text-sm text-destructive">
              {errors.password}
            </p>
          )}
        </div>
        {message && (
          <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
            {message.text}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Please wait…' : label}
        </Button>
      </form>
    </div>
  );
}
```

`web/src/app/login/page.tsx` (the Supabase client is created inside the handlers so the page can be prerendered without environment variables):
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { createBrowserSupabase } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();

  async function onSignIn(email: string, password: string) {
    const { error } = await createBrowserSupabase().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    router.replace('/queue');
    router.refresh();
  }

  async function onSignUp(email: string, password: string) {
    const { data, error } = await createBrowserSupabase().auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (data.session) {
      router.replace('/onboarding');
      router.refresh();
      return { needsConfirmation: false };
    }
    return { needsConfirmation: true };
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">JobLume</h1>
        <p className="text-sm text-muted-foreground">AI-tailored applications that you approve before anything is sent.</p>
      </div>
      <AuthForm onSignIn={onSignIn} onSignUp={onSignUp} />
    </main>
  );
}
```

- [ ] **Step 5: Implement the shell and the app layout**

`web/src/components/layout/NavLinks.tsx`:
```tsx
'use client';

import { BarChart3, Inbox, KanbanSquare, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/queue', label: 'Queue', icon: Inbox },
  { href: '/tracker', label: 'Tracker', icon: KanbanSquare },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      <ul className="space-y-1">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

`web/src/components/layout/AppShell.tsx`:
```tsx
'use client';

import { Menu, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { NavLinks } from './NavLinks';

export function AppShell({ email, onSignOut, children }: { email: string | null; onSignOut(): void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-border p-4 md:block">
        <p className="mb-6 px-3 text-lg font-semibold">JobLume</p>
        <NavLinks />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <span className="hidden md:block" />
          <div className="flex items-center gap-3">
            {email && <span className="max-w-[160px] truncate text-sm text-muted-foreground">{email}</span>}
            <Button variant="outline" size="sm" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        </header>
        {open && (
          <div id="mobile-nav" className="border-b border-border p-4 md:hidden">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        )}
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
```

`web/src/app/(app)/layout.tsx`:
```tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { AppShell } from '@/components/layout/AppShell';
import { useProfile } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { needsOnboarding } from '@/lib/onboarding';
import { createBrowserSupabase } from '@/lib/supabase/client';

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const profile = useProfile();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    void createBrowserSupabase().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const mustOnboard = profile.data ? needsOnboarding(profile.data) && pathname !== '/onboarding' : false;

  useEffect(() => {
    if (mustOnboard) router.replace('/onboarding');
  }, [mustOnboard, router]);

  async function signOut() {
    await createBrowserSupabase().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  let body: ReactNode = children;
  if (profile.isLoading || mustOnboard) body = <PageSkeleton />;
  else if (profile.error) body = <ErrorState message={describeApiError(profile.error)} onRetry={() => void profile.refetch()} />;

  return (
    <AppShell email={email} onSignOut={() => void signOut()}>
      {body}
    </AppShell>
  );
}
```

- [ ] **Step 6: Verify**

Run: `npm test -w web && npm run typecheck -w web && npm run build -w web`
Expected: all tests PASS (safe-link 7, auth-form 5, nav-links 3, app-shell 2, onboarding 3, plus earlier ones); typecheck exits 0; `next build` succeeds and lists `/login`. If `next/link` fails to render in tests with a router-context error, mock it in the affected test files with `vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))` and report it.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(web): add sign-in page, app shell with navigation and onboarding gate

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Web: CV upload and profile/settings forms

**Files:**
- Create: `web/src/lib/profile-form.ts`
- Create: `web/src/components/cv/CvUpload.tsx`, `web/src/components/profile/ProfileForm.tsx`, `web/src/components/profile/SettingsForm.tsx`
- Test: `web/tests/lib/profile-form.test.ts`, `web/tests/components/cv-upload.test.tsx`, `profile-form.test.tsx`, `settings-form.test.tsx`

**Interfaces:**
- Consumes: `profilePatchSchema`, `ProfilePatch`, `Profile`, `LOCATIONS` from `@joblume/shared`; `describeApiError`.
- Produces (`@/lib/profile-form`):
  - `interface ProfileFormValues { desiredRoles: string; skills: string; location: '' | 'Lagos' | 'Abuja' | 'Remote'; yearsExperience: string; salaryMin: string; salaryMax: string }`
  - `type ProfileField = keyof ProfileFormValues`
  - `interface SettingsValues { applyMode: 'manual' | 'auto'; autoThreshold: string; dailyCap: string; autoFollowup: boolean }`
  - `type SettingsField = keyof SettingsValues`
  - `type BuildResult<K extends string> = { ok: true; patch: ProfilePatch } | { ok: false; errors: Partial<Record<K, string>> }`
  - `parseList(raw: string): string[]`
  - `buildProfilePatch(values: ProfileFormValues, opts?: { requireRoles?: boolean }): BuildResult<ProfileField>`
  - `buildSettingsPatch(values: SettingsValues): BuildResult<SettingsField>`
  - `profileToFormValues(profile: Profile): ProfileFormValues`, `profileToSettingsValues(profile: Profile): SettingsValues`
- Produces (components): `validateCvFile(file: { name: string; size: number }): string | null`, `MAX_CV_BYTES`, `CvUpload({ onUpload, currentName? })`, `ProfileForm({ initial, onSubmit, submitLabel, requireRoles? })`, `SettingsForm({ initial, onSubmit })`.

- [ ] **Step 1: Write the failing tests**

`web/tests/lib/profile-form.test.ts`:
```ts
import type { Profile } from '@joblume/shared';
import { describe, expect, it } from 'vitest';
import {
  buildProfilePatch, buildSettingsPatch, parseList, profileToFormValues, profileToSettingsValues,
  type ProfileFormValues, type SettingsValues,
} from '@/lib/profile-form';

const values = (over: Partial<ProfileFormValues> = {}): ProfileFormValues => ({
  desiredRoles: 'Data Analyst, BI Analyst', skills: 'SQL, Excel', location: 'Lagos',
  yearsExperience: '3', salaryMin: '200000', salaryMax: '400000', ...over,
});
const settings = (over: Partial<SettingsValues> = {}): SettingsValues => ({
  applyMode: 'manual', autoThreshold: '80', dailyCap: '20', autoFollowup: false, ...over,
});

describe('parseList', () => {
  it('splits on commas and newlines, trims, drops blanks and removes duplicates', () => {
    expect(parseList(' SQL, Excel\nSQL ,, Python ')).toEqual(['SQL', 'Excel', 'Python']);
    expect(parseList('   ')).toEqual([]);
  });
});

describe('buildProfilePatch', () => {
  it('builds a patch from valid values', () => {
    expect(buildProfilePatch(values())).toEqual({
      ok: true,
      patch: {
        desired_roles: ['Data Analyst', 'BI Analyst'], skills: ['SQL', 'Excel'], location: 'Lagos',
        years_experience: 3, salary_min: 200000, salary_max: 400000,
      },
    });
  });

  it('turns an empty location and empty numbers into null', () => {
    const r = buildProfilePatch(values({ location: '', yearsExperience: '', salaryMin: '', salaryMax: '' }));
    expect(r).toMatchObject({ ok: true, patch: { location: null, years_experience: null, salary_min: null, salary_max: null } });
  });

  it('requires at least one role only when asked to', () => {
    const empty = values({ desiredRoles: ' ' });
    expect(buildProfilePatch(empty, { requireRoles: true })).toEqual({
      ok: false, errors: { desiredRoles: 'Add at least one role you are looking for.' },
    });
    expect(buildProfilePatch(empty)).toMatchObject({ ok: true, patch: { desired_roles: [] } });
  });

  it('rejects non-numeric and out-of-range numbers with clear messages', () => {
    expect(buildProfilePatch(values({ yearsExperience: 'abc' }))).toEqual({ ok: false, errors: { yearsExperience: 'Enter a whole number.' } });
    expect(buildProfilePatch(values({ yearsExperience: '61' }))).toEqual({ ok: false, errors: { yearsExperience: 'Enter a number between 0 and 60.' } });
  });

  it('rejects a minimum salary above the maximum', () => {
    expect(buildProfilePatch(values({ salaryMin: '500000', salaryMax: '100000' }))).toEqual({
      ok: false, errors: { salaryMin: 'Minimum salary cannot be higher than maximum salary.' },
    });
  });

  it('rejects one-character roles', () => {
    expect(buildProfilePatch(values({ desiredRoles: 'x' }))).toEqual({
      ok: false, errors: { desiredRoles: 'Each role needs at least 2 characters.' },
    });
  });
});

describe('buildSettingsPatch', () => {
  it('builds a patch from valid values', () => {
    expect(buildSettingsPatch(settings({ applyMode: 'auto', autoThreshold: '85', dailyCap: '10', autoFollowup: true }))).toEqual({
      ok: true,
      patch: { apply_mode: 'auto', auto_threshold: 85, daily_cap: 10, auto_followup: true },
    });
  });

  it.each([
    ['cap above 20', settings({ dailyCap: '21' }), { dailyCap: 'Enter a whole number between 1 and 20.' }],
    ['cap of 0', settings({ dailyCap: '0' }), { dailyCap: 'Enter a whole number between 1 and 20.' }],
    ['threshold above 100', settings({ autoThreshold: '101' }), { autoThreshold: 'Enter a whole number between 0 and 100.' }],
    ['threshold text', settings({ autoThreshold: 'x' }), { autoThreshold: 'Enter a whole number between 0 and 100.' }],
    ['empty cap', settings({ dailyCap: '' }), { dailyCap: 'Enter a whole number between 1 and 20.' }],
  ])('rejects %s', (_name, input, errors) => {
    expect(buildSettingsPatch(input)).toEqual({ ok: false, errors });
  });
});

describe('profile to form values', () => {
  const profile = {
    user_id: 'u1', base_cv_text: null, base_cv_url: null, skills: ['SQL', 'Excel'], years_experience: 3,
    desired_roles: ['Data Analyst'], location: 'Abuja', salary_min: null, salary_max: 400000, apply_mode: 'auto',
    auto_threshold: 90, daily_cap: 12, auto_followup: true, updated_at: '',
  } as Profile;

  it('maps a profile to editable strings', () => {
    expect(profileToFormValues(profile)).toEqual({
      desiredRoles: 'Data Analyst', skills: 'SQL, Excel', location: 'Abuja', yearsExperience: '3', salaryMin: '', salaryMax: '400000',
    });
    expect(profileToSettingsValues(profile)).toEqual({ applyMode: 'auto', autoThreshold: '90', dailyCap: '12', autoFollowup: true });
  });

  it('maps a blank profile to empty strings', () => {
    const blank = { ...profile, skills: [], desired_roles: [], location: null, years_experience: null, salary_max: null } as Profile;
    expect(profileToFormValues(blank)).toEqual({ desiredRoles: '', skills: '', location: '', yearsExperience: '', salaryMin: '', salaryMax: '' });
  });
});
```

`web/tests/components/cv-upload.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CvUpload, MAX_CV_BYTES, validateCvFile } from '@/components/cv/CvUpload';
import { ApiRequestError } from '@/lib/api/client';

const pdf = (name = 'cv.pdf') => new File([new Uint8Array(1000)], name, { type: 'application/pdf' });

function setup(onUpload = vi.fn().mockResolvedValue(undefined)) {
  render(<CvUpload onUpload={onUpload} />);
  // applyAccept:false so we can prove our own validation rejects wrong files
  return { onUpload, user: userEvent.setup({ applyAccept: false }), input: screen.getByLabelText('CV file') };
}

describe('validateCvFile', () => {
  it('accepts pdf and docx within the size limit, case-insensitively', () => {
    expect(validateCvFile({ name: 'cv.pdf', size: 10 })).toBeNull();
    expect(validateCvFile({ name: 'CV.DOCX', size: 10 })).toBeNull();
  });
  it('rejects other types, empty files and files over 5 MB', () => {
    expect(validateCvFile({ name: 'cv.txt', size: 10 })).toMatch(/pdf or docx/i);
    expect(validateCvFile({ name: 'cv.pdf', size: 0 })).toMatch(/empty/i);
    expect(validateCvFile({ name: 'cv.pdf', size: MAX_CV_BYTES + 1 })).toMatch(/5 mb/i);
    expect(validateCvFile({ name: 'cv.pdf', size: MAX_CV_BYTES })).toBeNull();
  });
});

describe('CvUpload', () => {
  it('uploads a valid file and confirms', async () => {
    const { onUpload, user, input } = setup();
    const file = pdf();
    await user.upload(input, file);
    expect(onUpload).toHaveBeenCalledWith(file);
    expect(await screen.findByText(/cv uploaded/i)).toBeInTheDocument();
  });

  it('rejects a wrong file type without calling onUpload', async () => {
    const { onUpload, user, input } = setup();
    await user.upload(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/pdf or docx/i);
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('rejects a file over 5 MB without calling onUpload', async () => {
    const { onUpload, user, input } = setup();
    await user.upload(input, new File([new Uint8Array(MAX_CV_BYTES + 1)], 'big.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/5 mb/i);
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('shows the plain-language server error', async () => {
    const { user, input } = setup(vi.fn().mockRejectedValue(new ApiRequestError(422, 'cv_text_too_short')));
    await user.upload(input, pdf());
    expect(await screen.findByRole('alert')).toHaveTextContent(/scanned/i);
  });

  it('shows a generic message for unknown failures', async () => {
    const { user, input } = setup(vi.fn().mockRejectedValue(new Error('boom')));
    await user.upload(input, pdf());
    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
  });

  it('shows the current CV name when given', () => {
    render(<CvUpload onUpload={vi.fn()} currentName="base-cv.pdf" />);
    expect(screen.getByText(/base-cv\.pdf/)).toBeInTheDocument();
  });
});
```

`web/tests/components/profile-form.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { ApiRequestError } from '@/lib/api/client';
import type { ProfileFormValues } from '@/lib/profile-form';

const initial: ProfileFormValues = { desiredRoles: '', skills: '', location: '', yearsExperience: '', salaryMin: '', salaryMax: '' };

function setup(props: Partial<React.ComponentProps<typeof ProfileForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<ProfileForm initial={initial} onSubmit={onSubmit} submitLabel="Save" {...props} />);
  return { onSubmit, user: userEvent.setup() };
}

describe('ProfileForm', () => {
  it('renders the initial values', () => {
    setup({ initial: { ...initial, desiredRoles: 'Data Analyst', location: 'Abuja' } });
    expect(screen.getByLabelText('Roles you want')).toHaveValue('Data Analyst');
    expect(screen.getByLabelText('Location')).toHaveValue('Abuja');
  });

  it('shows a required-roles error and does not submit', async () => {
    const { onSubmit, user } = setup({ requireRoles: true });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Add at least one role you are looking for.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the built patch', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('Roles you want'), 'Data Analyst, BI Analyst');
    await user.type(screen.getByLabelText('Skills'), 'SQL, Excel');
    await user.selectOptions(screen.getByLabelText('Location'), 'Lagos');
    await user.type(screen.getByLabelText('Years of experience'), '3');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({
      desired_roles: ['Data Analyst', 'BI Analyst'], skills: ['SQL', 'Excel'], location: 'Lagos',
      years_experience: 3, salary_min: null, salary_max: null,
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.');
  });

  it('shows a field error for a salary range that is the wrong way round', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('Minimum salary'), '500000');
    await user.type(screen.getByLabelText('Maximum salary'), '100000');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Minimum salary cannot be higher than maximum salary.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the plain-language server error', async () => {
    const { user } = setup({ onSubmit: vi.fn().mockRejectedValue(new ApiRequestError(0, 'network_error')) });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot reach the server/i);
  });
});
```

`web/tests/components/settings-form.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsForm } from '@/components/profile/SettingsForm';
import type { SettingsValues } from '@/lib/profile-form';

const initial: SettingsValues = { applyMode: 'manual', autoThreshold: '80', dailyCap: '20', autoFollowup: false };

function setup() {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<SettingsForm initial={initial} onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
}

describe('SettingsForm', () => {
  it('renders the stored settings and the Phase 3 note', () => {
    setup();
    expect(screen.getByLabelText('Manual')).toBeChecked();
    expect(screen.getByLabelText('Auto-apply threshold')).toHaveValue(80);
    expect(screen.getByLabelText('Daily application cap')).toHaveValue(20);
    expect(screen.getByText(/only saves your preference/i)).toBeInTheDocument();
  });

  it('submits changed settings', async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByLabelText('Auto'));
    await user.clear(screen.getByLabelText('Daily application cap'));
    await user.type(screen.getByLabelText('Daily application cap'), '10');
    await user.click(screen.getByLabelText('Auto follow-up'));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(onSubmit).toHaveBeenCalledWith({ apply_mode: 'auto', auto_threshold: 80, daily_cap: 10, auto_followup: true });
  });

  it('rejects a daily cap above 20', async () => {
    const { onSubmit, user } = setup();
    await user.clear(screen.getByLabelText('Daily application cap'));
    await user.type(screen.getByLabelText('Daily application cap'), '25');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Enter a whole number between 1 and 20.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -w web -- tests/lib/profile-form.test.ts tests/components/cv-upload.test.tsx tests/components/profile-form.test.tsx tests/components/settings-form.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the form logic** — `web/src/lib/profile-form.ts`

```ts
import { profilePatchSchema, type Profile, type ProfilePatch } from '@joblume/shared';

export interface ProfileFormValues {
  desiredRoles: string;
  skills: string;
  location: '' | 'Lagos' | 'Abuja' | 'Remote';
  yearsExperience: string;
  salaryMin: string;
  salaryMax: string;
}
export type ProfileField = keyof ProfileFormValues;

export interface SettingsValues {
  applyMode: 'manual' | 'auto';
  autoThreshold: string;
  dailyCap: string;
  autoFollowup: boolean;
}
export type SettingsField = keyof SettingsValues;

export type BuildResult<K extends string> = { ok: true; patch: ProfilePatch } | { ok: false; errors: Partial<Record<K, string>> };

export const parseList = (raw: string): string[] => [
  ...new Set(
    raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];

/** null for blank, NaN for non-numeric, otherwise the integer. */
function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

const PROFILE_FIELD: Record<string, ProfileField> = {
  desired_roles: 'desiredRoles',
  skills: 'skills',
  location: 'location',
  years_experience: 'yearsExperience',
  salary_min: 'salaryMin',
  salary_max: 'salaryMax',
};

export function buildProfilePatch(values: ProfileFormValues, opts: { requireRoles?: boolean } = {}): BuildResult<ProfileField> {
  const errors: Partial<Record<ProfileField, string>> = {};
  const roles = parseList(values.desiredRoles);
  if (opts.requireRoles && roles.length === 0) errors.desiredRoles = 'Add at least one role you are looking for.';

  const years = parseOptionalInt(values.yearsExperience);
  const min = parseOptionalInt(values.salaryMin);
  const max = parseOptionalInt(values.salaryMax);
  if (Number.isNaN(years)) errors.yearsExperience = 'Enter a whole number.';
  if (Number.isNaN(min)) errors.salaryMin = 'Enter a whole number.';
  if (Number.isNaN(max)) errors.salaryMax = 'Enter a whole number.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const patch = {
    desired_roles: roles,
    skills: parseList(values.skills),
    location: values.location === '' ? null : values.location,
    years_experience: years,
    salary_min: min,
    salary_max: max,
  };
  const parsed = profilePatchSchema.safeParse(patch);
  if (parsed.success) return { ok: true, patch: parsed.data };

  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0]);
    const field = PROFILE_FIELD[key];
    if (!field || errors[field]) continue;
    if (key === 'salary_min' && issue.message.includes('must not exceed')) {
      errors[field] = 'Minimum salary cannot be higher than maximum salary.';
    } else if (key === 'years_experience') {
      errors[field] = 'Enter a number between 0 and 60.';
    } else if (key === 'desired_roles') {
      errors[field] = 'Each role needs at least 2 characters.';
    } else {
      errors[field] = issue.message;
    }
  }
  if (Object.keys(errors).length === 0) errors.desiredRoles = parsed.error.issues[0]?.message ?? 'Check the form and try again.';
  return { ok: false, errors };
}

export function buildSettingsPatch(values: SettingsValues): BuildResult<SettingsField> {
  const errors: Partial<Record<SettingsField, string>> = {};
  const threshold = parseOptionalInt(values.autoThreshold);
  const cap = parseOptionalInt(values.dailyCap);
  if (threshold === null || Number.isNaN(threshold) || threshold > 100) {
    errors.autoThreshold = 'Enter a whole number between 0 and 100.';
  }
  if (cap === null || Number.isNaN(cap) || cap < 1 || cap > 20) {
    errors.dailyCap = 'Enter a whole number between 1 and 20.';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const parsed = profilePatchSchema.safeParse({
    apply_mode: values.applyMode,
    auto_threshold: threshold,
    daily_cap: cap,
    auto_followup: values.autoFollowup,
  });
  if (parsed.success) return { ok: true, patch: parsed.data };
  return { ok: false, errors: { autoThreshold: 'Check the settings and try again.' } };
}

export function profileToFormValues(profile: Profile): ProfileFormValues {
  return {
    desiredRoles: profile.desired_roles.join(', '),
    skills: profile.skills.join(', '),
    location: profile.location ?? '',
    yearsExperience: profile.years_experience === null ? '' : String(profile.years_experience),
    salaryMin: profile.salary_min === null ? '' : String(profile.salary_min),
    salaryMax: profile.salary_max === null ? '' : String(profile.salary_max),
  };
}

export function profileToSettingsValues(profile: Profile): SettingsValues {
  return {
    applyMode: profile.apply_mode,
    autoThreshold: String(profile.auto_threshold),
    dailyCap: String(profile.daily_cap),
    autoFollowup: profile.auto_followup,
  };
}
```

- [ ] **Step 4: Implement the components**

`web/src/components/cv/CvUpload.tsx`:
```tsx
'use client';

import { useRef, useState } from 'react';
import { describeApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';

export const MAX_CV_BYTES = 5 * 1024 * 1024;

export function validateCvFile(file: { name: string; size: number }): string | null {
  if (!/\.(pdf|docx)$/i.test(file.name)) return 'Upload a PDF or DOCX file.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_CV_BYTES) return 'That file is larger than 5 MB.';
  return null;
}

export interface CvUploadProps {
  onUpload(file: File): Promise<void>;
  currentName?: string | null;
}

export function CvUpload({ onUpload, currentName }: CvUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const problem = validateCvFile(file);
    if (problem) {
      setError(problem);
      setStatus('idle');
      return;
    }
    setError(null);
    setStatus('uploading');
    try {
      await onUpload(file);
      setStatus('done');
    } catch (err) {
      setError(describeApiError(err));
      setStatus('idle');
    }
  }

  return (
    <div className="space-y-3">
      <label
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-8 text-center text-sm transition-colors hover:bg-accent/50',
          dragging && 'border-primary bg-accent/50',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFile(e.dataTransfer.files[0]);
        }}
      >
        <span className="font-medium">{status === 'uploading' ? 'Uploading…' : 'Drop your CV here or click to choose'}</span>
        <span className="text-muted-foreground">PDF or DOCX, up to 5 MB, with selectable text</span>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          aria-label="CV file"
          className="sr-only"
          disabled={status === 'uploading'}
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      {currentName && <p className="text-sm text-muted-foreground">Current CV: {currentName}</p>}
      {status === 'done' && (
        <p role="status" className="text-sm text-emerald-400">
          CV uploaded.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
```

`web/src/components/profile/ProfileForm.tsx`:
```tsx
'use client';

import type { ProfilePatch } from '@joblume/shared';
import { LOCATIONS } from '@joblume/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeApiError } from '@/lib/api/errors';
import { buildProfilePatch, type ProfileField, type ProfileFormValues } from '@/lib/profile-form';

export interface ProfileFormProps {
  initial: ProfileFormValues;
  onSubmit(patch: ProfilePatch): Promise<void>;
  submitLabel: string;
  requireRoles?: boolean;
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

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
  const invalid = (f: ProfileField) => (errors[f] ? true : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
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
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field id="desiredRoles" label="Roles you want" hint="Separate roles with commas, for example Data Analyst, BI Analyst. Every word of a role must appear in a job title to match." error={errors.desiredRoles}>
        <Input id="desiredRoles" value={values.desiredRoles} onChange={(e) => set('desiredRoles', e.target.value)} aria-invalid={invalid('desiredRoles')} aria-describedby={errors.desiredRoles ? 'desiredRoles-error' : undefined} />
      </Field>
      <Field id="skills" label="Skills" hint="Separate skills with commas." error={errors.skills}>
        <Input id="skills" value={values.skills} onChange={(e) => set('skills', e.target.value)} aria-invalid={invalid('skills')} />
      </Field>
      <Field id="location" label="Location" error={errors.location}>
        <select
          id="location"
          value={values.location}
          onChange={(e) => set('location', e.target.value as ProfileFormValues['location'])}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Any location</option>
          {LOCATIONS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field id="yearsExperience" label="Years of experience" error={errors.yearsExperience}>
        <Input id="yearsExperience" inputMode="numeric" value={values.yearsExperience} onChange={(e) => set('yearsExperience', e.target.value)} aria-invalid={invalid('yearsExperience')} aria-describedby={errors.yearsExperience ? 'yearsExperience-error' : undefined} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="salaryMin" label="Minimum salary" error={errors.salaryMin}>
          <Input id="salaryMin" inputMode="numeric" value={values.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} aria-invalid={invalid('salaryMin')} aria-describedby={errors.salaryMin ? 'salaryMin-error' : undefined} />
        </Field>
        <Field id="salaryMax" label="Maximum salary" error={errors.salaryMax}>
          <Input id="salaryMax" inputMode="numeric" value={values.salaryMax} onChange={(e) => set('salaryMax', e.target.value)} aria-invalid={invalid('salaryMax')} aria-describedby={errors.salaryMax ? 'salaryMax-error' : undefined} />
        </Field>
      </div>
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-emerald-400">
          Saved.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
```

`web/src/components/profile/SettingsForm.tsx`:
```tsx
'use client';

import type { ProfilePatch } from '@joblume/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeApiError } from '@/lib/api/errors';
import { buildSettingsPatch, type SettingsField, type SettingsValues } from '@/lib/profile-form';

export interface SettingsFormProps {
  initial: SettingsValues;
  onSubmit(patch: ProfilePatch): Promise<void>;
}

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

  async function submit(e: FormEvent) {
    e.preventDefault();
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
    <form onSubmit={submit} noValidate className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Apply mode</legend>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="applyMode" checked={values.applyMode === 'manual'} onChange={() => set('applyMode', 'manual')} />
            Manual
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="applyMode" checked={values.applyMode === 'auto'} onChange={() => set('applyMode', 'auto')} />
            Auto
          </label>
        </div>
        <p className="text-xs text-muted-foreground">Auto mode only saves your preference for now. Sending arrives in a later update, and nothing is applied without your action today.</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="autoThreshold">Auto-apply threshold</Label>
          <Input id="autoThreshold" type="number" value={values.autoThreshold} onChange={(e) => set('autoThreshold', e.target.value)} aria-invalid={errors.autoThreshold ? true : undefined} />
          {errors.autoThreshold && <p className="text-sm text-destructive">{errors.autoThreshold}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="dailyCap">Daily application cap</Label>
          <Input id="dailyCap" type="number" value={values.dailyCap} onChange={(e) => set('dailyCap', e.target.value)} aria-invalid={errors.dailyCap ? true : undefined} />
          {errors.dailyCap && <p className="text-sm text-destructive">{errors.dailyCap}</p>}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={values.autoFollowup} onChange={(e) => set('autoFollowup', e.target.checked)} />
        Auto follow-up
      </label>

      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-emerald-400">
          Saved.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm test -w web && npm run typecheck -w web && npm run build -w web`
Expected: all tests PASS (profile-form logic about 19, cv-upload 8, profile-form component 5, settings-form 3, plus earlier ones), typecheck exits 0, build succeeds. If `getByLabelText('Auto')` is ambiguous with another label, fix the component text rather than the test.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): add CV upload and profile/settings forms with shared validation

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Web: onboarding and settings pages

**Files:**
- Create: `web/src/app/(app)/onboarding/page.tsx`, `web/src/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `useProfile`, `useUpdateProfile`, `useUploadCv` from `@/hooks/api`; `CvUpload`, `ProfileForm`, `SettingsForm`; `profileToFormValues`, `profileToSettingsValues`; `initialStep`; UI primitives.
- Produces: the `/onboarding` and `/settings` routes.

These pages only wire tested pieces together, so they have no new unit tests; they are covered by `typecheck`, `build` and the manual checklist in Task 13.

- [ ] **Step 1: Write the onboarding page** — `web/src/app/(app)/onboarding/page.tsx`

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CvUpload } from '@/components/cv/CvUpload';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useProfile, useUpdateProfile, useUploadCv } from '@/hooks/api';
import { initialStep } from '@/lib/onboarding';
import { profileToFormValues } from '@/lib/profile-form';

const STEPS = ['Upload your CV', 'Tell us what you want', 'All set'] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const profile = useProfile();
  const uploadCv = useUploadCv();
  const updateProfile = useUpdateProfile();
  const [step, setStep] = useState<1 | 2 | 3 | null>(null);

  useEffect(() => {
    if (profile.data && step === null) setStep(initialStep(profile.data));
  }, [profile.data, step]);

  if (!profile.data || step === null) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ol className="flex gap-2 text-xs text-muted-foreground" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={step === i + 1 ? 'step' : undefined} className={step === i + 1 ? 'font-semibold text-foreground' : undefined}>
            {i + 1}. {label}
            {i < STEPS.length - 1 ? ' ›' : ''}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload your CV</CardTitle>
            <CardDescription>We tailor a copy of this CV for each job. We never invent experience you do not have.</CardDescription>
          </CardHeader>
          <CardContent>
            <CvUpload
              onUpload={async (file) => {
                await uploadCv.mutateAsync(file);
                setStep(2);
              }}
            />
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>What are you looking for?</CardTitle>
            <CardDescription>We only prepare applications for jobs that match these roles and your location.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              initial={profileToFormValues(profile.data)}
              requireRoles
              submitLabel="Save and continue"
              onSubmit={async (patch) => {
                await updateProfile.mutateAsync(patch);
                setStep(3);
              }}
            />
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>You are ready</CardTitle>
            <CardDescription>
              We are matching your profile against current jobs. The first prepared applications usually appear within a few minutes. Nothing is ever sent without your approval.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/queue')}>Go to my queue</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the settings page** — `web/src/app/(app)/settings/page.tsx`

```tsx
'use client';

import { CvUpload } from '@/components/cv/CvUpload';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { SettingsForm } from '@/components/profile/SettingsForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useProfile, useUpdateProfile, useUploadCv } from '@/hooks/api';
import { profileToFormValues, profileToSettingsValues } from '@/lib/profile-form';

const fileName = (path: string | null) => (path ? (path.split('/').pop() ?? path) : null);

export default function SettingsPage() {
  const profile = useProfile();
  const uploadCv = useUploadCv();
  const updateProfile = useUpdateProfile();

  if (!profile.data) return <PageSkeleton />;
  const data = profile.data;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Your CV</CardTitle>
          <CardDescription>Replacing it finds matches for your latest CV. Applications already prepared keep the CV they were tailored from.</CardDescription>
        </CardHeader>
        <CardContent>
          <CvUpload currentName={fileName(data.base_cv_url)} onUpload={async (file) => { await uploadCv.mutateAsync(file); }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job preferences</CardTitle>
          <CardDescription>Roles, location, skills and salary range.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initial={profileToFormValues(data)}
            submitLabel="Save preferences"
            onSubmit={async (patch) => { await updateProfile.mutateAsync(patch); }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Applying</CardTitle>
          <CardDescription>How applications are handled and how often.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            initial={profileToSettingsValues(data)}
            onSubmit={async (patch) => { await updateProfile.mutateAsync(patch); }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck -w web && npm test -w web && npm run build -w web`
Expected: typecheck exits 0, all tests still pass, `next build` lists `/onboarding` and `/settings` among the routes.

- [ ] **Step 4: Commit**

```bash
git add web
git commit -m "feat(web): add onboarding flow and settings page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 10: Web: review queue with detail editor and assisted apply

**Files:**
- Create: `web/src/lib/format.ts`
- Create: `web/src/components/applications/ScoreRing.tsx`, `ApplicationCard.tsx`, `AssistedApplyPanel.tsx`, `ApplicationDetail.tsx`
- Create: `web/src/app/(app)/queue/page.tsx`
- Test: `web/tests/lib/format.test.ts`, `web/tests/components/application-card.test.tsx`, `web/tests/components/assisted-apply-panel.test.tsx`

**Interfaces:**
- Consumes: `Application`, `ApplicationDetail` (type), `ApplicationStatus` from `@joblume/shared`; hooks `useApplications`, `useApplication`, `useUpdateApplicationText`, `useSetStatus`, `useRefreshJobs`; `splitQueue`, `previewText`, `scoreTone`, `buildTextPatch`, `QueueTab`; `SafeLink`, `ErrorState`, `EmptyState`, `PageSkeleton`; `describeApiError`; UI primitives.
- Produces:
  - `@/lib/format`: `sourceLabel(source: string): string`, `formatShortDate(iso: string | null): string` (UTC, `20 Oct` style), `COLUMN_LABELS: Record<KanbanColumn, string>`
  - `ScoreRing({ score, size? })` (role `img`, aria-label `Match score 82 out of 100` or `No match score`)
  - `ApplicationCard({ app, onOpen })`
  - `AssistedApplyPanel({ app: ApplicationDetail, onMarkApplied, pending? })`
  - `ApplicationDetail({ id: string | null, onClose })` (right-hand sheet; the shared detail view for queue and tracker)

- [ ] **Step 1: Write the failing tests**

`web/tests/lib/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { COLUMN_LABELS, formatShortDate, sourceLabel } from '@/lib/format';

describe('sourceLabel', () => {
  it('names the known sources and falls back to the raw value', () => {
    expect(sourceLabel('remotive')).toBe('Remotive');
    expect(sourceLabel('myjobmag')).toBe('MyJobMag');
    expect(sourceLabel('jobberman')).toBe('Jobberman');
    expect(sourceLabel('linkedin')).toBe('LinkedIn');
    expect(sourceLabel('indeed')).toBe('Indeed');
    expect(sourceLabel('somewhere')).toBe('somewhere');
  });
});

describe('formatShortDate', () => {
  it('formats a UTC date as day and short month', () => {
    expect(formatShortDate('2026-10-20T10:00:00.000Z')).toBe('20 Oct');
  });
  it('returns an empty string for null or an invalid date', () => {
    expect(formatShortDate(null)).toBe('');
    expect(formatShortDate('not a date')).toBe('');
  });
});

describe('COLUMN_LABELS', () => {
  it('labels the five board columns in the spec wording', () => {
    expect(COLUMN_LABELS).toEqual({
      pending_review: 'Pending Review', applied: 'Applied', interviewing: 'Interviewing', rejected: 'Rejected', offer: 'Offer',
    });
  });
});
```

`web/tests/components/application-card.test.tsx`:
```tsx
import type { Application } from '@joblume/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationCard } from '@/components/applications/ApplicationCard';

const app = (over: Partial<Application> = {}): Application => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'Experienced analyst. '.repeat(30), tailored_cv_url: null,
  cover_letter_text: 'Dear hiring team, I would like to join. '.repeat(20), match_score: 82,
  missing_keywords: ['Docker', 'Kubernetes'], hiring_manager_email: null, email_confidence: null, apply_method: null,
  status: 'pending_review', applied_at: null, follow_up_at: null, created_at: '2026-10-01T00:00:00.000Z',
  job: { title: 'Data Analyst', company: 'Acme Ltd', location: 'Lagos', source: 'myjobmag', url: 'https://example.com/job/1', company_domain: null },
  ...over,
});

describe('ApplicationCard', () => {
  it('shows the role, company, location, source and score', () => {
    render(<ApplicationCard app={app()} onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Data Analyst' })).toBeInTheDocument();
    expect(screen.getByText(/Acme Ltd/)).toBeInTheDocument();
    expect(screen.getByText(/Lagos/)).toBeInTheDocument();
    expect(screen.getByText('MyJobMag')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Match score 82 out of 100' })).toBeInTheDocument();
  });

  it('links to the posting only for http(s) URLs, with safe link attributes', () => {
    const { unmount } = render(<ApplicationCard app={app()} onOpen={() => {}} />);
    const link = screen.getByRole('link', { name: 'View posting' });
    expect(link).toHaveAttribute('href', 'https://example.com/job/1');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    unmount();

    render(<ApplicationCard app={app({ job: { title: 'X', company: 'Y', location: '', source: 'remotive', url: 'javascript:alert(1)', company_domain: null } })} onOpen={() => {}} />);
    expect(screen.queryByRole('link', { name: 'View posting' })).toBeNull();
  });

  it('shows at most five missing keywords and a +N more badge', () => {
    render(<ApplicationCard app={app({ missing_keywords: ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7'] })} onOpen={() => {}} />);
    const group = screen.getByLabelText('Missing keywords');
    expect(group).toHaveTextContent('a1');
    expect(group).toHaveTextContent('e5');
    expect(group).not.toHaveTextContent('f6');
    expect(group).toHaveTextContent('+2 more');
  });

  it('truncates the previews', () => {
    render(<ApplicationCard app={app()} onOpen={() => {}} />);
    const previews = screen.getAllByText(/…$/);
    expect(previews.length).toBe(2);
    for (const p of previews) expect(p.textContent!.length).toBeLessThanOrEqual(181);
  });

  it('marks an approved application as ready to apply', () => {
    render(<ApplicationCard app={app({ status: 'approved' })} onOpen={() => {}} />);
    expect(screen.getByText('Ready to apply')).toBeInTheDocument();
  });

  it('opens the detail from the title and from the Review button', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<ApplicationCard app={app()} onOpen={onOpen} />);
    await user.click(screen.getByRole('button', { name: 'Data Analyst' }));
    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(onOpen).toHaveBeenNthCalledWith(1, 'a1');
    expect(onOpen).toHaveBeenNthCalledWith(2, 'a1');
  });

  it('copes with a missing job and no score', () => {
    render(<ApplicationCard app={app({ job: null, match_score: null })} onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Untitled role' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'No match score' })).toBeInTheDocument();
  });
});
```

`web/tests/components/assisted-apply-panel.test.tsx`:
```tsx
import type { ApplicationDetail } from '@joblume/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistedApplyPanel } from '@/components/applications/AssistedApplyPanel';

const detail = (over: Partial<ApplicationDetail> = {}): ApplicationDetail => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'cv', tailored_cv_url: 'u1/tailored/j1.pdf',
  cover_letter_text: 'Dear team, hello.', match_score: 80, missing_keywords: [], hiring_manager_email: null,
  email_confidence: null, apply_method: null, status: 'approved', applied_at: null, follow_up_at: null,
  created_at: '2026-10-01T00:00:00.000Z', cv_pdf_url: 'https://files.example.com/cv.pdf',
  job: { title: 'Data Analyst', company: 'Acme', location: 'Lagos', source: 'myjobmag', url: 'https://example.com/job/1', company_domain: null },
  ...over,
});

function mockClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('AssistedApplyPanel', () => {
  it('offers the job link and the CV download with safe link attributes', () => {
    render(<AssistedApplyPanel app={detail()} onMarkApplied={() => {}} />);
    const job = screen.getByRole('link', { name: 'Open job link' });
    expect(job).toHaveAttribute('href', 'https://example.com/job/1');
    expect(job).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Download CV PDF' })).toHaveAttribute('href', 'https://files.example.com/cv.pdf');
  });

  it('hides unsafe or missing links and explains why', () => {
    render(<AssistedApplyPanel app={detail({ cv_pdf_url: null, job: { title: 'T', company: 'C', location: '', source: 'x', url: 'javascript:alert(1)', company_domain: null } })} onMarkApplied={() => {}} />);
    expect(screen.queryByRole('link', { name: 'Open job link' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Download CV PDF' })).toBeNull();
    expect(screen.getByText(/no valid link/i)).toBeInTheDocument();
  });

  it('copies the cover letter text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    render(<AssistedApplyPanel app={detail()} onMarkApplied={() => {}} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Copy cover letter' }));
    expect(writeText).toHaveBeenCalledWith('Dear team, hello.');
    expect(await screen.findByText('Copied.')).toBeInTheDocument();
  });

  it('tells the user when copying is not possible', async () => {
    mockClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    render(<AssistedApplyPanel app={detail()} onMarkApplied={() => {}} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Copy cover letter' }));
    expect(await screen.findByText(/could not copy/i)).toBeInTheDocument();
  });

  it('marks the application as applied', async () => {
    const onMarkApplied = vi.fn();
    render(<AssistedApplyPanel app={detail()} onMarkApplied={onMarkApplied} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mark as applied' }));
    expect(onMarkApplied).toHaveBeenCalledTimes(1);
  });

  it('disables Mark as applied while a change is pending', () => {
    render(<AssistedApplyPanel app={detail()} onMarkApplied={() => {}} pending />);
    expect(screen.getByRole('button', { name: 'Mark as applied' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -w web -- tests/lib/format.test.ts tests/components/application-card.test.tsx tests/components/assisted-apply-panel.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement format helpers** — `web/src/lib/format.ts`

```ts
import type { KanbanColumn } from '@joblume/shared';

const SOURCES: Record<string, string> = {
  remotive: 'Remotive',
  myjobmag: 'MyJobMag',
  jobberman: 'Jobberman',
  linkedin: 'LinkedIn',
  indeed: 'Indeed',
};

export const sourceLabel = (source: string): string => SOURCES[source] ?? source;

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function formatShortDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : shortDate.format(date);
}

export const COLUMN_LABELS: Record<KanbanColumn, string> = {
  pending_review: 'Pending Review',
  applied: 'Applied',
  interviewing: 'Interviewing',
  rejected: 'Rejected',
  offer: 'Offer',
};
```

- [ ] **Step 4: Implement the card pieces**

`web/src/components/applications/ScoreRing.tsx`:
```tsx
import { scoreTone } from '@/lib/applications';
import { cn } from '@/lib/utils';

const TONE_CLASS = {
  high: 'text-emerald-400',
  mid: 'text-amber-400',
  low: 'text-rose-400',
  none: 'text-muted-foreground',
} as const;

export function ScoreRing({ score, size = 44 }: { score: number | null; size?: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const percent = score === null ? 0 : Math.max(0, Math.min(100, score));
  return (
    <div
      role="img"
      aria-label={score === null ? 'No match score' : `Match score ${score} out of 100`}
      className={cn('relative inline-flex shrink-0 items-center justify-center', TONE_CLASS[scoreTone(score)])}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4" />
        <circle
          cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)}
        />
      </svg>
      <span className="relative text-xs font-semibold">{score ?? '–'}</span>
    </div>
  );
}
```

`web/src/components/applications/ApplicationCard.tsx`:
```tsx
import type { Application } from '@joblume/shared';
import { SafeLink } from '@/components/common/SafeLink';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { previewText } from '@/lib/applications';
import { sourceLabel } from '@/lib/format';
import { ScoreRing } from './ScoreRing';

const MAX_KEYWORDS = 5;

export function ApplicationCard({ app, onOpen }: { app: Application; onOpen(id: string): void }) {
  const title = app.job?.title ?? 'Untitled role';
  const keywords = app.missing_keywords.slice(0, MAX_KEYWORDS);
  const extra = app.missing_keywords.length - keywords.length;

  return (
    <Card className="transition-colors hover:border-primary/50">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(app.id)}
              className="text-left font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {title}
            </button>
            <p className="text-sm text-muted-foreground">
              {app.job?.company ?? 'Unknown company'}
              {app.job?.location ? ` · ${app.job.location}` : ''}
            </p>
          </div>
          <ScoreRing score={app.match_score} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {app.job && <Badge variant="outline">{sourceLabel(app.job.source)}</Badge>}
          {app.status === 'approved' && <Badge variant="success">Ready to apply</Badge>}
          <SafeLink href={app.job?.url} className="text-xs text-primary hover:underline">
            View posting
          </SafeLink>
        </div>

        {keywords.length > 0 && (
          <div aria-label="Missing keywords" className="flex flex-wrap gap-1">
            {keywords.map((k) => (
              <Badge key={k} variant="warning">
                {k}
              </Badge>
            ))}
            {extra > 0 && <Badge variant="secondary">+{extra} more</Badge>}
          </div>
        )}

        <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <p className="mb-1 font-medium text-foreground">CV preview</p>
            <p>{previewText(app.tailored_cv_text, 180)}</p>
          </div>
          <div>
            <p className="mb-1 font-medium text-foreground">Cover letter</p>
            <p>{previewText(app.cover_letter_text, 180)}</p>
          </div>
        </div>

        <Button size="sm" variant="outline" onClick={() => onOpen(app.id)}>
          Review
        </Button>
      </CardContent>
    </Card>
  );
}
```

`web/src/components/applications/AssistedApplyPanel.tsx`:
```tsx
'use client';

import { safeHttpUrl, type ApplicationDetail } from '@joblume/shared';
import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface AssistedApplyPanelProps {
  app: ApplicationDetail;
  onMarkApplied(): void;
  pending?: boolean;
}

export function AssistedApplyPanel({ app, onMarkApplied, pending = false }: AssistedApplyPanelProps) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const jobUrl = safeHttpUrl(app.job?.url);
  const pdfUrl = safeHttpUrl(app.cv_pdf_url);
  const linkClass = cn(buttonVariants({ variant: 'outline', size: 'sm' }));

  async function copyLetter() {
    try {
      await navigator.clipboard.writeText(app.cover_letter_text ?? '');
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  return (
    <section aria-label="Apply" className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
      <h3 className="font-semibold">Apply on the employer's site</h3>
      <p className="text-sm text-muted-foreground">Nothing is sent for you. Open the job, upload your tailored CV, paste the cover letter, then mark it as applied here.</p>
      <ol className="space-y-3 text-sm">
        <li className="flex flex-wrap items-center gap-3">
          <span className="w-5 text-muted-foreground">1.</span>
          {jobUrl ? (
            <a href={jobUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Open job link
            </a>
          ) : (
            <span className="text-muted-foreground">This job has no valid link.</span>
          )}
        </li>
        <li className="flex flex-wrap items-center gap-3">
          <span className="w-5 text-muted-foreground">2.</span>
          {pdfUrl ? (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Download CV PDF
            </a>
          ) : (
            <span className="text-muted-foreground">The tailored CV PDF is not available yet.</span>
          )}
        </li>
        <li className="flex flex-wrap items-center gap-3">
          <span className="w-5 text-muted-foreground">3.</span>
          <Button variant="outline" size="sm" onClick={() => void copyLetter()}>
            Copy cover letter
          </Button>
          {copy === 'copied' && <span role="status" className="text-emerald-400">Copied.</span>}
          {copy === 'failed' && <span role="alert" className="text-destructive">Could not copy. Select the text in the editor below and copy it yourself.</span>}
        </li>
        <li className="flex flex-wrap items-center gap-3">
          <span className="w-5 text-muted-foreground">4.</span>
          <Button size="sm" onClick={onMarkApplied} disabled={pending}>
            Mark as applied
          </Button>
        </li>
      </ol>
    </section>
  );
}
```

- [ ] **Step 5: Implement the detail sheet** — `web/src/components/applications/ApplicationDetail.tsx`

```tsx
'use client';

import type { ApplicationStatus } from '@joblume/shared';
import { useEffect, useState } from 'react';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { SafeLink } from '@/components/common/SafeLink';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useApplication, useSetStatus, useUpdateApplicationText } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { buildTextPatch } from '@/lib/applications';
import { COLUMN_LABELS, sourceLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AssistedApplyPanel } from './AssistedApplyPanel';
import { ScoreRing } from './ScoreRing';

const APPLIED_FAMILY: ApplicationStatus[] = ['applied', 'interviewing', 'rejected', 'offer'];
const MOVE_OPTIONS = ['pending_review', 'applied', 'interviewing', 'rejected', 'offer'] as const;

export function ApplicationDetail({ id, onClose }: { id: string | null; onClose(): void }) {
  const detail = useApplication(id);
  const updateText = useUpdateApplicationText();
  const setStatus = useSetStatus();
  const data = detail.data;

  const [cv, setCv] = useState('');
  const [letter, setLetter] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    setCv(data?.tailored_cv_text ?? '');
    setLetter(data?.cover_letter_text ?? '');
    setPanelOpen(false);
  }, [data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const text = data ? buildTextPatch({ cv: data.tailored_cv_text, letter: data.cover_letter_text }, { cv, letter }) : null;
  const mutationError = updateText.error ?? setStatus.error;
  const move = (status: ApplicationStatus) => {
    if (id) setStatus.mutate({ id, status });
  };
  const showPanel = data !== undefined && (data.status === 'approved' || panelOpen);

  return (
    <Dialog open={id !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{data?.job?.title ?? 'Application'}</DialogTitle>
          <DialogDescription>
            {data?.job ? `${data.job.company}${data.job.location ? ` · ${data.job.location}` : ''}` : 'Loading application'}
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading && <PageSkeleton />}
        {detail.error && <ErrorState message={describeApiError(detail.error)} onRetry={() => void detail.refetch()} />}

        {data && text && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <ScoreRing score={data.match_score} />
              {data.job && <Badge variant="outline">{sourceLabel(data.job.source)}</Badge>}
              <Badge variant="secondary">{data.status === 'approved' ? 'Ready to apply' : data.status.replace('_', ' ')}</Badge>
              <SafeLink href={data.job?.url} className="text-sm text-primary hover:underline">
                View posting
              </SafeLink>
              <SafeLink href={data.cv_pdf_url} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                Download CV PDF
              </SafeLink>
            </div>

            {data.missing_keywords.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Keywords this CV does not support</p>
                <div className="flex flex-wrap gap-1">
                  {data.missing_keywords.map((k) => (
                    <Badge key={k} variant="warning">
                      {k}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {data.status === 'pending_review' && (
                <>
                  <Button onClick={() => { move('approved'); setPanelOpen(true); }}>Approve &amp; Apply</Button>
                  <Button variant="outline" onClick={() => { move('skipped'); onClose(); }}>Skip</Button>
                </>
              )}
              {data.status === 'approved' && (
                <>
                  <Button variant="outline" onClick={() => { move('skipped'); onClose(); }}>Skip</Button>
                  <Button variant="ghost" onClick={() => move('pending_review')}>Back to pending</Button>
                </>
              )}
              {data.status === 'skipped' && <Button onClick={() => move('pending_review')}>Restore</Button>}
              {APPLIED_FAMILY.includes(data.status) && (
                <label className="flex items-center gap-2 text-sm">
                  Move to
                  <select
                    value={data.status}
                    onChange={(e) => move(e.target.value as ApplicationStatus)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {MOVE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {COLUMN_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {showPanel && (
              <AssistedApplyPanel
                app={data}
                pending={setStatus.isPending}
                onMarkApplied={() =>
                  setStatus.mutate(
                    { id: data.id, status: 'applied' },
                    { onSuccess: () => { setPanelOpen(false); onClose(); } },
                  )
                }
              />
            )}

            <div className="space-y-2">
              <Label htmlFor="cv-text">Tailored CV</Label>
              <Textarea id="cv-text" value={cv} onChange={(e) => setCv(e.target.value)} rows={14} aria-invalid={text.errors.cv ? true : undefined} />
              {text.errors.cv && <p className="text-sm text-destructive">{text.errors.cv}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="letter-text">Cover letter</Label>
              <Textarea id="letter-text" value={letter} onChange={(e) => setLetter(e.target.value)} rows={10} aria-invalid={text.errors.letter ? true : undefined} />
              {text.errors.letter && <p className="text-sm text-destructive">{text.errors.letter}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={!text.dirty || Object.keys(text.errors).length > 0 || updateText.isPending}
                onClick={() => updateText.mutate({ id: data.id, patch: text.patch })}
              >
                {updateText.isPending ? 'Saving…' : 'Save changes'}
              </Button>
              <p className="text-xs text-muted-foreground">Saving a CV change rebuilds the PDF.</p>
              {updateText.isSuccess && !text.dirty && <span role="status" className="text-sm text-emerald-400">Saved.</span>}
            </div>

            {mutationError && <p role="alert" className="text-sm text-destructive">{describeApiError(mutationError)}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Implement the queue page** — `web/src/app/(app)/queue/page.tsx`

```tsx
'use client';

import { useMemo, useState } from 'react';
import { ApplicationCard } from '@/components/applications/ApplicationCard';
import { ApplicationDetail } from '@/components/applications/ApplicationDetail';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApplications, useRefreshJobs } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { splitQueue, type QueueTab } from '@/lib/applications';

const TABS: QueueTab[] = ['pending', 'ready', 'skipped'];
const TAB_LABELS: Record<QueueTab, string> = { pending: 'Pending', ready: 'Ready to apply', skipped: 'Skipped' };
const EMPTY: Record<QueueTab, { title: string; description: string }> = {
  pending: {
    title: 'No applications to review yet',
    description: 'New jobs are checked every 6 hours. Make sure your CV and roles are set in Settings, then check for new jobs.',
  },
  ready: { title: 'Nothing is ready to apply', description: 'Approve an application from the Pending tab and it will wait here until you mark it applied.' },
  skipped: { title: 'No skipped applications', description: 'Applications you skip appear here, and you can restore them.' },
};

export default function QueuePage() {
  const apps = useApplications({ poll: true });
  const refresh = useRefreshJobs();
  const [tab, setTab] = useState<QueueTab>('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  const groups = useMemo(() => splitQueue(apps.data ?? []), [apps.data]);

  if (apps.isLoading) return <PageSkeleton />;
  if (apps.error) return <ErrorState message={describeApiError(apps.error)} onRetry={() => void apps.refetch()} />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Review queue</h1>
        <Button variant="outline" size="sm" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
          {refresh.isPending ? 'Checking…' : 'Check for new jobs'}
        </Button>
      </div>
      {refresh.isSuccess && <p role="status" className="text-sm text-muted-foreground">Checking for new jobs. New matches appear here within a few minutes.</p>}
      {refresh.error && <p role="alert" className="text-sm text-destructive">{describeApiError(refresh.error)}</p>}

      <Tabs value={tab} onValueChange={(v) => setTab(v as QueueTab)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {TAB_LABELS[t]} ({groups[t].length})
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t} value={t}>
            {groups[t].length === 0 ? (
              <EmptyState title={EMPTY[t].title} description={EMPTY[t].description} />
            ) : (
              <div className="space-y-4">
                {groups[t].map((a) => (
                  <ApplicationCard key={a.id} app={a} onOpen={setOpenId} />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <ApplicationDetail id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
```

- [ ] **Step 7: Verify**

Run: `npm test -w web && npm run typecheck -w web && npm run build -w web`
Expected: all tests PASS (format 5, application-card 7, assisted-apply-panel 6, plus earlier), typecheck exits 0, `next build` lists `/queue`. If a Radix Dialog or Tabs warning appears in test output, it comes from components not rendered by these tests; report anything unexpected.

- [ ] **Step 8: Commit**

```bash
git add web
git commit -m "feat(web): add review queue with detail editor and assisted apply panel

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Web: tracker Kanban

**Files:**
- Create: `web/src/components/tracker/KanbanBoard.tsx`, `web/src/app/(app)/tracker/page.tsx`
- Test: `web/tests/components/kanban-board.test.tsx`

**Interfaces:**
- Consumes: `groupByColumn`, `resolveDrop`; `COLUMN_LABELS`, `formatShortDate`; `ScoreRing`; `KANBAN_COLUMNS`, `KanbanColumn`, `Application`, `ApplicationStatus`; `useApplications`, `useSetStatus`; `ApplicationDetail`.
- Produces: `KanbanBoard({ apps, onMove(id, status), onOpen(id) })` (presentational; dragging a card to another column calls `onMove`).

- [ ] **Step 1: Write the failing test** — `web/tests/components/kanban-board.test.tsx`

```tsx
import type { Application } from '@joblume/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from '@/components/tracker/KanbanBoard';

const app = (id: string, status: Application['status'], over: Partial<Application> = {}): Application => ({
  id, user_id: 'u1', job_id: `j-${id}`, tailored_cv_text: 'cv', tailored_cv_url: null, cover_letter_text: 'l',
  match_score: 70, missing_keywords: [], hiring_manager_email: null, email_confidence: null, apply_method: null,
  status, applied_at: status === 'pending_review' || status === 'approved' || status === 'skipped' ? null : '2026-10-20T10:00:00.000Z',
  follow_up_at: null, created_at: '2026-10-01T00:00:00.000Z',
  job: { title: `Role ${id}`, company: `Company ${id}`, location: 'Lagos', source: 'myjobmag', url: 'https://example.com', company_domain: null },
  ...over,
});

const apps = [
  app('p1', 'pending_review'),
  app('p2', 'approved'),
  app('s1', 'skipped'),
  app('a1', 'applied'),
  app('i1', 'interviewing'),
  app('i2', 'interviewing'),
];

describe('KanbanBoard', () => {
  it('renders the five columns in order with counts', () => {
    render(<KanbanBoard apps={apps} onMove={() => {}} onOpen={() => {}} />);
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(regions).toEqual(['Pending Review', 'Applied', 'Interviewing', 'Rejected', 'Offer']);
    expect(within(screen.getByRole('region', { name: 'Pending Review' })).getByLabelText('2 applications')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Interviewing' })).getByLabelText('2 applications')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Offer' })).getByLabelText('0 applications')).toBeInTheDocument();
  });

  it('shows approved applications in Pending Review with a badge, and hides skipped ones', () => {
    render(<KanbanBoard apps={apps} onMove={() => {}} onOpen={() => {}} />);
    const pending = within(screen.getByRole('region', { name: 'Pending Review' }));
    expect(pending.getByText('Role p1')).toBeInTheDocument();
    expect(pending.getByText('Role p2')).toBeInTheDocument();
    expect(pending.getByText('Ready to apply')).toBeInTheDocument();
    expect(screen.queryByText('Role s1')).toBeNull();
  });

  it('shows the applied date on applied cards', () => {
    render(<KanbanBoard apps={apps} onMove={() => {}} onOpen={() => {}} />);
    expect(within(screen.getByRole('region', { name: 'Applied' })).getByText(/20 Oct/)).toBeInTheDocument();
  });

  it('shows a hint in empty columns', () => {
    render(<KanbanBoard apps={[]} onMove={() => {}} onOpen={() => {}} />);
    expect(screen.getAllByText('Drop a card here')).toHaveLength(5);
  });

  it('opens a card from its title', async () => {
    const onOpen = vi.fn();
    render(<KanbanBoard apps={apps} onMove={() => {}} onOpen={onOpen} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Role a1' }));
    expect(onOpen).toHaveBeenCalledWith('a1');
  });
});
```
(Drag and drop itself is verified by the `resolveDrop` unit tests in Task 6 and by the manual checklist, because simulating dnd-kit pointer sensors in jsdom is unreliable.)

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -w web -- tests/components/kanban-board.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the board** — `web/src/components/tracker/KanbanBoard.tsx`

```tsx
'use client';

import {
  DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { KANBAN_COLUMNS, type Application, type ApplicationStatus, type KanbanColumn } from '@joblume/shared';
import { useMemo } from 'react';
import { ScoreRing } from '@/components/applications/ScoreRing';
import { Badge } from '@/components/ui/badge';
import { groupByColumn, resolveDrop } from '@/lib/applications';
import { COLUMN_LABELS, formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface KanbanBoardProps {
  apps: Application[];
  onMove(id: string, status: ApplicationStatus): void;
  onOpen(id: string): void;
}

function DraggableCard({ app, onOpen }: { app: Application; onOpen(id: string): void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: app.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const applied = formatShortDate(app.applied_at);
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn('cursor-grab touch-none rounded-md border border-border bg-card p-3 text-sm shadow-sm', isDragging && 'relative z-10 opacity-80 shadow-lg')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button type="button" className="text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onOpen(app.id)}>
            {app.job?.title ?? 'Untitled role'}
          </button>
          <p className="truncate text-xs text-muted-foreground">{app.job?.company ?? 'Unknown company'}</p>
        </div>
        <ScoreRing score={app.match_score} size={32} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {app.status === 'approved' && <Badge variant="success">Ready to apply</Badge>}
        {applied && <span>Applied {applied}</span>}
      </div>
    </div>
  );
}

function Column({ column, apps, onOpen }: { column: KanbanColumn; apps: Application[]; onOpen(id: string): void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  return (
    <section
      aria-label={COLUMN_LABELS[column]}
      ref={setNodeRef}
      className={cn('flex w-72 shrink-0 flex-col gap-3 rounded-lg border border-border bg-card/40 p-3', isOver && 'border-primary')}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{COLUMN_LABELS[column]}</h2>
        <span className="text-xs text-muted-foreground" aria-label={`${apps.length} applications`}>
          {apps.length}
        </span>
      </header>
      {apps.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Drop a card here</p>}
      {apps.map((app) => (
        <DraggableCard key={app.id} app={app} onOpen={onOpen} />
      ))}
    </section>
  );
}

export function KanbanBoard({ apps, onMove, onOpen }: KanbanBoardProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const groups = useMemo(() => groupByColumn(apps), [apps]);

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const status = resolveDrop(apps, activeId, event.over ? String(event.over.id) : null);
    if (status) onMove(activeId, status);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map((column) => (
          <Column key={column} column={column} apps={groups[column]} onOpen={onOpen} />
        ))}
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 4: Implement the page** — `web/src/app/(app)/tracker/page.tsx`

```tsx
'use client';

import { useState } from 'react';
import { ApplicationDetail } from '@/components/applications/ApplicationDetail';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { KanbanBoard } from '@/components/tracker/KanbanBoard';
import { useApplications, useSetStatus } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';

export default function TrackerPage() {
  const apps = useApplications({ poll: true });
  const setStatus = useSetStatus();
  const [openId, setOpenId] = useState<string | null>(null);

  if (apps.isLoading) return <PageSkeleton />;
  if (apps.error) return <ErrorState message={describeApiError(apps.error)} onRetry={() => void apps.refetch()} />;

  const items = apps.data ?? [];
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Tracker</h1>
      {setStatus.error && (
        <p role="alert" className="text-sm text-destructive">
          {describeApiError(setStatus.error)} The card was moved back.
        </p>
      )}
      {items.length === 0 ? (
        <EmptyState title="Nothing to track yet" description="Applications appear here once your queue has matches. Drag a card between columns as your applications progress." />
      ) : (
        <KanbanBoard apps={items} onMove={(id, status) => setStatus.mutate({ id, status })} onOpen={setOpenId} />
      )}
      <ApplicationDetail id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm test -w web && npm run typecheck -w web && npm run build -w web`
Expected: all tests PASS (kanban-board 5, plus earlier), typecheck exits 0, `next build` lists `/tracker`.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): add Kanban tracker with drag and drop and optimistic moves

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Web: analytics page

**Files:**
- Modify: `web/src/lib/format.ts`
- Create: `web/src/components/analytics/StatusBar.tsx`, `web/src/app/(app)/analytics/page.tsx`
- Test: `web/tests/lib/analytics-format.test.ts`, `web/tests/components/status-bar.test.tsx`

**Interfaces:**
- Consumes: `useAnalytics`; `Analytics`, `ApplicationStatus`, `APPLICATION_STATUSES` from `@joblume/shared`.
- Produces (added to `@/lib/format`): `formatPercent(rate: number): string`, `formatScore(avg: number | null): string`, `STATUS_LABELS: Record<ApplicationStatus, string>`, `statusSegments(byStatus: Record<ApplicationStatus, number>): { status: ApplicationStatus; label: string; count: number; pct: number }[]` (zero counts omitted; empty when the total is 0). Component `StatusBar({ byStatus })`.

- [ ] **Step 1: Write the failing tests**

`web/tests/lib/analytics-format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatPercent, formatScore, statusSegments, STATUS_LABELS } from '@/lib/format';

const zero = { pending_review: 0, approved: 0, applied: 0, interviewing: 0, rejected: 0, offer: 0, skipped: 0 };

describe('formatPercent', () => {
  it('rounds a rate to a whole percent', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(1 / 3)).toBe('33%');
    expect(formatPercent(0.666)).toBe('67%');
    expect(formatPercent(1)).toBe('100%');
  });
});

describe('formatScore', () => {
  it('shows a dash for no score, integers plainly and decimals to one place', () => {
    expect(formatScore(null)).toBe('–');
    expect(formatScore(72)).toBe('72');
    expect(formatScore(70.5)).toBe('70.5');
  });
});

describe('statusSegments', () => {
  it('returns nothing when there are no applications', () => {
    expect(statusSegments(zero)).toEqual([]);
  });

  it('omits zero counts and gives percentages that sum to 100', () => {
    const segments = statusSegments({ ...zero, pending_review: 1, applied: 3 });
    expect(segments).toEqual([
      { status: 'pending_review', label: 'Pending Review', count: 1, pct: 25 },
      { status: 'applied', label: 'Applied', count: 3, pct: 75 },
    ]);
  });

  it('has a label for every status', () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual(['applied', 'approved', 'interviewing', 'offer', 'pending_review', 'rejected', 'skipped']);
    expect(STATUS_LABELS.approved).toBe('Ready to apply');
  });
});
```

`web/tests/components/status-bar.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBar } from '@/components/analytics/StatusBar';

const zero = { pending_review: 0, approved: 0, applied: 0, interviewing: 0, rejected: 0, offer: 0, skipped: 0 };

describe('StatusBar', () => {
  it('lists each non-zero status with its count', () => {
    render(<StatusBar byStatus={{ ...zero, applied: 3, offer: 1 }} />);
    expect(screen.getByRole('img', { name: 'Applications by status' })).toBeInTheDocument();
    expect(screen.getByText('Applied: 3')).toBeInTheDocument();
    expect(screen.getByText('Offer: 1')).toBeInTheDocument();
    expect(screen.queryByText(/Rejected/)).toBeNull();
  });

  it('renders nothing when there are no applications', () => {
    const { container } = render(<StatusBar byStatus={zero} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -w web -- tests/lib/analytics-format.test.ts tests/components/status-bar.test.tsx`
Expected: FAIL (missing exports / module).

- [ ] **Step 3: Extend the formatters** — append to `web/src/lib/format.ts`

Add the import `import { APPLICATION_STATUSES, type ApplicationStatus } from '@joblume/shared';` at the top (merge with the existing `KanbanColumn` import: `import { APPLICATION_STATUSES, type ApplicationStatus, type KanbanColumn } from '@joblume/shared';`), then append:
```ts
export const formatPercent = (rate: number): string => `${Math.round(rate * 100)}%`;

export const formatScore = (avg: number | null): string => {
  if (avg === null) return '–';
  return Number.isInteger(avg) ? String(avg) : avg.toFixed(1);
};

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending_review: 'Pending Review',
  approved: 'Ready to apply',
  applied: 'Applied',
  interviewing: 'Interviewing',
  rejected: 'Rejected',
  offer: 'Offer',
  skipped: 'Skipped',
};

export function statusSegments(byStatus: Record<ApplicationStatus, number>) {
  const total = APPLICATION_STATUSES.reduce((sum, s) => sum + byStatus[s], 0);
  if (total === 0) return [];
  return APPLICATION_STATUSES.filter((s) => byStatus[s] > 0).map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: byStatus[status],
    pct: (byStatus[status] / total) * 100,
  }));
}
```

- [ ] **Step 4: Implement the component and page**

`web/src/components/analytics/StatusBar.tsx`:
```tsx
import type { ApplicationStatus } from '@joblume/shared';
import { statusSegments } from '@/lib/format';
import { cn } from '@/lib/utils';

const COLORS: Record<ApplicationStatus, string> = {
  pending_review: 'bg-slate-500',
  approved: 'bg-sky-500',
  applied: 'bg-primary',
  interviewing: 'bg-amber-500',
  rejected: 'bg-rose-500',
  offer: 'bg-emerald-500',
  skipped: 'bg-zinc-700',
};

export function StatusBar({ byStatus }: { byStatus: Record<ApplicationStatus, number> }) {
  const segments = statusSegments(byStatus);
  if (segments.length === 0) return null;
  return (
    <div className="space-y-3">
      <div role="img" aria-label="Applications by status" className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((s) => (
          <div key={s.status} className={COLORS[s.status]} style={{ width: `${s.pct}%` }} title={`${s.label}: ${s.count}`} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segments.map((s) => (
          <li key={s.status} className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', COLORS[s.status])} aria-hidden="true" />
            {s.label}: {s.count}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`web/src/app/(app)/analytics/page.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { StatusBar } from '@/components/analytics/StatusBar';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAnalytics } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { formatPercent, formatScore } from '@/lib/format';

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold">{value}</p>
        {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const analytics = useAnalytics();

  if (analytics.isLoading) return <PageSkeleton />;
  if (analytics.error) return <ErrorState message={describeApiError(analytics.error)} onRetry={() => void analytics.refetch()} />;
  const a = analytics.data;
  if (!a || a.total === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <EmptyState
          title="No applications yet"
          description="Numbers appear once your first applications are prepared."
          action={<Link href="/queue" className="text-sm text-primary hover:underline">Go to the review queue</Link>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold">Analytics</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Total applications" value={String(a.total)} />
        <Tile label="Applied" value={String(a.applied_ever)} />
        <Tile
          label="Response rate"
          value={formatPercent(a.response_rate)}
          note="Counts applications you moved past Applied (interviewing, rejected or offer). Automatic reply tracking arrives with email sending."
        />
        <Tile label="Average match score" value={formatScore(a.avg_match_score)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Applications by status</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusBar byStatus={a.by_status} />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm test -w web && npm run typecheck -w web && npm run build -w web`
Expected: all tests PASS (analytics-format 9, status-bar 2, plus earlier), typecheck exits 0, `next build` lists `/analytics`.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): add analytics page with stat tiles and status bar

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Docs, run scripts, manual checklist and final verification

**Files:**
- Modify: root `package.json` (add `dev`), `README.md`
- Create: `docs/phase2-manual-checklist.md`

**Interfaces:**
- Consumes: everything above.
- Produces: root script `npm run dev` (server + web), README Phase 2 instructions, a written manual checklist.

- [ ] **Step 1: Add the combined dev script**

Run `npm install -D concurrently` at the repo root (it is already installed for the server; this records it at the root). Add to the root `package.json` scripts:
```json
    "dev": "concurrently -n server,web -c blue,green \"npm:dev:server\" \"npm:dev:web\"",
```

- [ ] **Step 2: Update the README**

In `README.md` replace the Phase 1 setup steps 2 and 3 so they read as below, and add the new sections. (Keep the rest of the file.)

```markdown
## Setup

1. Create a Supabase project and run `supabase/migrations/0001_init.sql` (CLI `supabase db push`, or the SQL editor). In Authentication, enable the Email provider. For easy local testing you may turn off "Confirm email".
2. Copy `.env.example` to `.env` and fill in the server values (Supabase, Gemini, Upstash). `GEMINI_MODEL` must be a model Google currently offers. `WEB_ORIGIN` must equal the web app's address (`http://localhost:3000` in development).
3. Copy `web/.env.example` to `web/.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public values only) and `NEXT_PUBLIC_API_URL` (`http://localhost:4000`).
4. From the repo root run `npm install`. This is an npm workspace (`server`, `web`, `packages/shared`); the install also builds the shared package.
5. Run everything with `npm run dev` (server on port 4000, web on port 3000), or separately with `npm run dev:server` and `npm run dev:web`.
6. Open http://localhost:3000, create an account, and follow the onboarding steps (upload your CV, set your roles).

Useful commands from the repo root: `npm test`, `npm run typecheck`, `npm run build`.

## Web dashboard

- **Queue:** AI-prepared applications sorted by match score. Open one to edit the tailored CV and cover letter, then **Approve & Apply**. Nothing is sent for you: the panel gives you the job link, the CV PDF and a copy button for the cover letter; you apply on the employer's site and click **Mark as applied**.
- **Tracker:** Kanban board (Pending Review, Applied, Interviewing, Rejected, Offer). Drag cards between columns.
- **Analytics:** totals, response rate (counts cards you moved past Applied until email reply tracking exists) and average match score.
- **Settings:** replace your CV, edit preferences, and set apply mode, threshold, daily cap and follow-up preferences. Auto mode only stores the preference until sending exists.

## Deploying the web app

Deploy `web/` to Vercel. Set the project's Root Directory to `web`, enable "Include source files outside of the Root Directory", and set the three `NEXT_PUBLIC_*` variables. Set the server's `WEB_ORIGIN` to the Vercel URL.
```

- [ ] **Step 3: Write the manual checklist** — `docs/phase2-manual-checklist.md`

```markdown
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
```

- [ ] **Step 4: Final verification from the repo root**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck passes for shared, server and web; tests pass in all three workspaces (note the counts per workspace in the report); the production build succeeds for shared, server and web (`next build` lists `/`, `/login`, `/queue`, `/tracker`, `/analytics`, `/settings`, `/onboarding`). Make sure `git status` is clean afterwards except for intended files.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json README.md docs/phase2-manual-checklist.md
git commit -m "docs: add Phase 2 run instructions and manual checklist

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

**Spec coverage (spec section to task):** structure and shared package (§3) to Task 1; auth flow and route protection (§4) to Tasks 5, 7; server status endpoint (§5) to Task 2; analytics endpoint and list limit (§5) to Task 3; sign-in page, onboarding, settings (§6) to Tasks 7, 8, 9; review queue, detail editor, assisted apply, skip/restore, refetch behaviour (§6) to Tasks 6, 10; Kanban (§6) to Task 11; analytics page (§6) to Task 12; error handling (§7) to Task 5 (client and messages) and the pages; security rules (§8) to Tasks 1 (`safeHttpUrl`), 7, 10 (safe links, plain-text rendering); testing (§9) to every task; definition of done and manual checklist (§10) to Task 13; out-of-scope items (§11) are absent by design.

**Deliberate choices and limits to know about:**
- `ApplicationDetail`, the pages, and the Radix dialog are verified by typecheck, build and the manual checklist; their logic lives in unit-tested helpers and hooks. Drag and drop is verified through `resolveDrop` tests plus the checklist, because dnd-kit pointer sensors are unreliable in jsdom.
- `planStatusChange` (server) and `applyStatusLocal` (web, optimistic) implement the same rules; the server's answer always replaces the local guess (`onSettled` invalidates).
- `GET /profile` returns the full profile including the CV text; this is accepted for Phase 2 (a leaner profile endpoint can come later).
- Fresh installs need `npm install` at the repo root (the `postinstall` builds `@joblume/shared`); the `pre*` scripts rebuild it before tests, typecheck and builds.
- Version drift risk: Next 14 with a very new TypeScript, and Vitest with the React plugin, may need small pins; Task 4 says to pin and report rather than work around.

