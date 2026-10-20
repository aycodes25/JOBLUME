import { KANBAN_COLUMNS, type ApplicationStatus, type KanbanColumn } from '@joblume/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { COLUMN_LABELS } from '@/lib/format';
import { colors, font, space } from '@/theme';

const APPLIED_FAMILY: ApplicationStatus[] = ['applied', 'interviewing', 'rejected', 'offer'];
export const MOVE_OPTIONS = KANBAN_COLUMNS.map((c) => ({ value: c, label: COLUMN_LABELS[c] }));

export interface StatusActionsProps {
  status: ApplicationStatus;
  /** True while the CV or letter has unsaved edits: approving is blocked until they are saved. */
  dirty: boolean;
  pending: boolean;
  onMove(status: ApplicationStatus): void;
  /** Skip moves the application to Skipped and leaves the screen. */
  onSkip(): void;
}

/** The status buttons of the job detail screen, same rules as the web dialog. Moving an applied card uses an action sheet. */
export function StatusActions({ status, dirty, pending, onMove, onSkip }: StatusActionsProps) {
  const [sheet, setSheet] = useState(false);

  if (status === 'pending_review') {
    return (
      <View style={styles.wrap}>
        <View style={styles.row}>
          <Button label="Approve & Apply" disabled={dirty || pending} onPress={() => onMove('approved')} />
          <Button label="Skip" variant="outline" disabled={pending} onPress={onSkip} />
        </View>
        {dirty ? <Text style={styles.muted}>Save your changes before approving.</Text> : null}
      </View>
    );
  }
  if (status === 'approved') {
    return (
      <View style={styles.row}>
        <Button label="Skip" variant="outline" disabled={pending} onPress={onSkip} />
        <Button label="Back to pending" variant="ghost" disabled={pending} onPress={() => onMove('pending_review')} />
      </View>
    );
  }
  if (status === 'skipped') {
    return <Button label="Restore" disabled={pending} onPress={() => onMove('pending_review')} />;
  }
  if (APPLIED_FAMILY.includes(status)) {
    return (
      <View style={styles.wrap}>
        <Button label={`Move to… (now ${COLUMN_LABELS[status as KanbanColumn]})`} variant="outline" disabled={pending} onPress={() => setSheet(true)} />
        <OptionSheet visible={sheet} title="Move to" options={MOVE_OPTIONS} current={status as KanbanColumn} onSelect={onMove} onClose={() => setSheet(false)} />
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  wrap: { gap: space(2) },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  muted: { fontSize: font.tiny, color: colors.muted },
});
