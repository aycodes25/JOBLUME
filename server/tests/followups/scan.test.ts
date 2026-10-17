import { describe, expect, it, vi } from 'vitest';
import { runFollowUpScan, SCAN_LIMIT } from '../../src/services/followups/scan.js';

describe('runFollowUpScan', () => {
  it('queues a draft job for every due application', async () => {
    const d = { findDue: vi.fn().mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]), enqueueDraft: vi.fn().mockResolvedValue(undefined) };
    expect(await runFollowUpScan(d)).toEqual({ queued: 2, failed: 0 });
    expect(d.findDue).toHaveBeenCalledWith(SCAN_LIMIT);
    expect(d.enqueueDraft).toHaveBeenCalledWith('a1');
    expect(d.enqueueDraft).toHaveBeenCalledWith('a2');
    expect(SCAN_LIMIT).toBe(50);
  });

  it('does nothing when nothing is due', async () => {
    const d = { findDue: vi.fn().mockResolvedValue([]), enqueueDraft: vi.fn() };
    expect(await runFollowUpScan(d)).toEqual({ queued: 0, failed: 0 });
    expect(d.enqueueDraft).not.toHaveBeenCalled();
  });

  it('keeps going when one enqueue fails and counts it', async () => {
    const d = {
      findDue: vi.fn().mockResolvedValue([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]),
      enqueueDraft: vi.fn().mockRejectedValueOnce(new Error('redis')).mockResolvedValue(undefined),
    };
    expect(await runFollowUpScan(d)).toEqual({ queued: 2, failed: 1 });
    expect(d.enqueueDraft).toHaveBeenCalledTimes(3);
  });
});
