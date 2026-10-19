import { describe, expect, it } from 'vitest';
import { domainFromWebsite, JOB_FIELD_LIMITS, normaliseJob, tidyLocation } from '../../src/domain/jobs.js';

const base = {
  title: '  Data   Analyst ',
  company: ' Acme\nAnalytics ',
  location: ' Lagos ',
  description: '  Line one.\r\n\r\n\r\n\r\nLine two.  ',
  source: 'linkedin' as const,
  url: 'https://www.linkedin.com/jobs/view/4012345678/',
};

describe('normaliseJob', () => {
  it('tidies whitespace and keeps the source and url', () => {
    expect(normaliseJob(base)).toEqual({
      title: 'Data Analyst', company: 'Acme Analytics', location: 'Lagos', description: 'Line one.\n\nLine two.',
      source: 'linkedin', url: base.url, companyDomain: null,
    });
  });

  it.each([
    ['the title is blank', { title: '   ' }],
    ['the company is missing', { company: undefined }],
    ['the description is empty', { description: '' }],
    ['the title is not text', { title: 42 }],
  ])('returns null when %s', (_name, over) => {
    expect(normaliseJob({ ...base, ...over })).toBeNull();
  });

  it('returns null for a url that is not http(s)', () => {
    expect(normaliseJob({ ...base, url: 'javascript:alert(1)' })).toBeNull();
  });

  it('allows an empty location and keeps a company domain', () => {
    expect(normaliseJob({ ...base, location: undefined, companyDomain: 'acme.com' })).toMatchObject({ location: '', companyDomain: 'acme.com' });
  });

  it('caps every field', () => {
    const job = normaliseJob({ ...base, title: 'a'.repeat(1000), company: 'b'.repeat(1000), location: 'c'.repeat(1000), description: 'd'.repeat(60_000) });
    expect(job?.title).toHaveLength(JOB_FIELD_LIMITS.title);
    expect(job?.company).toHaveLength(JOB_FIELD_LIMITS.company);
    expect(job?.location).toHaveLength(JOB_FIELD_LIMITS.location);
    expect(job?.description).toHaveLength(JOB_FIELD_LIMITS.description);
  });
});

describe('tidyLocation', () => {
  it('joins the parts, drops blanks and repeats, and names Nigeria', () => {
    expect(tidyLocation(['Lagos', 'lagos', null, ' ', 'NG'])).toBe('Lagos, Nigeria');
    expect(tidyLocation(['Abuja', 'FCT', 'Nigeria'])).toBe('Abuja, FCT, Nigeria');
    expect(tidyLocation([])).toBe('');
  });
});

describe('domainFromWebsite', () => {
  it.each([
    ['https://www.acme.com/careers', 'acme.com'],
    ['http://Jobs.Acme.co.uk', 'jobs.acme.co.uk'],
    ['https://www.linkedin.com/company/acme', null],
    ['https://ng.indeed.com/cmp/acme', null],
    ['not a url', null],
    [null, null],
    [42, null],
  ])('reads %j as %j', (input, expected) => {
    expect(domainFromWebsite(input)).toBe(expected);
  });
});
