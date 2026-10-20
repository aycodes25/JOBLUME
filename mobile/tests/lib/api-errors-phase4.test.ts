import { ApiRequestError } from '@/lib/api/client';
import { describeApiError } from '@/lib/api/errors';

describe('describeApiError: Phase 4 codes', () => {
  it('explains an unsupported job link in plain language', () => {
    expect(describeApiError(new ApiRequestError(400, 'unsupported_job_link'))).toMatch(/LinkedIn or Indeed job/);
  });

  it('keeps the rate-limit message for too many links', () => {
    expect(describeApiError(new ApiRequestError(429, 'rate_limited'))).toMatch(/too often/);
  });
});
