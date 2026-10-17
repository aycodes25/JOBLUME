import { describe, expect, it } from 'vitest';
import { createMonthlyQuota } from '../../src/services/email/quota.js';

function fakeRedis() {
  const store = new Map<string, number>();
  const expires = new Map<string, number>();
  return {
    store, expires,
    async incr(key: string) { const n = (store.get(key) ?? 0) + 1; store.set(key, n); return n; },
    async decr(key: string) { const n = (store.get(key) ?? 0) - 1; store.set(key, n); return n; },
    async expire(key: string, seconds: number) { expires.set(key, seconds); return 1; },
  };
}

describe('createMonthlyQuota', () => {
  it('allows searches up to the monthly limit then refuses', async () => {
    const quota = createMonthlyQuota(fakeRedis(), 2, () => new Date('2026-10-17T10:00:00Z'));
    expect(await quota.consume()).toBe(true);
    expect(await quota.consume()).toBe(true);
    expect(await quota.consume()).toBe(false);
  });

  it('starts a fresh count each calendar month and sets an expiry on first use', async () => {
    const redis = fakeRedis();
    let now = '2026-10-31T23:59:00Z';
    const quota = createMonthlyQuota(redis, 1, () => new Date(now));
    expect(await quota.consume()).toBe(true);
    expect(await quota.consume()).toBe(false);
    now = '2026-11-01T00:01:00Z';
    expect(await quota.consume()).toBe(true);
    expect(redis.expires.get('hunter:2026-10')).toBe(40 * 86_400);
    expect(redis.store.get('hunter:2026-11')).toBe(1);
  });
});

describe('createMonthlyQuota.refund', () => {
  it('gives a consumed call back so it can be used again', async () => {
    const redis = fakeRedis();
    const quota = createMonthlyQuota(redis, 1, () => new Date('2026-10-17T10:00:00Z'));
    expect(await quota.consume()).toBe(true);
    await quota.refund();
    expect(redis.store.get('hunter:2026-10')).toBe(0);
    expect(await quota.consume()).toBe(true);
  });
});
