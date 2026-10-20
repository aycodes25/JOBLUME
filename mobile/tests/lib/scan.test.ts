import type { ScanRun } from '@joblume/shared';
import { describeScanRun, describeWorker } from '@/lib/scan';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const run = (over: Partial<ScanRun> = {}): ScanRun => ({
  source: 'myjobmag', started_at: '2026-10-20T11:46:00.000Z', finished_at: '2026-10-20T11:48:00.000Z', status: 'ok', error: null,
  listed: 35, new_count: 6, inserted: 6, rejected_title: 3, rejected_location: 1, ...over,
});

describe('describeScanRun', () => {
  it('lists what the scan found, added and skipped, by reason', () => {
    expect(describeScanRun(run(), NOW)).toBe('12 min ago · 35 listed · 6 new · 6 added · skipped 4 (3 by title, 1 by location)');
  });

  it('leaves out the skipped part when nothing was skipped', () => {
    expect(describeScanRun(run({ rejected_title: 0, rejected_location: 0 }), NOW)).toBe('12 min ago · 35 listed · 6 new · 6 added');
  });

  it('says why a scan failed', () => {
    expect(describeScanRun(run({ status: 'failed', error: 'HTTP 403' }), NOW)).toBe('12 min ago · failed: HTTP 403');
    expect(describeScanRun(run({ status: 'failed', error: null }), NOW)).toBe('12 min ago · failed: unknown error');
  });

  it('copes with a time it cannot read', () => {
    expect(describeScanRun(run({ finished_at: 'garbage' }), NOW)).toMatch(/^time unknown · 35 listed/);
  });
});

describe('describeWorker', () => {
  it('says the worker is running', () => {
    expect(describeWorker({ worker_alive: true, worker_last_seen: '2026-10-20T11:59:00.000Z' }, NOW)).toBe('Worker running');
  });

  it('says it is not running, with when it was last seen if known', () => {
    expect(describeWorker({ worker_alive: false, worker_last_seen: '2026-10-20T10:00:00.000Z' }, NOW)).toBe(
      'Worker not running (last seen 2 hours ago). New jobs are not being checked until it is started.',
    );
    expect(describeWorker({ worker_alive: false, worker_last_seen: null }, NOW)).toBe(
      'Worker not running. New jobs are not being checked until it is started.',
    );
  });
});
