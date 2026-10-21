import { profilePatchSchema, type Profile, type ProfilePatch } from '@joblume/shared';

export interface ProfileFormValues {
  desiredRoles: string;
  skills: string;
  location: '' | 'Lagos' | 'Abuja' | 'Remote';
  yearsExperience: string;
  salaryMin: string;
  salaryMax: string;
}
export type ProfileField = keyof ProfileFormValues;

export interface SettingsValues {
  applyMode: 'manual' | 'auto';
  autoThreshold: string;
  dailyCap: string;
  autoFollowup: boolean;
  notifyNewMatches: boolean;
}
export type SettingsField = keyof SettingsValues;

export type BuildResult<K extends string> = { ok: true; patch: ProfilePatch } | { ok: false; errors: Partial<Record<K, string>> };

export const parseList = (raw: string): string[] => [
  ...new Set(
    raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];

/** null for blank, NaN for non-numeric, otherwise the integer. */
function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

const PROFILE_FIELD: Record<string, ProfileField> = {
  desired_roles: 'desiredRoles',
  skills: 'skills',
  location: 'location',
  years_experience: 'yearsExperience',
  salary_min: 'salaryMin',
  salary_max: 'salaryMax',
};

export function buildProfilePatch(values: ProfileFormValues, opts: { requireRoles?: boolean } = {}): BuildResult<ProfileField> {
  const errors: Partial<Record<ProfileField, string>> = {};
  const roles = parseList(values.desiredRoles);
  if (opts.requireRoles && roles.length === 0) errors.desiredRoles = 'Add at least one role you are looking for.';

  const years = parseOptionalInt(values.yearsExperience);
  const min = parseOptionalInt(values.salaryMin);
  const max = parseOptionalInt(values.salaryMax);
  if (Number.isNaN(years)) errors.yearsExperience = 'Enter a whole number.';
  if (Number.isNaN(min)) errors.salaryMin = 'Enter a whole number.';
  if (Number.isNaN(max)) errors.salaryMax = 'Enter a whole number.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const patch = {
    desired_roles: roles,
    skills: parseList(values.skills),
    location: values.location === '' ? null : values.location,
    years_experience: years,
    salary_min: min,
    salary_max: max,
  };
  const parsed = profilePatchSchema.safeParse(patch);
  if (parsed.success) return { ok: true, patch: parsed.data };

  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0]);
    const field = PROFILE_FIELD[key];
    if (!field || errors[field]) continue;
    if (key === 'salary_min' && issue.message.includes('must not exceed')) {
      errors[field] = 'Minimum salary cannot be higher than maximum salary.';
    } else if (key === 'years_experience') {
      errors[field] = 'Enter a number between 0 and 60.';
    } else if (key === 'desired_roles') {
      errors[field] = 'Each role needs at least 2 characters.';
    } else {
      errors[field] = issue.message;
    }
  }
  if (Object.keys(errors).length === 0) errors.desiredRoles = parsed.error.issues[0]?.message ?? 'Check the form and try again.';
  return { ok: false, errors };
}

export function buildSettingsPatch(values: SettingsValues): BuildResult<SettingsField> {
  const errors: Partial<Record<SettingsField, string>> = {};
  const threshold = parseOptionalInt(values.autoThreshold);
  const cap = parseOptionalInt(values.dailyCap);
  if (threshold === null || Number.isNaN(threshold) || threshold > 100) {
    errors.autoThreshold = 'Enter a whole number between 0 and 100.';
  }
  if (cap === null || Number.isNaN(cap) || cap < 1 || cap > 20) {
    errors.dailyCap = 'Enter a whole number between 1 and 20.';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const parsed = profilePatchSchema.safeParse({
    apply_mode: values.applyMode,
    auto_threshold: threshold,
    daily_cap: cap,
    auto_followup: values.autoFollowup,
    notify_new_matches: values.notifyNewMatches,
  });
  if (parsed.success) return { ok: true, patch: parsed.data };
  return { ok: false, errors: { autoThreshold: 'Check the settings and try again.' } };
}

export function profileToFormValues(profile: Profile): ProfileFormValues {
  return {
    desiredRoles: profile.desired_roles.join(', '),
    skills: profile.skills.join(', '),
    location: profile.location ?? '',
    yearsExperience: profile.years_experience === null ? '' : String(profile.years_experience),
    salaryMin: profile.salary_min === null ? '' : String(profile.salary_min),
    salaryMax: profile.salary_max === null ? '' : String(profile.salary_max),
  };
}

export function profileToSettingsValues(profile: Profile): SettingsValues {
  return {
    applyMode: profile.apply_mode,
    autoThreshold: String(profile.auto_threshold),
    dailyCap: String(profile.daily_cap),
    autoFollowup: profile.auto_followup,
    notifyNewMatches: profile.notify_new_matches,
  };
}
