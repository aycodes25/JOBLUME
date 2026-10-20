import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, font, radius, space } from '@/theme';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress(): void;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  disabled?: boolean;
  /** Shows a spinner next to the label and blocks presses. */
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', size = 'md', disabled = false, busy = false, style }: ButtonProps) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [styles.base, styles[size], styles[variant], off && styles.off, pressed && !off && styles.pressed, style]}
    >
      {busy && <ActivityIndicator size="small" color={variant === 'primary' || variant === 'danger' ? colors.primaryText : colors.primary} />}
      <Text style={[styles.label, size === 'sm' && styles.labelSm, labelColor[variant]]}>{label}</Text>
    </Pressable>
  );
}

const labelColor = StyleSheet.create({
  primary: { color: colors.primaryText },
  danger: { color: colors.primaryText },
  outline: { color: colors.primary },
  ghost: { color: colors.secondaryText },
});

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2), borderRadius: radius.input, borderWidth: 1 },
  md: { minHeight: 44, paddingHorizontal: space(4) },
  sm: { minHeight: 36, paddingHorizontal: space(3) },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
  outline: { backgroundColor: colors.card, borderColor: colors.primary },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  off: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  label: { fontSize: font.body, fontWeight: '600' },
  labelSm: { fontSize: font.small },
});
