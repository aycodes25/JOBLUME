import { HttpError } from '../../lib/http.js';
import { JSearchError } from '../../scrapers/jsearch-client.js';
import type { ScanRun } from '@joblume/shared';
import type { Db } from '../../lib/supabase.js';

/** One finished scan of one source, as the worker records it. Counts are over the jobs found NEW in that scan. */
export interface ScanRunInput {
  source: string;
  started_at: string;
  finished_at: string;
  status: 'ok' | 'failed';
  error: string | null;
  listed: number;
  new_count: number;
  inserted: number;
  rejected_title: number;
  rejected_location: number;
}

export interface ScanRunsRepo {
  record(run: ScanRunInput): Promise<void>;
  /** The most recent run of each source, newest first. */
  latestPerSource(): Promise<ScanRun[]>;
}

const COLUMNS = 'source, started_at, finished_at, status, error, listed, new_count, inserted, rejected_title, rejected_location';
/** Old rows are deleted as new ones arrive, so the table stays small. */
export const KEEP_DAYS = 14;
/** Enough recent rows to contain every source at least once, even when one source runs far more often. */
const READ_LIMIT = 200;
const MAX_ERROR_LENGTH = 200;

/** scan_runs is server-write-only: this service-role repo is its only writer and reader. */
export function createScanRunsRepo(db: Db, now: () => Date = () => new Date()): ScanRunsRepo {
  return {
    async record(run) {
      const row = { ...run, error: run.error === null ? null : run.error.slice(0, MAX_ERROR_LENGTH) };
      const { error } = await db.from('scan_runs').insert(row);
      if (error) throw error;
      // Best effort: failing to tidy up must never turn a recorded scan into a failure.
      const cutoff = new Date(now().getTime() - KEEP_DAYS * 86_400_000).toISOString();
      await db.from('scan_runs').delete().lt('started_at', cutoff);
    },
    async latestPerSource() {
      const { data, error } = await db.from('scan_runs').select(COLUMNS).order('started_at', { ascending: false }).limit(READ_LIMIT);
      if (error) throw error;
      const seen = new Set<string>();
      const latest: ScanRun[] = [];
      for (const row of (data ?? []) as ScanRun[]) {
        if (seen.has(row.source)) continue;
        seen.add(row.source);
        latest.push(row);
      }
      return latest;
    },
  };
}

/**
 * A fixed, safe reason for a failed scan. Every signed-in user can read scan_runs.error, and a raw error message can hold
 * another user's role (in a search URL) or database details, so only these reasons are stored; the full error goes to the log.
 */
export function scanFailureReason(err: unknown): string {
  if (err instanceof HttpError) return `http_${err.status}`;
  if (err instanceof JSearchError) return `jsearch_${err.kind}`;
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'timeout';
    if (err instanceof SyntaxError) return 'parse';
    if (err instanceof TypeError) return 'network';
    return 'unknown';
  }
  // Supabase errors are plain objects with a Postgres code.
  if (typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string') return 'db';
  return 'unknown';
}
