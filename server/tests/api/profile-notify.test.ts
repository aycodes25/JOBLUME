import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { makeDeps } from '../helpers/deps.js';

const profile = {
  user_id: 'u1', base_cv_text: null, base_cv_url: null, base_cv_filename: null, skills: [], years_experience: null, desired_roles: [],
  location: null, salary_min: null, salary_max: null, apply_mode: 'manual' as const, auto_threshold: 80, daily_cap: 20,
  auto_followup: false, notify_new_matches: false, updated_at: '',
};

function deps() {
  return makeDeps({
    profiles: { get: vi.fn(), update: vi.fn(async (_id, patch) => ({ ...profile, ...patch })) },
    jobs: { refresh: vi.fn(), rematch: vi.fn(async () => undefined) },
  });
}
const put = (app: ReturnType<typeof createApp>, body: object) => request(app).put('/profile').set('authorization', 'Bearer good').send(body);

describe('PUT /profile notify_new_matches', () => {
  it('saves the new-match email switch for the signed-in user only', async () => {
    const d = deps();
    const res = await put(createApp(d), { notify_new_matches: true });
    expect(res.status).toBe(200);
    expect(res.body.notify_new_matches).toBe(true);
    expect(d.profiles.update).toHaveBeenCalledWith('u1', { notify_new_matches: true });
  });

  it('rejects a value that is not true or false', async () => {
    const d = deps();
    const res = await put(createApp(d), { notify_new_matches: 'yes' });
    expect(res.status).toBe(400);
    expect(d.profiles.update).not.toHaveBeenCalled();
  });
});
