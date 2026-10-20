import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '@/theme';

export type BadgeTone = 'primary' | 'success' | 'warning' | 'danger' | 'secondary' | 'outline';

const TONES: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft },
  success: { bg: colors.successSoft, fg: colors.success, border: colors.successSoft },
  warning: { bg: colors.warningSoft, fg: colors.warning, border: colors.warningSoft },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  secondary: { bg: colors.secondary, fg: colors.secondaryText, border: colors.secondary },
  outline: { bg: colors.card, fg: colors.secondaryText, border: colors.border },
};

/** A pill badge, as on the web. */
export function Badge({ label, tone = 'secondary' }: { label: string; tone?: BadgeTone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: space(2.5), paddingVertical: space(0.5) },
  text: { fontSize: font.tiny, fontWeight: '600' },
});
