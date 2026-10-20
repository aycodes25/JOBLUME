import { describe, expect, it } from 'vitest';
import { matchesProfile, prefilterJob, words, type MatchProfile } from '../../src/domain/prefilter.js';

const profile = { desired_roles: ['backend engineer'], location: 'Lagos' as const };

describe('words', () => {
  it('lowercases and splits on anything but letters, digits, + and #', () => {
    expect(words('C++/C# Developer (Remote)')).toEqual(['c++', 'c#', 'engineer', 'remote']);
  });

  it('joins common spellings so they compare equal', () => {
    expect(words('Full Stack Developer')).toEqual(['fullstack', 'engineer']);
    expect(words('Full-Stack Engineer')).toEqual(['fullstack', 'engineer']);
    expect(words('Fullstack Dev')).toEqual(['fullstack', 'engineer']);
    expect(words('Front End Engineer')).toEqual(['frontend', 'engineer']);
    expect(words('Back-end Programmer')).toEqual(['backend', 'engineer']);
    expect(words('Node.js Developer')).toEqual(['node', 'engineer']);
    expect(words('NodeJS Developer')).toEqual(['node', 'engineer']);
  });

  it('drops single letters', () => {
    expect(words('A Data Analyst')).toEqual(['data', 'analyst']);
  });
});

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

describe('prefilterJob reason codes', () => {
  const job = { title: 'Backend Engineer', location: 'Lagos', source: 'myjobmag' as const };

  it('says ok when the job fits', () => {
    expect(prefilterJob(job, profile)).toEqual({ ok: true });
  });

  it('says no_roles when the user has no roles, or only roles with no usable words', () => {
    expect(prefilterJob(job, { ...profile, desired_roles: [] })).toEqual({ ok: false, reason: 'no_roles' });
    expect(prefilterJob(job, { ...profile, desired_roles: ['a', '!'] })).toEqual({ ok: false, reason: 'no_roles' });
  });

  it('says title when no role fits, even if the place would not fit either', () => {
    expect(prefilterJob({ ...job, title: 'Marketing Manager', location: 'Abuja' }, profile)).toEqual({ ok: false, reason: 'title' });
  });

  it('says location when the title fits but the place does not', () => {
    expect(prefilterJob({ ...job, location: 'Abuja' }, profile)).toEqual({ ok: false, reason: 'location' });
  });
});

// The roles one real user searches for, against titles that boards really post.
describe('real roles table', () => {
  const user: MatchProfile = {
    desired_roles: ['Full Stack Developer', 'JavaScript Developer', 'Software Engineer', 'Backend Developer'],
    skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'React Native'],
    location: 'Remote',
  };
  const remote = (title: string) => ({ title, location: 'Worldwide', source: 'remotive' as const });

  it.each([
    'Full Stack Developer',
    'Senior Full-Stack Engineer',
    'Fullstack Developer (React/Node)',
    'Full Stack Software Engineer',
    'JavaScript Developer',
    'JavaScript Engineer',
    'Senior JS/TypeScript Engineer',
    'Software Engineer',
    'Senior Software Engineer II',
    'Software Developer',
    'Staff Software Engineer, Platform',
    'Backend Developer',
    'Back End Engineer',
    'Senior Backend Engineer (Node.js)',
    'Sr. Backend Developer',
    'Node.js Developer',
    'React Developer',
    'React Native Engineer',
    'Frontend Developer - React',
    'Software Engineer (Remote)',
  ])('accepts "%s"', (title) => {
    expect(prefilterJob(remote(title), user)).toEqual({ ok: true });
  });

  it.each([
    'Marketing Manager',
    'Sales Executive',
    'Data Entry Clerk',
    'Civil Engineer',
    'Mechanical Engineer',
    'Customer Support Engineer',
    'Sales Engineer',
    'DevOps Engineer',
    'Frontend Developer',
    'Product Designer',
    'Account Manager',
    'Registered Nurse',
  ])('turns away "%s" on the title', (title) => {
    expect(prefilterJob(remote(title), user)).toEqual({ ok: false, reason: 'title' });
  });

  it.each([
    'Backend Developer Intern',
    'Software Engineering Internship Software Engineer',
    'Software Engineer (Unpaid)',
    'Volunteer Full Stack Developer',
    'Software Engineer - Intern',
  ])('turns away "%s" because of the blocklist', (title) => {
    expect(prefilterJob(remote(title), user)).toEqual({ ok: false, reason: 'title' });
  });

  it('lets a blocklist word through when a desired role contains it', () => {
    const internUser: MatchProfile = { desired_roles: ['Software Engineering Intern'], location: null };
    expect(prefilterJob({ title: 'Software Engineering Intern', location: '', source: 'myjobmag' }, internUser)).toEqual({ ok: true });
    expect(prefilterJob({ title: 'Software Engineer', location: '', source: 'myjobmag' }, internUser)).toEqual({ ok: false, reason: 'title' });
  });

  it('does not treat "International" as the blocked word "intern"', () => {
    expect(prefilterJob(remote('International Software Engineer'), user)).toEqual({ ok: true });
  });

  it('matches a longer role on 60 percent of its words plus a core noun', () => {
    const senior: MatchProfile = { desired_roles: ['Senior Backend Engineer'], location: null };
    expect(prefilterJob({ title: 'Backend Engineer', location: '', source: 'myjobmag' }, senior)).toEqual({ ok: true });
    expect(prefilterJob({ title: 'Senior Backend Analyst', location: '', source: 'myjobmag' }, senior)).toEqual({ ok: false, reason: 'title' });
  });

  it('needs the core noun for a skill match', () => {
    expect(prefilterJob(remote('React Designer'), user)).toEqual({ ok: false, reason: 'title' });
    expect(prefilterJob(remote('React Architect'), user)).toEqual({ ok: true });
  });
});

