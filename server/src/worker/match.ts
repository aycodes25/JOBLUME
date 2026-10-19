import type { JobRow, ProfileRow } from '../db/types.js';
import { matchesProfile } from '../domain/prefilter.js';

export type MatchCandidate = Pick<ProfileRow, 'user_id' | 'desired_roles' | 'location'>;

export interface MatchDeps {
  loadJob(id: string): Promise<JobRow | null>;
  /** Profiles that have a base CV and at least one desired role. */
  loadCandidates(): Promise<MatchCandidate[]>;
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

/** The user pasted this job: queue tailoring for them alone. No prefilter, because they chose it. */
export async function matchUserJob(userId: string, jobId: string, d: MatchDeps): Promise<number> {
  const profile = await d.loadProfile(userId);
  if (!profile || !profile.base_cv_text) return 0;
  const job = await d.loadJob(jobId);
  if (!job) return 0;
  const done = await d.existingJobIds(userId, [job.id]);
  if (done.has(job.id)) return 0;
  await d.enqueueTailor(userId, job.id);
  return 1;
}
