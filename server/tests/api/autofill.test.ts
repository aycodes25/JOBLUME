import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { makeDeps } from '../helpers/deps.js';

const ID = '3f2b8c1e-9a4d-4e7b-8c55-1a2b3c4d5e6f';
const payload = {
  job_url: 'https://job-boards.greenhouse.io/acme/jobs/1', full_name: 'Ada Lovelace', first_name: 'Ada', last_name: 'Lovelace',
  email: 'a@b.c', phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null, cover_letter: 'Hello', cv: null,
};

describe('GET /applications/:id/autofill', () => {
  it('needs a token', async () => {
    const res = await request(createApp(makeDeps())).get(`/applications/${ID}/autofill`);
    expect(res.status).toBe(401);
  });

  it('returns the payload for the signed-in user (id and email from the token) and is not cacheable', async () => {
    const d = makeDeps({ autofill: { get: vi.fn(async () => payload) } });
    const res = await request(createApp(d)).get(`/applications/${ID}/autofill`).set('authorization', 'Bearer good');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(payload);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(d.autofill.get).toHaveBeenCalledWith({ id: 'u1', email: 'a@b.c' }, ID);
  });

  it('answers 404 for another user application or an unknown id', async () => {
    const d = makeDeps({ autofill: { get: vi.fn(async () => null) } });
    const res = await request(createApp(d)).get(`/applications/${ID}/autofill`).set('authorization', 'Bearer good');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('application_not_found');
  });

  it('answers 404 without calling the service when the id is not a uuid', async () => {
    const d = makeDeps();
    const res = await request(createApp(d)).get('/applications/not-a-uuid/autofill').set('authorization', 'Bearer good');
    expect(res.status).toBe(404);
    expect(d.autofill.get).not.toHaveBeenCalled();
  });
});
