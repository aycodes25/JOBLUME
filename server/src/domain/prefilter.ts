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

const REMOTIVE_OPEN = /worldwide|anywhere|global|africa|emea|nigeria|^remote$/i;

function locationMatches(job: MatchJob, preference: MatchProfile['location']): boolean {
  if (preference === null) return true;
  if (job.source === 'remotive') {
    // Remotive lists a candidate_required_location; skip region-locked jobs (e.g. "USA Only") before spending AI calls.
    const loc = job.location.trim();
    return loc === '' || REMOTIVE_OPEN.test(loc);
  }
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
