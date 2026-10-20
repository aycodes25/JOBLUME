'use client';

import { useMemo, useState } from 'react';
import { ApplicationCard } from '@/components/applications/ApplicationCard';
import { ApplicationDetail } from '@/components/applications/ApplicationDetail';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { FollowUpCard } from '@/components/followups/FollowUpCard';
import { AddJobLink } from '@/components/jobs/AddJobLink';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useAddJobLink, useApplications, useDismissFollowUp, useFollowUps, useJobFetches, useRefreshJobs, useSendFollowUp, useUpdateFollowUp,
} from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { formatScore } from '@/lib/format';
import { averageScore, splitQueue, type QueueTab } from '@/lib/applications';
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
  const jobFetches = useJobFetches();
  const addLink = useAddJobLink();
  const [tab, setTab] = useState<Tab>('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  const groups = useMemo(() => splitQueue(apps.data ?? []), [apps.data]);
  const avg = useMemo(() => averageScore(apps.data ?? []), [apps.data]);

  if (apps.isLoading) return <PageSkeleton />;
  if (apps.error) return <ErrorState message={describeApiError(apps.error)} onRetry={() => void apps.refetch()} />;

  const drafts = followUps.data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Application Queue</h1>
          <p className="mt-1 text-muted-foreground">
            Review and approve your prepared job applications. You have <span className="font-semibold text-primary">{groups.pending.length}</span> pending{' '}
            {groups.pending.length === 1 ? 'match' : 'matches'}.
          </p>
        </div>
        <Button size="sm" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
          {refresh.isPending ? 'Checking…' : 'Check for new jobs'}
        </Button>
      </div>
      {refresh.isSuccess && <p role="status" className="text-sm text-muted-foreground">Checking for new jobs. New matches appear here within a few minutes.</p>}
      {refresh.error && <p role="alert" className="text-sm text-destructive">{describeApiError(refresh.error)}</p>}

      <AddJobLink
        fetches={jobFetches.data ?? []}
        pending={addLink.isPending}
        error={addLink.error ? describeApiError(addLink.error) : null}
        result={addLink.data ?? null}
        onAdd={(url) => addLink.mutate(url)}
      />

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Pending review', value: String(groups.pending.length), tone: 'text-primary' },
          { label: 'Ready to apply', value: String(groups.ready.length), tone: 'text-emerald-600' },
          { label: 'Average match', value: avg === null ? '–' : `${formatScore(avg)}%`, tone: 'text-emerald-600' },
          { label: 'Skipped', value: String(groups.skipped.length), tone: 'text-foreground' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border/70 bg-white px-5 py-4 shadow-card">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{stat.label}</dt>
            <dd className={`mt-1 text-3xl font-semibold ${stat.tone}`}>{stat.value}</dd>
          </div>
        ))}
      </dl>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="w-full sm:w-auto">
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
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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
