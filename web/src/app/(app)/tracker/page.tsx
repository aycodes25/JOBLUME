'use client';

import { useState } from 'react';
import { ApplicationDetail } from '@/components/applications/ApplicationDetail';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { KanbanBoard } from '@/components/tracker/KanbanBoard';
import { useApplications, useSetStatus } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';

export default function TrackerPage() {
  const apps = useApplications({ poll: true });
  const setStatus = useSetStatus();
  const [openId, setOpenId] = useState<string | null>(null);

  if (apps.isLoading) return <PageSkeleton />;
  if (apps.error) return <ErrorState message={describeApiError(apps.error)} onRetry={() => void apps.refetch()} />;

  const items = apps.data ?? [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Tracker</h1>
        <p className="mt-1 text-muted-foreground">Drag a card between columns as your applications progress.</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Total', value: items.length },
          { label: 'Applied', value: items.filter((a) => a.status === 'applied').length },
          { label: 'Interviewing', value: items.filter((a) => a.status === 'interviewing').length },
          { label: 'Offers', value: items.filter((a) => a.status === 'offer').length },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border/70 bg-white px-5 py-4 text-center shadow-card md:text-left">
            <dd className="text-2xl font-semibold">{stat.value}</dd>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{stat.label}</dt>
          </div>
        ))}
      </dl>
      {setStatus.error && (
        <p role="alert" className="text-sm text-destructive">
          {describeApiError(setStatus.error)} The card was moved back.
        </p>
      )}
      {items.length === 0 ? (
        <EmptyState title="Nothing to track yet" description="Applications appear here once your queue has matches. Drag a card between columns as your applications progress." />
      ) : (
        <KanbanBoard apps={items} onMove={(id, status) => setStatus.mutate({ id, status })} onOpen={setOpenId} />
      )}
      <ApplicationDetail id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
