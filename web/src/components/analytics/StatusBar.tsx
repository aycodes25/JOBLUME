import type { ApplicationStatus } from '@joblume/shared';
import { statusSegments } from '@/lib/format';
import { cn } from '@/lib/utils';

const COLORS: Record<ApplicationStatus, string> = {
  pending_review: 'bg-slate-400',
  approved: 'bg-sky-500',
  applied: 'bg-primary',
  interviewing: 'bg-amber-500',
  rejected: 'bg-rose-500',
  offer: 'bg-emerald-500',
  skipped: 'bg-zinc-700',
};

export function StatusBar({ byStatus }: { byStatus: Record<ApplicationStatus, number> }) {
  const segments = statusSegments(byStatus);
  if (segments.length === 0) return null;
  return (
    <div className="space-y-3">
      <div role="img" aria-label="Applications by status" className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((s) => (
          <div key={s.status} className={COLORS[s.status]} style={{ width: `${s.pct}%` }} title={`${s.label}: ${s.count}`} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segments.map((s) => (
          <li key={s.status} className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', COLORS[s.status])} aria-hidden="true" />
            {s.label}: {s.count}
          </li>
        ))}
      </ul>
    </div>
  );
}
