import { describe, expect, it } from 'vitest';
import { normaliseJob, parsePostedAt } from '../../src/domain/jobs.js';

const NOW = new Date('2026-10-20T12:00:00.000Z');

describe('parsePostedAt', () => {
  it('reads epoch seconds and epoch milliseconds', () => {
    expect(parsePostedAt(1792425604, NOW)).toBe('2026-10-19T16:00:04.000Z');
    expect(parsePostedAt(1792425604000, NOW)).toBe('2026-10-19T16:00:04.000Z');
  });

  it('reads ISO strings with a zone, converting to UTC', () => {
    expect(parsePostedAt('2026-10-19T16:00:04+00:00', NOW)).toBe('2026-10-19T16:00:04.000Z');
    expect(parsePostedAt('2026-10-17T09:04:44+01:00', NOW)).toBe('2026-10-17T08:04:44.000Z');
    expect(parsePostedAt('2026-10-16T00:00:00.000000Z', NOW)).toBe('2026-10-16T00:00:00.000Z');
  });

  it('reads an ISO string with no zone as UTC (Remotive sends it that way)', () => {
    expect(parsePostedAt('2026-10-14T20:33:44', NOW)).toBe('2026-10-14T20:33:44.000Z');
  });

  it('reads an RFC 822 date (RSS pubDate)', () => {
    expect(parsePostedAt('Tue, 20 Oct 2026 18:10:55 +0000', new Date('2026-10-20T19:00:00Z'))).toBe('2026-10-20T18:10:55.000Z');
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['an empty string', '  '],
    ['text', 'yesterday'],
    ['NaN', Number.NaN],
    ['a date before 2000', '1999-12-31T00:00:00Z'],
    ['a date more than a day ahead', '2026-10-22T12:00:00Z'],
    ['an object', {}],
  ])('returns null for %s', (_name, value) => {
    expect(parsePostedAt(value, NOW)).toBeNull();
  });

  it('allows a little clock difference (up to a day ahead)', () => {
    expect(parsePostedAt('2026-10-21T10:00:00Z', NOW)).toBe('2026-10-21T10:00:00.000Z');
  });
});

describe('normaliseJob postedAt', () => {
  const base = {
    title: 'Data Analyst', company: 'Acme', location: 'Lagos', description: 'Do things.',
    source: 'remoteok' as const, url: 'https://remoteok.com/remote-jobs/1',
  };

  it('keeps a readable posted time as an ISO string', () => {
    expect(normaliseJob({ ...base, postedAt: '2026-10-19T16:00:04+00:00' })?.postedAt).toBe('2026-10-19T16:00:04.000Z');
  });

  it('leaves postedAt out when the time is missing or unreadable', () => {
    expect(normaliseJob(base)).not.toHaveProperty('postedAt');
    expect(normaliseJob({ ...base, postedAt: 'soon' })).not.toHaveProperty('postedAt');
  });
});
