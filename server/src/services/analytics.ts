import { APPLICATION_STATUSES, type Analytics, type ApplicationStatus } from '@joblume/shared';

export interface AnalyticsRow {
  status: ApplicationStatus;
  match_score: number | null;
}

export function computeAnalytics(rows: AnalyticsRow[]): Analytics {
  const by_status = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
  let scoreSum = 0;
  let scoreCount = 0;
  for (const r of rows) {
    by_status[r.status] += 1;
    if (r.match_score !== null) {
      scoreSum += r.match_score;
      scoreCount += 1;
    }
  }
  const responded = by_status.interviewing + by_status.rejected + by_status.offer;
  const applied_ever = by_status.applied + responded;
  return {
    total: rows.length,
    by_status,
    applied_ever,
    responded,
    response_rate: applied_ever === 0 ? 0 : responded / applied_ever,
    avg_match_score: scoreCount === 0 ? null : Math.round((scoreSum / scoreCount) * 10) / 10,
  };
}
