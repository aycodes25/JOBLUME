import { describe, expect, it } from 'vitest';
import { companyKey, dedupeJobs, dedupeKey, type NormalisedJob } from '../../src/domain/jobs.js';

const job = (over: Partial<NormalisedJob>): NormalisedJob => ({
  title: 'Backend Engineer',
  company: 'Acme Ltd',
  location: 'Lagos',
  description: 'd',
  source: 'myjobmag',
  url: 'https://x/1',
  companyDomain: null,
  ...over,
});

describe('dedupeKey', () => {
  it('ignores case, punctuation and company suffixes', () => {
    expect(dedupeKey('Acme Ltd.', 'Sr. Engineer')).toBe(dedupeKey('ACME Limited', 'Sr Engineer'));
  });

  it('strips Nigeria and legal suffixes from company only', () => {
    expect(dedupeKey('Viju Industries Nigeria Limited', 'Quality Assurance')).toBe('viju industries|quality assurance');
  });

  it('keeps different roles at the same company apart', () => {
    expect(dedupeKey('Acme', 'Data Analyst')).not.toBe(dedupeKey('Acme', 'Data Engineer'));
  });
});

describe('dedupeJobs', () => {
  it('keeps the first of each company+title', () => {
    const out = dedupeJobs([
      job({ url: 'https://x/1' }),
      job({ company: 'ACME Limited', url: 'https://x/2', source: 'jobberman' }),
      job({ title: 'Data Analyst', url: 'https://x/3' }),
    ]);
    expect(out.map((j) => j.url)).toEqual(['https://x/1', 'https://x/3']);
  });
});

describe('companyKey', () => {
  it('lowercases, strips punctuation and legal suffixes', () => {
    expect(companyKey('Viju Industries Nigeria Limited')).toBe('viju industries');
    expect(companyKey('Acme Ltd.')).toBe('acme');
    expect(companyKey('  ACME & Sons, Inc ')).toBe('acme and sons');
  });

  it('is empty when nothing meaningful is left', () => {
    expect(companyKey('Limited')).toBe('');
  });

  it('agrees with the company half of dedupeKey', () => {
    expect(dedupeKey('Acme Ltd', 'Dev')).toBe(`${companyKey('Acme Ltd')}|dev`);
  });
});
