import { describe, expect, it } from 'vitest';
import { LOCATIONS, profilePatchSchema } from '../src/index.js';

describe('profilePatchSchema', () => {
  it('accepts a valid partial update', () => {
    const body = { desired_roles: ['data analyst'], location: 'Lagos', skills: ['SQL'], years_experience: 3, daily_cap: 15 };
    expect(profilePatchSchema.parse(body)).toEqual(body);
  });

  it('exposes the three allowed locations', () => {
    expect([...LOCATIONS]).toEqual(['Lagos', 'Abuja', 'Remote']);
  });

  it.each([
    ['unknown location', { location: 'Kano' }],
    ['daily cap above 20', { daily_cap: 21 }],
    ['daily cap below 1', { daily_cap: 0 }],
    ['threshold above 100', { auto_threshold: 101 }],
    ['bad apply mode', { apply_mode: 'yolo' }],
    ['negative experience', { years_experience: -1 }],
    ['extra field', { user_id: 'someone-else' }],
    ['empty body', {}],
    ['salary min above max', { salary_min: 500000, salary_max: 100000 }],
  ])('rejects %s', (_name, body) => {
    expect(profilePatchSchema.safeParse(body).success).toBe(false);
  });

  it('accepts equal salary bounds and null location', () => {
    expect(profilePatchSchema.safeParse({ salary_min: 100, salary_max: 100 }).success).toBe(true);
    expect(profilePatchSchema.safeParse({ location: null }).success).toBe(true);
  });
});
