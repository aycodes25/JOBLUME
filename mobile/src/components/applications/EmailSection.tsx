import type { ApplicationDetail, GmailStatus } from '@joblume/shared';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Message } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { previewText } from '@/lib/applications';
import { recipientInfo, sendDisabledReason } from '@/lib/email-send';
import { colors, font, radius, space } from '@/theme';

export interface EmailSectionProps {
  app: ApplicationDetail;
  gmail: GmailStatus | undefined;
  lockedReason?: string;
  pending: boolean;
  error?: string | null;
  notice?: string | null;
  onSend(input: { to?: string; confirmGuess?: boolean }): void;
  onNextEmail(): void;
  onOpenSettings(): void;
}

/**
 * Send by email. Nothing is sent until the user taps Send application, and a guessed address
 * also needs the "Send to this guessed address" box ticked first (the server checks this again).
 */
export function EmailSection({ app, gmail, lockedReason, pending, error, notice, onSend, onNextEmail, onOpenSettings }: EmailSectionProps) {
  const stored = app.hiring_manager_email ?? '';
  const [email, setEmail] = useState(stored);
  const [guessConfirmed, setGuessConfirmed] = useState(false);

  useEffect(() => {
    setEmail(stored);
    setGuessConfirmed(false);
  }, [stored, app.id]);

  const info = recipientInfo(app, email);
  const gmailConnected = gmail?.connected === true;
  const reason = sendDisabledReason({ gmailConnected, email, isGuess: info.isGuess, guessConfirmed, locked: lockedReason });

  const sending = useRef(false);
  useEffect(() => {
    if (!pending) sending.current = false;
  }, [pending]);

  function submit() {
    // Two taps in one frame arrive before `pending` re-renders; only the first is sent until the request settles.
    if (sending.current) return;
    sending.current = true;
    onSend({ to: email.trim(), ...(info.isGuess && guessConfirmed ? { confirmGuess: true } : {}) });
  }

  return (
    <View accessibilityLabel="Send by email" style={styles.panel}>
      <Text accessibilityRole="header" style={styles.title}>
        Send by email
      </Text>

      {!gmailConnected ? (
        <View style={styles.row}>
          <Text style={styles.muted}>Gmail is not connected.</Text>
          <Pressable accessibilityRole="link" onPress={onOpenSettings} hitSlop={8}>
            <Text style={styles.link}>Connect Gmail</Text>
          </Pressable>
        </View>
      ) : null}

      {info.badge ? <Badge label={info.badge.label} tone={info.badge.tone} /> : null}
      <TextField label="Recipient" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Button label="Find another email" variant="outline" size="sm" onPress={onNextEmail} disabled={pending} />
      {info.isGuess ? <Checkbox label="Send to this guessed address" checked={guessConfirmed} onChange={setGuessConfirmed} /> : null}

      <View style={styles.preview}>
        <Text style={styles.muted}>{`Subject: Application for ${app.job?.title ?? 'the role'}`}</Text>
        <Text style={styles.muted}>{previewText(app.cover_letter_text, 240)}</Text>
        <Text style={styles.muted}>Your tailored CV (PDF) is attached.</Text>
      </View>

      <Button label={pending ? 'Sending…' : 'Send application'} onPress={submit} disabled={pending || reason !== null} />
      {reason ? <Text style={styles.muted}>{reason}</Text> : null}
      {notice ? <Message kind="info" text={notice} /> : null}
      {error ? <Message kind="error" text={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space(3), borderRadius: radius.card, borderWidth: 1, borderColor: colors.primarySoft, backgroundColor: colors.primarySoft, padding: space(4) },
  title: { fontSize: font.heading, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(2) },
  muted: { fontSize: font.small, color: colors.muted },
  link: { fontSize: font.small, color: colors.primary, fontWeight: '600' },
  preview: { gap: space(1) },
});
