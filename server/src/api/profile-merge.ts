import type { ProfilePatch } from '@joblume/shared';
import type { ProfileRow } from '../db/types.js';

/** The profile PUT body carries full_name, which is stored on users, not on profiles. */
export function splitProfilePatch(patch: ProfilePatch): { profile: Omit<ProfilePatch, 'full_name'>; fullName: string | undefined } {
  const { full_name, ...profile } = patch;
  return { profile, fullName: full_name };
}

type Embedded = { full_name: string | null };

/** A profiles row selected as `*, users(full_name)`: lift the name to the top level. */
export function flattenProfile(row: Record<string, unknown>): ProfileRow {
  const { users, ...rest } = row as Record<string, unknown> & { users?: Embedded | Embedded[] | null };
  const user = Array.isArray(users) ? users[0] : users;
  return { ...rest, full_name: user?.full_name ?? null } as unknown as ProfileRow;
}

export const PROFILE_SELECT = '*, users(full_name)';
