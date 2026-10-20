import type { JobSource } from './jobs.js';

export interface MatchJob {
  title: string;
  location: string;
  source: JobSource;
}

export interface MatchProfile {
  desired_roles: string[];
  location: 'Lagos' | 'Abuja' | 'Remote' | null;
  /** The user's skills; a skill in the title plus a core role noun is enough for a match. */
  skills?: string[];
}

/** Why a job was turned away: the user has no usable roles, the title does not fit them, or the place does not fit. */
export type PrefilterReason = 'no_roles' | 'title' | 'location';
export type PrefilterResult = { ok: true } | { ok: false; reason: PrefilterReason };

// "Full stack" and "fullstack" must compare equal, so common spellings are joined before the title is split into words.
const PHRASES: Array<[RegExp, string]> = [
  [/\bfull[\s-]*stack\b/g, 'fullstack'],
  [/\bfront[\s-]*end\b/g, 'frontend'],
  [/\bback[\s-]*end\b/g, 'backend'],
  [/\bnode\.js\b|\bnodejs\b/g, 'node'],
];

// "Software Engineer" and "Software Developer" are the same job, so these nouns count as one word.
const SYNONYMS: Record<string, string> = { developer: 'engineer', programmer: 'engineer', dev: 'engineer' };

/** The nouns that make a title a hands-on technical role (after SYNONYMS: developer, programmer and dev are "engineer"). */
const CORE_NOUNS = new Set(['engineer', 'architect']);

const BLOCKLIST = ['intern', 'internship', 'unpaid', 'volunteer'];

const ROLE_SHARE = 0.6;

/** Lowercase words of a title, role or skill: split on anything but letters, digits, "+" and "#". */
export function words(text: string): string[] {
  let t = text.toLowerCase();
  for (const [pattern, joined] of PHRASES) t = t.replace(pattern, ` ${joined} `);
  return t
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w.length > 1)
    .map((w) => SYNONYMS[w] ?? w);
}

function titleMatches(title: string, roleWordLists: string[][], skills: string[]): boolean {
  const titleWords = new Set(words(title));

  // intern, unpaid and similar titles are turned away unless the user is looking for exactly that.
  for (const blocked of BLOCKLIST) {
    if (titleWords.has(blocked) && !roleWordLists.some((role) => role.includes(blocked))) return false;
  }

  const hasCoreNoun = [...titleWords].some((w) => CORE_NOUNS.has(w));
  const roleFits = roleWordLists.some((role) => {
    const found = role.filter((w) => titleWords.has(w)).length;
    return found === role.length || (hasCoreNoun && found / role.length >= ROLE_SHARE);
  });
  if (roleFits) return true;

  if (!hasCoreNoun) return false;
  return skills.some((skill) => {
    const skillWords = words(skill);
    return skillWords.length > 0 && skillWords.every((w) => titleWords.has(w));
  });
}

// Boards that only list remote work. Their location is the region the employer hires from.
const REMOTE_BOARDS = new Set<JobSource>(['remotive', 'remoteok', 'weworkremotely', 'himalayas']);
const OPEN_REGION = /worldwide|anywhere|global|africa|emea|nigeria|^remote$/i;
const SAYS_REMOTE = /remote|work from home|anywhere/i;

function locationMatches(job: MatchJob, preference: MatchProfile['location']): boolean {
  if (preference === null) return true;
  const place = job.location.trim();
  if (REMOTE_BOARDS.has(job.source)) {
    // Skip region-locked jobs (for example "USA Only") before spending AI calls.
    return place === '' || OPEN_REGION.test(place);
  }
  if (SAYS_REMOTE.test(`${job.title} ${job.location}`)) return true;
  if (preference === 'Remote') return OPEN_REGION.test(place);
  if (place === '') return true;
  return place.toLowerCase().includes(preference.toLowerCase());
}

/** Cheap, free check run before spending an AI call. Says why a job was turned away. */
export function prefilterJob(job: MatchJob, profile: MatchProfile): PrefilterResult {
  const roleWordLists = profile.desired_roles.map(words).filter((role) => role.length > 0);
  if (roleWordLists.length === 0) return { ok: false, reason: 'no_roles' };
  if (!titleMatches(job.title, roleWordLists, profile.skills ?? [])) return { ok: false, reason: 'title' };
  if (!locationMatches(job, profile.location)) return { ok: false, reason: 'location' };
  return { ok: true };
}

export function matchesProfile(job: MatchJob, profile: MatchProfile): boolean {
  return prefilterJob(job, profile).ok;
}
