import type { ApiClient } from '@/lib/api/client';
import { createApi } from '@/lib/api/endpoints';

describe('Phase 6 API calls (mobile)', () => {
  it('getScanStatus reads /scan/status', async () => {
    const request = jest.fn().mockResolvedValue({ worker_alive: true, worker_last_seen: null, runs: [] });
    await createApi(request as unknown as ApiClient).getScanStatus();
    expect(request).toHaveBeenLastCalledWith('/scan/status');
  });
});
