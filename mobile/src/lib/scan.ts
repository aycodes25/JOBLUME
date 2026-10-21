import type { ScanRun, ScanStatus } from '@joblume/shared';
import { formatRelative } from './format';

const HTTP_TEXT: Array<[(n: number) => boolean, string]> = [
  [(n) => n === 429, 'The site asked us to slow down'],
  [(n) => n >= 500, 'The site had a problem'],
  [(n) => n === 401 || n === 403, 'The site refused the request'],
  [() => true, 'The site did not accept the request'],
];
const REASON_TEXT: Record<string, string> = {
  timeout: 'The site took too long',
  network: 'Could not reach the site',
  network_dns: "Could not find the site's address (DNS). Check your internet or DNS settings.",
  network_refused: 'The site refused the connection.',
  network_reset: 'The connection was cut off.',
  network_timeout: 'The connection timed out.',
  network_tls: 'Secure connection failed (check antivirus or proxy).',
  parse: 'The site sent something unreadable',
  db: 'Could not save the results',
  jsearch_auth: 'JSearch refused the API key',
  jsearch_rate_limited: 'JSearch rate limit reached',
  jsearch_timeout: 'JSearch took too long',
  jsearch_failed: 'JSearch could not be reached',
  jsearch_malformed: 'JSearch sent something unreadable',
};

/** A stored scan failure reason in plain words. Anything not recognised reads "Something went wrong". */
export function describeScanError(error: string | null): string {
  if (!error) return 'Something went wrong';
  const http = /^http_(\d{3})$/.exec(error);
  if (http) {
    const status = Number(http[1]);
    return `${HTTP_TEXT.find(([test]) => test(status))![1]} (${status})`;
  }
  const js = /^jsearch_http_(\d{3})$/.exec(error);
  if (js) {
    return js[1] === '404'
      ? 'JSearch says that request was not found. Check that your JSearch subscription is active and the key belongs to JSearch (see the checklist).'
      : `JSearch answered with an error (${js[1]}). See the checklist.`;
  }
  return Object.hasOwn(REASON_TEXT, error) ? REASON_TEXT[error]! : 'Something went wrong';
}

/** One line about one source's latest scan, without the source's name: "12 min ago · 35 listed · 6 new · 6 added · skipped 4 (3 by title, 1 by location)". */
export function describeScanRun(run: ScanRun, now: Date = new Date()): string {
  const when = formatRelative(run.finished_at, now) || 'time unknown';
  if (run.status === 'failed') return `${when} · failed: ${describeScanError(run.error)}`;
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
