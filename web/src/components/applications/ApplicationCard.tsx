import { Clock, MapPin, Target } from 'lucide-react';
import type { Application } from '@joblume/shared';
import { SafeLink } from '@/components/common/SafeLink';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { APPLY_METHOD_LABELS, applyMethod, previewText, scoreTone } from '@/lib/applications';
import { postedLabel, sourceLabel, STATUS_LABELS } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ScoreRing } from './ScoreRing';

const MAX_KEYWORDS = 5;

const TILE_CLASS = {
  high: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  mid: 'border-amber-100 bg-amber-50 text-amber-700',
  low: 'border-rose-100 bg-rose-50 text-rose-700',
  none: 'border-border bg-secondary text-muted-foreground',
} as const;

export function ApplicationCard({ app, onOpen }: { app: Application; onOpen(id: string): void }) {
  const title = app.job?.title ?? 'Untitled role';
  const company = app.job?.company ?? 'Unknown company';
  const keywords = app.missing_keywords.slice(0, MAX_KEYWORDS);
  const extra = app.missing_keywords.length - keywords.length;
  const posted = postedLabel(app.created_at, app.job?.posted_at);

  return (
    <Card className="flex h-full flex-col transition-shadow hover:shadow-md">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-base font-semibold uppercase text-primary"
            aria-hidden="true"
          >
            {company.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{company}</p>
            <button
              type="button"
              onClick={() => onOpen(app.id)}
              className="text-left text-lg font-semibold leading-snug hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {title}
            </button>
          </div>
        </div>

        <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', TILE_CLASS[scoreTone(app.match_score)])}>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Target className="h-3.5 w-3.5" aria-hidden="true" />
              Match
            </p>
            <p className="text-2xl font-semibold leading-tight">{app.match_score === null ? '–' : `${app.match_score}%`}</p>
          </div>
          <ScoreRing score={app.match_score} />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {app.job?.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {app.job.location}
            </span>
          )}
          {posted && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {posted}
            </span>
          )}
          {app.job && <Badge variant="outline">{sourceLabel(app.job.source)}</Badge>}
          <Badge variant="outline">{APPLY_METHOD_LABELS[applyMethod(app)]}</Badge>
        </div>

        {keywords.length > 0 && (
          <div aria-label="Missing keywords" className="flex flex-wrap gap-1">
            {keywords.map((k) => (
              <Badge key={k} variant="warning">
                {k}
              </Badge>
            ))}
            {extra > 0 && <Badge variant="secondary">+{extra} more</Badge>}
          </div>
        )}

        <div className="grid gap-3 text-xs text-muted-foreground">
          <div>
            <p className="mb-1 font-medium text-foreground">CV preview</p>
            <p>{previewText(app.tailored_cv_text, 180)}</p>
          </div>
          <div>
            <p className="mb-1 font-medium text-foreground">Cover letter</p>
            <p>{previewText(app.cover_letter_text, 180)}</p>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4">
          <div className="flex min-w-0 flex-col items-start gap-1">
            {app.status === 'approved' ? (
              <Badge className="bg-primary text-primary-foreground">Ready to apply</Badge>
            ) : (
              <Badge variant="secondary">{STATUS_LABELS[app.status]}</Badge>
            )}
            <SafeLink href={app.job?.url} className="text-xs text-primary hover:underline">
              View posting
            </SafeLink>
          </div>
          <Button size="sm" variant="outline" className="border-primary/30 text-primary" onClick={() => onOpen(app.id)}>
            Review
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
