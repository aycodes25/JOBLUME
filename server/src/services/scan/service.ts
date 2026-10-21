import type { ScanService } from '../../api/deps.js';
import { WORKER_ALIVE_MS, type Heartbeat } from './heartbeat.js';
import type { ScanRunsRepo } from './runs.js';

export interface ScanServiceDeps {
  runs: Pick<ScanRunsRepo, 'latestPerSource'>;
  heartbeat: Pick<Heartbeat, 'lastSeen'>;
  now?: () => Date;
}

export function createScanService(d: ScanServiceDeps): ScanService {
  const now = d.now ?? (() => new Date());
  return {
    async status() {
      const [runs, seen] = await Promise.all([d.runs.latestPerSource(), d.heartbeat.lastSeen()]);
      return {
        worker_alive: seen !== null && now().getTime() - seen.getTime() <= WORKER_ALIVE_MS,
        worker_last_seen: seen ? seen.toISOString() : null,
        runs,
      };
    },
  };
}
