import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { ScrapeSource } from './scrapers/index.js';

export const QUEUES = { scrape: 'scrape', match: 'match', tailor: 'tailor', findEmail: 'find-email' } as const;

export type ScrapeJobData = { source: ScrapeSource };
export type MatchJobData = { kind: 'job'; jobId: string } | { kind: 'user'; userId: string };
export type TailorJobData = { userId: string; jobId: string };
export type FindEmailJobData = { applicationId: string };

/** BullMQ forbids ":" in custom job ids. Deterministic id = one tailor job per (user, job). */
export const tailorJobId = (userId: string, jobId: string) => `tailor-${userId}-${jobId}`;

export const findEmailJobId = (applicationId: string) => `find-email-${applicationId}`;

const BASE_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: { age: 86_400, count: 1000 },
  removeOnFail: { age: 604_800 },
};

// Tailor jobs depend on an external AI provider: give outages hours (not ~90s) to clear, and let failed ids expire after a day.
const TAILOR_JOB_OPTIONS = {
  ...BASE_JOB_OPTIONS,
  attempts: 6,
  backoff: { type: 'exponential' as const, delay: 300_000 },
  removeOnFail: { age: 86_400 },
};

export function createQueues(connection: Redis) {
  return {
    scrape: new Queue<ScrapeJobData>(QUEUES.scrape, { connection, defaultJobOptions: BASE_JOB_OPTIONS }),
    match: new Queue<MatchJobData>(QUEUES.match, { connection, defaultJobOptions: BASE_JOB_OPTIONS }),
    tailor: new Queue<TailorJobData>(QUEUES.tailor, { connection, defaultJobOptions: TAILOR_JOB_OPTIONS }),
    findEmail: new Queue<FindEmailJobData>(QUEUES.findEmail, {
      connection,
      defaultJobOptions: { ...BASE_JOB_OPTIONS, attempts: 3, backoff: { type: 'exponential' as const, delay: 60_000 }, removeOnFail: { age: 86_400 } },
    }),
  };
}

/** Add a tailor job; a previously failed job with the same deterministic id is removed first so it can be retried. */
export async function enqueueTailor(
  queue: Pick<Queue<TailorJobData>, 'getJob' | 'add'>,
  userId: string,
  jobId: string,
): Promise<void> {
  const id = tailorJobId(userId, jobId);
  const existing = await queue.getJob(id);
  if (existing && (await existing.isFailed())) await existing.remove();
  await queue.add('tailor', { userId, jobId }, { jobId: id });
}

export async function enqueueFindEmail(
  queue: Pick<Queue<FindEmailJobData>, 'getJob' | 'add'>,
  applicationId: string,
): Promise<void> {
  const id = findEmailJobId(applicationId);
  const existing = await queue.getJob(id);
  if (existing && (await existing.isFailed())) await existing.remove();
  await queue.add('find-email', { applicationId }, { jobId: id });
}

export type Queues = ReturnType<typeof createQueues>;
