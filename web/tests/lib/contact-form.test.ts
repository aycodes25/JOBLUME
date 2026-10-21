import type { Profile } from '@joblume/shared';
import { describe, expect, it } from 'vitest';
import { buildContactPatch, profileToContactValues, type ContactValues } from '@/lib/profile-form';

const values = (over: Partial<ContactValues> = {}): ContactValues => ({
  fullName: 'Ada Lovelace', phone: '+234 801 234 5678', city: 'Lagos', linkedinUrl: 'https://www.linkedin.com/in/ada', githubUrl: '', portfolioUrl: '', ...over,
});

describe('buildContactPatch', () => {
  it('builds a patch, turning blank links into null', () => {
    expect(buildContactPatch(values())).toEqual({
      ok: true,
      patch: { full_name: 'Ada Lovelace', phone: '+234 801 234 5678', city: 'Lagos', linkedin_url: 'https://www.linkedin.com/in/ada', github_url: null, portfolio_url: null },
    });
  });

  it('clears every contact field when all are blank and leaves the name out', () => {
    expect(buildContactPatch(values({ fullName: '', phone: '', city: '', linkedinUrl: '' }))).toEqual({
      ok: true,
      patch: { phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null },
    });
  });

  it.each([
    ['an http link', { githubUrl: 'http://github.com/ada' }, 'githubUrl'],
    ['a link without a scheme', { portfolioUrl: 'ada.dev' }, 'portfolioUrl'],
    ['a phone with letters', { phone: 'call me' }, 'phone'],
    ['a one-letter name', { fullName: 'A' }, 'fullName'],
    ['a city over 80 characters', { city: 'x'.repeat(81) }, 'city'],
  ])('reports %s on the right field', (_name, over, field) => {
    const res = buildContactPatch(values(over));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors)).toEqual([field]);
  });
});

describe('profileToContactValues', () => {
  const profile = { full_name: 'Ada Lovelace', phone: null, city: 'Lagos', linkedin_url: 'https://www.linkedin.com/in/ada', github_url: null, portfolio_url: null } as Profile;

  it('maps a profile to editable strings, using empty text for missing values', () => {
    expect(profileToContactValues(profile)).toEqual({
      fullName: 'Ada Lovelace', phone: '', city: 'Lagos', linkedinUrl: 'https://www.linkedin.com/in/ada', githubUrl: '', portfolioUrl: '',
    });
  });
});
