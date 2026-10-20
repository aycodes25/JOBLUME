import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../../src/lib/supabase.js';
import { createHeartbeat, WORKER_ALIVE_MS } from '../../src/services/scan/heartbeat.js';
import { createScanRunsRepo, KEEP_DAYS, type ScanRunInput } from '../../src/services/scan/runs.js';
import { createScanService } from '../../src/services/scan/service.js';

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

const NOW = new Date('2026-10-20T12:00:00.000Z');
const run = (over: Partial<ScanRunInput> = {}): ScanRunInput => ({
  source: 'myjobmag', started_at: '2026-10-20T11:00:00.000Z', finished_at: '2026-10-20T11:02:00.000Z', status: 'ok', error: null,
  listed: 35, new_count: 6, inserted: 6, rejected_title: 3, rejected_location: 1, ...over,
});

describe('createScanRunsRepo', () => {
  it('inserts the run, then deletes rows older than the keep window', async () => {
    const { db, calls } = fakeDb();
    await createScanRunsRepo(db, () => NOW).record(run());
    const cutoff = new Date(NOW.getTime() - KEEP_DAYS * 86_400_000).toISOString();
    expect(calls).toEqual([
      ['from', 'scan_runs'],
      ['insert', run()],
      ['from', 'scan_runs'],
      ['delete'],
      ['lt', 'started_at', cutoff],
    ]);
  });

  it('shortens a long error to 200 characters', async () => {
    const { db, calls } = fakeDb();
    await createScanRunsRepo(db, () => NOW).record(run({ status: 'failed', error: 'x'.repeat(500) }));
    expect((calls[1]![1] as ScanRunInput).error).toHaveLength(200);
  });

  it('throws when the insert fails, without trying to delete', async () => {
    const { db, calls } = fakeDb([{ error: { message: 'down' } }]);
    await expect(createScanRunsRepo(db, () => NOW).record(run())).rejects.toEqual({ message: 'down' });
    expect(calls.some((c) => c[0] === 'delete')).toBe(false);
  });

  it('does not fail when only the clean-up fails', async () => {
    const { db } = fakeDb([{}, { error: { message: 'delete failed' } }]);
    await expect(createScanRunsRepo(db, () => NOW).record(run())).resolves.toBeUndefined();
  });

  it('lists the newest run of each source', async () => {
    const rows = [
      run({ source: 'remoteok', started_at: '2026-10-20T11:30:00.000Z' }),
      run({ source: 'myjobmag', started_at: '2026-10-20T11:00:00.000Z' }),
      run({ source: 'remoteok', started_at: '2026-10-20T09:30:00.000Z' }),
      run({ source: 'myjobmag', started_at: '2026-10-20T09:00:00.000Z', status: 'failed', error: 'HTTP 403' }),
    ];
    const { db, calls } = fakeDb([{ data: rows }]);
    const latest = await createScanRunsRepo(db).latestPerSource();
    expect(latest.map((r) => [r.source, r.started_at])).toEqual([
      ['remoteok', '2026-10-20T11:30:00.000Z'],
      ['myjobmag', '2026-10-20T11:00:00.000Z'],
    ]);
    expect(calls).toEqual([
      ['from', 'scan_runs'],
      ['select', 'source, started_at, finished_at, status, error, listed, new_count, inserted, rejected_title, rejected_location'],
      ['order', 'started_at', { ascending: false }],
      ['limit', 200],
    ]);
  });

  it('returns an empty list before any scan, and throws a database error', async () => {
    expect(await createScanRunsRepo(fakeDb([{ data: [] }]).db).latestPerSource()).toEqual([]);
    await expect(createScanRunsRepo(fakeDb([{ error: { message: 'down' } }]).db).latestPerSource()).rejects.toEqual({ message: 'down' });
  });
});

describe('createHeartbeat', () => {
  function fakeRedis() {
    const store = new Map<string, string>();
    return {
      store,
      set: vi.fn(async (key: string, value: string, ..._rest: unknown[]) => (store.set(key, value), 'OK' as const)),
      get: vi.fn(async (key: string) => store.get(key) ?? null),
    };
  }

  it('beat() stores the time with an expiry; lastSeen() reads it back', async () => {
    const redis = fakeRedis();
    const heartbeat = createHeartbeat(redis as never, () => NOW);
    await heartbeat.beat();
    expect(redis.set).toHaveBeenCalledWith('worker:heartbeat', NOW.toISOString(), 'EX', 600);
    expect(await heartbeat.lastSeen()).toEqual(NOW);
  });

  it('lastSeen() is null when nothing was stored or the value is not a date', async () => {
    const redis = fakeRedis();
    const heartbeat = createHeartbeat(redis as never);
    expect(await heartbeat.lastSeen()).toBeNull();
    redis.store.set('worker:heartbeat', 'garbage');
    expect(await heartbeat.lastSeen()).toBeNull();
  });
});

describe('createScanService', () => {
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
  const make = (seen: Date | null, runs = [run()]) =>
    createScanService({
      runs: { latestPerSource: vi.fn<() => Promise<typeof runs>>().mockImplementation(async () => runs) },
      heartbeat: { lastSeen: vi.fn<() => Promise<Date | null>>().mockImplementation(async () => seen) },
      now: () => NOW,
    });

  it('reports the worker alive when it was seen within 5 minutes, with the runs', async () => {
    expect(WORKER_ALIVE_MS).toBe(5 * 60_000);
    expect(await make(minutesAgo(1)).status()).toEqual({ worker_alive: true, worker_last_seen: minutesAgo(1).toISOString(), runs: [run()] });
    expect((await make(minutesAgo(5)).status()).worker_alive).toBe(true);
  });

  it('reports the worker not alive when it was last seen over 5 minutes ago or never', async () => {
    expect((await make(minutesAgo(6)).status()).worker_alive).toBe(false);
    expect(await make(null, []).status()).toEqual({ worker_alive: false, worker_last_seen: null, runs: [] });
  });
});
