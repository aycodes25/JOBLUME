import { addResultMessage, FAST_POLL_MAX_AGE_MS, FETCH_REASON_TEXT, fetchSourceLabel, fetchStatusText, hasRecentPendingFetch, INVALID_LINK_MESSAGE } from '@/lib/job-fetches';

describe('fetchStatusText', () => {
  it('describes each status and failure reason in plain language', () => {
    expect(fetchStatusText({ status: 'queued', reason: null })).toBe('Reading the job…');
    expect(fetchStatusText({ status: 'done', reason: null })).toBe('Job added. Its application appears in your queue shortly.');
    expect(fetchStatusText({ status: 'failed', reason: 'blocked' })).toBe(FETCH_REASON_TEXT.blocked);
    expect(fetchStatusText({ status: 'failed', reason: 'login_required' })).toBe(FETCH_REASON_TEXT.login_required);
    expect(fetchStatusText({ status: 'failed', reason: 'not_found' })).toBe(FETCH_REASON_TEXT.not_found);
    expect(fetchStatusText({ status: 'failed', reason: 'unparseable' })).toBe(FETCH_REASON_TEXT.unparseable);
    expect(fetchStatusText({ status: 'failed', reason: null })).toBe('We could not read that job.');
  });

  it('has a message for every reason', () => {
    expect(Object.keys(FETCH_REASON_TEXT).sort()).toEqual(['blocked', 'login_required', 'not_found', 'unparseable']);
  });
});

describe('fetchSourceLabel', () => {
  it('names the site of a stored link', () => {
    expect(fetchSourceLabel('https://www.linkedin.com/jobs/view/4012345678/')).toBe('LinkedIn');
    expect(fetchSourceLabel('https://ng.indeed.com/viewjob?jk=0123456789abcdef')).toBe('Indeed');
    expect(fetchSourceLabel('https://example.com/x')).toBe('Link');
  });
});

describe('addResultMessage', () => {
  it('explains a queued link and a job we already have', () => {
    expect(addResultMessage({ queued: true })).toMatch(/reading the job now/i);
    expect(addResultMessage({ job_id: 'j1' })).toMatch(/already have this job/i);
  });

  it('has an invalid-link message that names both sites', () => {
    expect(INVALID_LINK_MESSAGE).toMatch(/LinkedIn or Indeed/);
  });
});

describe('hasRecentPendingFetch', () => {
  const now = Date.parse('2026-10-19T12:00:00.000Z');
  const row = (status: 'queued' | 'done' | 'failed', ageMs: number) => ({ status, created_at: new Date(now - ageMs).toISOString() });

  it('is true for a recently queued row', () => {
    expect(hasRecentPendingFetch([row('done', 0), row('queued', 60_000)], now)).toBe(true);
  });

  it('is false when nothing is queued or the list is missing', () => {
    expect(hasRecentPendingFetch([row('done', 0), row('failed', 0)], now)).toBe(false);
    expect(hasRecentPendingFetch(undefined, now)).toBe(false);
  });

  it('ignores a queued row older than 10 minutes', () => {
    expect(hasRecentPendingFetch([row('queued', FAST_POLL_MAX_AGE_MS + 1)], now)).toBe(false);
    expect(hasRecentPendingFetch([row('queued', FAST_POLL_MAX_AGE_MS)], now)).toBe(true);
  });
});
