import { KANBAN_COLUMNS, columnForStatus, type Application, type KanbanColumn } from '@joblume/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Chips } from '@/components/ui/Chips';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, Loading, Message } from '@/components/ui/States';
import { useApplications, useSetStatus } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { groupByColumn } from '@/lib/applications';
import { COLUMN_LABELS, formatRelative } from '@/lib/format';
import { matchesSearch } from '@/lib/queue-filters';
import { colors, font, radius, space } from '@/theme';

const TABS = KANBAN_COLUMNS.map((c) => ({ value: c, label: COLUMN_LABELS[c] }));

function TrackerCard({ app, onOpen, onMenu }: { app: Application; onOpen(): void; onMenu(): void }) {
  const title = app.job?.title ?? 'Untitled role';
  const column = columnForStatus(app.status);
  return (
    <Card>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${title}`} onPress={onOpen} style={styles.titles}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.muted}>{app.job?.company ?? 'Unknown company'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Change status for ${title}`} onPress={onMenu} hitSlop={12} style={styles.menu}>
          <Text style={styles.menuText}>⋮</Text>
        </Pressable>
      </View>
      <View style={styles.meta}>
        {app.job?.location ? <Text style={styles.muted}>{app.job.location}</Text> : null}
        <Text style={styles.muted}>{formatRelative(app.applied_at ?? app.created_at)}</Text>
      </View>
      <View style={styles.bottom}>
        {column ? <Badge label={COLUMN_LABELS[column]} tone="primary" /> : null}
        <Text style={styles.muted}>
          Match: <Text style={styles.score}>{app.match_score === null ? '–' : `${app.match_score}%`}</Text>
        </Text>
      </View>
    </Card>
  );
}

/** Tracker tab (mobile tracker mockup): stats, company search, status tabs, cards; status changes go through an action sheet. */
export function TrackerScreen() {
  const router = useRouter();
  const apps = useApplications({ poll: true });
  const setStatus = useSetStatus();
  const [tab, setTab] = useState<KanbanColumn>('applied');
  const [search, setSearch] = useState('');
  const [menuFor, setMenuFor] = useState<Application | null>(null);
  const items = apps.data ?? [];
  const groups = useMemo(() => groupByColumn(items), [items]);

  if (apps.isLoading) return <Loading />;
  if (apps.error) return <ErrorState message={describeApiError(apps.error)} onRetry={() => void apps.refetch()} />;

  const shown = groups[tab].filter((a) => matchesSearch(a, search));
  const stats = [
    { label: 'TOTAL', value: items.length },
    { label: 'APPLIED', value: items.filter((a) => a.status === 'applied').length },
    { label: 'INTERVIEWS', value: items.filter((a) => a.status === 'interviewing').length },
    { label: 'OFFERS', value: items.filter((a) => a.status === 'offer').length },
  ];

  return (
    <Screen title="Application Tracker" onRefresh={() => void apps.refetch()} refreshing={apps.isRefetching}>
      <View style={styles.stats}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
      <TextInput
        accessibilityLabel="Search companies"
        placeholder="Search companies..."
        placeholderTextColor={colors.muted}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        style={styles.search}
      />
      <Chips label="Status" role="tab" options={TABS.map((t) => ({ ...t, label: `${t.label} (${groups[t.value].length})` }))} value={tab} onChange={setTab} />
      {setStatus.error ? <Message kind="error" text={`${describeApiError(setStatus.error)} The card was moved back.`} /> : null}
      {items.length === 0 ? (
        <EmptyState title="Nothing to track yet" description="Applications appear here once your queue has matches." />
      ) : shown.length === 0 ? (
        <EmptyState title={`Nothing in ${COLUMN_LABELS[tab]}`} description="Change the status of a card with its ⋮ menu to move it here." />
      ) : (
        shown.map((a) => <TrackerCard key={a.id} app={a} onOpen={() => router.push(`/application/${a.id}`)} onMenu={() => setMenuFor(a)} />)
      )}
      <OptionSheet
        visible={menuFor !== null}
        title="Move to"
        options={TABS}
        current={menuFor ? (columnForStatus(menuFor.status) ?? undefined) : undefined}
        onSelect={(status) => {
          if (menuFor) setStatus.mutate({ id: menuFor.id, status });
        }}
        onClose={() => setMenuFor(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space(2) },
  stat: { flex: 1, alignItems: 'center', borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingVertical: space(3) },
  statValue: { fontSize: font.heading, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 10, color: colors.muted, letterSpacing: 0.5 },
  search: { minHeight: 44, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: space(3), fontSize: font.body, color: colors.text },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space(2) },
  titles: { flex: 1, gap: 2 },
  title: { fontSize: font.body, fontWeight: '600', color: colors.text },
  muted: { fontSize: font.small, color: colors.muted },
  menu: { paddingHorizontal: space(2) },
  menuText: { fontSize: font.heading, color: colors.muted },
  meta: { flexDirection: 'row', gap: space(3) },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space(3) },
  score: { color: colors.primary, fontWeight: '700' },
});
