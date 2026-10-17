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

export function dedupeKey(company: string, title: string): string {
  const c = clean(company)
    .split(' ')
    .filter((w) => w && !COMPANY_SUFFIXES.has(w))
    .join(' ');
  return `${c}|${clean(title)}`;
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
