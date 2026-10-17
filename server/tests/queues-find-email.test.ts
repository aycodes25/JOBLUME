import { describe, expect, it, vi } from 'vitest';
import { enqueueFindEmail, findEmailJobId, QUEUES } from '../src/queues.js';

describe('find-email queue helpers', () => {
  it('has a queue name and a deterministic job id without a colon', () => {
    expect(QUEUES.findEmail).toBe('find-email');
    expect(findEmailJobId('abc')).toBe('find-email-abc');
  });

  it('adds one job per application under the deterministic id', async () => {
    const queue = { getJob: vi.fn().mockResolvedValue(undefined), add: vi.fn().mockResolvedValue(undefined) };
    await enqueueFindEmail(queue as never, 'abc');
    expect(queue.add).toHaveBeenCalledWith('find-email', { applicationId: 'abc' }, { jobId: 'find-email-abc' });
  });

  it('removes a previously failed job with the same id first', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const queue = { getJob: vi.fn().mockResolvedValue({ isFailed: async () => true, remove }), add: vi.fn().mockResolvedValue(undefined) };
    await enqueueFindEmail(queue as never, 'abc');
    expect(remove).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalled();
  });

  it('leaves a job that has not failed alone', async () => {
    const remove = vi.fn();
    const queue = { getJob: vi.fn().mockResolvedValue({ isFailed: async () => false, remove }), add: vi.fn().mockResolvedValue(undefined) };
    await enqueueFindEmail(queue as never, 'abc');
    expect(remove).not.toHaveBeenCalled();
  });
});
