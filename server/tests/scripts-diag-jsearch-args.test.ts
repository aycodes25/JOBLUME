import { describe, expect, it } from 'vitest';
import { keyNames, parseDiagArgs } from '../src/scripts/diag-jsearch-args.js';

describe('parseDiagArgs', () => {
  it('uses the env defaults and the default query', () => {
    expect(parseDiagArgs([], {})).toEqual({ query: 'full stack developer remote', onsite: false, provider: 'rapidapi', path: '/search-v2' });
    expect(parseDiagArgs([], { provider: 'openwebninja', path: '/search' })).toMatchObject({ provider: 'openwebninja', path: '/search' });
  });
  it('lets flags override the env', () => {
    const a = parseDiagArgs(['go dev', '--onsite', '--path=/search', '--provider=openwebninja'], { provider: 'rapidapi', path: '/search-v2' });
    expect(a).toEqual({ query: 'go dev', onsite: true, provider: 'openwebninja', path: '/search' });
  });
  it('rejects unknown values', () => {
    expect(() => parseDiagArgs(['--path=/x'], {})).toThrow(/--path/);
    expect(() => parseDiagArgs(['--provider=x'], {})).toThrow(/--provider/);
  });
});

describe('keyNames', () => {
  it('returns names only, for plain objects only', () => {
    expect(keyNames({ jobs: [], next_cursor: 'secret text' })).toEqual(['jobs', 'next_cursor']);
    expect(keyNames([1])).toEqual([]);
    expect(keyNames(null)).toEqual([]);
    expect(keyNames('x')).toEqual([]);
  });
});
