import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, font, space } from '@/theme';
import { Button } from './Button';

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator accessibilityLabel={label} color={colors.primary} size="large" />
    </View>
  );
}

/** Plain-language error with a retry button (network failures and server errors). */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text accessibilityRole="alert" style={styles.error}>
        {message}
      </Text>
      {onRetry ? <Button label="Try again" variant="outline" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {action}
    </View>
  );
}

/** A one-line result under a form: 'error' is announced as an alert. */
export function Message({ kind, text }: { kind: 'error' | 'success' | 'info'; text: string }) {
  return (
    <Text accessibilityRole={kind === 'error' ? 'alert' : 'text'} style={[styles.message, kindStyle[kind]]}>
      {text}
    </Text>
  );
}

const kindStyle = StyleSheet.create({
  error: { color: colors.danger },
  success: { color: colors.success },
  info: { color: colors.muted },
});

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(4), padding: space(6), minHeight: 200 },
  error: { fontSize: font.body, color: colors.danger, textAlign: 'center' },
  empty: { alignItems: 'center', gap: space(2), padding: space(8), borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 16 },
  title: { fontSize: font.heading, fontWeight: '600', color: colors.text, textAlign: 'center' },
  description: { fontSize: font.small, color: colors.muted, textAlign: 'center' },
  message: { fontSize: font.small },
});
