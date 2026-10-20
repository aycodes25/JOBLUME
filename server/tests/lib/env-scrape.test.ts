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

describe('loadEnv: SCRAPE_EVERY_MINUTES', () => {
  it('defaults to every 120 minutes', () => {
    expect(loadEnv(valid).SCRAPE_EVERY_MINUTES).toBe(120);
  });

  it('reads a custom interval and treats blank as unset', () => {
    expect(loadEnv({ ...valid, SCRAPE_EVERY_MINUTES: '45' }).SCRAPE_EVERY_MINUTES).toBe(45);
    expect(loadEnv({ ...valid, SCRAPE_EVERY_MINUTES: '30' }).SCRAPE_EVERY_MINUTES).toBe(30);
    expect(loadEnv({ ...valid, SCRAPE_EVERY_MINUTES: '' }).SCRAPE_EVERY_MINUTES).toBe(120);
  });

  it('refuses an interval under 30 minutes, a fraction, or text', () => {
    for (const bad of ['29', '5', '0', '-60', '60.5', 'often']) {
      expect(() => loadEnv({ ...valid, SCRAPE_EVERY_MINUTES: bad })).toThrowError(/SCRAPE_EVERY_MINUTES/);
    }
  });
});
