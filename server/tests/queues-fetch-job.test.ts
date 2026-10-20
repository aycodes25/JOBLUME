import { describe, expect, it, vi } from 'vitest';
import { enqueueFetchJob, FETCH_JOB_OPTIONS, fetchJobJobId, QUEUES, type FetchJobData } from '../src/queues.js';

const data: FetchJobData = { userId: 'u1', url: 'https://www.linkedin.com/jobs/view/4012345678/', source: 'linkedin' };

type Existing = { isFailed(): Promise<boolean>; isCompleted(): Promise<boolean>; remove(): Promise<void> };
function fakeQueue(existing?: Existing) {
  const getJob = vi.fn(async (_id: string) => existing as never);
  const add = vi.fn(async (..._a: unknown[]) => undefined as never);
  return { getJob, add };
}

describe('fetch-job queue', () => {
  it('is named fetch-job and tries twice', () => {
    expect(QUEUES.fetchJob).toBe('fetch-job');
    expect(FETCH_JOB_OPTIONS.attempts).toBe(2);
  });

  it('derives a stable id from the user and the canonical link, without a colon', () => {
    const id = fetchJobJobId('u1', data.url);
    expect(id).toBe(fetchJobJobId('u1', data.url));
    expect(id).toMatch(/^fetch-job-u1-[0-9a-f]{32}$/);
    expect(fetchJobJobId('u2', data.url)).not.toBe(id);
    expect(fetchJobJobId('u1', 'https://ng.indeed.com/viewjob?jk=0123456789abcdef')).not.toBe(id);
  });
});

describe('enqueueFetchJob', () => {
  const id = fetchJobJobId('u1', data.url);

  it('adds with the deterministic id', async () => {
    const q = fakeQueue();
    await enqueueFetchJob(q, data);
    expect(q.getJob).toHaveBeenCalledWith(id);
    expect(q.add).toHaveBeenCalledWith('fetch-job', data, { jobId: id });
  });

  it.each([
    ['failed', true, false],
    ['completed', false, true],
  ])('removes a %s job with the same id first, so the link can be fetched again', async (_n, failed, completed) => {
    const order: string[] = [];
    const q = fakeQueue({
      isFailed: async () => failed,
      isCompleted: async () => completed,
      remove: async () => {
        order.push('remove');
      },
    });
    q.add.mockImplementation(async () => {
      order.push('add');
      return undefined as never;
    });
    await enqueueFetchJob(q, data);
    expect(order).toEqual(['remove', 'add']);
  });

  it('leaves a waiting or running job alone', async () => {
    const remove = vi.fn(async () => undefined);
    const q = fakeQueue({ isFailed: async () => false, isCompleted: async () => false, remove });
    await enqueueFetchJob(q, data);
    expect(remove).not.toHaveBeenCalled();
    expect(q.add).toHaveBeenCalledTimes(1);
  });
});
