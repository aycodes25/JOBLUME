import { describe, expect, it } from 'vitest';
import { createQuota, msUntilUtcMidnight } from '../../src/services/ai/quota.js';

function fakeRedis() {
  const store = new Map<string, number>();
  const expires = new Map<string, number>();
  return {
    expires,
    async incr(key: string) { const n = (store.get(key) ?? 0) + 1; store.set(key, n); return n; },
    async expire(key: string, seconds: number) { expires.set(key, seconds); return 1; },
  };
}

describe('createQuota', () => {
  it('allows up to the limit then refuses', async () => {
    const quota = createQuota(fakeRedis(), 2, () => new Date('2026-10-17T10:00:00Z'));
    expect(await quota.consume()).toBe(true);
    expect(await quota.consume()).toBe(true);
    expect(await quota.consume()).toBe(false);
  });

  it('uses a fresh counter on a new UTC day and sets an expiry on first use', async () => {
    const redis = fakeRedis();
    let day = '2026-10-17T23:59:00Z';
    const quota = createQuota(redis, 1, () => new Date(day));
    expect(await quota.consume()).toBe(true);
    expect(await quota.consume()).toBe(false);
    day = '2026-10-18T00:01:00Z';
    expect(await quota.consume()).toBe(true);
    expect(redis.expires.get('ai:gemini:2026-10-17')).toBe(172800);
  });
});

describe('msUntilUtcMidnight', () => {
  it('returns the time left in the UTC day', () => {
    expect(msUntilUtcMidnight(new Date('2026-10-17T23:00:00Z'))).toBe(3_600_000);
  });
});
