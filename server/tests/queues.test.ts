import { describe, expect, it, vi } from 'vitest';
import { enqueueTailor, tailorJobId } from '../src/queues.js';

function fakeQueue(existing: { isFailed: () => Promise<boolean>; remove: () => Promise<void> } | undefined) {
  const getJob = vi.fn(async (_id: string) => existing as never);
  const add = vi.fn(async (..._a: unknown[]) => undefined as never);
  return { getJob, add };
}

describe('enqueueTailor', () => {
  const id = tailorJobId('u1', 'j1');

  it('removes a failed existing job and then adds', async () => {
    const order: string[] = [];
    const remove = vi.fn(async () => void order.push('remove'));
    const q = fakeQueue({ isFailed: async () => true, remove });
    q.add.mockImplementation(async () => void order.push('add') as never);
    await enqueueTailor(q, 'u1', 'j1');
    expect(q.getJob).toHaveBeenCalledWith(id);
    expect(order).toEqual(['remove', 'add']);
    expect(q.add).toHaveBeenCalledWith('tailor', { userId: 'u1', jobId: 'j1' }, { jobId: id });
  });

  it('leaves a non-failed existing job alone and still calls add', async () => {
    const remove = vi.fn(async () => undefined);
    const q = fakeQueue({ isFailed: async () => false, remove });
    await enqueueTailor(q, 'u1', 'j1');
    expect(remove).not.toHaveBeenCalled();
    expect(q.add).toHaveBeenCalledTimes(1);
  });

  it('just adds with the deterministic id when no job exists', async () => {
    const q = fakeQueue(undefined);
    await enqueueTailor(q, 'u1', 'j1');
    expect(q.add).toHaveBeenCalledWith('tailor', { userId: 'u1', jobId: 'j1' }, { jobId: id });
  });
});
