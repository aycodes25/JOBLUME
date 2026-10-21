import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@/lib/api/client';
import { createApi } from '@/lib/api/endpoints';

describe('Phase 8 API calls', () => {
  it('getAutofill reads /applications/:id/autofill', async () => {
    const request = vi.fn().mockResolvedValue({ job_url: 'https://example.com/j' });
    const api = createApi(request as unknown as ApiClient);
    await api.getAutofill('3f2b8c1e-9a4d-4e7b-8c55-1a2b3c4d5e6f');
    expect(request).toHaveBeenLastCalledWith('/applications/3f2b8c1e-9a4d-4e7b-8c55-1a2b3c4d5e6f/autofill');
  });
});

describe('Phase 6 API calls', () => {
  it('getScanStatus reads /scan/status', async () => {
    const request = vi.fn().mockResolvedValue({ worker_alive: true, worker_last_seen: null, runs: [] });
    const api = createApi(request as unknown as ApiClient);
    await api.getScanStatus();
    expect(request).toHaveBeenLastCalledWith('/scan/status');
  });
});
