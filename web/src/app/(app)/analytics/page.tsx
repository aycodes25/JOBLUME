'use client';

import Link from 'next/link';
import { StatusBar } from '@/components/analytics/StatusBar';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAnalytics } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { formatPercent, formatScore } from '@/lib/format';

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold">{value}</p>
        {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const analytics = useAnalytics();

  if (analytics.isLoading) return <PageSkeleton />;
  if (analytics.error) return <ErrorState message={describeApiError(analytics.error)} onRetry={() => void analytics.refetch()} />;
  const a = analytics.data;
  if (!a || a.total === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <EmptyState
          title="No applications yet"
          description="Numbers appear once your first applications are prepared."
          action={<Link href="/queue" className="text-sm text-primary hover:underline">Go to the review queue</Link>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold">Analytics</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Total applications" value={String(a.total)} />
        <Tile label="Applied" value={String(a.applied_ever)} />
        <Tile
          label="Response rate"
          value={formatPercent(a.response_rate)}
          note="Counts applications you moved past Applied (interviewing, rejected or offer). Automatic reply tracking arrives with email sending."
        />
        <Tile label="Average match score" value={formatScore(a.avg_match_score)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Applications by status</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusBar byStatus={a.by_status} />
        </CardContent>
      </Card>
    </div>
  );
}
