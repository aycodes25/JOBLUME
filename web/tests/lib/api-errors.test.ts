import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '@/lib/api/client';
import { describeApiError } from '@/lib/api/errors';

const e = (status: number, code: string) => new ApiRequestError(status, code);

describe('describeApiError', () => {
  it.each([
    [e(0, 'network_error'), /cannot reach the server/i],
    [e(400, 'unsupported_file_type'), /pdf or docx/i],
    [e(422, 'cv_text_too_short'), /scanned/i],
    [e(422, 'unreadable_file'), /re-export/i],
    [e(400, 'file_required'), /choose a file/i],
    [e(413, 'limit_file_size'), /5 mb/i],
    [e(413, 'payload_too_large'), /5 mb|too large/i],
    [e(429, 'rate_limited'), /too often/i],
    [e(404, 'application_not_found'), /no longer exists/i],
    [e(400, 'invalid_request'), /invalid/i],
    [e(500, 'internal_error'), /server had a problem/i],
    [e(503, 'http_error'), /server had a problem/i],
    [e(418, 'teapot'), /could not be completed/i],
  ])('explains %# in plain language', (err, pattern) => {
    expect(describeApiError(err)).toMatch(pattern);
  });

  it('falls back to a generic message for unknown errors', () => {
    expect(describeApiError(new Error('boom'))).toMatch(/something went wrong/i);
    expect(describeApiError('x')).toMatch(/something went wrong/i);
  });
});
