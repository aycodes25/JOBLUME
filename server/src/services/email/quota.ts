import type { Redis } from 'ioredis';

/** A calendar-month call budget kept in Redis (Hunter's and JSearch's small free tiers). The prefix names the counter. */
export function createMonthlyQuota(
  redis: Pick<Redis, 'incr' | 'decr' | 'expire'>,
  limit: number,
  now: () => Date = () => new Date(),
  prefix = 'hunter',
) {
  const monthKey = () => `${prefix}:${now().toISOString().slice(0, 7)}`;
  return {
    async refund(): Promise<void> {
      await redis.decr(monthKey());
    },
    async consume(): Promise<boolean> {
      const key = monthKey();
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 40 * 86_400);
      return count <= limit;
    },
  };
}
