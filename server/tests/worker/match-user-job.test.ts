import { describe, expect, it, vi } from 'vitest';
import type { JobRow, ProfileRow } from '../../src/db/types.js';
import { matchUserJob, type MatchDeps } from '../../src/worker/match.js';

const job = (over: Partial<JobRow> = {}): JobRow => ({
  id: 'j1', title: 'Chief Happiness Officer', company: 'Acme', location: 'Paris', description: 'd', source: 'linkedin',
  url: 'https://www.linkedin.com/jobs/view/4012345678/', company_domain: null, dedupe_key: 'acme|chief happiness officer',
  created_at: '2026-10-18T00:00:00Z', ...over,
});
const profile = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  user_id: 'u1', base_cv_text: 'cv', base_cv_url: 'p', base_cv_filename: null, skills: [], years_experience: 3, desired_roles: ['backend engineer'],
  location: 'Lagos', salary_min: null, salary_max: null, apply_mode: 'manual', auto_threshold: 80, daily_cap: 20,
  auto_followup: false, notify_new_matches: false, updated_at: '',
  full_name: null, phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null, ...over,
});

function deps(over: Partial<MatchDeps> = {}): MatchDeps {
  return {
    loadJob: vi.fn<MatchDeps['loadJob']>().mockImplementation(async () => job()),
    loadCandidates: vi.fn<MatchDeps['loadCandidates']>().mockImplementation(async () => []),
    loadProfile: vi.fn<MatchDeps['loadProfile']>().mockImplementation(async () => profile()),
    loadRecentJobs: vi.fn<MatchDeps['loadRecentJobs']>().mockImplementation(async () => []),
    existingJobIds: vi.fn<MatchDeps['existingJobIds']>().mockImplementation(async () => new Set<string>()),
    enqueueTailor: vi.fn<MatchDeps['enqueueTailor']>().mockImplementation(async () => undefined),
    ...over,
  };
}

describe('matchUserJob', () => {
  it('queues tailoring for that user only, even when the title and place do not match their preferences', async () => {
    const d = deps();
    expect(await matchUserJob('u1', 'j1', d)).toBe(1);
    expect(d.enqueueTailor).toHaveBeenCalledWith('u1', 'j1');
    expect(d.enqueueTailor).toHaveBeenCalledTimes(1);
    expect(d.loadCandidates).not.toHaveBeenCalled();
    expect(d.existingJobIds).toHaveBeenCalledWith('u1', ['j1']);
  });

  it('does nothing when the user already has an application for the job', async () => {
    const d = deps({ existingJobIds: vi.fn<MatchDeps['existingJobIds']>().mockImplementation(async () => new Set(['j1'])) });
    expect(await matchUserJob('u1', 'j1', d)).toBe(0);
    expect(d.enqueueTailor).not.toHaveBeenCalled();
  });

  it.each([
    ['there is no profile', { loadProfile: vi.fn<MatchDeps['loadProfile']>().mockImplementation(async () => null) }],
    ['the user has no CV yet', { loadProfile: vi.fn<MatchDeps['loadProfile']>().mockImplementation(async () => profile({ base_cv_text: null })) }],
    ['the job is gone', { loadJob: vi.fn<MatchDeps['loadJob']>().mockImplementation(async () => null) }],
  ])('does nothing when %s', async (_n, over) => {
    const d = deps(over);
    expect(await matchUserJob('u1', 'j1', d)).toBe(0);
    expect(d.enqueueTailor).not.toHaveBeenCalled();
  });
});
