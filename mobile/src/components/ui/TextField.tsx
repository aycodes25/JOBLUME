import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, font, radius, space } from '@/theme';

export interface TextFieldProps
  extends Pick<TextInputProps, 'keyboardType' | 'autoCapitalize' | 'autoComplete' | 'secureTextEntry' | 'placeholder' | 'inputMode' | 'maxLength'> {
  label: string;
  value: string;
  onChangeText(text: string): void;
  error?: string;
  hint?: string;
  multiline?: boolean;
  /** Visible height in lines for a multiline field. */
  lines?: number;
  editable?: boolean;
}

/** A labelled input. Tests find it with getByLabelText(label). */
export function TextField({ label, value, onChangeText, error, hint, multiline = false, lines = 6, editable = true, ...rest }: TextFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && { minHeight: lines * 20 + space(4) }, error ? styles.invalid : null]}
        {...rest}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space(1.5) },
  label: { fontSize: font.small, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.card,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    fontSize: font.body,
    color: colors.text,
  },
  invalid: { borderColor: colors.danger },
  error: { fontSize: font.small, color: colors.danger },
  hint: { fontSize: font.tiny, color: colors.muted },
});
