import type { GmailStatus } from '@joblume/shared';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Card';
import { Message } from '@/components/ui/States';
import { describeGmailReason, type GmailReturn } from '@/lib/gmail-return';
import { colors, font, space } from '@/theme';

export interface GmailCardProps {
  status: GmailStatus | undefined;
  connecting: boolean;
  disconnecting: boolean;
  error?: string | null;
  returned?: GmailReturn | null;
  onConnect(): void;
  onDisconnect(): void;
}

/** Same states and wording as the web Gmail card. */
export function GmailCard({ status, connecting, disconnecting, error, returned, onConnect, onDisconnect }: GmailCardProps) {
  return (
    <Section
      title="Gmail"
      description="Connect Gmail so JobLume can send your applications and follow-ups from your own address. It can only send email; it cannot read your mail."
    >
      {returned?.kind === 'connected' ? <Message kind="success" text="Gmail connected." /> : null}
      {returned?.kind === 'error' ? <Message kind="error" text={describeGmailReason(returned.reason)} /> : null}
      {!status ? (
        <Text style={styles.muted}>Checking Gmail…</Text>
      ) : !status.configured ? (
        <Text style={styles.muted}>Gmail is not set up on this server yet. Follow docs/gmail-setup.md, then restart the server.</Text>
      ) : status.connected ? (
        <View style={styles.row}>
          <Text style={styles.text}>{`Connected as ${status.email ?? ''}`}</Text>
          <Button label={disconnecting ? 'Disconnecting…' : 'Disconnect'} variant="outline" size="sm" onPress={onDisconnect} disabled={disconnecting} />
        </View>
      ) : (
        <Button label={connecting ? 'Opening Google…' : 'Connect Gmail'} onPress={onConnect} disabled={connecting} />
      )}
      {error ? <Message kind="error" text={error} /> : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { gap: space(2) },
  text: { fontSize: font.body, color: colors.text },
  muted: { fontSize: font.small, color: colors.muted },
});
