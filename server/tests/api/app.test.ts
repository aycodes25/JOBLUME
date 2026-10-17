import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import type { AppDeps } from '../../src/api/deps.js';
import { ApiError } from '../../src/lib/errors.js';

const ID = '3f2b8c1e-9a4d-4e7b-8c55-1a2b3c4d5e6f';
const profile = {
  user_id: 'u1', base_cv_text: null, base_cv_url: null, skills: [], years_experience: null, desired_roles: [],
  location: null, salary_min: null, salary_max: null, apply_mode: 'manual', auto_threshold: 80, daily_cap: 20,
  auto_followup: false, updated_at: '',
};

function makeDeps(over: Partial<AppDeps> = {}): AppDeps {
  return {
    webOrigin: 'http://localhost:3000',
    getUser: vi.fn(async (t: string) => (t === 'good' ? { id: 'u1', email: 'a@b.c' } : null)),
    profiles: { get: vi.fn().mockResolvedValue(profile), update: vi.fn(async (_id, patch) => ({ ...profile, ...patch })) },
    cv: { upload: vi.fn().mockResolvedValue({ characters: 1234 }) },
    applications: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
    },
    jobs: { refresh: vi.fn().mockResolvedValue(undefined), rematch: vi.fn().mockResolvedValue(undefined) },
    ...over,
  };
}
const authed = (app: ReturnType<typeof createApp>) => ({
  get: (u: string) => request(app).get(u).set('authorization', 'Bearer good'),
  put: (u: string) => request(app).put(u).set('authorization', 'Bearer good'),
  patch: (u: string) => request(app).patch(u).set('authorization', 'Bearer good'),
  post: (u: string) => request(app).post(u).set('authorization', 'Bearer good'),
});

describe('auth', () => {
  it('serves /health without a token', async () => {
    expect((await request(createApp(makeDeps())).get('/health')).body).toEqual({ ok: true });
  });
  it('rejects a missing or invalid token with 401', async () => {
    const app = createApp(makeDeps());
    expect((await request(app).get('/profile')).status).toBe(401);
    expect((await request(app).get('/profile').set('authorization', 'Bearer bad')).status).toBe(401);
  });
});

describe('profile', () => {
  it('GET /profile returns the profile for the token user', async () => {
    const deps = makeDeps();
    const res = await authed(createApp(deps)).get('/profile');
    expect(res.status).toBe(200);
    expect(deps.profiles.get).toHaveBeenCalledWith('u1');
  });

  it('PUT /profile validates, updates and triggers a rematch', async () => {
    const deps = makeDeps();
    const body = { desired_roles: ['backend engineer'], location: 'Lagos', skills: ['Node.js'], years_experience: 4, apply_mode: 'auto', daily_cap: 15 };
    const res = await authed(createApp(deps)).put('/profile').send(body);
    expect(res.status).toBe(200);
    expect(deps.profiles.update).toHaveBeenCalledWith('u1', body);
    expect(deps.jobs.rematch).toHaveBeenCalledWith('u1');
  });

  it.each([
    ['unknown location', { location: 'Kano' }],
    ['daily cap above 20', { daily_cap: 21 }],
    ['threshold above 100', { auto_threshold: 101 }],
    ['bad apply mode', { apply_mode: 'yolo' }],
    ['negative experience', { years_experience: -1 }],
    ['extra field', { user_id: 'someone-else' }],
  ])('PUT /profile rejects %s with 400', async (_n, body) => {
    const deps = makeDeps();
    const res = await authed(createApp(deps)).put('/profile').send(body);
    expect(res.status).toBe(400);
    expect(deps.profiles.update).not.toHaveBeenCalled();
  });
});

describe('profile body validation', () => {
  it('rejects an empty body with 400 and does not update', async () => {
    const deps = makeDeps();
    const res = await authed(createApp(deps)).put('/profile').send({});
    expect(res.status).toBe(400);
    expect(deps.profiles.update).not.toHaveBeenCalled();
  });

  it('rejects salary_min above salary_max', async () => {
    const deps = makeDeps();
    const res = await authed(createApp(deps)).put('/profile').send({ salary_min: 500000, salary_max: 100000 });
    expect(res.status).toBe(400);
    expect(deps.profiles.update).not.toHaveBeenCalled();
  });

  it('accepts equal salary_min and salary_max', async () => {
    const res = await authed(createApp(makeDeps())).put('/profile').send({ salary_min: 100000, salary_max: 100000 });
    expect(res.status).toBe(200);
  });

  it('malformed JSON gives 400 invalid_json', async () => {
    const res = await authed(createApp(makeDeps())).put('/profile').set('content-type', 'application/json').send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_json');
  });

  it('JSON body over 1 MB gives 413 payload_too_large', async () => {
    const res = await authed(createApp(makeDeps())).put('/profile').send({ skills: ['x'.repeat(1024 * 1024 + 10)] });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('payload_too_large');
  });
});

