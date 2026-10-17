import { describe, expect, it } from 'vitest';
import { COLUMN_LABELS, formatShortDate, sourceLabel } from '@/lib/format';

describe('sourceLabel', () => {
  it('names the known sources and falls back to the raw value', () => {
    expect(sourceLabel('remotive')).toBe('Remotive');
    expect(sourceLabel('myjobmag')).toBe('MyJobMag');
    expect(sourceLabel('jobberman')).toBe('Jobberman');
    expect(sourceLabel('linkedin')).toBe('LinkedIn');
    expect(sourceLabel('indeed')).toBe('Indeed');
    expect(sourceLabel('somewhere')).toBe('somewhere');
  });
});

describe('formatShortDate', () => {
  it('formats a UTC date as day and short month', () => {
    expect(formatShortDate('2026-10-20T10:00:00.000Z')).toBe('20 Oct');
  });
  it('returns an empty string for null or an invalid date', () => {
    expect(formatShortDate(null)).toBe('');
    expect(formatShortDate('not a date')).toBe('');
  });
});

describe('COLUMN_LABELS', () => {
  it('labels the five board columns in the spec wording', () => {
    expect(COLUMN_LABELS).toEqual({
      pending_review: 'Pending Review', applied: 'Applied', interviewing: 'Interviewing', rejected: 'Rejected', offer: 'Offer',
    });
  });
});
