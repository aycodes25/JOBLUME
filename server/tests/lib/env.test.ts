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

describe('loadEnv', () => {
  it('parses a valid environment and applies defaults', () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(4000);
    expect(env.OPENAI_MODEL).toBe('gpt-4o-mini');
    expect(env.AI_DAILY_LIMIT).toBe(1400);
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it('treats blank optional values as undefined', () => {
    expect(loadEnv({ ...valid, OPENAI_API_KEY: '' }).OPENAI_API_KEY).toBeUndefined();
  });

  it('throws naming every missing variable', () => {
    const { GEMINI_API_KEY, ENCRYPTION_KEY, ...rest } = valid;
    expect(() => loadEnv(rest)).toThrowError(/GEMINI_API_KEY[\s\S]*ENCRYPTION_KEY/);
  });

  it('rejects an encryption key that is not 64 hex chars', () => {
    expect(() => loadEnv({ ...valid, ENCRYPTION_KEY: 'short' })).toThrowError(/ENCRYPTION_KEY/);
  });

  it('rejects a non-redis URL', () => {
    expect(() => loadEnv({ ...valid, UPSTASH_REDIS_URL: 'https://x' })).toThrowError(/UPSTASH_REDIS_URL/);
  });
});
