import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ApplicationCard } from '@/components/applications/ApplicationCard';
import { FollowUpItem } from '@/components/followups/FollowUpItem';
import { AddJobLink } from '@/components/jobs/AddJobLink';
import { Button } from '@/components/ui/Button';
import { Chips } from '@/components/ui/Chips';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, Loading, Message } from '@/components/ui/States';
import { useAddJobLink, useApplications, useFollowUps, useJobFetches, useRefreshJobs } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { splitQueue, type QueueTab } from '@/lib/applications';
import { filterQueue, isHighMatch, QUEUE_FILTERS, type QueueFilter } from '@/lib/queue-filters';
import { useSession } from '@/lib/session';
import { colors, font, radius, space } from '@/theme';

type Segment = QueueTab | 'followups';

const EMPTY: Record<QueueTab, { title: string; description: string }> = {
  pending: {
    title: 'No applications to review yet',
    description: 'New jobs are checked every 6 hours. Make sure your CV and roles are set in Settings, then check for new jobs.',
  },
  ready: { title: 'Nothing is ready to apply', description: 'Approve an application from Pending and it will wait here until you send or mark it applied.' },
  skipped: { title: 'No skipped applications', description: 'Applications you skip appear here, and you can restore them.' },
};

/** Queue tab, following the mobile home mockup: search, stats, segments, filter chips, cards, pull-to-refresh. */
export function QueueScreen() {
  const router = useRouter();
  const { email } = useSession();
  const apps = useApplications({ poll: true });
  const followUps = useFollowUps('pending_review');
  const jobFetches = useJobFetches();
  const addLink = useAddJobLink();
  const refresh = useRefreshJobs();
  const [segment, setSegment] = useState<Segment>('pending');
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [search, setSearch] = useState('');
  const groups = useMemo(() => splitQueue(apps.data ?? []), [apps.data]);

  if (apps.isLoading) return <Loading />;
  if (apps.error) return <ErrorState message={describeApiError(apps.error)} onRetry={() => void apps.refetch()} />;

  const drafts = followUps.data ?? [];
  const segments = [
    { value: 'pending', label: `Pending (${groups.pending.length})` },
    { value: 'ready', label: `Ready (${groups.ready.length})` },
    { value: 'skipped', label: `Skipped (${groups.skipped.length})` },
    { value: 'followups', label: `Follow-ups (${drafts.length})` },
  ] as const;
  const shown = segment === 'followups' ? [] : filterQueue(groups[segment], { filter, search });
  const open = (id: string) => router.push(`/application/${id}`);
  const onRefresh = () => {
    void apps.refetch();
    void followUps.refetch();
    void jobFetches.refetch();
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={apps.isRefetching}>
      <View>
        <Text style={styles.welcome}>Welcome back,</Text>
        <Text style={styles.name}>{email ?? 'JobLume'}</Text>
      </View>
      <TextInput
        accessibilityLabel="Search your queue"
        placeholder="Search your queue..."
        placeholderTextColor={colors.muted}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        style={styles.search}
      />

      <View style={styles.stats}>
        <View style={[styles.stat, styles.statPrimary]}>
          <Text style={styles.statLabel}>In Queue</Text>
          <Text style={styles.statValue}>{`${groups.pending.length} jobs`}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>High Match</Text>
          <Text style={styles.statValue}>{`${groups.pending.filter(isHighMatch).length} ≥ 90%`}</Text>
        </View>
      </View>

      <Button label={refresh.isPending ? 'Checking…' : 'Check for new jobs'} size="sm" variant="outline" disabled={refresh.isPending} onPress={() => refresh.mutate()} />
      {refresh.isSuccess ? <Message kind="info" text="Checking for new jobs. New matches appear here within a few minutes." /> : null}
      {refresh.error ? <Message kind="error" text={describeApiError(refresh.error)} /> : null}

      <Chips label="Queue sections" role="tab" options={segments} value={segment} onChange={setSegment} />

      {segment === 'followups' ? (
        followUps.error ? (
          <ErrorState message={describeApiError(followUps.error)} onRetry={() => void followUps.refetch()} />
        ) : drafts.length === 0 ? (
          <EmptyState
            title="No follow-ups waiting"
            description="A follow-up draft appears here three days after you send an application, as long as you have not moved its card."
          />
        ) : (
          drafts.map((f) => <FollowUpItem key={f.id} followUp={f} />)
        )
      ) : (
        <>
          <Chips label="Filters" options={QUEUE_FILTERS} value={filter} onChange={setFilter} />
          <Text style={styles.section}>RECOMMENDED FOR YOU</Text>
          {groups[segment].length === 0 ? (
            <EmptyState title={EMPTY[segment].title} description={EMPTY[segment].description} />
          ) : shown.length === 0 ? (
            <EmptyState title="No matches for this filter" description="Try another filter or clear the search." />
          ) : (
            shown.map((a) => <ApplicationCard key={a.id} app={a} onOpen={open} />)
          )}
          <AddJobLink
            fetches={jobFetches.data ?? []}
            pending={addLink.isPending}
            error={addLink.error ? describeApiError(addLink.error) : null}
            result={addLink.data ?? null}
            onAdd={(url) => addLink.mutate(url)}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  welcome: { fontSize: font.small, color: colors.muted },
  name: { fontSize: font.heading, fontWeight: '600', color: colors.text },
  search: {
    minHeight: 44,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: space(3),
    fontSize: font.body,
    color: colors.text,
  },
  stats: { flexDirection: 'row', gap: space(3) },
  stat: { flex: 1, borderRadius: radius.card, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: space(3), gap: 2 },
  statPrimary: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  statLabel: { fontSize: font.small, color: colors.primary },
  statValue: { fontSize: font.heading, fontWeight: '700', color: colors.primary },
  section: { fontSize: font.small, letterSpacing: 1.5, color: colors.muted, fontWeight: '600' },
});
