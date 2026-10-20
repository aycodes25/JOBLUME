import type { Profile } from '@joblume/shared';
import {
  buildProfilePatch, buildSettingsPatch, parseList, profileToFormValues, profileToSettingsValues,
  type ProfileFormValues, type SettingsValues,
} from '@/lib/profile-form';

const values = (over: Partial<ProfileFormValues> = {}): ProfileFormValues => ({
  desiredRoles: 'Data Analyst, BI Analyst', skills: 'SQL, Excel', location: 'Lagos',
  yearsExperience: '3', salaryMin: '200000', salaryMax: '400000', ...over,
});
const settings = (over: Partial<SettingsValues> = {}): SettingsValues => ({
  applyMode: 'manual', autoThreshold: '80', dailyCap: '20', autoFollowup: false, ...over,
});

describe('parseList', () => {
  it('splits on commas and newlines, trims, drops blanks and removes duplicates', () => {
    expect(parseList(' SQL, Excel\nSQL ,, Python ')).toEqual(['SQL', 'Excel', 'Python']);
    expect(parseList('   ')).toEqual([]);
  });
});

describe('buildProfilePatch', () => {
  it('builds a patch from valid values', () => {
    expect(buildProfilePatch(values())).toEqual({
      ok: true,
      patch: {
        desired_roles: ['Data Analyst', 'BI Analyst'], skills: ['SQL', 'Excel'], location: 'Lagos',
        years_experience: 3, salary_min: 200000, salary_max: 400000,
      },
    });
  });

  it('turns an empty location and empty numbers into null', () => {
    const r = buildProfilePatch(values({ location: '', yearsExperience: '', salaryMin: '', salaryMax: '' }));
    expect(r).toMatchObject({ ok: true, patch: { location: null, years_experience: null, salary_min: null, salary_max: null } });
  });

  it('requires at least one role only when asked to', () => {
    const empty = values({ desiredRoles: ' ' });
    expect(buildProfilePatch(empty, { requireRoles: true })).toEqual({
      ok: false, errors: { desiredRoles: 'Add at least one role you are looking for.' },
    });
    expect(buildProfilePatch(empty)).toMatchObject({ ok: true, patch: { desired_roles: [] } });
  });

  it('rejects non-numeric and out-of-range numbers with clear messages', () => {
    expect(buildProfilePatch(values({ yearsExperience: 'abc' }))).toEqual({ ok: false, errors: { yearsExperience: 'Enter a whole number.' } });
    expect(buildProfilePatch(values({ yearsExperience: '61' }))).toEqual({ ok: false, errors: { yearsExperience: 'Enter a number between 0 and 60.' } });
  });

  it('rejects a minimum salary above the maximum', () => {
    expect(buildProfilePatch(values({ salaryMin: '500000', salaryMax: '100000' }))).toEqual({
      ok: false, errors: { salaryMin: 'Minimum salary cannot be higher than maximum salary.' },
    });
  });

  it('rejects one-character roles', () => {
    expect(buildProfilePatch(values({ desiredRoles: 'x' }))).toEqual({
      ok: false, errors: { desiredRoles: 'Each role needs at least 2 characters.' },
    });
  });
});

describe('buildSettingsPatch', () => {
  it('builds a patch from valid values', () => {
    expect(buildSettingsPatch(settings({ applyMode: 'auto', autoThreshold: '85', dailyCap: '10', autoFollowup: true }))).toEqual({
      ok: true,
      patch: { apply_mode: 'auto', auto_threshold: 85, daily_cap: 10, auto_followup: true },
    });
  });

  it.each([
    ['cap above 20', settings({ dailyCap: '21' }), { dailyCap: 'Enter a whole number between 1 and 20.' }],
    ['cap of 0', settings({ dailyCap: '0' }), { dailyCap: 'Enter a whole number between 1 and 20.' }],
    ['threshold above 100', settings({ autoThreshold: '101' }), { autoThreshold: 'Enter a whole number between 0 and 100.' }],
    ['threshold text', settings({ autoThreshold: 'x' }), { autoThreshold: 'Enter a whole number between 0 and 100.' }],
    ['empty cap', settings({ dailyCap: '' }), { dailyCap: 'Enter a whole number between 1 and 20.' }],
  ])('rejects %s', (_name, input, errors) => {
    expect(buildSettingsPatch(input)).toEqual({ ok: false, errors });
  });
});

describe('profile to form values', () => {
  const profile = {
    user_id: 'u1', base_cv_text: null, base_cv_url: null, skills: ['SQL', 'Excel'], years_experience: 3,
    desired_roles: ['Data Analyst'], location: 'Abuja', salary_min: null, salary_max: 400000, apply_mode: 'auto',
    auto_threshold: 90, daily_cap: 12, auto_followup: true, updated_at: '',
  } as Profile;

  it('maps a profile to editable strings', () => {
    expect(profileToFormValues(profile)).toEqual({
      desiredRoles: 'Data Analyst', skills: 'SQL, Excel', location: 'Abuja', yearsExperience: '3', salaryMin: '', salaryMax: '400000',
    });
    expect(profileToSettingsValues(profile)).toEqual({ applyMode: 'auto', autoThreshold: '90', dailyCap: '12', autoFollowup: true });
  });

  it('maps a blank profile to empty strings', () => {
    const blank = { ...profile, skills: [], desired_roles: [], location: null, years_experience: null, salary_max: null } as Profile;
    expect(profileToFormValues(blank)).toEqual({ desiredRoles: '', skills: '', location: '', yearsExperience: '', salaryMin: '', salaryMax: '' });
  });
});
