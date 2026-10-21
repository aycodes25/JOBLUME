import { dedupeKey, type NormalisedJob } from '../../domain/jobs.js';
import type { Db } from '../../lib/supabase.js';

const URL_CHUNK = 50; // keeps the PostgREST query string short

export async function findSeenUrls(db: Db, urls: string[]): Promise<Set<string>> {
  const seen = new Set<string>();
  for (let i = 0; i < urls.length; i += URL_CHUNK) {
    const chunk = urls.slice(i, i + URL_CHUNK);
    const { data, error } = await db.from('jobs').select('url').in('url', chunk);
    if (error) throw error;
    for (const row of data ?? []) seen.add((row as { url: string }).url);
  }
  return seen;
}

/** Inserts new jobs; rows whose dedupe_key already exists are skipped. Returns ids of rows actually inserted. */
export async function insertJobs(db: Db, jobs: NormalisedJob[]): Promise<string[]> {
  if (jobs.length === 0) return [];
  const rows = jobs.map((j) => ({
    title: j.title,
    company: j.company,
    location: j.location,
    description: j.description,
    source: j.source,
    url: j.url,
    company_domain: j.companyDomain,
    dedupe_key: dedupeKey(j.company, j.title),
    posted_at: j.postedAt ?? null,
  }));
  const { data, error } = await db
    .from('jobs')
    .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    .select('id');
  if (error) throw error;
  return (data ?? []).map((r) => (r as { id: string }).id);
}

export async function findJobIdByUrl(db: Db, url: string): Promise<string | null> {
  const { data, error } = await db.from('jobs').select('id').eq('url', url).limit(1).maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

/** Inserts one job and returns its id; when the same company and title is already stored, returns that job's id. */
export async function saveJob(db: Db, job: NormalisedJob): Promise<string> {
  const [id] = await insertJobs(db, [job]);
  if (id) return id;
  const { data, error } = await db.from('jobs').select('id').eq('dedupe_key', dedupeKey(job.company, job.title)).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('job insert was skipped but no matching job was found');
  return (data as { id: string }).id;
}
