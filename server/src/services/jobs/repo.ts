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
  }));
  const { data, error } = await db
    .from('jobs')
    .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    .select('id');
  if (error) throw error;
  return (data ?? []).map((r) => (r as { id: string }).id);
}
