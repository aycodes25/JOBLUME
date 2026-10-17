export const APPLICATION_STATUSES = [
  'pending_review',
  'approved',
  'applied',
  'interviewing',
  'rejected',
  'offer',
  'skipped',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const KANBAN_COLUMNS = ['pending_review', 'applied', 'interviewing', 'rejected', 'offer'] as const;
export type KanbanColumn = (typeof KANBAN_COLUMNS)[number];

export const isApplicationStatus = (v: unknown): v is ApplicationStatus =>
  typeof v === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(v);

/** The board column a status is shown in, or null when it is not on the board (skipped). */
export function columnForStatus(status: ApplicationStatus): KanbanColumn | null {
  if (status === 'approved') return 'pending_review';
  if (status === 'skipped') return null;
  return status;
}
