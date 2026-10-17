import { APPLICATION_STATUSES, type ApplicationStatus, type KanbanColumn } from '@joblume/shared';

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

export const formatPercent = (rate: number): string => `${Math.round(rate * 100)}%`;

export const formatScore = (avg: number | null): string => {
  if (avg === null) return '–';
  return Number.isInteger(avg) ? String(avg) : avg.toFixed(1);
};

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending_review: 'Pending Review',
  approved: 'Ready to apply',
  applied: 'Applied',
  interviewing: 'Interviewing',
  rejected: 'Rejected',
  offer: 'Offer',
  skipped: 'Skipped',
};

export function statusSegments(byStatus: Record<ApplicationStatus, number>) {
  const total = APPLICATION_STATUSES.reduce((sum, s) => sum + byStatus[s], 0);
  if (total === 0) return [];
  return APPLICATION_STATUSES.filter((s) => byStatus[s] > 0).map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: byStatus[status],
    pct: (byStatus[status] / total) * 100,
  }));
}
