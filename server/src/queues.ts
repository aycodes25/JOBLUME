import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { ScrapeSource } from './scrapers/index.js';

export const QUEUES = { scrape: 'scrape', match: 'match', tailor: 'tailor' } as const;

export type ScrapeJobData = { source: ScrapeSource };
export type MatchJobData = { kind: 'job'; jobId: string } | { kind: 'user'; userId: string };
export type TailorJobData = { userId: string; jobId: string };

/** BullMQ forbids ":" in custom job ids. Deterministic id = one tailor job per (user, job). */
export const tailorJobId = (userId: string, jobId: string) => `tailor-${userId}-${jobId}`;

export function createQueues(connection: Redis) {
  const opts = {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 30_000 },
      removeOnComplete: { age: 86_400, count: 1000 },
      removeOnFail: { age: 604_800 },
    },
  };
  return {
    scrape: new Queue<ScrapeJobData>(QUEUES.scrape, opts),
    match: new Queue<MatchJobData>(QUEUES.match, opts),
    tailor: new Queue<TailorJobData>(QUEUES.tailor, opts),
  };
}

export type Queues = ReturnType<typeof createQueues>;
