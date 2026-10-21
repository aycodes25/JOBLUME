import { describe, expect, it } from 'vitest';
import type { Db } from '../../src/lib/supabase.js';
import { createAlertRepo } from '../../src/services/alerts/repo.js';

type Result = { data?: unknown; error?: unknown };

/** A Supabase stand-in: records every chained call; each awaited query takes the next queued result. */
function fakeDb(results: Result[] = []) {
  const calls: unknown[][] = [];
  const chain: object = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') {
        const next = results.shift() ?? {};
        return (resolve: (v: unknown) => void) => resolve({ data: next.data ?? null, error: next.error ?? null });
      }
      return (...args: unknown[]) => {
        calls.push([String(prop), ...args]);
        return chain;
      };
    },
  });
  return { db: { from: (table: string) => (calls.push(['from', table]), chain) } as unknown as Db, calls };
}

const SINCE = new Date('2026-10-19T12:00:00.000Z');

describe('createAlertRepo', () => {
  it('lists only the users who turned the digest on, with their thresholds', async () => {
    const { db, calls } = fakeDb([{ data: [{ user_id: 'u1', auto_threshold: 80 }] }]);
    expect(await createAlertRepo(db).loadSubscribers()).toEqual([{ user_id: 'u1', auto_threshold: 80 }]);
    expect(calls).toEqual([['from', 'profiles'], ['select', 'user_id, auto_threshold'], ['eq', 'notify_new_matches', true]]);
  });

  it('reads one user\'s new pending matches at or above the score, best first, and never selects CV or letter text', async () => {
    const rows = [{ id: 'a1', match_score: 92, job: { title: 'Backend Engineer', company: 'Acme' } }, { id: 'a2', match_score: 85, job: null }];
    const { db, calls } = fakeDb([{ data: rows }]);
    const matches = await createAlertRepo(db).loadNewMatches('u1', 80, SINCE);
    expect(matches).toEqual([
      { id: 'a1', title: 'Backend Engineer', company: 'Acme', match_score: 92 },
      { id: 'a2', title: 'Untitled role', company: 'Unknown company', match_score: 85 },
    ]);
    expect(calls).toEqual([
      ['from', 'applications'],
      ['select', 'id, match_score, job:jobs(title, company)'],
      ['eq', 'user_id', 'u1'],
      ['eq', 'status', 'pending_review'],
      ['is', 'notified_at', null],
      ['gte', 'match_score', 80],
      ['gte', 'created_at', SINCE.toISOString()],
      ['order', 'match_score', { ascending: false }],
      ['limit', 50],
    ]);
    const select = String(calls[1]![1]);
    expect(select).not.toMatch(/cv|letter|tailored/i);
  });

  it('marks the given applications as notified', async () => {
    const { db, calls } = fakeDb();
    await createAlertRepo(db).markNotified(['a1', 'a2'], SINCE);
    expect(calls).toEqual([['from', 'applications'], ['update', { notified_at: SINCE.toISOString() }], ['in', 'id', ['a1', 'a2']]]);
  });

  it('does nothing for an empty list, and throws database errors', async () => {
    const empty = fakeDb();
    await createAlertRepo(empty.db).markNotified([], SINCE);
    expect(empty.calls).toEqual([]);
    await expect(createAlertRepo(fakeDb([{ error: { message: 'down' } }]).db).loadSubscribers()).rejects.toEqual({ message: 'down' });
    await expect(createAlertRepo(fakeDb([{ error: { message: 'down' } }]).db).loadNewMatches('u1', 80, SINCE)).rejects.toEqual({ message: 'down' });
    await expect(createAlertRepo(fakeDb([{ error: { message: 'down' } }]).db).markNotified(['a1'], SINCE)).rejects.toEqual({ message: 'down' });
  });
});
