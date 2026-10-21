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
});
