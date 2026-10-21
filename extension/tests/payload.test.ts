import { describe, expect, it } from 'vitest';
import { LIMITS, httpsHref, validatePayload } from '../src/payload';
import { payload } from './helpers/dom';

describe('validatePayload', () => {
  it('accepts a full payload and returns a clean copy', () => {
    const input = payload();
    const out = validatePayload(input);
    expect(out).toEqual({ ...input, portfolio_url: 'https://ada.dev/' });
    expect(out).not.toBe(input);
  });

  it('accepts nulls and a missing cv', () => {
    const out = validatePayload({ job_url: 'https://example.com/jobs/1' });
    expect(out).toEqual({
      job_url: 'https://example.com/jobs/1', full_name: null, first_name: null, last_name: null, email: null, phone: null, city: null,
      linkedin_url: null, github_url: null, portfolio_url: null, cover_letter: null, cv: null,
    });
  });

  it('turns blank strings into null and trims text', () => {
    const out = validatePayload({ ...payload(), city: '   ', full_name: '  Ada Lovelace ' });
    expect(out?.city).toBeNull();
    expect(out?.full_name).toBe('Ada Lovelace');
  });

  it('allows line breaks in the cover letter only', () => {
    expect(validatePayload({ ...payload(), cover_letter: 'Dear team,\r\n\tHello' })?.cover_letter).toBe('Dear team,\r\n\tHello');
    expect(validatePayload({ ...payload(), cover_letter: 'bad\u0000letter' })).toBeNull();
    expect(validatePayload({ ...payload(), full_name: 'Ada\nLovelace' })).toBeNull();
    expect(validatePayload({ ...payload(), city: 'Lagos\u0007' })).toBeNull();
  });

  it.each([
    ['not an object', 'hello'],
    ['an array', []],
    ['null', null],
    ['an unknown key', { ...payload(), password: 'x' }],
    ['a missing job_url', { ...payload(), job_url: undefined }],
    ['an http job_url', payload({ job_url: 'http://example.com/job' })],
    ['a javascript job_url', payload({ job_url: 'javascript:alert(1)' })],
    ['a job_url with credentials', payload({ job_url: 'https://user:pw@example.com/job' })],
    ['an http linkedin_url', payload({ linkedin_url: 'http://linkedin.com/in/a' })],
    ['a non-string github_url', { ...payload(), github_url: 5 }],
    ['an http cv url', payload({ cv: { url: 'http://abcd1234.supabase.co/x.pdf', filename: 'cv.pdf' } })],
    ['a cv with an extra key', { ...payload(), cv: { url: 'https://abcd1234.supabase.co/x.pdf', filename: 'cv.pdf', extra: 1 } }],
    ['a cv filename with a slash', payload({ cv: { url: 'https://abcd1234.supabase.co/x.pdf', filename: '../cv.pdf' } })],
    ['a bad email', payload({ email: 'not-an-email' })],
    ['a bad phone', payload({ phone: 'call me maybe' })],
    ['a name over the cap', payload({ full_name: 'x'.repeat(LIMITS.name + 1) })],
    ['a cover letter over the cap', payload({ cover_letter: 'x'.repeat(LIMITS.coverLetter + 1) })],
    ['a url over the cap', payload({ portfolio_url: `https://example.com/${'a'.repeat(LIMITS.url)}` })],
    ['a url with a space', payload({ portfolio_url: 'https://example.com/a b' })],
  ])('rejects %s', (_name, input) => {
    expect(validatePayload(input)).toBeNull();
  });
});

describe('httpsHref', () => {
  it('normalises https urls and rejects everything else', () => {
    expect(httpsHref('https://Example.com')).toBe('https://example.com/');
    expect(httpsHref('ftp://example.com')).toBeNull();
    expect(httpsHref('//example.com')).toBeNull();
    expect(httpsHref('')).toBeNull();
    expect(httpsHref(undefined)).toBeNull();
  });
});
