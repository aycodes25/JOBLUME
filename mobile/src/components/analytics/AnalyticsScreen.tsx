import type { ApplicationStatus } from '@joblume/shared';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card, Section } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/States';
import { useAnalytics } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { formatPercent, formatScore, statusSegments } from '@/lib/format';
import { colors, font, radius, space } from '@/theme';

const BAR_COLORS: Record<ApplicationStatus, string> = {
  pending_review: '#94A3B8',
  approved: '#0EA5E9',
  applied: colors.primary,
  interviewing: '#F59E0B',
  rejected: '#F43F5E',
  offer: '#10B981',
  skipped: '#3F3F46',
};

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </Card>
  );
}

/** One bar per status that has applications, from the real /analytics counts. */
export function StatusBars({ byStatus }: { byStatus: Record<ApplicationStatus, number> }) {
  const segments = statusSegments(byStatus);
  if (segments.length === 0) return null;
  return (
    <View style={styles.bars}>
      {segments.map((s) => (
        <View key={s.status} accessibilityLabel={`${s.label}: ${s.count}`} style={styles.barRow}>
          <View style={styles.barHead}>
            <Text style={styles.barLabel}>{s.label}</Text>
            <Text style={styles.barLabel}>{s.count}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${s.pct}%`, backgroundColor: BAR_COLORS[s.status] }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function AnalyticsScreen() {
  const router = useRouter();
  const analytics = useAnalytics();

  if (analytics.isLoading) return <Loading />;
  if (analytics.error) return <ErrorState message={describeApiError(analytics.error)} onRetry={() => void analytics.refetch()} />;
  const a = analytics.data;
  if (!a || a.total === 0) {
    return (
      <Screen title="Analytics">
        <EmptyState
          title="No applications yet"
          description="Numbers appear once your first applications are prepared."
          action={<Button label="Go to the review queue" variant="ghost" onPress={() => router.push('/queue')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen title="Performance Analytics" subtitle="How your applications are progressing." onRefresh={() => void analytics.refetch()} refreshing={analytics.isRefetching}>
      <View style={styles.grid}>
        <Tile label="TOTAL APPLICATIONS" value={String(a.total)} />
        <Tile label="APPLIED" value={String(a.applied_ever)} />
        <Tile label="RESPONSE RATE" value={formatPercent(a.response_rate)} note="Counts applications you moved past Applied (interviewing, rejected or offer)." />
        <Tile label="AVERAGE MATCH SCORE" value={formatScore(a.avg_match_score)} />
      </View>
      <Section title="Applications by status">
        <StatusBars byStatus={a.by_status} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  tile: { flexBasis: '47%', flexGrow: 1, gap: space(1) },
  tileLabel: { fontSize: font.tiny, fontWeight: '600', letterSpacing: 0.5, color: colors.muted },
  tileValue: { fontSize: 28, fontWeight: '700', color: colors.text },
  note: { fontSize: font.tiny, color: colors.muted },
  bars: { gap: space(3) },
  barRow: { gap: space(1) },
  barHead: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { fontSize: font.small, color: colors.secondaryText },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: colors.secondary, overflow: 'hidden' },
  fill: { height: 10, borderRadius: radius.pill },
});
