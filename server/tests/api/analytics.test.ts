import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import type { AppDeps } from '../../src/api/deps.js';
import { makeDeps as baseDeps } from '../helpers/deps.js';

const payload = {
  total: 2,
  by_status: { pending_review: 1, approved: 0, applied: 1, interviewing: 0, rejected: 0, offer: 0, skipped: 0 },
  applied_ever: 1, responded: 0, response_rate: 0, avg_match_score: 65,
};

function makeDeps(analytics = vi.fn().mockResolvedValue(payload)): AppDeps {
  return baseDeps({
    applications: { list: vi.fn(), get: vi.fn(), update: vi.fn(), setStatus: vi.fn(), analytics } as never,
  });
}

describe('GET /analytics', () => {
  it('requires a token', async () => {
    expect((await request(createApp(makeDeps())).get('/analytics')).status).toBe(401);
  });

  it('returns the analytics for the token user only', async () => {
    const deps = makeDeps();
    const res = await request(createApp(deps)).get('/analytics').set('authorization', 'Bearer good');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(payload);
    expect(deps.applications.analytics).toHaveBeenCalledWith('u1');
  });
});
