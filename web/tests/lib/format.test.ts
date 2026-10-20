import { describe, expect, it } from 'vitest';
import { COLUMN_LABELS, formatShortDate, sourceLabel } from '@/lib/format';

describe('sourceLabel', () => {
  it('names the known sources and falls back to the raw value', () => {
    expect(sourceLabel('remotive')).toBe('Remotive');
    expect(sourceLabel('myjobmag')).toBe('MyJobMag');
    expect(sourceLabel('jobberman')).toBe('Jobberman');
    expect(sourceLabel('linkedin')).toBe('LinkedIn');
    expect(sourceLabel('indeed')).toBe('Indeed');
    expect(sourceLabel('remoteok')).toBe('RemoteOK');
    expect(sourceLabel('weworkremotely')).toBe('We Work Remotely');
    expect(sourceLabel('himalayas')).toBe('Himalayas');
    expect(sourceLabel('arbeitnow')).toBe('Arbeitnow');
    expect(sourceLabel('jsearch')).toBe('JSearch (LinkedIn, Indeed)');
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

import { formatRelative } from '@/lib/format';

describe('formatRelative', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');
  it('describes minutes, hours, days and weeks', () => {
    expect(formatRelative('2026-10-10T11:59:50.000Z', now)).toBe('just now');
    expect(formatRelative('2026-10-10T11:30:00.000Z', now)).toBe('30 min ago');
    expect(formatRelative('2026-10-10T11:00:00.000Z', now)).toBe('1 hour ago');
    expect(formatRelative('2026-10-10T07:00:00.000Z', now)).toBe('5 hours ago');
    expect(formatRelative('2026-10-08T12:00:00.000Z', now)).toBe('2 days ago');
    expect(formatRelative('2026-09-26T12:00:00.000Z', now)).toBe('2 weeks ago');
  });
  it('returns an empty string for missing or invalid input', () => {
    expect(formatRelative(null, now)).toBe('');
    expect(formatRelative('nope', now)).toBe('');
  });
});
