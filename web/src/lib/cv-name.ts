import type { Profile } from '@joblume/shared';

/** The CV name to show: the user's original file name, else the stored name for older uploads. */
export function displayCvName(profile: Pick<Profile, 'base_cv_filename' | 'base_cv_url'>): string | null {
  if (profile.base_cv_filename) return profile.base_cv_filename;
  if (profile.base_cv_url) return profile.base_cv_url.split('/').pop() ?? profile.base_cv_url;
  return null;
}