describe('real roles table, places', () => {
  const lagos: MatchProfile = { desired_roles: ['Software Engineer'], skills: ['React'], location: 'Lagos' };
  const remote: MatchProfile = { ...lagos, location: 'Remote' };
  const job = (location: string, source: 'myjobmag' | 'remoteok' | 'weworkremotely' | 'himalayas' | 'arbeitnow') => ({ title: 'Software Engineer', location, source });

  it('a Lagos user keeps Lagos jobs and any remote job, and drops other cities', () => {
    expect(prefilterJob(job('Lagos', 'myjobmag'), lagos)).toEqual({ ok: true });
    expect(prefilterJob(job('Lagos, Nigeria', 'myjobmag'), lagos)).toEqual({ ok: true });
    expect(prefilterJob(job('Remote, Germany', 'arbeitnow'), lagos)).toEqual({ ok: true });
    expect(prefilterJob(job('Abuja', 'myjobmag'), lagos)).toEqual({ ok: false, reason: 'location' });
    expect(prefilterJob(job('Port Harcourt', 'myjobmag'), lagos)).toEqual({ ok: false, reason: 'location' });
  });

  it('a Remote user keeps remote, worldwide, anywhere, Africa, Nigeria and EMEA places', () => {
    for (const place of ['Remote', 'Worldwide', 'Anywhere in the World', 'Africa', 'Nigeria', 'EMEA', 'Lagos, Nigeria']) {
      expect(prefilterJob(job(place, 'myjobmag'), remote)).toEqual({ ok: true });
    }
    expect(prefilterJob(job('Abuja', 'myjobmag'), remote)).toEqual({ ok: false, reason: 'location' });
  });

  it('remote boards keep open regions and drop region-locked jobs for every preference', () => {
    for (const source of ['remoteok', 'weworkremotely', 'himalayas'] as const) {
      for (const preference of [lagos, remote]) {
        expect(prefilterJob(job('Anywhere in the World', source), preference)).toEqual({ ok: true });
        expect(prefilterJob(job('India, Nigeria, Philippines', source), preference)).toEqual({ ok: true });
        expect(prefilterJob(job('Worldwide', source), preference)).toEqual({ ok: true });
        expect(prefilterJob(job('', source), preference)).toEqual({ ok: true });
        expect(prefilterJob(job('USA Only', source), preference)).toEqual({ ok: false, reason: 'location' });
        expect(prefilterJob(job('North America Only', source), preference)).toEqual({ ok: false, reason: 'location' });
        expect(prefilterJob(job('Copenhagen', source), preference)).toEqual({ ok: false, reason: 'location' });
      }
    }
  });

  it('a null preference keeps every place', () => {
    expect(prefilterJob(job('USA Only', 'remoteok'), { ...lagos, location: null })).toEqual({ ok: true });
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
