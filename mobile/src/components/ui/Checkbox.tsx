import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, space } from '@/theme';

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange(next: boolean): void;
  disabled?: boolean;
}

/** A tick box. Tests find it with getByRole('checkbox', { name: label }). */
export function Checkbox({ label, checked, onChange, disabled = false }: CheckboxProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={styles.row}
    >
      <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Text style={styles.tick}>✓</Text> : null}</View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2), minHeight: 40 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.primaryText, fontSize: font.small, fontWeight: '700' },
  label: { flex: 1, fontSize: font.body, color: colors.text },
});
