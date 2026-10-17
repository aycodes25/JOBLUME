import type { Application } from '@joblume/shared';
import { SafeLink } from '@/components/common/SafeLink';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { previewText } from '@/lib/applications';
import { sourceLabel } from '@/lib/format';
import { ScoreRing } from './ScoreRing';

const MAX_KEYWORDS = 5;

export function ApplicationCard({ app, onOpen }: { app: Application; onOpen(id: string): void }) {
  const title = app.job?.title ?? 'Untitled role';
  const keywords = app.missing_keywords.slice(0, MAX_KEYWORDS);
  const extra = app.missing_keywords.length - keywords.length;

  return (
    <Card className="transition-colors hover:border-primary/50">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(app.id)}
              className="text-left font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {title}
            </button>
            <p className="text-sm text-muted-foreground">
              {app.job?.company ?? 'Unknown company'}
              {app.job?.location ? ` · ${app.job.location}` : ''}
            </p>
          </div>
          <ScoreRing score={app.match_score} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {app.job && <Badge variant="outline">{sourceLabel(app.job.source)}</Badge>}
          {app.status === 'approved' && <Badge variant="success">Ready to apply</Badge>}
          <SafeLink href={app.job?.url} className="text-xs text-primary hover:underline">
            View posting
          </SafeLink>
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

        <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <p className="mb-1 font-medium text-foreground">CV preview</p>
            <p>{previewText(app.tailored_cv_text, 180)}</p>
          </div>
          <div>
            <p className="mb-1 font-medium text-foreground">Cover letter</p>
            <p>{previewText(app.cover_letter_text, 180)}</p>
          </div>
        </div>

        <Button size="sm" variant="outline" onClick={() => onOpen(app.id)}>
          Review
        </Button>
      </CardContent>
    </Card>
  );
}
