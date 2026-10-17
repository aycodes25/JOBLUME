import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { ApiError } from '../../src/lib/errors.js';
import { makeDeps } from '../helpers/deps.js';

const ID = '3f2b8c1e-5d4a-4b7e-9c11-2a6f0d9e8b77';
const call = (app: ReturnType<typeof createApp>, method: 'post' | 'put', path: string) => request(app)[method](path).set('authorization', 'Bearer good');

describe('POST /applications/:id/email/next', () => {
  it('requires a token', async () => {
    expect((await request(createApp(makeDeps())).post(`/applications/${ID}/email/next`)).status).toBe(401);
  });

  it('returns the result for the token user', async () => {
    const deps = makeDeps();
    deps.applications.nextEmail = vi.fn().mockResolvedValue({ exhausted: false, application: { id: ID } });
    const res = await call(createApp(deps), 'post', `/applications/${ID}/email/next`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exhausted: false, application: { id: ID } });
    expect(deps.applications.nextEmail).toHaveBeenCalledWith('u1', ID);
  });

  it('answers 404 for a non-UUID id and for an unknown application', async () => {
    const deps = makeDeps();
    deps.applications.nextEmail = vi.fn().mockResolvedValue(null);
    expect((await call(createApp(deps), 'post', '/applications/abc/email/next')).status).toBe(404);
    expect((await call(createApp(deps), 'post', `/applications/${ID}/email/next`)).status).toBe(404);
  });
});

describe('PUT /applications/:id/email', () => {
  it('stores a cleaned address', async () => {
    const deps = makeDeps();
    deps.applications.setEmail = vi.fn().mockResolvedValue({ id: ID });
    const res = await call(createApp(deps), 'put', `/applications/${ID}/email`).send({ email: '  Jane@Acme.com ' });
    expect(res.status).toBe(200);
    expect(deps.applications.setEmail).toHaveBeenCalledWith('u1', ID, 'jane@acme.com');
  });

  it.each([
    ['a bad address', { email: 'nope' }],
    ['a missing address', {}],
    ['an extra field', { email: 'a@b.co', status: 'applied' }],
  ])('rejects %s with 400', async (_n, body) => {
    const deps = makeDeps();
    const res = await call(createApp(deps), 'put', `/applications/${ID}/email`).send(body);
    expect(res.status).toBe(400);
    expect(deps.applications.setEmail).not.toHaveBeenCalled();
  });

  it('maps already_sent to 409 and an unknown application to 404', async () => {
    const deps = makeDeps();
    deps.applications.setEmail = vi.fn().mockRejectedValueOnce(new ApiError(409, 'already_sent')).mockResolvedValueOnce(null);
    expect((await call(createApp(deps), 'put', `/applications/${ID}/email`).send({ email: 'a@b.co' })).status).toBe(409);
    expect((await call(createApp(deps), 'put', `/applications/${ID}/email`).send({ email: 'a@b.co' })).status).toBe(404);
  });
});
