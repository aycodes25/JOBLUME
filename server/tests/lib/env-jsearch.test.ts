import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/lib/env.js';

const valid = {
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  GEMINI_API_KEY: 'g',
  GEMINI_MODEL: 'gemini-2.5-flash',
  UPSTASH_REDIS_URL: 'rediss://default:pw@host.upstash.io:6379',
  ENCRYPTION_KEY: 'a'.repeat(64),
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('loadEnv: JSearch', () => {
  it('leaves JSearch off by default with a monthly limit of 50', () => {
    const env = loadEnv(valid);
    expect(env.JSEARCH_API_KEY).toBeUndefined();
    expect(env.JSEARCH_MONTHLY_LIMIT).toBe(50);
  });

  it('reads the key and a custom limit', () => {
    const env = loadEnv({ ...valid, JSEARCH_API_KEY: 'rapid-key', JSEARCH_MONTHLY_LIMIT: '10' });
    expect(env.JSEARCH_API_KEY).toBe('rapid-key');
    expect(env.JSEARCH_MONTHLY_LIMIT).toBe(10);
  });

  it('treats blank values as unset', () => {
    const env = loadEnv({ ...valid, JSEARCH_API_KEY: '  ', JSEARCH_MONTHLY_LIMIT: '' });
    expect(env.JSEARCH_API_KEY).toBeUndefined();
    expect(env.JSEARCH_MONTHLY_LIMIT).toBe(50);
  });

  it('rejects a limit that is not a positive integer', () => {
    expect(() => loadEnv({ ...valid, JSEARCH_MONTHLY_LIMIT: '0' })).toThrowError(/JSEARCH_MONTHLY_LIMIT/);
  });

  it('defaults JSEARCH_PROVIDER to rapidapi and accepts openwebninja', () => {
    expect(loadEnv(valid).JSEARCH_PROVIDER).toBe('rapidapi');
    expect(loadEnv({ ...valid, JSEARCH_PROVIDER: '' }).JSEARCH_PROVIDER).toBe('rapidapi');
    expect(loadEnv({ ...valid, JSEARCH_PROVIDER: 'openwebninja' }).JSEARCH_PROVIDER).toBe('openwebninja');
    expect(() => loadEnv({ ...valid, JSEARCH_PROVIDER: 'other' })).toThrow();
  });
});
