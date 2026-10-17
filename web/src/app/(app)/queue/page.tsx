'use client';

import { useMemo, useState } from 'react';
import { ApplicationCard } from '@/components/applications/ApplicationCard';
import { ApplicationDetail } from '@/components/applications/ApplicationDetail';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApplications, useRefreshJobs } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { splitQueue, type QueueTab } from '@/lib/applications';

const TABS: QueueTab[] = ['pending', 'ready', 'skipped'];
const TAB_LABELS: Record<QueueTab, string> = { pending: 'Pending', ready: 'Ready to apply', skipped: 'Skipped' };
const EMPTY: Record<QueueTab, { title: string; description: string }> = {
  pending: {
    title: 'No applications to review yet',
    description: 'New jobs are checked every 6 hours. Make sure your CV and roles are set in Settings, then check for new jobs.',
  },
  ready: { title: 'Nothing is ready to apply', description: 'Approve an application from the Pending tab and it will wait here until you mark it applied.' },
  skipped: { title: 'No skipped applications', description: 'Applications you skip appear here, and you can restore them.' },
};

export default function QueuePage() {
  const apps = useApplications({ poll: true });
  const refresh = useRefreshJobs();
  const [tab, setTab] = useState<QueueTab>('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  const groups = useMemo(() => splitQueue(apps.data ?? []), [apps.data]);

  if (apps.isLoading) return <PageSkeleton />;
  if (apps.error) return <ErrorState message={describeApiError(apps.error)} onRetry={() => void apps.refetch()} />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Review queue</h1>
        <Button variant="outline" size="sm" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
          {refresh.isPending ? 'Checking…' : 'Check for new jobs'}
        </Button>
      </div>
      {refresh.isSuccess && <p role="status" className="text-sm text-muted-foreground">Checking for new jobs. New matches appear here within a few minutes.</p>}
      {refresh.error && <p role="alert" className="text-sm text-destructive">{describeApiError(refresh.error)}</p>}

      <Tabs value={tab} onValueChange={(v) => setTab(v as QueueTab)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {TAB_LABELS[t]} ({groups[t].length})
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t} value={t}>
            {groups[t].length === 0 ? (
              <EmptyState title={EMPTY[t].title} description={EMPTY[t].description} />
            ) : (
              <div className="space-y-4">
                {groups[t].map((a) => (
                  <ApplicationCard key={a.id} app={a} onOpen={setOpenId} />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <ApplicationDetail id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
