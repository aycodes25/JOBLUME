import { createHash } from 'node:crypto';
import type { LinkSource } from '@joblume/shared';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { ScrapeSource } from './scrapers/index.js';

export const QUEUES = { scrape: 'scrape', match: 'match', tailor: 'tailor', findEmail: 'find-email', followups: 'followups', send: 'send', fetchJob: 'fetch-job', alerts: 'alerts' } as const;

export type ScrapeJobData = { source: ScrapeSource };
export type MatchJobData =
  | { kind: 'job'; jobId: string }
  | { kind: 'user'; userId: string }
  | { kind: 'user-job'; userId: string; jobId: string };
/** A pasted job link, already canonicalised. */
export type FetchJobData = { userId: string; url: string; source: LinkSource };
export type TailorJobData = { userId: string; jobId: string };
export type FindEmailJobData = { applicationId: string };
export type FollowUpsJobData = { kind: 'scan' } | { kind: 'draft'; applicationId: string };
/** The new-match email digest: one repeating job that looks at every user who opted in. */
export type AlertsJobData = { kind: 'digest' };
export type SendJobData =
  | { kind: 'application'; userId: string; applicationId: string }
  | { kind: 'followup'; userId: string; followUpId: string };

/** BullMQ forbids ":" in custom job ids. Deterministic id = one tailor job per (user, job). */
export const tailorJobId = (userId: string, jobId: string) => `tailor-${userId}-${jobId}`;

export const findEmailJobId = (applicationId: string) => `find-email-${applicationId}`;

export const followUpDraftJobId = (applicationId: string) => `followup-draft-${applicationId}`;
export const sendJobId = (data: SendJobData) =>
  data.kind === 'application' ? `auto-send-${data.applicationId}` : `auto-followup-${data.followUpId}`;

/** A URL contains ":", which BullMQ forbids in ids, so the link is hashed. One fetch per (user, link). */
export const fetchJobJobId = (userId: string, url: string) =>
  `fetch-job-${userId}-${createHash('sha256').update(url).digest('hex').slice(0, 32)}`;

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

// One retry for a page that did not load; finished ids expire after an hour so the same link can be pasted again.
export const FETCH_JOB_OPTIONS = {
  ...BASE_JOB_OPTIONS,
  attempts: 2,
  backoff: { type: 'exponential' as const, delay: 60_000 },
  removeOnComplete: { age: 3_600, count: 1000 },
  removeOnFail: { age: 3_600 },
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
    followups: new Queue<FollowUpsJobData>(QUEUES.followups, { connection, defaultJobOptions: TAILOR_JOB_OPTIONS }),
    send: new Queue<SendJobData>(QUEUES.send, { connection, defaultJobOptions: { ...BASE_JOB_OPTIONS, attempts: 1 } }),
    fetchJob: new Queue<FetchJobData>(QUEUES.fetchJob, { connection, defaultJobOptions: FETCH_JOB_OPTIONS }),
    // One attempt: a failed digest is simply tried again by the next scheduled run.
    alerts: new Queue<AlertsJobData>(QUEUES.alerts, { connection, defaultJobOptions: { ...BASE_JOB_OPTIONS, attempts: 1 } }),
  };
}

/** Queue a page fetch. A finished (failed or completed) job with the same id is removed first so the link can be tried again. */
export async function enqueueFetchJob(queue: Pick<Queue<FetchJobData>, 'getJob' | 'add'>, data: FetchJobData): Promise<void> {
  const id = fetchJobJobId(data.userId, data.url);
  const existing = await queue.getJob(id);
  if (existing && ((await existing.isFailed()) || (await existing.isCompleted()))) await existing.remove();
  await queue.add('fetch-job', data, { jobId: id });
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

export async function enqueueFollowUpDraft(queue: Pick<Queue<FollowUpsJobData>, 'add'>, applicationId: string): Promise<void> {
  await queue.add('draft', { kind: 'draft', applicationId }, { jobId: followUpDraftJobId(applicationId) });
}

/** Queue an automatic send. The deterministic id means a send is never queued twice for the same item. */
export async function enqueueSend(queue: Pick<Queue<SendJobData>, 'add'>, data: SendJobData, delayMs: number): Promise<void> {
  await queue.add('send', data, { jobId: sendJobId(data), delay: delayMs });
}

export type Queues = ReturnType<typeof createQueues>;
