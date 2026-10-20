import type { FollowUpWithJob } from '@joblume/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Message } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { buildFollowUpPatch } from '@/lib/follow-ups';
import { formatShortDate } from '@/lib/format';
import { colors, font, space } from '@/theme';

export interface FollowUpCardProps {
  followUp: FollowUpWithJob;
  pending: boolean;
  error?: string | null;
  onSave(patch: { subject?: string; body?: string }): void;
  onSend(): void;
  onDismiss(): void;
}

/** A follow-up draft. It is only sent when the user taps Send follow-up (or under Auto follow-up on the server). */
export function FollowUpCard({ followUp, pending, error, onSave, onSend, onDismiss }: FollowUpCardProps) {
  const [subject, setSubject] = useState(followUp.subject);
  const [body, setBody] = useState(followUp.body);

  useEffect(() => {
    setSubject(followUp.subject);
    setBody(followUp.body);
  }, [followUp.id, followUp.subject, followUp.body]);

  const edit = buildFollowUpPatch({ subject: followUp.subject, body: followUp.body }, { subject, body });
  const hasErrors = Object.keys(edit.errors).length > 0;

  return (
    <Card>
      <View>
        <Text style={styles.title}>{followUp.job ? `${followUp.job.title} at ${followUp.job.company}` : 'Application'}</Text>
        <Text style={styles.muted}>{`Draft created ${formatShortDate(followUp.created_at)}`}</Text>
      </View>
      <TextField label="Subject" value={subject} onChangeText={setSubject} error={edit.errors.subject} />
      <TextField label="Message" value={body} onChangeText={setBody} error={edit.errors.body} multiline lines={8} />
      <View style={styles.actions}>
        <Button label="Save changes" variant="outline" size="sm" disabled={!edit.dirty || hasErrors || pending} onPress={() => onSave(edit.patch)} />
        <Button label="Send follow-up" size="sm" disabled={edit.dirty || pending} onPress={onSend} />
        <Button label="Dismiss" variant="ghost" size="sm" disabled={pending} onPress={onDismiss} />
      </View>
      {edit.dirty ? <Text style={styles.muted}>Save your changes first.</Text> : null}
      {error ? <Message kind="error" text={error} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.body, fontWeight: '600', color: colors.text },
  muted: { fontSize: font.tiny, color: colors.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
});
