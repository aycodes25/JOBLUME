import { describe, expect, it, vi } from 'vitest';
import type { JobRow, ProfileRow } from '../../src/db/types.js';
import { matchJob, matchUser, type MatchDeps } from '../../src/worker/match.js';

const job = (over: Partial<JobRow> = {}): JobRow => ({
  id: 'j1', title: 'Backend Engineer', company: 'Acme', location: 'Lagos', description: 'd', source: 'myjobmag',
  url: 'https://x/1', company_domain: null, dedupe_key: 'acme|backend engineer', created_at: '2026-10-17T00:00:00Z', ...over,
});
const profile = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  user_id: 'u1', base_cv_text: 'cv', base_cv_url: 'p', base_cv_filename: null, skills: [], years_experience: 3, desired_roles: ['backend engineer'],
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
