import type { ScanStatus } from '@joblume/shared';
import { StyleSheet, Text, View } from 'react-native';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

import { describeScanRun, describeWorker, scanSourceLabel } from '@/lib/scan';
import { colors, font, space } from '@/theme';

export interface LastScanCardProps {
  status: ScanStatus | undefined;
  /** For tests: the time the card measures "ago" from. */
  now?: Date;
}

/** What the last scan of each job source found and discarded, and whether the worker is running. */
export function LastScanCard({ status, now }: LastScanCardProps) {
  if (!status) return null;
  return (
    <Card>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>
          Last scan
        </Text>
        <Badge label={status.worker_alive ? 'Worker running' : 'Worker not running'} tone={status.worker_alive ? 'success' : 'warning'} />
      </View>
      {!status.worker_alive ? <Text style={styles.muted}>{describeWorker(status, now)}</Text> : null}
      {status.runs.length === 0 ? (
        <Text style={styles.muted}>No scan has finished yet. The first one starts when the worker starts.</Text>
      ) : (
        status.runs.map((run) => (
          <View key={run.source} style={styles.run}>
            <Text style={styles.source}>{scanSourceLabel(run.source)}</Text>
            <Text style={run.status === 'failed' ? styles.failed : styles.muted}>{describeScanRun(run, now)}</Text>
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(2) },
  title: { fontSize: font.heading, fontWeight: '600', color: colors.text },
  run: { gap: 2 },
  source: { fontSize: font.small, fontWeight: '600', color: colors.text },
  muted: { fontSize: font.small, color: colors.muted },
  failed: { fontSize: font.small, color: colors.danger },
});
