import { describe, expect, it } from 'vitest';
import { PHONE_PATTERN, profilePatchSchema } from '../src/index.js';

describe('profilePatchSchema contact details', () => {
  it('accepts every contact field, trimming text', () => {
    const body = {
      full_name: '  Ada Lovelace ',
      phone: '+234 (801) 234-5678',
      city: ' Lagos ',
      linkedin_url: 'https://www.linkedin.com/in/ada',
      github_url: 'https://github.com/ada',
      portfolio_url: 'https://ada.dev',
    };
    expect(profilePatchSchema.parse(body)).toEqual({ ...body, full_name: 'Ada Lovelace', city: 'Lagos' });
  });

  it('accepts null to clear a contact field', () => {
    const body = { phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null };
    expect(profilePatchSchema.parse(body)).toEqual(body);
  });

  it.each([
    ['an http link', { linkedin_url: 'http://linkedin.com/in/ada' }],
    ['a javascript link', { github_url: 'javascript:alert(1)' }],
    ['a link that is not a url', { portfolio_url: 'my website' }],
    ['a link over 300 characters', { portfolio_url: `https://example.com/${'a'.repeat(300)}` }],
    ['a phone with letters', { phone: '0801-CALL-ME' }],
    ['a phone shorter than 7 characters', { phone: '12345' }],
    ['a phone longer than 20 characters', { phone: '1'.repeat(21) }],
    ['an empty city', { city: '   ' }],
    ['a city over 80 characters', { city: 'x'.repeat(81) }],
    ['a name of one character', { full_name: 'A' }],
    ['a null name', { full_name: null }],
    ['a name over 120 characters', { full_name: 'x'.repeat(121) }],
    ['an unknown contact field', { twitter_url: 'https://x.com/ada' }],
  ])('rejects %s', (_name, body) => {
    expect(profilePatchSchema.safeParse(body).success).toBe(false);
  });

  it('exports the phone rule used by the database check', () => {
    expect(PHONE_PATTERN.source).toBe('^[0-9 +()-]{7,20}$');
  });
});
