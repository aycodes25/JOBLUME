import { describe, expect, it, vi } from 'vitest';
import { computeAnalytics, type AnalyticsRow } from '../../src/services/analytics.js';
import { createApplicationsService } from '../../src/services/applications.js';

const row = (status: AnalyticsRow['status'], match_score: number | null = null): AnalyticsRow => ({ status, match_score });

describe('computeAnalytics', () => {
  it('returns zeros and a null average for no applications', () => {
    expect(computeAnalytics([])).toEqual({
      total: 0,
      by_status: { pending_review: 0, approved: 0, applied: 0, interviewing: 0, rejected: 0, offer: 0, skipped: 0 },
      applied_ever: 0,
      responded: 0,
      response_rate: 0,
      avg_match_score: null,
    });
  });

  it('counts per status and derives applied_ever, responded and response_rate', () => {
    const a = computeAnalytics([
      row('pending_review', 80), row('approved', 60), row('skipped', 10),
      row('applied', 70), row('applied', 50), row('interviewing', 90), row('rejected', 40), row('offer', 100),
    ]);
    expect(a.total).toBe(8);
    expect(a.by_status.applied).toBe(2);
    expect(a.applied_ever).toBe(5);
    expect(a.responded).toBe(3);
    expect(a.response_rate).toBeCloseTo(3 / 5);
  });

  it('averages only non-null scores and rounds to one decimal', () => {
    expect(computeAnalytics([row('applied', 70), row('applied', 71), row('applied', null)]).avg_match_score).toBe(70.5);
    expect(computeAnalytics([row('applied', 10), row('applied', 10), row('applied', 11)]).avg_match_score).toBe(10.3);
    expect(computeAnalytics([row('applied', null)]).avg_match_score).toBeNull();
  });

  it('response_rate is 0 when nothing has been applied to', () => {
    expect(computeAnalytics([row('pending_review', 50), row('approved', 50)]).response_rate).toBe(0);
  });
});

describe('applications service analytics', () => {
  it('reads only the requesting user rows and computes from them', async () => {
    const repo = {
      list: vi.fn(), get: vi.fn(), update: vi.fn(),
      listForAnalytics: vi.fn().mockResolvedValue([row('applied', 80), row('offer', 60)]),
    };
    const svc = createApplicationsService({ repo, renderPdf: vi.fn(), uploadPdf: vi.fn(), signUrl: vi.fn() });
    const result = await svc.analytics('u1');
    expect(repo.listForAnalytics).toHaveBeenCalledWith('u1');
    expect(result.total).toBe(2);
    expect(result.responded).toBe(1);
  });
});
