/** The newest scan_runs row of each source (only its start time is needed). */
export type LatestRuns = Partial<Record<string, { started_at: string }>>;

const HOUR_MS = 3_600_000;

/**
 * Sources that are scheduled but have no recorded scan newer than their interval, in the order given. A source with
 * no row, or an unreadable date, needs one. Pass only the sources that are really scheduled (JSearch only with a key).
 */
export function sourcesNeedingCatchUp<S extends string>(
  latestRunsBySource: LatestRuns,
  nowMs: number,
  intervals: Record<S, number>,
  enabledSources: readonly S[],
): S[] {
  return enabledSources.filter((source) => {
    const startedAt = Date.parse(latestRunsBySource[source]?.started_at ?? '');
    if (!Number.isFinite(startedAt)) return true;
    return nowMs - startedAt >= intervals[source];
  });
}

/** One catch-up job per source per clock hour, so a worker restarting repeatedly does not pile up duplicates. BullMQ forbids ":" in ids. */
export const catchUpJobId = (source: string, nowMs: number) => `catchup-${source}-${Math.floor(nowMs / HOUR_MS)}`;

interface CatchUpLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export interface CatchUpDeps<S extends string> {
  readLatest(): Promise<LatestRuns>;
  enqueue(source: S, jobId: string): Promise<void>;
  sources: readonly S[];
  intervals: Record<S, number>;
  nowMs: number;
  log: CatchUpLog;
}

/** Enqueues one immediate scrape for each stale source. Never throws: a failure here must not stop the worker starting. */
export async function runCatchUp<S extends string>(d: CatchUpDeps<S>): Promise<S[]> {
  let stale: S[];
  try {
    stale = sourcesNeedingCatchUp(await d.readLatest(), d.nowMs, d.intervals, d.sources);
  } catch (err) {
    d.log.warn({ err }, 'catch-up scans skipped: could not read scan_runs');
    return [];
  }
  const queued: S[] = [];
  for (const source of stale) {
    try {
      await d.enqueue(source, catchUpJobId(source, d.nowMs));
      queued.push(source);
    } catch (err) {
      d.log.warn({ err, source }, 'catch-up scan could not be queued');
    }
  }
  if (queued.length > 0) d.log.info({ sources: queued }, 'catch-up scans queued');
  return queued;
}
