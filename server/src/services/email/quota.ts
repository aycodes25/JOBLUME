import type { Redis } from 'ioredis';

/** A calendar-month call budget kept in Redis (for Hunter's small free tier). */
export function createMonthlyQuota(redis: Pick<Redis, 'incr' | 'expire'>, limit: number, now: () => Date = () => new Date()) {
  return {
    async consume(): Promise<boolean> {
      const key = `hunter:${now().toISOString().slice(0, 7)}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 40 * 86_400);
      return count <= limit;
    },
  };
}
