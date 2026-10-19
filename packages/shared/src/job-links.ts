import type { LinkSource } from './job-sources.js';

export const MAX_JOB_LINK_LENGTH = 2048;

/** A LinkedIn or Indeed job page in its canonical form (tracking parameters removed). */
export interface JobLink {
  url: string;
  source: LinkSource;
}

const LINKEDIN_HOSTS = new Set(['linkedin.com', 'www.linkedin.com']);
// indeed.com or exactly one subdomain label (www, ng, uk, ...). `hostname` is already lower-cased
// and punycode-encoded by the URL parser, so only [a-z0-9-] labels can match.
const INDEED_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)?indeed\.com$/;

// /jobs/view/4012345678 or /jobs/view/data-analyst-at-acme-4012345678
const LINKEDIN_VIEW = /^\/jobs\/view\/(?:[^/]*-)?(\d{5,})\/?$/;
const LINKEDIN_JOBS = /^\/jobs(?:\/|$)/;
const LINKEDIN_ID = /^\d{5,}$/;

const INDEED_JOB_PATH = /^\/(?:m\/)?(?:viewjob|rc\/clk|jobs|q-[a-z0-9-]+-jobs\.html)\/?$/i;
const INDEED_KEY = /^[0-9a-f]{16}$/i;

function linkedIn(u: URL): JobLink | null {
  const view = LINKEDIN_VIEW.exec(u.pathname);
  const id = view?.[1] ?? (LINKEDIN_JOBS.test(u.pathname) ? u.searchParams.get('currentJobId') : null);
  if (!id || !LINKEDIN_ID.test(id)) return null;
  return { url: `https://www.linkedin.com/jobs/view/${id}/`, source: 'linkedin' };
}

function indeed(u: URL, host: string): JobLink | null {
  if (!INDEED_JOB_PATH.test(u.pathname)) return null;
  const key = u.searchParams.get('jk') ?? u.searchParams.get('vjk');
  if (!key || !INDEED_KEY.test(key)) return null;
  const canonicalHost = host === 'indeed.com' ? 'www.indeed.com' : host;
  return { url: `https://${canonicalHost}/viewjob?jk=${key.toLowerCase()}`, source: 'indeed' };
}

/** Returns the canonical job link for a LinkedIn or Indeed job page, or null for anything else. */
export function canonicalJobUrl(raw: unknown): JobLink | null {
  if (typeof raw !== 'string') return null;
  const input = raw.trim();
  if (input === '' || input.length > MAX_JOB_LINK_LENGTH) return null;
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.port !== '') return null;
  const host = u.hostname.toLowerCase();
  if (LINKEDIN_HOSTS.has(host)) return linkedIn(u);
  if (INDEED_HOST.test(host)) return indeed(u, host);
  return null;
}
