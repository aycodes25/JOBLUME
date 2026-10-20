import { describe, expect, it, vi } from 'vitest';
import type { JobRow } from '../../src/db/types.js';
import type { Db } from '../../src/lib/supabase.js';
import { matchJob, type MatchCandidate, type MatchDeps } from '../../src/worker/match.js';
import { createWorkerRepos } from '../../src/worker/repos.js';

const job = (title: string): JobRow => ({
  id: 'j1', title, company: 'Acme', location: 'Worldwide', description: 'd', source: 'remoteok',
  url: 'https://remoteOK.com/remote-jobs/1', company_domain: null, dedupe_key: 'acme|x', created_at: '2026-10-20T00:00:00Z',
});

function deps(candidates: MatchCandidate[], title: string): MatchDeps {
  return {
    loadJob: vi.fn<MatchDeps['loadJob']>().mockImplementation(async () => job(title)),
    loadCandidates: vi.fn<MatchDeps['loadCandidates']>().mockImplementation(async () => candidates),
    loadProfile: vi.fn(),
    loadRecentJobs: vi.fn(),
    existingJobIds: vi.fn(),
    enqueueTailor: vi.fn<MatchDeps['enqueueTailor']>().mockImplementation(async () => undefined),
  };
}

describe('matchJob with skills', () => {
  const dev: MatchCandidate = { user_id: 'u1', desired_roles: ['Software Engineer'], location: 'Remote', skills: ['React', 'Node.js'] };

  it('queues a title that fits no role but names a skill plus a core role noun', async () => {
    const d = deps([dev], 'React Developer');
    expect(await matchJob('j1', d)).toBe(1);
    expect(d.enqueueTailor).toHaveBeenCalledWith('u1', 'j1');
  });

  it('does not queue a title with a skill but no core role noun', async () => {
    const d = deps([dev], 'React Designer');
    expect(await matchJob('j1', d)).toBe(0);
  });

  it('works for a candidate whose skills were not loaded', async () => {
    const d = deps([{ user_id: 'u2', desired_roles: ['Software Engineer'], location: 'Remote' }], 'Software Developer');
    expect(await matchJob('j1', d)).toBe(1);
  });
});

describe('worker repo loadCandidates', () => {
  it('reads the skills along with the roles, and drops profiles with no roles', async () => {
    const calls: unknown[][] = [];
    const rows = [
      { user_id: 'u1', desired_roles: ['Software Engineer'], location: 'Remote', skills: ['React'] },
      { user_id: 'u2', desired_roles: [], location: 'Lagos', skills: [] },
    ];
    const chain: object = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
        return (...args: unknown[]) => (calls.push([String(prop), ...args]), chain);
      },
    });
    const db = { from: (table: string) => (calls.push(['from', table]), chain) } as unknown as Db;
    expect(await createWorkerRepos(db).loadCandidates()).toEqual([rows[0]]);
    expect(calls[1]).toEqual(['select', 'user_id, desired_roles, location, skills']);
  });
});
