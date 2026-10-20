import type { JobFetch } from '@joblume/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import type { AppDeps } from '../../src/api/deps.js';
import { makeDeps } from '../helpers/deps.js';

const CANONICAL = 'https://www.linkedin.com/jobs/view/4012345678/';

function deps(over: Partial<AppDeps['jobLinks']> = {}) {
  return makeDeps({
    jobLinks: {
      addFromUrl: vi.fn<AppDeps['jobLinks']['addFromUrl']>().mockImplementation(async () => ({ queued: true })),
      listFetches: vi.fn<AppDeps['jobLinks']['listFetches']>().mockImplementation(async () => []),
      ...over,
    },
  });
}
const post = (app: ReturnType<typeof createApp>, body: object) =>
  request(app).post('/jobs/from-url').set('authorization', 'Bearer good').send(body);

describe('POST /jobs/from-url', () => {
  it('queues a new link in its canonical form and answers 202', async () => {
    const d = deps();
    const res = await post(createApp(d), { url: 'https://linkedin.com/jobs/view/data-analyst-at-acme-4012345678?trk=public_jobs' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ queued: true });
    expect(d.jobLinks.addFromUrl).toHaveBeenCalledWith('u1', { url: CANONICAL, source: 'linkedin' });
  });

  it('answers 200 with the job id when the job is already stored', async () => {
    const d = deps({ addFromUrl: vi.fn<AppDeps['jobLinks']['addFromUrl']>().mockImplementation(async () => ({ job_id: 'j1' })) });
    const res = await post(createApp(d), { url: 'https://ng.indeed.com/viewjob?jk=0123456789abcdef&from=serp' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ job_id: 'j1' });
    expect(d.jobLinks.addFromUrl).toHaveBeenCalledWith('u1', { url: 'https://ng.indeed.com/viewjob?jk=0123456789abcdef', source: 'indeed' });
  });

  it.each([
    ['an http link', 'http://www.linkedin.com/jobs/view/4012345678/'],
    ['another job site', 'https://www.glassdoor.com/job-listing/123'],
    ['a look-alike host', 'https://evil-indeed.com/viewjob?jk=0123456789abcdef'],
    ['a LinkedIn profile', 'https://www.linkedin.com/in/ada-lovelace/'],
    ['plain text', 'not a link'],
  ])('refuses %s with unsupported_job_link', async (_n, url) => {
    const d = deps();
    const res = await post(createApp(d), { url });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unsupported_job_link');
    expect(d.jobLinks.addFromUrl).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing url', {}],
    ['a url that is not text', { url: 5 }],
    ['an unknown field', { url: CANONICAL, source: 'linkedin' }],
    ['a url longer than 2048 characters', { url: `${CANONICAL}?pad=${'a'.repeat(2100)}` }],
  ])('refuses %s with invalid_request', async (_n, body) => {
    const d = deps();
    const res = await post(createApp(d), body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(d.jobLinks.addFromUrl).not.toHaveBeenCalled();
  });

  it('needs a signed-in user', async () => {
    const res = await request(createApp(deps())).post('/jobs/from-url').send({ url: CANONICAL });
    expect(res.status).toBe(401);
  });

  it('rate limits to 10 links per hour per user', async () => {
    const app = createApp(deps());
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await post(app, { url: CANONICAL })).status);
    expect(statuses.slice(0, 10).every((s) => s === 202)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('GET /jobs/fetches', () => {
  it('returns the signed-in user\'s recent links', async () => {
    const rows: JobFetch[] = [
      { id: 'f1', url: CANONICAL, status: 'failed', reason: 'login_required', job_id: null, created_at: '2026-10-18T09:00:00.000Z', updated_at: '2026-10-18T09:01:00.000Z' },
    ];
    const d = deps({ listFetches: vi.fn<AppDeps['jobLinks']['listFetches']>().mockImplementation(async () => rows) });
    const res = await request(createApp(d)).get('/jobs/fetches').set('authorization', 'Bearer good');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(d.jobLinks.listFetches).toHaveBeenCalledWith('u1');
  });

  it('needs a signed-in user', async () => {
    expect((await request(createApp(deps())).get('/jobs/fetches')).status).toBe(401);
  });
});
