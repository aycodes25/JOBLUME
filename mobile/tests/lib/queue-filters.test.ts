import { filterQueue, isHighMatch, matchesSearch, RECENT_MS } from '@/lib/queue-filters';
import { app } from '../fixtures';

const NOW = Date.parse('2026-10-19T12:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const apps = [
  app({ id: 'top', match_score: 96, created_at: daysAgo(10) }),
  app({ id: 'ninety', match_score: 90, created_at: daysAgo(1), job: { title: 'Frontend Engineer', company: 'Luminary AI', location: 'Remote', source: 'linkedin', url: 'https://x', company_domain: null } }),
  app({ id: 'mid', match_score: 79, created_at: daysAgo(2) }),
  app({ id: 'none', match_score: null, created_at: daysAgo(0.1) }),
];
const ids = (list: { id: string }[]) => list.map((a) => a.id);

describe('matchesSearch', () => {
  it('matches title, company, location and source label, ignoring case and spaces', () => {
    expect(matchesSearch(apps[1]!, '  frontend ')).toBe(true);
    expect(matchesSearch(apps[1]!, 'LUMINARY')).toBe(true);
    expect(matchesSearch(apps[1]!, 'remote')).toBe(true);
    expect(matchesSearch(apps[1]!, 'LinkedIn')).toBe(true);
    expect(matchesSearch(apps[1]!, 'acme')).toBe(false);
  });

  it('matches everything for a blank search and nothing searchable without a job', () => {
    expect(matchesSearch(app({ job: null }), '')).toBe(true);
    expect(matchesSearch(app({ job: null }), 'acme')).toBe(false);
  });
});

describe('filterQueue', () => {
  it('All keeps every application in the given order', () => {
    expect(ids(filterQueue(apps, { filter: 'all', search: '', now: NOW }))).toEqual(['top', 'ninety', 'mid', 'none']);
  });

  it('90%+ keeps scores of 90 and above only', () => {
    expect(ids(filterQueue(apps, { filter: 'high', search: '', now: NOW }))).toEqual(['top', 'ninety']);
    expect(isHighMatch({ match_score: 89 })).toBe(false);
  });

  it('Recent keeps the last 7 days, newest first', () => {
    expect(ids(filterQueue(apps, { filter: 'recent', search: '', now: NOW }))).toEqual(['none', 'ninety', 'mid']);
    const edge = app({ id: 'edge', created_at: new Date(NOW - RECENT_MS).toISOString() });
    expect(ids(filterQueue([edge, app({ id: 'bad', created_at: 'not a date' })], { filter: 'recent', search: '', now: NOW }))).toEqual(['edge']);
  });

  it('combines the search with the chip', () => {
    expect(ids(filterQueue(apps, { filter: 'high', search: 'acme', now: NOW }))).toEqual(['top']);
  });
});
