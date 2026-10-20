import type { ScanRun, ScanStatus } from '@joblume/shared';
import { formatRelative } from './format';

/** One line about one source's latest scan, without the source's name: "12 min ago · 35 listed · 6 new · 6 added · skipped 4 (3 by title, 1 by location)". */
export function describeScanRun(run: ScanRun, now: Date = new Date()): string {
  const when = formatRelative(run.finished_at, now) || 'time unknown';
  if (run.status === 'failed') return `${when} · failed: ${run.error ?? 'unknown error'}`;
  const parts = [when, `${run.listed} listed`, `${run.new_count} new`, `${run.inserted} added`];
  const skipped = run.rejected_title + run.rejected_location;
  if (skipped > 0) parts.push(`skipped ${skipped} (${run.rejected_title} by title, ${run.rejected_location} by location)`);
  return parts.join(' · ');
}

/** Whether the background worker is running, in plain words. */
export function describeWorker(status: Pick<ScanStatus, 'worker_alive' | 'worker_last_seen'>, now: Date = new Date()): string {
  if (status.worker_alive) return 'Worker running';
  const seen = formatRelative(status.worker_last_seen, now);
  return seen
    ? `Worker not running (last seen ${seen}). New jobs are not being checked until it is started.`
    : 'Worker not running. New jobs are not being checked until it is started.';
}
