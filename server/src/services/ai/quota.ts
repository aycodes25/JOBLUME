import type { Redis } from 'ioredis';

export function createQuota(redis: Pick<Redis, 'incr' | 'expire'>, limit: number, now: () => Date = () => new Date()) {
  return {
    /** Returns true if a call is still within today's (UTC) budget. */
    async consume(): Promise<boolean> {
      const key = `ai:gemini:${now().toISOString().slice(0, 10)}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 172_800);
      return count <= limit;
    },
  };
}

export function msUntilUtcMidnight(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}
