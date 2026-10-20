import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, font, radius, space } from '@/theme';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export interface ChipsProps<T extends string> {
  options: readonly ChipOption<T>[];
  value: NoInfer<T>;
  onChange(value: NoInfer<T>): void;
  /** 'tab' for segment switches (Pending / Ready / ...), 'button' for filter chips. */
  role?: 'tab' | 'button';
  label: string;
}

/** A horizontal row of pill chips with one selected, as in the mobile mockups. */
export function Chips<T extends string>({ options, value, onChange, role = 'button', label }: ChipsProps<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={label} contentContainerStyle={styles.row}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole={role}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, selected && styles.on]}
          >
            <Text style={[styles.text, selected && styles.textOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space(2), paddingVertical: space(1) },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: space(3.5), paddingVertical: space(2) },
  on: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { fontSize: font.small, color: colors.secondaryText, fontWeight: '500' },
  textOn: { color: colors.primaryText, fontWeight: '600' },
});
