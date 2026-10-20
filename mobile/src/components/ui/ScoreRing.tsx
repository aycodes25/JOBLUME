import { StyleSheet, Text, View } from 'react-native';
import { scoreTone } from '@/lib/applications';
import { colors } from '@/theme';

const TONE_COLOR = { high: colors.success, mid: colors.warning, low: colors.danger, none: colors.muted } as const;

/** The match score in a coloured ring. Same accessible label as the web ScoreRing. */
export function ScoreRing({ score, size = 44 }: { score: number | null; size?: number }) {
  const color = TONE_COLOR[scoreTone(score)];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={score === null ? 'No match score' : `Match score ${score} out of 100`}
      style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: color }]}
    >
      <Text style={[styles.text, { color, fontSize: Math.round(size / 3.2) }]}>{score ?? '–'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center', borderWidth: 4 },
  text: { fontWeight: '700' },
});
