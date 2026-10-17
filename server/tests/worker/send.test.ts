import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/lib/errors.js';
import { runSendJob } from '../../src/worker/send.js';

const make = () => ({ sendApplication: vi.fn().mockResolvedValue({}), sendFollowUp: vi.fn().mockResolvedValue(undefined) });

describe('runSendJob', () => {
  it('sends an application', async () => {
    const d = make();
    expect(await runSendJob({ kind: 'application', userId: 'u1', applicationId: 'a1' }, d)).toEqual({ ok: true });
    expect(d.sendApplication).toHaveBeenCalledWith('u1', 'a1');
    expect(d.sendFollowUp).not.toHaveBeenCalled();
  });

  it('sends a follow-up', async () => {
    const d = make();
    expect(await runSendJob({ kind: 'followup', userId: 'u1', followUpId: 'f1' }, d)).toEqual({ ok: true });
    expect(d.sendFollowUp).toHaveBeenCalledWith('u1', 'f1');
    expect(d.sendApplication).not.toHaveBeenCalled();
  });

  it('reports a business-rule refusal (ApiError) as a result instead of failing the job', async () => {
    const d = make();
    d.sendApplication.mockRejectedValue(new ApiError(429, 'daily_cap_reached'));
    expect(await runSendJob({ kind: 'application', userId: 'u1', applicationId: 'a1' }, d)).toEqual({ ok: false, code: 'daily_cap_reached' });
  });

  it('lets unexpected errors fail the job', async () => {
    const d = make();
    d.sendFollowUp.mockRejectedValue(new Error('db down'));
    await expect(runSendJob({ kind: 'followup', userId: 'u1', followUpId: 'f1' }, d)).rejects.toThrow('db down');
  });
});
