import type { Redis } from 'ioredis';

const THROTTLE_SECONDS = 3600;

export interface DigestThrottle {
  /** True when this user has had no digest in the last hour (and records that one is being sent now). */
  acquire(userId: string): Promise<boolean>;
  /** Gives the hour back, used when the send failed so the next run can try again. */
  release(userId: string): Promise<void>;
}

const key = (userId: string) => `alert:digest:${userId}`;

/** At most one digest per user per hour, kept in Redis so it holds across worker restarts. */
export function createDigestThrottle(redis: Pick<Redis, 'set' | 'del'>): DigestThrottle {
  return {
    async acquire(userId) {
      return (await redis.set(key(userId), '1', 'EX', THROTTLE_SECONDS, 'NX')) === 'OK';
    },
    async release(userId) {
      await redis.del(key(userId));
    },
  };
}
