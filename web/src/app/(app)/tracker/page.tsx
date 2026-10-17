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
      <h1 className="text-xl font-semibold">Tracker</h1>
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
