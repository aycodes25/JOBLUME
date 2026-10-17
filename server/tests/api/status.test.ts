import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import type { AppDeps } from '../../src/api/deps.js';
import { makeDeps as baseDeps } from '../helpers/deps.js';

const ID = '3f2b8c1e-5d4a-4b7e-9c11-2a6f0d9e8b77';

function makeDeps(setStatus = vi.fn().mockResolvedValue({ id: ID, status: 'applied' })): AppDeps {
  return baseDeps({
    applications: { list: vi.fn(), get: vi.fn(), update: vi.fn(), setStatus, analytics: vi.fn() } as never,
  });
}
const patch = (app: ReturnType<typeof createApp>, path: string) =>
  request(app).patch(path).set('authorization', 'Bearer good');

describe('PATCH /applications/:id/status', () => {
  it('requires a token', async () => {
    const res = await request(createApp(makeDeps())).patch(`/applications/${ID}/status`).send({ status: 'applied' });
    expect(res.status).toBe(401);
  });

  it('passes the token user, id and status to the service and returns the application', async () => {
    const deps = makeDeps();
    const res = await patch(createApp(deps), `/applications/${ID}/status`).send({ status: 'applied' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: ID, status: 'applied' });
    expect(deps.applications.setStatus).toHaveBeenCalledWith('u1', ID, 'applied');
  });

  it.each([
    ['unknown status', { status: 'done' }],
    ['missing status', {}],
    ['extra field', { status: 'applied', applied_at: '2020-01-01' }],
  ])('rejects %s with 400', async (_n, body) => {
    const deps = makeDeps();
    const res = await patch(createApp(deps), `/applications/${ID}/status`).send(body);
    expect(res.status).toBe(400);
    expect(deps.applications.setStatus).not.toHaveBeenCalled();
  });

  it('answers 404 for a non-UUID id without calling the service', async () => {
    const deps = makeDeps();
    const res = await patch(createApp(deps), '/applications/abc/status').send({ status: 'applied' });
    expect(res.status).toBe(404);
    expect(deps.applications.setStatus).not.toHaveBeenCalled();
  });

  it('answers 404 when the service finds no such application for this user', async () => {
    const res = await patch(createApp(makeDeps(vi.fn().mockResolvedValue(null))), `/applications/${ID}/status`).send({ status: 'applied' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('application_not_found');
  });
});
