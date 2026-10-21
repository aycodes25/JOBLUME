import type { ScanStatus } from '@joblume/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

import { describeScanRun, describeWorker, scanSourceLabel } from '@/lib/scan';

export interface LastScanCardProps {
  status: ScanStatus | undefined;
  /** For tests: the time the card measures "ago" from. */
  now?: Date;
}

/** What the last scan of each job source found and discarded, and whether the worker is running. */
export function LastScanCard({ status, now }: LastScanCardProps) {
  if (!status) return null;
  return (
    <Card role="region" aria-label="Last scan">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Last scan</h2>
          <Badge variant={status.worker_alive ? 'success' : 'warning'}>{status.worker_alive ? 'Worker running' : 'Worker not running'}</Badge>
        </div>
        {!status.worker_alive && <p className="text-sm text-muted-foreground">{describeWorker(status, now)}</p>}
        {status.runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scan has finished yet. The first one starts when the worker starts.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {status.runs.map((run) => (
              <li key={run.source} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <span className="w-44 shrink-0 font-medium">{scanSourceLabel(run.source)}</span>
                <span className={run.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{describeScanRun(run, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
