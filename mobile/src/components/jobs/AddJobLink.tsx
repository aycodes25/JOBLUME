import { canonicalJobUrl, type AddJobLinkResult, type JobFetch } from '@joblume/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Message } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { formatRelative } from '@/lib/format';
import { addResultMessage, fetchSourceLabel, fetchStatusText, INVALID_LINK_MESSAGE } from '@/lib/job-fetches';
import { colors, font, space } from '@/theme';

export interface AddJobLinkProps {
  fetches: JobFetch[];
  pending: boolean;
  error: string | null;
  result: AddJobLinkResult | null;
  onAdd(url: string): void;
}

/** "Add a job link" card: checks the link with the shared canonicalJobUrl before sending, then lists recent links. */
export function AddJobLink({ fetches, pending, error, result, onAdd }: AddJobLinkProps) {
  const [url, setUrl] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (result) setUrl('');
  }, [result]);

  function submit() {
    const link = canonicalJobUrl(url);
    if (!link) {
      setLocalError(INVALID_LINK_MESSAGE);
      return;
    }
    setLocalError(null);
    onAdd(link.url);
  }

  const shownError = localError ?? error;

  return (
    <Card>
      <TextField
        label="Add a job link"
        hint="Paste a LinkedIn or Indeed job link. We read that one page and prepare an application for you to review. You apply on the site yourself."
        placeholder="https://www.linkedin.com/jobs/view/…"
        value={url}
        onChangeText={(t) => {
          setUrl(t);
          setLocalError(null);
        }}
        keyboardType="url"
        autoCapitalize="none"
        maxLength={2048}
      />
      <Button label={pending ? 'Adding…' : 'Add'} onPress={submit} disabled={pending || url.trim() === ''} />
      {shownError ? <Message kind="error" text={shownError} /> : null}
      {!shownError && result ? <Message kind="info" text={addResultMessage(result)} /> : null}
      {fetches.length > 0 ? (
        <View accessibilityLabel="Recent job links" style={styles.list}>
          {fetches.map((f) => (
            <View key={f.id} style={styles.row}>
              <Text numberOfLines={1} style={styles.url}>
                <Text style={styles.source}>{fetchSourceLabel(f.url)} </Text>
                {f.url}
              </Text>
              <Text style={[styles.status, f.status === 'failed' && styles.failed]}>{`${fetchStatusText(f)} · ${formatRelative(f.updated_at)}`}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: space(2) },
  row: { gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space(2) },
  url: { fontSize: font.small, color: colors.muted },
  source: { fontWeight: '600', color: colors.text },
  status: { fontSize: font.small, color: colors.muted },
  failed: { color: colors.danger },
});
