import { describe, expect, it } from 'vitest';
import { formatPercent, formatScore, statusSegments, STATUS_LABELS } from '@/lib/format';

const zero = { pending_review: 0, approved: 0, applied: 0, interviewing: 0, rejected: 0, offer: 0, skipped: 0 };

describe('formatPercent', () => {
  it('rounds a rate to a whole percent', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(1 / 3)).toBe('33%');
    expect(formatPercent(0.666)).toBe('67%');
    expect(formatPercent(1)).toBe('100%');
  });
});

describe('formatScore', () => {
  it('shows a dash for no score, integers plainly and decimals to one place', () => {
    expect(formatScore(null)).toBe('–');
    expect(formatScore(72)).toBe('72');
    expect(formatScore(70.5)).toBe('70.5');
  });
});

describe('statusSegments', () => {
  it('returns nothing when there are no applications', () => {
    expect(statusSegments(zero)).toEqual([]);
  });

  it('omits zero counts and gives percentages that sum to 100', () => {
    const segments = statusSegments({ ...zero, pending_review: 1, applied: 3 });
    expect(segments).toEqual([
      { status: 'pending_review', label: 'Pending Review', count: 1, pct: 25 },
      { status: 'applied', label: 'Applied', count: 3, pct: 75 },
    ]);
  });

  it('has a label for every status', () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual(['applied', 'approved', 'interviewing', 'offer', 'pending_review', 'rejected', 'skipped']);
    expect(STATUS_LABELS.approved).toBe('Ready to apply');
  });
});
