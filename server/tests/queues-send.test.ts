import { describe, expect, it, vi } from 'vitest';
import { enqueueFollowUpDraft, enqueueSend, followUpDraftJobId, QUEUES, sendJobId } from '../src/queues.js';

describe('follow-up and send queue helpers', () => {
  it('has queue names and deterministic job ids without a colon', () => {
    expect(QUEUES.followups).toBe('followups');
    expect(QUEUES.send).toBe('send');
    expect(followUpDraftJobId('a1')).toBe('followup-draft-a1');
    expect(sendJobId({ kind: 'application', userId: 'u1', applicationId: 'a1' })).toBe('auto-send-a1');
    expect(sendJobId({ kind: 'followup', userId: 'u1', followUpId: 'f1' })).toBe('auto-followup-f1');
  });

  it('queues one draft job per application', async () => {
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    await enqueueFollowUpDraft(queue as never, 'a1');
    expect(queue.add).toHaveBeenCalledWith('draft', { kind: 'draft', applicationId: 'a1' }, { jobId: 'followup-draft-a1' });
  });

  it('queues a delayed send under its deterministic id', async () => {
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const data = { kind: 'application', userId: 'u1', applicationId: 'a1' } as const;
    await enqueueSend(queue as never, data, 7000);
    expect(queue.add).toHaveBeenCalledWith('send', data, { jobId: 'auto-send-a1', delay: 7000 });
  });
});
