import { describe, expect, it, vi } from 'vitest';
import { createJobsService } from '../../src/services/jobs/service.js';

function fakeQueues() {
  const scrapeAdd = vi.fn(async (..._a: unknown[]) => undefined);
  const matchAdd = vi.fn(async (..._a: unknown[]) => undefined);
  return { scrapeAdd, matchAdd, queues: { scrape: { add: scrapeAdd }, match: { add: matchAdd } } as never };
}

describe('jobs service', () => {
  it('rematch never passes a jobId, so repeated calls are never deduped', async () => {
    const f = fakeQueues();
    const svc = createJobsService(f.queues);
    await svc.rematch('u1');
    await svc.rematch('u1');
    expect(f.matchAdd).toHaveBeenCalledTimes(2);
    for (const call of f.matchAdd.mock.calls) {
      expect(call[0]).toBe('match');
      expect(call[1]).toEqual({ kind: 'user', userId: 'u1' });
      expect(call[2]).toBeUndefined();
    }
  });

  it('refresh scrapes only myjobmag and jobberman with hour-bucket ids', async () => {
    const f = fakeQueues();
    const svc = createJobsService(f.queues, () => 7_200_000 * 3 + 5);
    await svc.refresh('u1');
    const sources = f.scrapeAdd.mock.calls.map((c) => (c[1] as { source: string }).source);
    expect(sources.sort()).toEqual(['jobberman', 'myjobmag']);
    expect(f.scrapeAdd.mock.calls.map((c) => (c[2] as { jobId: string }).jobId).sort()).toEqual([
      'refresh-jobberman-6',
      'refresh-myjobmag-6',
    ]);
  });

  it('refresh also triggers a rematch', async () => {
    const f = fakeQueues();
    await createJobsService(f.queues).refresh('u2');
    expect(f.matchAdd).toHaveBeenCalledWith('match', { kind: 'user', userId: 'u2' });
  });
});
