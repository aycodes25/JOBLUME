import { describe, expect, it } from 'vitest';
import { flattenProfile, splitProfilePatch } from '../../src/api/profile-merge.js';
import { createProfileRepo } from '../../src/api/repos.js';
import type { Db } from '../../src/lib/supabase.js';

describe('splitProfilePatch', () => {
  it('separates the full name (stored on users) from the profile columns', () => {
    expect(splitProfilePatch({ full_name: 'Ada Lovelace', phone: '+234 801 234 5678' })).toEqual({
      profile: { phone: '+234 801 234 5678' },
      fullName: 'Ada Lovelace',
    });
    expect(splitProfilePatch({ city: 'Lagos' })).toEqual({ profile: { city: 'Lagos' }, fullName: undefined });
  });
});

describe('flattenProfile', () => {
  it('lifts users.full_name to the top level for an object or one-element array', () => {
    expect(flattenProfile({ user_id: 'u1', phone: null, users: { full_name: 'Ada Lovelace' } })).toEqual({ user_id: 'u1', phone: null, full_name: 'Ada Lovelace' });
    expect(flattenProfile({ user_id: 'u1', users: [{ full_name: 'Ada' }] }).full_name).toBe('Ada');
  });

  it('uses null when there is no name or no joined user', () => {
    expect(flattenProfile({ user_id: 'u1', users: { full_name: null } }).full_name).toBeNull();
    expect(flattenProfile({ user_id: 'u1', users: null }).full_name).toBeNull();
    expect(flattenProfile({ user_id: 'u1' }).full_name).toBeNull();
  });
});

type Call = { table: string; op: string; arg: unknown };

/** A tiny stand-in for the Supabase query builder that records calls and answers with `row`. */
function fakeDb(row: Record<string, unknown> | null) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const b = {
      select: (cols: string) => { calls.push({ table, op: 'select', arg: cols }); return b; },
      update: (values: unknown) => { calls.push({ table, op: 'update', arg: values }); return b; },
      eq: (col: string, val: unknown) => { calls.push({ table, op: 'eq', arg: [col, val] }); return b; },
      maybeSingle: async () => ({ data: row, error: null }),
      single: async () => ({ data: row, error: null }),
      then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
    };
    return b;
  };
  return { db: { from } as unknown as Db, calls };
}

describe('createProfileRepo', () => {
  const row = { user_id: 'u1', phone: '+234 801 234 5678', users: { full_name: 'Ada Lovelace' } };

  it('reads the profile together with users.full_name', async () => {
    const { db, calls } = fakeDb(row);
    const profile = await createProfileRepo(db).get('u1');
    expect(profile).toEqual({ user_id: 'u1', phone: '+234 801 234 5678', full_name: 'Ada Lovelace' });
    expect(calls).toContainEqual({ table: 'profiles', op: 'select', arg: '*, users(full_name)' });
    expect(calls).toContainEqual({ table: 'profiles', op: 'eq', arg: ['user_id', 'u1'] });
  });

  it('returns null when there is no profile', async () => {
    expect(await createProfileRepo(fakeDb(null).db).get('u1')).toBeNull();
  });

  it('writes the name to users and the other fields to profiles, scoped to the signed-in user', async () => {
    const { db, calls } = fakeDb(row);
    const updated = await createProfileRepo(db).update('u1', { full_name: 'Ada Lovelace', phone: '+234 801 234 5678' });
    expect(updated.full_name).toBe('Ada Lovelace');
    expect(calls).toContainEqual({ table: 'users', op: 'update', arg: { full_name: 'Ada Lovelace' } });
    expect(calls).toContainEqual({ table: 'users', op: 'eq', arg: ['id', 'u1'] });
    const profileUpdate = calls.find((c) => c.table === 'profiles' && c.op === 'update')!.arg as Record<string, unknown>;
    expect(profileUpdate.phone).toBe('+234 801 234 5678');
    expect(profileUpdate).not.toHaveProperty('full_name');
    expect(calls).toContainEqual({ table: 'profiles', op: 'eq', arg: ['user_id', 'u1'] });
  });

  it('does not touch users when the patch has no name', async () => {
    const { db, calls } = fakeDb(row);
    await createProfileRepo(db).update('u1', { city: 'Lagos' });
    expect(calls.some((c) => c.table === 'users')).toBe(false);
  });
});