describe('cv upload', () => {
  it('400 when no file is attached', async () => {
    expect((await authed(createApp(makeDeps())).post('/cv')).status).toBe(400);
  });

  it('passes the file to the service and triggers a rematch', async () => {
    const deps = makeDeps();
    const res = await authed(createApp(deps)).post('/cv').attach('file', Buffer.from('%PDF-1.7 hello'), 'cv.pdf');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ characters: 1234 });
    expect(deps.cv.upload).toHaveBeenCalledWith('u1', { buffer: expect.any(Buffer) });
    expect(deps.jobs.rematch).toHaveBeenCalledWith('u1');
  });

  it('413 when the file is over 5 MB', async () => {
    const res = await authed(createApp(makeDeps())).post('/cv').attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'big.pdf');
    expect(res.status).toBe(413);
  });

  it('maps service ApiErrors to their status', async () => {
    const deps = makeDeps({ cv: { upload: vi.fn().mockRejectedValue(new ApiError(400, 'unsupported_file_type')) } });
    const res = await authed(createApp(deps)).post('/cv').attach('file', Buffer.from('nope'), 'x.txt');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unsupported_file_type');
  });
});

describe('applications', () => {
  it('GET /applications passes a valid status filter', async () => {
    const deps = makeDeps();
    await authed(createApp(deps)).get('/applications?status=pending_review');
    expect(deps.applications.list).toHaveBeenCalledWith('u1', 'pending_review');
  });

  it('GET /applications rejects an unknown status with 400', async () => {
    expect((await authed(createApp(makeDeps())).get('/applications?status=bogus')).status).toBe(400);
  });

  it('GET /applications/:id returns 404 when not found', async () => {
    expect((await authed(createApp(makeDeps())).get(`/applications/${ID}`)).status).toBe(404);
  });

  it('non-UUID ids give 404 application_not_found without calling the service', async () => {
    const deps = makeDeps();
    const g = await authed(createApp(deps)).get('/applications/abc');
    expect(g.status).toBe(404);
    expect(g.body.error).toBe('application_not_found');
    const p = await authed(createApp(deps)).patch('/applications/abc').send({ cover_letter_text: 'hi there' });
    expect(p.status).toBe(404);
    expect(p.body.error).toBe('application_not_found');
    expect(deps.applications.get).not.toHaveBeenCalled();
    expect(deps.applications.update).not.toHaveBeenCalled();
  });

  it('PATCH rejects a whitespace-only cover letter with 400', async () => {
    const deps = makeDeps();
    const res = await authed(createApp(deps)).patch(`/applications/${ID}`).send({ cover_letter_text: '   ' });
    expect(res.status).toBe(400);
    expect(deps.applications.update).not.toHaveBeenCalled();
  });

  it('PATCH /applications/:id only accepts the two text fields', async () => {
    const deps = makeDeps({ applications: { list: vi.fn(), get: vi.fn(), update: vi.fn().mockResolvedValue({ id: 'a1' } as never) } });
    const ok = await authed(createApp(deps)).patch(`/applications/${ID}`).send({ cover_letter_text: 'hi there' });
    expect(ok.status).toBe(200);
    expect(deps.applications.update).toHaveBeenCalledWith('u1', ID, { cover_letter_text: 'hi there' });
    expect((await authed(createApp(deps)).patch(`/applications/${ID}`).send({ status: 'applied' })).status).toBe(400);
    expect((await authed(createApp(deps)).patch(`/applications/${ID}`).send({})).status).toBe(400);
  });
});

describe('jobs refresh', () => {
  it('POST /jobs/refresh triggers a refresh and answers 202', async () => {
    const deps = makeDeps();
    const res = await authed(createApp(deps)).post('/jobs/refresh');
    expect(res.status).toBe(202);
    expect(deps.jobs.refresh).toHaveBeenCalledWith('u1');
  });

  it('rate limits to 3 refreshes per hour per user', async () => {
    const app = createApp(makeDeps());
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await authed(app).post('/jobs/refresh')).status);
    expect(statuses).toEqual([202, 202, 202, 429]);
  });
});
