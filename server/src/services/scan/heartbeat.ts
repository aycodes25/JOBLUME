import type { Redis } from 'ioredis';

const KEY = 'worker:heartbeat';
/** The key expires on its own, so a dead worker's time never lingers for long. */
const KEY_TTL_SECONDS = 600;

/** The worker reports in every minute; the API calls it alive when the last report is at most this old. */
export const WORKER_ALIVE_MS = 5 * 60_000;
export const HEARTBEAT_EVERY_MS = 60_000;

export interface Heartbeat {
  /** Called by the worker: remember that it is running now. */
  beat(): Promise<void>;
  /** Called by the API: when the worker last reported, or null if it never has (or the report expired). */
  lastSeen(): Promise<Date | null>;
}

/** Kept in Redis (not the database): one tiny key, no table, no migration. */
export function createHeartbeat(redis: Pick<Redis, 'set' | 'get'>, now: () => Date = () => new Date()): Heartbeat {
  return {
    async beat() {
      await redis.set(KEY, now().toISOString(), 'EX', KEY_TTL_SECONDS);
    },
    async lastSeen() {
      const value = await redis.get(KEY);
      if (!value) return null;
      const seen = new Date(value);
      return Number.isNaN(seen.getTime()) ? null : seen;
    },
  };
}
