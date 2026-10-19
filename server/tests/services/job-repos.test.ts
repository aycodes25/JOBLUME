import { describe, expect, it } from 'vitest';
import type { NormalisedJob } from '../../src/domain/jobs.js';
import type { Db } from '../../src/lib/supabase.js';
import { createJobFetchesRepo } from '../../src/services/jobs/fetches-repo.js';
import { findJobIdByUrl, saveJob } from '../../src/services/jobs/repo.js';

type Result = { data?: unknown; error?: unknown };

/** A Supabase stand-in: records every chained call; each awaited query takes the next queued result. */
function fakeDb(results: Result[] = []) {
  const calls: unknown[][] = [];
  const chain: object = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') {
        const next = results.shift() ?? {};
        return (resolve: (v: unknown) => void) => resolve({ data: next.data ?? null, error: next.error ?? null });
      }
      return (...args: unknown[]) => {
        calls.push([String(prop), ...args]);
        return chain;
      };
    },
  });
  const db = {
    from: (table: string) => {
      calls.push(['from', table]);
      return chain;
    },
  };
  return { db: db as unknown as Db, calls };
}

const NOW = new Date('2026-10-18T10:00:00.000Z');
const URL_1 = 'https://www.linkedin.com/jobs/view/4012345678/';
const job: NormalisedJob = {
  title: 'Data Analyst', company: 'Acme Analytics', location: 'Lagos', description: 'd', source: 'linkedin', url: URL_1, companyDomain: null,
};

describe('createJobFetchesRepo', () => {
  it('records a new request as queued with fresh timestamps, one row per user and link', async () => {
    const { db, calls } = fakeDb();
    await createJobFetchesRepo(db, () => NOW).save('u1', URL_1, { status: 'queued' });
    expect(calls).toEqual([
      ['from', 'job_fetches'],
      ['upsert', {
        user_id: 'u1', url: URL_1, status: 'queued', reason: null, job_id: null,
        updated_at: NOW.toISOString(), created_at: NOW.toISOString(),
      }, { onConflict: 'user_id,url' }],
    ]);
  });

  it('records done with the job id and failed with the reason, keeping created_at', async () => {
    const { db, calls } = fakeDb();
    const repo = createJobFetchesRepo(db, () => NOW);
    await repo.save('u1', URL_1, { status: 'done', jobId: 'j1' });
    await repo.save('u1', URL_1, { status: 'failed', reason: 'login_required' });
    expect(calls[1]).toEqual(['upsert', { user_id: 'u1', url: URL_1, status: 'done', reason: null, job_id: 'j1', updated_at: NOW.toISOString() }, { onConflict: 'user_id,url' }]);
    expect(calls[3]).toEqual(['upsert', { user_id: 'u1', url: URL_1, status: 'failed', reason: 'login_required', job_id: null, updated_at: NOW.toISOString() }, { onConflict: 'user_id,url' }]);
  });

  it('throws a database error', async () => {
    const { db } = fakeDb([{ error: { message: 'down' } }]);
    await expect(createJobFetchesRepo(db).save('u1', URL_1, { status: 'queued' })).rejects.toEqual({ message: 'down' });
  });

  it('lists the user\'s most recent rows only', async () => {
    const rows = [{ id: 'f1', url: URL_1, status: 'queued', reason: null, job_id: null, created_at: 'c', updated_at: 'u' }];
    const { db, calls } = fakeDb([{ data: rows }]);
    expect(await createJobFetchesRepo(db).listRecent('u1', 20)).toEqual(rows);
    expect(calls).toEqual([
      ['from', 'job_fetches'],
      ['select', 'id, url, status, reason, job_id, created_at, updated_at'],
      ['eq', 'user_id', 'u1'],
      ['order', 'created_at', { ascending: false }],
      ['limit', 20],
    ]);
  });
});

describe('findJobIdByUrl', () => {
  it('returns the stored job id for the canonical link', async () => {
    const { db, calls } = fakeDb([{ data: { id: 'j1' } }]);
    expect(await findJobIdByUrl(db, URL_1)).toBe('j1');
    expect(calls).toContainEqual(['eq', 'url', URL_1]);
  });

  it('returns null when no job has that link', async () => {
    const { db } = fakeDb([{ data: null }]);
    expect(await findJobIdByUrl(db, URL_1)).toBeNull();
  });
});

describe('saveJob', () => {
  it('returns the id of a newly inserted job', async () => {
    const { db } = fakeDb([{ data: [{ id: 'j-new' }] }]);
    expect(await saveJob(db, job)).toBe('j-new');
  });

  it('returns the stored job with the same company and title when the insert was skipped', async () => {
    const { db, calls } = fakeDb([{ data: [] }, { data: { id: 'j-old' } }]);
    expect(await saveJob(db, job)).toBe('j-old');
    expect(calls).toContainEqual(['eq', 'dedupe_key', 'acme analytics|data analyst']);
  });

  it('throws when the insert was skipped and nothing matches', async () => {
    const { db } = fakeDb([{ data: [] }, { data: null }]);
    await expect(saveJob(db, job)).rejects.toThrow('no matching job');
  });
});
