import type { ApplicationStatus } from '@joblume/shared';

export interface StatusSnapshot {
  status: ApplicationStatus;
  applied_at: string | null;
  follow_up_at: string | null;
  apply_method: 'email' | 'assisted' | 'auto' | null;
}

export const FOLLOW_UP_DAYS = 3;

const APPLIED_FAMILY = new Set<ApplicationStatus>(['applied', 'interviewing', 'rejected', 'offer']);

/** Returns the column changes for moving an application to `next`. Pure: no I/O. */
export function planStatusChange(existing: StatusSnapshot, next: ApplicationStatus, now: Date): Record<string, unknown> {
  const changes: Record<string, unknown> = { status: next };
  if (APPLIED_FAMILY.has(next)) {
    if (existing.applied_at === null) {
      changes.applied_at = now.toISOString();
      changes.follow_up_at = new Date(now.getTime() + FOLLOW_UP_DAYS * 86_400_000).toISOString();
      if (existing.apply_method === null) changes.apply_method = 'assisted';
    }
  } else {
    changes.applied_at = null;
    changes.follow_up_at = null;
  }
  return changes;
}
