import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { ApiError } from '../../src/lib/errors.js';
import { makeDeps } from '../helpers/deps.js';

const auth = (r: request.Test) => r.set('authorization', 'Bearer good');

describe('authenticated Gmail routes', () => {
  it('require a token', async () => {
    const app = createApp(makeDeps());
    expect((await request(app).post('/gmail/connect')).status).toBe(401);
    expect((await request(app).get('/gmail/status')).status).toBe(401);
    expect((await request(app).delete('/gmail')).status).toBe(401);
  });

  it('POST /gmail/connect returns the Google URL for the token user', async () => {
    const deps = makeDeps();
    deps.gmail.startConnect = vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?x=1');
    const res = await auth(request(createApp(deps)).post('/gmail/connect'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });
    expect(deps.gmail.startConnect).toHaveBeenCalledWith('u1', 'web');
  });

  it('POST /gmail/connect maps gmail_not_configured to 503', async () => {
    const deps = makeDeps();
    deps.gmail.startConnect = vi.fn(() => { throw new ApiError(503, 'gmail_not_configured'); });
    const res = await auth(request(createApp(deps)).post('/gmail/connect'));
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('gmail_not_configured');
  });

  it('POST /gmail/connect asks for the app return target when the phone names it', async () => {
    const deps = makeDeps();
    deps.gmail.startConnect = vi.fn().mockResolvedValue('https://accounts.google.com/o/oauth2/v2/auth?x=2');
    const res = await auth(request(createApp(deps)).post('/gmail/connect')).send({ return: 'joblume://gmail-return' });
    expect(res.status).toBe(200);
    expect(deps.gmail.startConnect).toHaveBeenCalledWith('u1', 'app');
  });

  it.each([
    ['an arbitrary URL', { return: 'https://evil.example/steal' }],
    ['another app scheme', { return: 'otherapp://gmail-return' }],
    ['an unknown key', { return: 'joblume://gmail-return', next: '/x' }],
  ])('POST /gmail/connect refuses %s with 400 invalid_request', async (_name, body) => {
    const deps = makeDeps();
    const res = await auth(request(createApp(deps)).post('/gmail/connect')).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(deps.gmail.startConnect).not.toHaveBeenCalled();
  });

  it('serves a request that carries no Origin header (the phone app sends none)', async () => {
    const deps = makeDeps();
    deps.gmail.status = vi.fn().mockResolvedValue({ configured: true, connected: false, email: null });
    const res = await auth(request(createApp(deps)).get('/gmail/status'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ configured: true, connected: false, email: null });
  });

  it('GET /gmail/status returns the status', async () => {
    const deps = makeDeps();
    deps.gmail.status = vi.fn().mockResolvedValue({ configured: true, connected: true, email: 'me@gmail.com' });
    const res = await auth(request(createApp(deps)).get('/gmail/status'));
    expect(res.body).toEqual({ configured: true, connected: true, email: 'me@gmail.com' });
    expect(deps.gmail.status).toHaveBeenCalledWith('u1');
  });

  it('DELETE /gmail disconnects', async () => {
    const deps = makeDeps();
    const res = await auth(request(createApp(deps)).delete('/gmail'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connected: false });
    expect(deps.gmail.disconnect).toHaveBeenCalledWith('u1');
  });
});

describe('GET /gmail/callback', () => {
  it('works without a bearer token and sends the browser back to Settings', async () => {
    const deps = makeDeps();
    deps.gmail.finishConnect = vi.fn().mockResolvedValue({ ok: true });
    const res = await request(createApp(deps)).get('/gmail/callback?code=C&state=S');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:3000/settings?gmail=connected');
    expect(deps.gmail.finishConnect).toHaveBeenCalledWith({ code: 'C', state: 'S', error: undefined });
  });

  it('redirects with the failure reason', async () => {
    const deps = makeDeps();
    deps.gmail.finishConnect = vi.fn().mockResolvedValue({ ok: false, reason: 'missing_scope' });
    const res = await request(createApp(deps)).get('/gmail/callback?code=C&state=S');
    expect(res.headers.location).toBe('http://localhost:3000/settings?gmail=error&reason=missing_scope');
  });

  it('turns an unexpected failure into a server_error redirect', async () => {
    const deps = makeDeps();
    deps.gmail.finishConnect = vi.fn().mockRejectedValue(new Error('db down'));
    const res = await request(createApp(deps)).get('/gmail/callback?code=C&state=S');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:3000/settings?gmail=error&reason=server_error');
  });

  it('only ever redirects to the web origin, whatever the query says', async () => {
    const deps = makeDeps();
    deps.gmail.finishConnect = vi.fn().mockResolvedValue({ ok: true });
    const res = await request(createApp(deps)).get('/gmail/callback?code=C&state=http://evil.example&redirect=http://evil.example');
    expect(res.headers.location?.startsWith('http://localhost:3000/settings')).toBe(true);
  });

  it('ignores non-string query values', async () => {
    const deps = makeDeps();
    deps.gmail.finishConnect = vi.fn().mockResolvedValue({ ok: false, reason: 'invalid_state' });
    await request(createApp(deps)).get('/gmail/callback?code[]=a&code[]=b&state[x]=y');
    expect(deps.gmail.finishConnect).toHaveBeenCalledWith({ code: undefined, state: undefined, error: undefined });
  });

  it('sends the phone back to the app when the signed state says so', async () => {
    const deps = makeDeps();
    deps.gmail.finishConnect = vi.fn().mockResolvedValue({ ok: true });
    deps.gmail.returnTarget = vi.fn().mockReturnValue('app');
    const res = await request(createApp(deps)).get('/gmail/callback?code=C&state=S');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('joblume://gmail-return?status=connected');
    expect(deps.gmail.returnTarget).toHaveBeenCalledWith('S');
  });

  it('carries the failure reason back to the app', async () => {
    const deps = makeDeps();
    deps.gmail.finishConnect = vi.fn().mockResolvedValue({ ok: false, reason: 'denied' });
    deps.gmail.returnTarget = vi.fn().mockReturnValue('app');
    const res = await request(createApp(deps)).get('/gmail/callback?error=access_denied&state=S');
    expect(res.headers.location).toBe('joblume://gmail-return?status=error&reason=denied');
  });

  it('keeps the web redirect when the state names no app target', async () => {
    const deps = makeDeps();
    deps.gmail.finishConnect = vi.fn().mockResolvedValue({ ok: true });
    deps.gmail.returnTarget = vi.fn().mockReturnValue('web');
    const res = await request(createApp(deps)).get('/gmail/callback?code=C&state=S&return=joblume://gmail-return');
    expect(res.headers.location).toBe('http://localhost:3000/settings?gmail=connected');
  });
});
