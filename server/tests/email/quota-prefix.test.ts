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

const now = () => new Date('2026-10-18T10:00:00Z');

describe('createMonthlyQuota with a key prefix', () => {
  it('counts JSearch calls under their own monthly key, apart from Hunter', async () => {
    const redis = fakeRedis();
    const jsearch = createMonthlyQuota(redis, 1, now, 'jsearch');
    const hunter = createMonthlyQuota(redis, 1, now);
    expect(await jsearch.consume()).toBe(true);
    expect(await jsearch.consume()).toBe(false);
    expect(await hunter.consume()).toBe(true);
    expect(redis.store.get('jsearch:2026-10')).toBe(2);
    expect(redis.store.get('hunter:2026-10')).toBe(1);
    expect(redis.expires.get('jsearch:2026-10')).toBe(40 * 86_400);
  });

  it('refunds against the prefixed key', async () => {
    const redis = fakeRedis();
    const jsearch = createMonthlyQuota(redis, 1, now, 'jsearch');
    expect(await jsearch.consume()).toBe(true);
    await jsearch.refund();
    expect(redis.store.get('jsearch:2026-10')).toBe(0);
    expect(await jsearch.consume()).toBe(true);
  });
});
