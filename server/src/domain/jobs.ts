import { safeHttpUrl } from '@joblume/shared';
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

/** Normalised company name (lowercase, punctuation and legal suffixes removed): the cache key for company lookups. */
export function companyKey(company: string): string {
  return clean(company)
    .split(' ')
    .filter((w) => w && !COMPANY_SUFFIXES.has(w))
    .join(' ');
}

export function dedupeKey(company: string, title: string): string {
  return `${companyKey(company)}|${clean(title)}`;
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

export const JOB_FIELD_LIMITS = { title: 300, company: 200, location: 200, description: 50_000 } as const;

const oneLine = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

const tidyText = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, max)
    : '';

/** Validates and tidies a job from an outside source. Returns null when the title, company, description or link is unusable. */
export function normaliseJob(input: {
  title?: unknown;
  company?: unknown;
  location?: unknown;
  description?: unknown;
  source: JobSource;
  url: string;
  companyDomain?: string | null;
}): NormalisedJob | null {
  const title = oneLine(input.title, JOB_FIELD_LIMITS.title);
  const company = oneLine(input.company, JOB_FIELD_LIMITS.company);
  const location = oneLine(input.location, JOB_FIELD_LIMITS.location);
  const description = tidyText(input.description, JOB_FIELD_LIMITS.description);
  if (!title || !company || !description || !safeHttpUrl(input.url)) return null;
  return { title, company, location, description, source: input.source, url: input.url, companyDomain: input.companyDomain ?? null };
}

const COUNTRY_NAMES: Record<string, string> = { NG: 'Nigeria' };

/** "Lagos, Lagos, NG" becomes "Lagos, Nigeria": blanks and repeats dropped, country codes named. */
export function tidyLocation(parts: unknown[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (typeof part !== 'string') continue;
    const clean = part.replace(/\s+/g, ' ').trim();
    const named = COUNTRY_NAMES[clean] ?? clean;
    if (!named || seen.has(named.toLowerCase())) continue;
    seen.add(named.toLowerCase());
    out.push(named);
  }
  return out.join(', ');
}

// Job-board hosts are never the employer's own domain.
const PORTAL_HOSTS = ['linkedin.com', 'indeed.com'];

/** The employer's domain from its website link (without "www."), or null for a missing, invalid or job-board link. */
export function domainFromWebsite(raw: unknown): string | null {
  const url = safeHttpUrl(raw);
  if (!url) return null;
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  if (!host.includes('.') || PORTAL_HOSTS.some((p) => host === p || host.endsWith(`.${p}`))) return null;
  return host;
}
