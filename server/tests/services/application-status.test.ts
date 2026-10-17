import { describe, expect, it } from 'vitest';
import { FOLLOW_UP_DAYS, planStatusChange, type StatusSnapshot } from '../../src/services/application-status.js';

const pending: StatusSnapshot = { status: 'pending_review', applied_at: null, follow_up_at: null, apply_method: null };
const applied: StatusSnapshot = {
  status: 'applied',
  applied_at: '2026-10-18T09:00:00.000Z',
  follow_up_at: '2026-10-21T09:00:00.000Z',
  apply_method: 'assisted',
};
const now = new Date('2026-10-20T10:00:00.000Z');

describe('planStatusChange', () => {
  it('uses a three day follow-up window', () => {
    expect(FOLLOW_UP_DAYS).toBe(3);
  });

  it('applied from pending stamps applied_at, follow_up_at (+3 days) and assisted', () => {
    expect(planStatusChange(pending, 'applied', now)).toEqual({
      status: 'applied',
      applied_at: '2026-10-20T10:00:00.000Z',
      follow_up_at: '2026-10-23T10:00:00.000Z',
      apply_method: 'assisted',
    });
  });

  it.each(['interviewing', 'rejected', 'offer'] as const)('%s without applied_at also stamps it', (next) => {
    expect(planStatusChange(pending, next, now)).toEqual({
      status: next,
      applied_at: '2026-10-20T10:00:00.000Z',
      follow_up_at: '2026-10-23T10:00:00.000Z',
      apply_method: 'assisted',
    });
  });

  it('keeps the original timestamps when moving between applied-family statuses', () => {
    expect(planStatusChange(applied, 'interviewing', now)).toEqual({ status: 'interviewing' });
    expect(planStatusChange(applied, 'applied', now)).toEqual({ status: 'applied' });
  });

  it('does not overwrite an existing apply_method', () => {
    const emailed: StatusSnapshot = { ...pending, apply_method: 'email' };
    expect(planStatusChange(emailed, 'applied', now)).toEqual({
      status: 'applied',
      applied_at: '2026-10-20T10:00:00.000Z',
      follow_up_at: '2026-10-23T10:00:00.000Z',
    });
  });

  it.each(['pending_review', 'approved', 'skipped'] as const)('%s clears the applied timestamps', (next) => {
    expect(planStatusChange(applied, next, now)).toEqual({ status: next, applied_at: null, follow_up_at: null });
  });

  it('approved and skipped from pending also write explicit nulls', () => {
    expect(planStatusChange(pending, 'approved', now)).toEqual({ status: 'approved', applied_at: null, follow_up_at: null });
  });
});
