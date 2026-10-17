import { Redis } from 'ioredis';

/** BullMQ requires maxRetriesPerRequest: null. Create one connection per Worker/Queue consumer. */
export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: false });
}
