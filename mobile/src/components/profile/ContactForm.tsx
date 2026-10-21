import type { ProfilePatch } from '@joblume/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Message } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { describeApiError } from '@/lib/api/errors';
import { buildContactPatch, type ContactField, type ContactValues } from '@/lib/profile-form';
import { colors, font, space } from '@/theme';

export interface ContactFormProps {
  initial: ContactValues;
  onSubmit(patch: ProfilePatch): Promise<void>;
}

/** Name, phone, city and links the JobLume browser extension fills into employer forms. */
export function ContactForm({ initial, onSubmit }: ContactFormProps) {
  const [values, setValues] = useState<ContactValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const set = (key: ContactField, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  };

  async function submit() {
    setServerError(null);
    setSaved(false);
    const result = buildContactPatch(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await onSubmit(result.patch);
      setSaved(true);
    } catch (err) {
      setServerError(describeApiError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.form}>
      <TextField label="Full name" autoComplete="name" value={values.fullName} onChangeText={(t) => set('fullName', t)} error={errors.fullName} />
      <TextField label="Phone" keyboardType="phone-pad" autoComplete="tel" value={values.phone} onChangeText={(t) => set('phone', t)} error={errors.phone} />
      <TextField label="City" value={values.city} onChangeText={(t) => set('city', t)} error={errors.city} />
      <TextField label="LinkedIn link" keyboardType="url" autoCapitalize="none" value={values.linkedinUrl} onChangeText={(t) => set('linkedinUrl', t)} error={errors.linkedinUrl} />
      <TextField label="GitHub link" keyboardType="url" autoCapitalize="none" value={values.githubUrl} onChangeText={(t) => set('githubUrl', t)} error={errors.githubUrl} />
      <TextField label="Portfolio or website link" keyboardType="url" autoCapitalize="none" value={values.portfolioUrl} onChangeText={(t) => set('portfolioUrl', t)} error={errors.portfolioUrl} />
      <Text style={styles.hint}>
        Links must start with https://. Leave a box empty to remove it. These details are only used to fill employer forms through the JobLume extension on a
        computer, and only when you press the button there.
      </Text>
      {serverError ? <Message kind="error" text={serverError} /> : null}
      {saved ? <Message kind="success" text="Saved." /> : null}
      <Button label={pending ? 'Saving…' : 'Save contact details'} onPress={() => void submit()} disabled={pending} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space(4) },
  hint: { fontSize: font.tiny, color: colors.muted },
});
