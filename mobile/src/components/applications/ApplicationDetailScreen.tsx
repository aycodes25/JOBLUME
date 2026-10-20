import type { ApplicationStatus } from '@joblume/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FollowUpItem } from '@/components/followups/FollowUpItem';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { ErrorState, Loading, Message } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { useApplication, useFollowUps, useGmailStatus, useNextEmail, useSendApplication, useSetStatus, useUpdateApplicationText } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { buildTextPatch } from '@/lib/applications';
import { openExternalUrl } from '@/lib/external';
import { sourceLabel, STATUS_LABELS } from '@/lib/format';
import { colors, font, space } from '@/theme';
import { AssistedApplyPanel } from './AssistedApplyPanel';
import { EmailSection } from './EmailSection';
import { StatusActions } from './StatusActions';

/** Job detail: match, keywords, status actions, email send, assisted apply, the CV and letter editors and any follow-up draft. */
export function ApplicationDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const detail = useApplication(id);
  const updateText = useUpdateApplicationText();
  const setStatus = useSetStatus();
  const gmail = useGmailStatus();
  const sendEmail = useSendApplication();
  const nextEmail = useNextEmail();
  const followUps = useFollowUps('pending_review');
  const [notice, setNotice] = useState<string | null>(null);
  const [cv, setCv] = useState('');
  const [letter, setLetter] = useState('');
  const data = detail.data;

  useEffect(() => {
    setCv(data?.tailored_cv_text ?? '');
    setLetter(data?.cover_letter_text ?? '');
    setNotice(null);
  }, [data?.id, data?.tailored_cv_text, data?.cover_letter_text]);

  if (detail.isLoading) return <Loading />;
  if (detail.error || !data) {
    return <ErrorState message={describeApiError(detail.error)} onRetry={() => void detail.refetch()} />;
  }

  const text = buildTextPatch({ cv: data.tailored_cv_text, letter: data.cover_letter_text }, { cv, letter });
  const lockedReason = text.dirty ? 'You have unsaved changes. Save them first so the copied letter and the PDF match.' : undefined;
  const emailError = sendEmail.error ?? nextEmail.error;
  const mutationError = updateText.error ?? setStatus.error;
  const draft = (followUps.data ?? []).find((f) => f.application_id === data.id);
  const move = (status: ApplicationStatus) => setStatus.mutate({ id: data.id, status });
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/queue');
  };

  return (
    <Screen>
      <View>
        <Text accessibilityRole="header" style={styles.title}>
          {data.job?.title ?? 'Application'}
        </Text>
        {data.job ? <Text style={styles.muted}>{`${data.job.company}${data.job.location ? ` · ${data.job.location}` : ''}`}</Text> : null}
      </View>

      <Card>
        <View style={styles.row}>
          <ScoreRing score={data.match_score} size={64} />
          <View style={styles.badges}>
            <Text style={styles.label}>MATCH PROBABILITY</Text>
            <View style={styles.row}>
              {data.job ? <Badge label={sourceLabel(data.job.source)} tone="outline" /> : null}
              <Badge label={STATUS_LABELS[data.status]} tone={data.status === 'approved' ? 'primary' : 'secondary'} />
            </View>
          </View>
        </View>
        <Button label="View posting" variant="ghost" size="sm" onPress={() => void openExternalUrl(data.job?.url)} disabled={!data.job?.url} />
      </Card>

      {data.missing_keywords.length > 0 ? (
        <Card>
          <Text style={styles.label}>Keywords this CV does not support</Text>
          <View style={styles.row}>
            {data.missing_keywords.map((k) => (
              <Badge key={k} label={k} tone="warning" />
            ))}
          </View>
        </Card>
      ) : null}

      <StatusActions
        status={data.status}
        dirty={text.dirty}
        pending={setStatus.isPending}
        onMove={move}
        onSkip={() => setStatus.mutate({ id: data.id, status: 'skipped' }, { onSuccess: leave })}
      />

      {data.status === 'approved' ? (
        <>
          <EmailSection
            app={data}
            gmail={gmail.data}
            lockedReason={lockedReason}
            pending={sendEmail.isPending || nextEmail.isPending}
            error={emailError ? describeApiError(emailError) : null}
            notice={notice}
            onSend={(body) => sendEmail.mutate({ id: data.id, body }, { onSuccess: leave })}
            onNextEmail={() =>
              nextEmail.mutate(data.id, {
                onSuccess: (result) => setNotice(result.exhausted ? 'No more suggested addresses. Paste one yourself.' : null),
              })
            }
            onOpenSettings={() => router.push('/settings')}
          />
          <AssistedApplyPanel
            app={data}
            pending={setStatus.isPending}
            lockedReason={lockedReason}
            onMarkApplied={() => setStatus.mutate({ id: data.id, status: 'applied' }, { onSuccess: leave })}
          />
        </>
      ) : null}

      {draft ? <FollowUpItem followUp={draft} /> : null}

      <Card>
        <TextField label="Tailored CV" value={cv} onChangeText={setCv} multiline lines={14} error={text.errors.cv} />
        <TextField label="Cover letter" value={letter} onChangeText={setLetter} multiline lines={10} error={text.errors.letter} />
        <Button
          label={updateText.isPending ? 'Saving…' : 'Save changes'}
          disabled={!text.dirty || Object.keys(text.errors).length > 0 || updateText.isPending}
          onPress={() => updateText.mutate({ id: data.id, patch: text.patch })}
        />
        <Text style={styles.muted}>Saving a CV change rebuilds the PDF.</Text>
        {updateText.isSuccess && !text.dirty ? <Message kind="success" text="Saved." /> : null}
      </Card>

      {mutationError ? <Message kind="error" text={describeApiError(mutationError)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.title, fontWeight: '700', color: colors.text },
  muted: { fontSize: font.small, color: colors.muted },
  label: { fontSize: font.tiny, fontWeight: '600', letterSpacing: 1, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(2) },
  badges: { flex: 1, gap: space(2) },
});
