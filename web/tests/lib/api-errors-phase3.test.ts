import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '@/lib/api/client';
import { describeApiError } from '@/lib/api/errors';

const e = (status: number, code: string) => new ApiRequestError(status, code);

describe('describeApiError: Phase 3 codes', () => {
  it.each([
    [e(409, 'gmail_not_connected'), /connect gmail/i],
    [e(503, 'gmail_not_configured'), /not set up/i],
    [e(409, 'gmail_reauth_required'), /reconnect gmail/i],
    [e(409, 'guess_not_confirmed'), /tick the box/i],
    [e(429, 'daily_cap_reached'), /today/i],
    [e(409, 'already_sent'), /already sent|no longer pending/i],
    [e(422, 'no_recipient'), /contact email/i],
    [e(502, 'send_failed'), /could not send/i],
    [e(409, 'not_applicable'), /moved on|no longer/i],
    [e(422, 'empty_message'), /cover letter is empty/i],
    [e(409, 'cv_not_ready'), /not ready/i],
    [e(404, 'follow_up_not_found'), /no longer exists/i],
    [e(409, 'auto_disabled'), /turned off/i],
    [e(409, 'not_auto_eligible'), /no longer applies/i],
  ])('explains %# in plain language', (err, pattern) => {
    expect(describeApiError(err)).toMatch(pattern);
  });
});
