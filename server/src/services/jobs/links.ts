import type { JobLinksService } from '../../api/deps.js';
import type { FetchJobData } from '../../queues.js';
import type { JobFetchesRepo } from './fetches-repo.js';

export const RECENT_FETCHES = 20;

export interface JobLinksDeps {
  findJobIdByUrl(url: string): Promise<string | null>;
  fetches: JobFetchesRepo;
  enqueueFetch(data: FetchJobData): Promise<void>;
  enqueueUserMatch(userId: string, jobId: string): Promise<void>;
}

export function createJobLinksService(d: JobLinksDeps): JobLinksService {
  return {
    async addFromUrl(userId, link) {
      const existing = await d.findJobIdByUrl(link.url);
      if (existing) {
        // Already stored: no page fetch; the user's application comes through the normal match flow.
        await d.fetches.save(userId, link.url, { status: 'done', jobId: existing });
        await d.enqueueUserMatch(userId, existing);
        return { job_id: existing };
      }
      await d.fetches.save(userId, link.url, { status: 'queued' });
      await d.enqueueFetch({ userId, url: link.url, source: link.source });
      return { queued: true };
    },
    async listFetches(userId) {
      return d.fetches.listRecent(userId, RECENT_FETCHES);
    },
  };
}
