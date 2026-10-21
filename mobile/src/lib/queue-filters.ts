import type { Application } from '@joblume/shared';
import { applyMethod } from './applications';
import { sourceLabel } from './format';

/** The queue's filter chips (mobile home mockup): All, 90%+ and Recent. */
export type QueueFilter = 'all' | 'high' | 'recent' | 'email';

export const QUEUE_FILTERS: readonly { value: QueueFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'high', label: '90%+' },
  { value: 'recent', label: 'Recent' },
  { value: 'email', label: 'Has email' },
];

export const HIGH_MATCH = 90;
/** "Recent" means prepared in the last 7 days. */
export const RECENT_MS = 7 * 86_400_000;

/** Case-insensitive match on the job title, company, location or source; a blank search matches everything. */
export function matchesSearch(app: Application, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (q === '') return true;
  const job = app.job;
  if (!job) return false;
  return [job.title, job.company, job.location, sourceLabel(job.source)].some((field) => field.toLowerCase().includes(q));
}

export const isHighMatch = (app: { match_score: number | null }): boolean => app.match_score !== null && app.match_score >= HIGH_MATCH;

/** Applies the search and the chip. Keeps the given order (best match first), except Recent which shows the newest first. */
export function filterQueue(apps: Application[], opts: { filter: QueueFilter; search: string; now?: number }): Application[] {
  const now = opts.now ?? Date.now();
  const searched = apps.filter((a) => matchesSearch(a, opts.search));
  if (opts.filter === 'high') return searched.filter(isHighMatch);
  if (opts.filter === 'email') return searched.filter((a) => applyMethod(a) === 'email');
  if (opts.filter === 'recent') {
    return searched
      .filter((a) => {
        const created = Date.parse(a.created_at);
        return !Number.isNaN(created) && now - created <= RECENT_MS;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return searched;
}
