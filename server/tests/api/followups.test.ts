import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { ApiError } from '../../src/lib/errors.js';
import { makeDeps } from '../helpers/deps.js';

const ID = '3f2b8c1e-5d4a-4b7e-9c11-2a6f0d9e8b77';
const authed = (r: request.Test) => r.set('authorization', 'Bearer good');
const LONG = 'Dear Hiring Team, I wanted to ask whether there is any update on my application. Kind regards.';

describe('follow-up routes', () => {
  it('require a token', async () => {
    const app = createApp(makeDeps());
    expect((await request(app).get('/follow-ups')).status).toBe(401);
    expect((await request(app).patch(`/follow-ups/${ID}`).send({})).status).toBe(401);
    expect((await request(app).post(`/follow-ups/${ID}/send`)).status).toBe(401);
    expect((await request(app).post(`/follow-ups/${ID}/dismiss`)).status).toBe(401);
  });

  it('GET lists pending drafts by default and accepts a valid status filter', async () => {
    const deps = makeDeps();
    deps.followUps.list = vi.fn().mockResolvedValue([]);
    await authed(request(createApp(deps)).get('/follow-ups'));
    expect(deps.followUps.list).toHaveBeenLastCalledWith('u1', 'pending_review');
    await authed(request(createApp(deps)).get('/follow-ups?status=sent'));
    expect(deps.followUps.list).toHaveBeenLastCalledWith('u1', 'sent');
    expect((await authed(request(createApp(deps)).get('/follow-ups?status=bogus'))).status).toBe(400);
  });

  it('PATCH edits the subject and body of a follow-up', async () => {
    const deps = makeDeps();
    deps.followUps.update = vi.fn().mockResolvedValue({ id: ID });
    const res = await authed(request(createApp(deps)).patch(`/follow-ups/${ID}`)).send({ subject: '  Re: Hello  ', body: LONG });
    expect(res.status).toBe(200);
    expect(deps.followUps.update).toHaveBeenCalledWith('u1', ID, { subject: 'Re: Hello', body: LONG });
  });

  it.each([
    ['an empty patch', {}],
    ['a short body', { body: 'too short' }],
    ['a too-long subject', { subject: 'x'.repeat(201) }],
    ['an extra field', { body: LONG, status: 'sent' }],
  ])('PATCH rejects %s with 400', async (_n, body) => {
    const deps = makeDeps();
    const res = await authed(request(createApp(deps)).patch(`/follow-ups/${ID}`)).send(body);
    expect(res.status).toBe(400);
    expect(deps.followUps.update).not.toHaveBeenCalled();
  });

  it('answers 404 for a non-UUID id or an unknown follow-up', async () => {
    const deps = makeDeps();
    deps.followUps.update = vi.fn().mockResolvedValue(null);
    deps.followUps.dismiss = vi.fn().mockResolvedValue(null);
    expect((await authed(request(createApp(deps)).patch('/follow-ups/abc')).send({ body: LONG })).status).toBe(404);
    expect((await authed(request(createApp(deps)).patch(`/follow-ups/${ID}`)).send({ body: LONG })).status).toBe(404);
    expect((await authed(request(createApp(deps)).post(`/follow-ups/${ID}/dismiss`))).status).toBe(404);
  });

  it('POST send and dismiss call the service for the token user', async () => {
    const deps = makeDeps();
    deps.followUps.send = vi.fn().mockResolvedValue({ id: ID, status: 'sent' });
    deps.followUps.dismiss = vi.fn().mockResolvedValue({ id: ID, status: 'dismissed' });
    const sent = await authed(request(createApp(deps)).post(`/follow-ups/${ID}/send`));
    expect(sent.body).toEqual({ id: ID, status: 'sent' });
    expect(deps.followUps.send).toHaveBeenCalledWith('u1', ID);
    const dismissed = await authed(request(createApp(deps)).post(`/follow-ups/${ID}/dismiss`));
    expect(dismissed.body).toEqual({ id: ID, status: 'dismissed' });
    expect(deps.followUps.dismiss).toHaveBeenCalledWith('u1', ID);
  });

  it('maps service errors to their status and code', async () => {
    const deps = makeDeps();
    deps.followUps.send = vi.fn().mockRejectedValue(new ApiError(409, 'not_applicable'));
    const res = await authed(request(createApp(deps)).post(`/follow-ups/${ID}/send`));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('not_applicable');
  });

  it('limits sends to 10 per minute per user', async () => {
    const deps = makeDeps();
    deps.followUps.send = vi.fn().mockResolvedValue({ id: ID });
    const app = createApp(deps);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await authed(request(app).post(`/follow-ups/${ID}/send`))).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
