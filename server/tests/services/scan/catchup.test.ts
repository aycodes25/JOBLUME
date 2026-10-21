import { describe, expect, it, vi } from 'vitest';
import { catchUpJobId, runCatchUp, sourcesNeedingCatchUp } from '../../../src/services/scan/catchup.js';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 21, 12, 30);
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const intervals = { remotive: 6 * HOUR, remoteok: 2 * HOUR, jsearch: 24 * HOUR };

describe('sourcesNeedingCatchUp', () => {
  it('picks sources with no run, or a run older than their interval', () => {
    const latest = { remotive: { started_at: iso(7 * HOUR) }, remoteok: { started_at: iso(1 * HOUR) } };
    expect(sourcesNeedingCatchUp(latest, NOW, intervals, ['remotive', 'remoteok', 'jsearch'])).toEqual(['remotive', 'jsearch']);
  });

  it('leaves out a source whose run is newer than its interval', () => {
    const latest = { remotive: { started_at: iso(5 * HOUR) }, remoteok: { started_at: iso(HOUR) }, jsearch: { started_at: iso(23 * HOUR) } };
    expect(sourcesNeedingCatchUp(latest, NOW, intervals, ['remotive', 'remoteok', 'jsearch'])).toEqual([]);
  });

  it('only considers enabled sources (JSearch without a key is simply not passed in)', () => {
    expect(sourcesNeedingCatchUp({}, NOW, intervals, ['remotive', 'remoteok'])).toEqual(['remotive', 'remoteok']);
  });

  it('treats an unreadable date as missing', () => {
    expect(sourcesNeedingCatchUp({ remotive: { started_at: 'nope' } }, NOW, intervals, ['remotive'])).toEqual(['remotive']);
  });

  describe('a failed latest run', () => {
    const MIN = 60_000;
    const failed = (finishedMsAgo: number, error: string | null = 'network') => ({
      started_at: iso(finishedMsAgo + 5_000), finished_at: iso(finishedMsAgo), status: 'failed', error,
    });
    const ok = (startedMsAgo: number) => ({ started_at: iso(startedMsAgo), finished_at: iso(startedMsAgo - 5_000), status: 'ok', error: null });
    const cases: Array<[string, Record<string, object>, string[]]> = [
      ['failed and finished over 10 minutes ago -> catch up', { jsearch: failed(2 * HOUR) }, ['jsearch']],
      ['failed and finished exactly 10 minutes ago -> catch up', { jsearch: failed(10 * MIN) }, ['jsearch']],
      ['failed less than 10 minutes ago -> wait', { jsearch: failed(9 * MIN) }, []],
      ['failed with the auth reason -> wait for the interval', { jsearch: failed(2 * HOUR, 'jsearch_auth') }, []],
      ['failed with an http 401 -> wait for the interval', { jsearch: failed(2 * HOUR, 'http_401') }, []],
      ['failed with an http 403 -> wait for the interval', { jsearch: failed(2 * HOUR, 'http_403') }, []],
      ['failed auth reason and older than the interval -> catch up', { jsearch: failed(25 * HOUR, 'jsearch_auth') }, ['jsearch']],
      ['failed with a network reason -> catch up', { jsearch: failed(HOUR, 'network_dns') }, ['jsearch']],
      ['failed with no readable finish time -> wait for the interval', { jsearch: { started_at: iso(2 * HOUR), finished_at: 'nope', status: 'failed', error: 'network' } }, []],
      ['ok and recent -> no', { jsearch: ok(2 * HOUR) }, []],
      ['ok and stale -> yes', { jsearch: ok(25 * HOUR) }, ['jsearch']],
    ];
    it.each(cases)('%s', (_name, latest, expected) => {
      expect(sourcesNeedingCatchUp(latest as never, NOW, intervals, ['jsearch'])).toEqual(expected);
    });
  });
});

describe('catchUpJobId', () => {
  it('is stable within an hour and has no colon', () => {
    expect(catchUpJobId('remotive', NOW)).toBe(catchUpJobId('remotive', NOW + 10 * 60_000));
    expect(catchUpJobId('remotive', NOW)).not.toBe(catchUpJobId('remotive', NOW + HOUR));
    expect(catchUpJobId('remotive', NOW)).toMatch(/^catchup-remotive-\d+$/);
  });
});

describe('runCatchUp', () => {
  const log = () => ({ info: vi.fn(), warn: vi.fn() });

  it('enqueues one job per stale source with a deterministic id', async () => {
    const enqueue = vi.fn<(source: string, jobId: string) => Promise<void>>().mockResolvedValue(undefined);
    const result = await runCatchUp({
      readLatest: async () => ({ remoteok: { started_at: iso(HOUR) } }),
      enqueue, sources: ['remotive', 'remoteok'], intervals, nowMs: NOW, log: log(),
    });
    expect(result).toEqual(['remotive']);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith('remotive', catchUpJobId('remotive', NOW));
  });

  it('logs and skips when scan_runs cannot be read, never throwing', async () => {
    const enqueue = vi.fn<(source: string, jobId: string) => Promise<void>>();
    const l = log();
    const result = await runCatchUp({
      readLatest: async () => { throw new Error('db down'); },
      enqueue, sources: ['remotive'], intervals, nowMs: NOW, log: l,
    });
    expect(result).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
    expect(l.warn).toHaveBeenCalled();
  });

  it('keeps going when one enqueue fails', async () => {
    const enqueue = vi.fn<(source: string, jobId: string) => Promise<void>>().mockRejectedValueOnce(new Error('redis')).mockResolvedValue(undefined);
    const result = await runCatchUp({
      readLatest: async () => ({}), enqueue, sources: ['remotive', 'remoteok'], intervals, nowMs: NOW, log: log(),
    });
    expect(result).toEqual(['remoteok']);
  });

  describe('when the schedule is already due soon', () => {
    const MIN = 60_000;
    it('skips a source whose scheduled run is due now or within 5 minutes', async () => {
      const enqueue = vi.fn<(source: string, jobId: string) => Promise<void>>().mockResolvedValue(undefined);
      const next: Record<string, number> = { remotive: NOW - MIN, remoteok: NOW + 4 * MIN, jsearch: NOW + 30 * MIN };
      const result = await runCatchUp({
        readLatest: async () => ({}), readNextRunMs: async (s) => next[s] ?? null,
        enqueue, sources: ['remotive', 'remoteok', 'jsearch'], intervals, nowMs: NOW, log: log(),
      });
      expect(result).toEqual(['jsearch']);
      expect(enqueue).toHaveBeenCalledTimes(1);
    });

    it('falls back to the old behaviour when there is no scheduler info', async () => {
      const enqueue = vi.fn<(source: string, jobId: string) => Promise<void>>().mockResolvedValue(undefined);
      const result = await runCatchUp({
        readLatest: async () => ({}), readNextRunMs: async () => null,
        enqueue, sources: ['remotive', 'remoteok'], intervals, nowMs: NOW, log: log(),
      });
      expect(result).toEqual(['remotive', 'remoteok']);
    });

    it('falls back to the old behaviour when reading the scheduler throws', async () => {
      const enqueue = vi.fn<(source: string, jobId: string) => Promise<void>>().mockResolvedValue(undefined);
      const result = await runCatchUp({
        readLatest: async () => ({}), readNextRunMs: async () => { throw new Error('redis'); },
        enqueue, sources: ['remotive'], intervals, nowMs: NOW, log: log(),
      });
      expect(result).toEqual(['remotive']);
    });
  });
});
