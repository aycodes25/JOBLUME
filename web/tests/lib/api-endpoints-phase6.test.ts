import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@/lib/api/client';
import { createApi } from '@/lib/api/endpoints';

describe('Phase 6 API calls', () => {
  it('getScanStatus reads /scan/status', async () => {
    const request = vi.fn().mockResolvedValue({ worker_alive: true, worker_last_seen: null, runs: [] });
    const api = createApi(request as unknown as ApiClient);
    await api.getScanStatus();
    expect(request).toHaveBeenLastCalledWith('/scan/status');
  });
});
