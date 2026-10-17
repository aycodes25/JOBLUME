import type { KanbanColumn } from '@joblume/shared';

const SOURCES: Record<string, string> = {
  remotive: 'Remotive',
  myjobmag: 'MyJobMag',
  jobberman: 'Jobberman',
  linkedin: 'LinkedIn',
  indeed: 'Indeed',
};

export const sourceLabel = (source: string): string => SOURCES[source] ?? source;

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function formatShortDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : shortDate.format(date);
}

export const COLUMN_LABELS: Record<KanbanColumn, string> = {
  pending_review: 'Pending Review',
  applied: 'Applied',
  interviewing: 'Interviewing',
  rejected: 'Rejected',
  offer: 'Offer',
};
