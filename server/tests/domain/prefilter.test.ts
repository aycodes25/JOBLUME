import { describe, expect, it } from 'vitest';
import { matchesProfile } from '../../src/domain/prefilter.js';

const profile = { desired_roles: ['backend engineer'], location: 'Lagos' as const };

describe('matchesProfile', () => {
  it('passes when every role word is in the title', () => {
    expect(matchesProfile({ title: 'Senior Backend Engineer', location: 'Lagos', source: 'myjobmag' }, profile)).toBe(true);
  });

  it('fails when the title does not contain the role words', () => {
    expect(matchesProfile({ title: 'Marketing Manager', location: 'Lagos', source: 'myjobmag' }, profile)).toBe(false);
    expect(matchesProfile({ title: 'Frontend Engineer', location: 'Lagos', source: 'myjobmag' }, profile)).toBe(false);
  });

  it('fails when the user has no desired roles', () => {
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Lagos', source: 'myjobmag' }, { ...profile, desired_roles: [] })).toBe(false);
  });

  it('rejects a non-remote job in another city', () => {
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Abuja', source: 'myjobmag' }, profile)).toBe(false);
  });

  it('accepts Remotive and remote jobs for a Lagos user', () => {
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Worldwide', source: 'remotive' }, profile)).toBe(true);
    expect(matchesProfile({ title: 'Backend Engineer (Remote)', location: '', source: 'jobberman' }, profile)).toBe(true);
  });

  it('accepts a job with no location', () => {
    expect(matchesProfile({ title: 'Backend Engineer', location: '', source: 'myjobmag' }, profile)).toBe(true);
  });

  it('for a Remote user only accepts remote jobs', () => {
    const remoteUser = { ...profile, location: 'Remote' as const };
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Lagos', source: 'myjobmag' }, remoteUser)).toBe(false);
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Worldwide', source: 'remotive' }, remoteUser)).toBe(true);
  });

  it('with no location preference any location passes', () => {
    expect(matchesProfile({ title: 'Backend Engineer', location: 'Kano', source: 'myjobmag' }, { ...profile, location: null })).toBe(true);
  });
});

describe('Remotive eligibility', () => {
  const rem = (location: string) => ({ title: 'Backend Engineer', location, source: 'remotive' as const });
  const lagos = { desired_roles: ['backend engineer'], location: 'Lagos' as const };
  const remote = { desired_roles: ['backend engineer'], location: 'Remote' as const };

  it('rejects region-locked Remotive jobs for Lagos and Remote users', () => {
    for (const loc of ['USA Only', 'Europe']) {
      expect(matchesProfile(rem(loc), lagos)).toBe(false);
      expect(matchesProfile(rem(loc), remote)).toBe(false);
    }
  });

  it('accepts open or Africa-friendly Remotive jobs', () => {
    for (const loc of ['Worldwide', 'Africa', 'Remote', 'EMEA', '']) {
      expect(matchesProfile(rem(loc), lagos)).toBe(true);
      expect(matchesProfile(rem(loc), remote)).toBe(true);
    }
  });

  it('a null location preference passes any Remotive location', () => {
    expect(matchesProfile(rem('USA Only'), { desired_roles: ['backend engineer'], location: null })).toBe(true);
  });
});

