import type { JobsService } from '../../api/deps.js';
import type { Queues } from '../../queues.js';

const hourBucket = (now: number) => Math.floor(now / 3_600_000);

/** Sources a user may trigger. Remotive is excluded: only the 6-hourly scheduler calls its API (max 4 calls/day). */
const REFRESH_SOURCES = ['myjobmag', 'jobberman'] as const;

export function createJobsService(queues: Pick<Queues, 'scrape' | 'match'>, now: () => number = Date.now): JobsService {
  const service: JobsService = {
    async rematch(userId) {
      // No custom jobId: BullMQ would drop the add while a same-id job exists in any state, losing catch-up runs.
      // matchUser is idempotent (existingJobIds + deterministic tailor job id).
      await queues.match.add('match', { kind: 'user', userId });
    },
    async refresh(userId) {
      for (const source of REFRESH_SOURCES) {
        await queues.scrape.add('scrape', { source }, { jobId: `refresh-${source}-${hourBucket(now())}` });
      }
      await service.rematch(userId);
    },
  };
  return service;
}
