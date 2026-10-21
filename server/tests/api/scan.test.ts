import type { ScanStatus } from '@joblume/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { makeDeps } from '../helpers/deps.js';

const status: ScanStatus = {
  worker_alive: true,
  worker_last_seen: '2026-10-20T11:59:00.000Z',
  runs: [
    {
      source: 'myjobmag', started_at: '2026-10-20T11:00:00.000Z', finished_at: '2026-10-20T11:02:00.000Z', status: 'ok', error: null,
      listed: 35, new_count: 6, inserted: 6, rejected_title: 3, rejected_location: 1,
    },
  ],
};

describe('GET /scan/status', () => {
  it('returns the scan status to a signed-in user', async () => {
    const d = makeDeps({ scan: { status: vi.fn<() => Promise<ScanStatus>>().mockImplementation(async () => status) } });
    const res = await request(createApp(d)).get('/scan/status').set('authorization', 'Bearer good');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(status);
    expect(d.scan.status).toHaveBeenCalledTimes(1);
  });

  it('refuses a request with no token or a bad token, without reading anything', async () => {
    const d = makeDeps();
    expect((await request(createApp(d)).get('/scan/status')).status).toBe(401);
    expect((await request(createApp(d)).get('/scan/status').set('authorization', 'Bearer bad')).status).toBe(401);
    expect(d.scan.status).not.toHaveBeenCalled();
  });

  it('is read-only: other methods are not routed', async () => {
    const d = makeDeps();
    const res = await request(createApp(d)).post('/scan/status').set('authorization', 'Bearer good').send({});
    expect(res.status).toBe(404);
  });
});
