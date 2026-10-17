import type { Profile } from '@joblume/shared';

/** A user needs onboarding until they have a stored CV and at least one desired role. */
export function needsOnboarding(profile: Pick<Profile, 'base_cv_url' | 'desired_roles'>): boolean {
  return !profile.base_cv_url || profile.desired_roles.length === 0;
}

export function initialStep(profile: Pick<Profile, 'base_cv_url'>): 1 | 2 {
  return profile.base_cv_url ? 2 : 1;
}
