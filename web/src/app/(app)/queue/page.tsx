'use client';

import { useMemo, useState } from 'react';
import { ApplicationCard } from '@/components/applications/ApplicationCard';
import { ApplicationDetail } from '@/components/applications/ApplicationDetail';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { FollowUpCard } from '@/components/followups/FollowUpCard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApplications, useDismissFollowUp, useFollowUps, useRefreshJobs, useSendFollowUp, useUpdateFollowUp } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { splitQueue, type QueueTab } from '@/lib/applications';
import type { FollowUpWithJob } from '@joblume/shared';

type Tab = QueueTab | 'followups';
const TABS: QueueTab[] = ['pending', 'ready', 'skipped'];
const TAB_LABELS: Record<QueueTab, string> = { pending: 'Pending', ready: 'Ready to apply', skipped: 'Skipped' };
const EMPTY: Record<QueueTab, { title: string; description: string }> = {
  pending: {
    title: 'No applications to review yet',
    description: 'New jobs are checked every 6 hours. Make sure your CV and roles are set in Settings, then check for new jobs.',
  },
  ready: { title: 'Nothing is ready to apply', description: 'Approve an application from the Pending tab and it will wait here until you send or mark it applied.' },
  skipped: { title: 'No skipped applications', description: 'Applications you skip appear here, and you can restore them.' },
};

function FollowUpItem({ followUp }: { followUp: FollowUpWithJob }) {
  const update = useUpdateFollowUp();
  const send = useSendFollowUp();
  const dismiss = useDismissFollowUp();
  const error = update.error ?? send.error ?? dismiss.error;
  return (
    <FollowUpCard
      followUp={followUp}
      pending={update.isPending || send.isPending || dismiss.isPending}
      error={error ? describeApiError(error) : null}
      onSave={(patch) => update.mutate({ id: followUp.id, patch })}
      onSend={() => send.mutate(followUp.id)}
      onDismiss={() => dismiss.mutate(followUp.id)}
    />
  );
}

export default function QueuePage() {
  const apps = useApplications({ poll: true });
  const followUps = useFollowUps('pending_review');
  const refresh = useRefreshJobs();
  const [tab, setTab] = useState<Tab>('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  const groups = useMemo(() => splitQueue(apps.data ?? []), [apps.data]);

  if (apps.isLoading) return <PageSkeleton />;
  if (apps.error) return <ErrorState message={describeApiError(apps.error)} onRetry={() => void apps.refetch()} />;

  const drafts = followUps.data ?? [];

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

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {TAB_LABELS[t]} ({groups[t].length})
            </TabsTrigger>
          ))}
          <TabsTrigger value="followups">Follow-ups ({drafts.length})</TabsTrigger>
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
        <TabsContent value="followups">
          {followUps.error ? (
            <ErrorState message={describeApiError(followUps.error)} onRetry={() => void followUps.refetch()} />
          ) : drafts.length === 0 ? (
            <EmptyState
              title="No follow-ups waiting"
              description="A follow-up draft appears here three days after you send an application, as long as you have not moved its card."
            />
          ) : (
            <div className="space-y-4">
              {drafts.map((f) => (
                <FollowUpItem key={f.id} followUp={f} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ApplicationDetail id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
