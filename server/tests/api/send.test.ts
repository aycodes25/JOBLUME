import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { ApiError } from '../../src/lib/errors.js';
import { makeDeps } from '../helpers/deps.js';

const ID = '3f2b8c1e-5d4a-4b7e-9c11-2a6f0d9e8b77';
const post = (app: ReturnType<typeof createApp>, path: string) => request(app).post(path).set('authorization', 'Bearer good');

describe('POST /applications/:id/send', () => {
  it('requires a token', async () => {
    expect((await request(createApp(makeDeps())).post(`/applications/${ID}/send`).send({})).status).toBe(401);
  });

  it('passes the token user, id and cleaned input to the service and returns the application', async () => {
    const deps = makeDeps();
    deps.sending.send = vi.fn().mockResolvedValue({ id: ID, status: 'applied' });
    const res = await post(createApp(deps), `/applications/${ID}/send`).send({ to: '  Jane@Acme.com ', confirmGuess: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: ID, status: 'applied' });
    expect(deps.sending.send).toHaveBeenCalledWith('u1', ID, { to: 'jane@acme.com', confirmGuess: true });
  });

  it('accepts an empty body', async () => {
    const deps = makeDeps();
    deps.sending.send = vi.fn().mockResolvedValue({ id: ID });
    await post(createApp(deps), `/applications/${ID}/send`).send({});
    expect(deps.sending.send).toHaveBeenCalledWith('u1', ID, {});
  });

  it('accepts a request with no body at all', async () => {
    const deps = makeDeps();
    deps.sending.send = vi.fn().mockResolvedValue({ id: ID });
    const res = await post(createApp(deps), `/applications/${ID}/send`);
    expect(res.status).toBe(200);
    expect(deps.sending.send).toHaveBeenCalledWith('u1', ID, {});
  });

  it.each([
    ['a bad address', { to: 'nope' }],
    ['an extra field', { to: 'a@b.co', status: 'applied' }],
    ['a non-boolean confirmGuess', { confirmGuess: 'yes' }],
  ])('rejects %s with 400 without calling the service', async (_n, body) => {
    const deps = makeDeps();
    const res = await post(createApp(deps), `/applications/${ID}/send`).send(body);
    expect(res.status).toBe(400);
    expect(deps.sending.send).not.toHaveBeenCalled();
  });

  it('answers 404 for a non-UUID id', async () => {
    const deps = makeDeps();
    const res = await post(createApp(deps), '/applications/abc/send').send({});
    expect(res.status).toBe(404);
    expect(deps.sending.send).not.toHaveBeenCalled();
  });

  it('maps service errors to their status and code', async () => {
    const deps = makeDeps();
    deps.sending.send = vi.fn().mockRejectedValue(new ApiError(409, 'guess_not_confirmed'));
    const res = await post(createApp(deps), `/applications/${ID}/send`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('guess_not_confirmed');
  });

  it('limits each user to 10 sends per minute', async () => {
    const deps = makeDeps();
    deps.sending.send = vi.fn().mockResolvedValue({ id: ID });
    const app = createApp(deps);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await post(app, `/applications/${ID}/send`).send({})).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
