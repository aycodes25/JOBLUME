import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@/lib/api/client';
import { createApi } from '@/lib/api/endpoints';

function make() {
  const request = vi.fn().mockResolvedValue({});
  return { api: createApi(request as unknown as ApiClient), request };
}

describe('Phase 3 API calls', () => {
  it('Gmail status, connect and disconnect', async () => {
    const { api, request } = make();
    await api.getGmailStatus();
    expect(request).toHaveBeenLastCalledWith('/gmail/status');
    await api.startGmailConnect();
    expect(request).toHaveBeenLastCalledWith('/gmail/connect', { method: 'POST' });
    await api.disconnectGmail();
    expect(request).toHaveBeenLastCalledWith('/gmail', { method: 'DELETE' });
  });

  it('sendApplication posts the options and encodes the id', async () => {
    const { api, request } = make();
    await api.sendApplication('a/b', { to: 'x@y.co', confirmGuess: true });
    expect(request).toHaveBeenLastCalledWith('/applications/a%2Fb/send', { method: 'POST', json: { to: 'x@y.co', confirmGuess: true } });
    await api.sendApplication('abc', {});
    expect(request).toHaveBeenLastCalledWith('/applications/abc/send', { method: 'POST', json: {} });
  });

  it('nextEmail and setEmail', async () => {
    const { api, request } = make();
    await api.nextEmail('abc');
    expect(request).toHaveBeenLastCalledWith('/applications/abc/email/next', { method: 'POST' });
    await api.setEmail('abc', 'jane@acme.com');
    expect(request).toHaveBeenLastCalledWith('/applications/abc/email', { method: 'PUT', json: { email: 'jane@acme.com' } });
  });

  it('follow-up list, edit, send and dismiss', async () => {
    const { api, request } = make();
    await api.listFollowUps();
    expect(request).toHaveBeenLastCalledWith('/follow-ups');
    await api.listFollowUps('sent');
    expect(request).toHaveBeenLastCalledWith('/follow-ups?status=sent');
    await api.updateFollowUp('f1', { body: 'New body' });
    expect(request).toHaveBeenLastCalledWith('/follow-ups/f1', { method: 'PATCH', json: { body: 'New body' } });
    await api.sendFollowUp('f1');
    expect(request).toHaveBeenLastCalledWith('/follow-ups/f1/send', { method: 'POST' });
    await api.dismissFollowUp('f1');
    expect(request).toHaveBeenLastCalledWith('/follow-ups/f1/dismiss', { method: 'POST' });
  });
});
