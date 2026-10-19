import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@/lib/api/client';
import { createApi } from '@/lib/api/endpoints';

function make() {
  const request = vi.fn().mockResolvedValue({});
  return { api: createApi(request as unknown as ApiClient), request };
}

describe('Phase 4 API calls', () => {
  it('addJobLink posts the link and listJobFetches reads the recent list', async () => {
    const { api, request } = make();
    await api.addJobLink('https://www.linkedin.com/jobs/view/4012345678/');
    expect(request).toHaveBeenLastCalledWith('/jobs/from-url', { method: 'POST', json: { url: 'https://www.linkedin.com/jobs/view/4012345678/' } });
    await api.listJobFetches();
    expect(request).toHaveBeenLastCalledWith('/jobs/fetches');
  });
});
