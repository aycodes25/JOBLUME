import type { ScanRun } from '@joblume/shared';
import { describe, expect, it } from 'vitest';
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

  it('says why a scan failed, in plain language', () => {
    const failed = (error: string | null) => describeScanRun(run({ status: 'failed', error }), NOW);
    expect(failed('http_403')).toBe('12 min ago · failed: The site refused the request (403)');
    expect(failed('http_503')).toBe('12 min ago · failed: The site had a problem (503)');
    expect(failed('http_429')).toBe('12 min ago · failed: The site asked us to slow down (429)');
    expect(failed('timeout')).toBe('12 min ago · failed: The site took too long');
    expect(failed('network')).toBe('12 min ago · failed: Could not reach the site');
    expect(failed('network_dns')).toBe("12 min ago · failed: Could not find the site's address (DNS). Check your internet or DNS settings.");
    expect(failed('network_refused')).toBe('12 min ago · failed: The site refused the connection.');
    expect(failed('network_reset')).toBe('12 min ago · failed: The connection was cut off.');
    expect(failed('network_timeout')).toBe('12 min ago · failed: The connection timed out.');
    expect(failed('network_tls')).toBe('12 min ago · failed: Secure connection failed (check antivirus or proxy).');
    expect(failed('parse')).toBe('12 min ago · failed: The site sent something unreadable');
    expect(failed('jsearch_auth')).toBe('12 min ago · failed: JSearch refused the API key');
    expect(failed('jsearch_rate_limited')).toBe('12 min ago · failed: JSearch rate limit reached');
    expect(failed('jsearch_http_404')).toBe('12 min ago · failed: JSearch says that request was not found. Check that your JSearch subscription is active and the key belongs to JSearch (see the checklist).');
    expect(failed('jsearch_endpoint_missing')).toBe('12 min ago · failed: The JSearch address this app uses no longer exists. Update JobLume or switch the JSearch settings (see the checklist).');
    expect(failed('jsearch_http_500')).toBe('12 min ago · failed: JSearch answered with an error (500). See the checklist.');
    expect(failed('jsearch_http_abc')).toBe('12 min ago · failed: Something went wrong');
    expect(failed('db')).toBe('12 min ago · failed: Could not save the results');
    expect(failed('unknown')).toBe('12 min ago · failed: Something went wrong');
    expect(failed('weird old text')).toBe('12 min ago · failed: Something went wrong');
    expect(failed(null)).toBe('12 min ago · failed: Something went wrong');
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
