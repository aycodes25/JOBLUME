import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { makeDeps } from '../helpers/deps.js';

const profile = {
  user_id: 'u1', base_cv_text: null, base_cv_url: null, base_cv_filename: null, skills: [], years_experience: null, desired_roles: [],
  location: null, salary_min: null, salary_max: null, apply_mode: 'manual' as const, auto_threshold: 80, daily_cap: 20,
  auto_followup: false, notify_new_matches: false, updated_at: '',
  full_name: 'Ada Lovelace', phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null,
};

function deps() {
  return makeDeps({
    profiles: { get: vi.fn(async () => profile), update: vi.fn(async (_id, patch) => ({ ...profile, ...patch })) },
    jobs: { refresh: vi.fn(), rematch: vi.fn(async () => undefined) },
  });
}
const authed = (app: ReturnType<typeof createApp>) => ({
  get: (u: string) => request(app).get(u).set('authorization', 'Bearer good'),
  put: (u: string, body: object) => request(app).put(u).set('authorization', 'Bearer good').send(body),
});

describe('profile contact details', () => {
  it('GET /profile returns the contact fields and the full name', async () => {
    const res = await authed(createApp(deps())).get('/profile');
    expect(res.status).toBe(200);
    expect(res.body.full_name).toBe('Ada Lovelace');
    expect(res.body).toHaveProperty('phone', null);
  });

  it('PUT /profile saves contact details for the signed-in user only', async () => {
    const d = deps();
    const body = {
      full_name: 'Ada Lovelace', phone: '+234 801 234 5678', city: 'Lagos',
      linkedin_url: 'https://www.linkedin.com/in/ada', github_url: null, portfolio_url: 'https://ada.dev',
    };
    const res = await authed(createApp(d)).put('/profile', body);
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('+234 801 234 5678');
    expect(d.profiles.update).toHaveBeenCalledWith('u1', body);
  });

  it.each([
    ['an http link', { linkedin_url: 'http://linkedin.com/in/ada' }],
    ['a bad phone', { phone: 'call me' }],
    ['a name of one character', { full_name: 'A' }],
    ['someone else user_id', { user_id: 'u2', phone: '+234 801 234 5678' }],
    ['an unknown field', { twitter_url: 'https://x.com/ada' }],
  ])('PUT /profile rejects %s without writing', async (_name, body) => {
    const d = deps();
    const res = await authed(createApp(d)).put('/profile', body);
    expect(res.status).toBe(400);
    expect(d.profiles.update).not.toHaveBeenCalled();
  });

  it('PUT /profile needs a token', async () => {
    const res = await request(createApp(deps())).put('/profile').send({ city: 'Lagos' });
    expect(res.status).toBe(401);
  });
});
