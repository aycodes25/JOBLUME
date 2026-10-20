import { ApiRequestError } from '@/lib/api/client';
import { createQueryClient, shouldRetry } from '@/lib/query-client';

describe('shouldRetry', () => {
  it('retries network and server errors up to twice', () => {
    expect(shouldRetry(0, new ApiRequestError(0, 'network_error'))).toBe(true);
    expect(shouldRetry(1, new ApiRequestError(503, 'http_error'))).toBe(true);
    expect(shouldRetry(2, new ApiRequestError(503, 'http_error'))).toBe(false);
    expect(shouldRetry(0, new Error('boom'))).toBe(true);
  });

  it('never retries a 4xx', () => {
    expect(shouldRetry(0, new ApiRequestError(400, 'invalid_request'))).toBe(false);
    expect(shouldRetry(0, new ApiRequestError(401, 'unauthorized'))).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('uses the shared retry rule and a 15 second stale time', () => {
    const qc = createQueryClient();
    expect(qc.getDefaultOptions().queries?.retry).toBe(shouldRetry);
    expect(qc.getDefaultOptions().queries?.staleTime).toBe(15_000);
  });
});
