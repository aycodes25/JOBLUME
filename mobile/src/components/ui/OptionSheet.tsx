import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '@/theme';

export interface SheetOption<T extends string> {
  value: T;
  label: string;
}

export interface OptionSheetProps<T extends string> {
  visible: boolean;
  title: string;
  options: readonly SheetOption<T>[];
  /** The option shown as current; pressing it just closes the sheet. */
  current?: T;
  onSelect(value: T): void;
  onClose(): void;
}

/** A bottom action sheet. Used instead of drag and drop to change an application's status. */
export function OptionSheet<T extends string>({ visible, title, options, current, onSelect, onClose }: OptionSheetProps<T>) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {options.map((o) => {
          const isCurrent = o.value === current;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              accessibilityState={{ selected: isCurrent }}
              onPress={() => {
                onClose();
                if (!isCurrent) onSelect(o.value);
              }}
              style={styles.option}
            >
              <Text style={[styles.optionText, isCurrent && styles.current]}>{isCurrent ? `${o.label} (current)` : o.label}</Text>
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.option}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), gap: space(1) },
  title: { fontSize: font.heading, fontWeight: '600', color: colors.text, marginBottom: space(2) },
  option: { minHeight: 48, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { fontSize: font.body, color: colors.text },
  current: { color: colors.muted },
  cancel: { fontSize: font.body, color: colors.primary, fontWeight: '600', textAlign: 'center' },
});
