import type { FollowUp, FollowUpWithJob } from '@joblume/shared';
import { describe, expect, it, vi } from 'vitest';
import { createFollowUpsService } from '../../src/services/followups/service.js';

const followUp = (over: Partial<FollowUp> = {}): FollowUp => ({
  id: 'f1', application_id: 'a1', subject: 'Re: x', body: 'Dear team, update please?', status: 'pending_review',
  created_at: '2026-10-23T09:00:00.000Z', sent_at: null, ...over,
});

function make(existing: FollowUp | null = followUp()) {
  const repo = {
    listForUser: vi.fn().mockResolvedValue([{ ...followUp(), job: { title: 'Data Analyst', company: 'Acme' } } as FollowUpWithJob]),
    getForUser: vi.fn().mockResolvedValue(existing),
    updateForUser: vi.fn(async (_u: string, _id: string, patch: Record<string, unknown>) => ({ ...(existing ?? followUp()), ...patch }) as FollowUp),
  };
  const send = vi.fn().mockResolvedValue(undefined);
  return { svc: createFollowUpsService({ repo, send }), repo, send };
}

describe('follow-ups service', () => {
  it('lists the user follow-ups, filtered by status', async () => {
    const { svc, repo } = make();
    expect(await svc.list('u1', 'pending_review')).toHaveLength(1);
    expect(repo.listForUser).toHaveBeenCalledWith('u1', 'pending_review');
  });

  it('edits a pending draft', async () => {
    const { svc, repo } = make();
    const result = await svc.update('u1', 'f1', { body: 'New body text that is long enough to count.' });
    expect(repo.updateForUser).toHaveBeenCalledWith('u1', 'f1', { body: 'New body text that is long enough to count.' });
    expect(result?.body).toBe('New body text that is long enough to count.');
  });

  it('refuses to edit or dismiss a draft that is no longer pending', async () => {
    const { svc } = make(followUp({ status: 'sent' }));
    await expect(svc.update('u1', 'f1', { body: 'x'.repeat(50) })).rejects.toMatchObject({ status: 409, code: 'already_sent' });
    await expect(svc.dismiss('u1', 'f1')).rejects.toMatchObject({ status: 409, code: 'already_sent' });
  });

  it('returns null for an unknown follow-up', async () => {
    const { svc } = make(null);
    expect(await svc.update('u1', 'x', { subject: 'abc' })).toBeNull();
    expect(await svc.dismiss('u1', 'x')).toBeNull();
  });

  it('dismisses a pending draft', async () => {
    const { svc, repo } = make();
    const result = await svc.dismiss('u1', 'f1');
    expect(repo.updateForUser).toHaveBeenCalledWith('u1', 'f1', { status: 'dismissed' });
    expect(result?.status).toBe('dismissed');
  });

  it('sends through the send function and returns the refreshed follow-up', async () => {
    const { svc, send, repo } = make();
    repo.getForUser.mockResolvedValueOnce(followUp()).mockResolvedValueOnce(followUp({ status: 'sent' }));
    const result = await svc.send('u1', 'f1');
    expect(send).toHaveBeenCalledWith('u1', 'f1');
    expect(result.status).toBe('sent');
  });

  it('answers 404 when sending an unknown follow-up', async () => {
    const { svc, send } = make(null);
    await expect(svc.send('u1', 'x')).rejects.toMatchObject({ status: 404, code: 'follow_up_not_found' });
    expect(send).not.toHaveBeenCalled();
  });
});
