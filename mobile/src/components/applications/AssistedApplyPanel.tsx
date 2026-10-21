import { safeHttpUrl, type ApplicationDetail } from '@joblume/shared';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Message } from '@/components/ui/States';
import { openExternalUrl } from '@/lib/external';
import { pdfFileName, shareCvPdf, type SharePdfResult } from '@/lib/share-pdf';
import { colors, font, radius, space } from '@/theme';

export interface AssistedApplyActions {
  openUrl(url: string): Promise<boolean>;
  sharePdf(url: string, fileName: string): Promise<SharePdfResult>;
  copyText(text: string): Promise<unknown>;
}

const defaultActions: AssistedApplyActions = {
  openUrl: (url) => openExternalUrl(url),
  sharePdf: (url, fileName) => shareCvPdf(url, fileName),
  copyText: (text) => Clipboard.setStringAsync(text),
};

export interface AssistedApplyPanelProps {
  app: ApplicationDetail;
  onMarkApplied(): void;
  pending?: boolean;
  lockedReason?: string;
  actions?: AssistedApplyActions;
  /** True once the application has been marked applied: the panel then offers to move on instead of the steps. */
  applied?: boolean;
  /** Opens the next application in the queue. Only navigates. Omit when there is none. */
  onOpenNext?(): void;
  onDone?(): void;
}

type Feedback = { kind: 'error' | 'success'; text: string } | null;

/** Apply on the employer's site. This path sends nothing: open the job, share the CV PDF, copy the letter, then mark it applied. */
export function AssistedApplyPanel({ app, onMarkApplied, pending = false, lockedReason, actions = defaultActions, applied = false, onOpenNext, onDone }: AssistedApplyPanelProps) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [sharing, setSharing] = useState(false);
  const jobUrl = safeHttpUrl(app.job?.url);
  const pdfUrl = safeHttpUrl(app.cv_pdf_url);

  async function share() {
    if (!pdfUrl) return;
    setSharing(true);
    setFeedback(null);
    try {
      const result = await actions.sharePdf(pdfUrl, pdfFileName(app.job));
      if (result === 'unavailable') setFeedback({ kind: 'error', text: 'Sharing is not available on this phone.' });
    } catch {
      setFeedback({ kind: 'error', text: 'Could not download the CV PDF. Check your connection and try again.' });
    } finally {
      setSharing(false);
    }
  }

  async function copy() {
    try {
      await actions.copyText(app.cover_letter_text ?? '');
      setFeedback({ kind: 'success', text: 'Copied.' });
    } catch {
      setFeedback({ kind: 'error', text: 'Could not copy. Select the text in the editor below and copy it yourself.' });
    }
  }

  if (applied) {
    return (
      <View accessibilityLabel="Apply" style={styles.panel}>
        <Message kind="success" text="Marked as applied." />
        {onOpenNext ? <Button label="Applied: open next job" size="sm" onPress={onOpenNext} /> : null}
        {onDone ? <Button label="Done" variant="outline" size="sm" onPress={onDone} /> : null}
      </View>
    );
  }

  return (
    <View accessibilityLabel="Apply" style={styles.panel}>
      <Text accessibilityRole="header" style={styles.title}>
        Or apply on the employer's site
      </Text>
      {lockedReason ? (
        <Message kind="error" text={lockedReason} />
      ) : (
        <>
          <Text style={styles.muted}>
            This path sends nothing for you. Open the job, attach your tailored CV, paste the cover letter, then mark it as applied here.
          </Text>
          {jobUrl ? (
            <Button label="1. Open job posting" variant="outline" size="sm" onPress={() => void actions.openUrl(jobUrl)} />
          ) : (
            <Text style={styles.muted}>This job has no valid link.</Text>
          )}
          {pdfUrl ? (
            <Button label="2. Share CV PDF" variant="outline" size="sm" busy={sharing} onPress={() => void share()} />
          ) : (
            <Text style={styles.muted}>The tailored CV PDF is not available yet.</Text>
          )}
          <Button label="3. Copy cover letter" variant="outline" size="sm" onPress={() => void copy()} />
          <Button label="4. Mark as applied" size="sm" disabled={pending} onPress={onMarkApplied} />
          {feedback ? <Message kind={feedback.kind} text={feedback.text} /> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space(3), borderRadius: radius.card, borderWidth: 1, borderColor: colors.primarySoft, backgroundColor: colors.primarySoft, padding: space(4) },
  title: { fontSize: font.heading, fontWeight: '600', color: colors.text },
  muted: { fontSize: font.small, color: colors.muted },
});
