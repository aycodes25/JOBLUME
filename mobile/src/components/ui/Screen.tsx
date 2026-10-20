import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font, space } from '@/theme';

export interface ScreenProps {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  /** Pull-to-refresh: called when the user pulls; `refreshing` shows the spinner. */
  onRefresh?: () => void;
  refreshing?: boolean;
}

/** The page frame: light grey background, safe area, scrolling content with an optional pull-to-refresh. */
export function Screen({ title, subtitle, children, onRefresh, refreshing = false }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} /> : undefined}
      >
        {title ? (
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space(4), gap: space(4), paddingBottom: space(10) },
  header: { gap: space(1) },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: font.small, color: colors.muted },
});
