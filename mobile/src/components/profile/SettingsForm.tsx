import type { ProfilePatch } from '@joblume/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Chips } from '@/components/ui/Chips';
import { Message } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { describeApiError } from '@/lib/api/errors';
import { buildSettingsPatch, type SettingsField, type SettingsValues } from '@/lib/profile-form';
import { colors, font, space } from '@/theme';

export interface SettingsFormProps {
  initial: SettingsValues;
  onSubmit(patch: ProfilePatch): Promise<void>;
}

const MODES = [
  { value: 'manual', label: 'Manual' },
  { value: 'auto', label: 'Auto' },
] as const;

/** Apply mode, auto threshold, daily cap and auto follow-up. The Auto rules are enforced by the server and unchanged. */
export function SettingsForm({ initial, onSubmit }: SettingsFormProps) {
  const [values, setValues] = useState<SettingsValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<SettingsField, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const set = <K extends SettingsField>(key: K, value: SettingsValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  };

  async function submit() {
    setServerError(null);
    setSaved(false);
    const result = buildSettingsPatch(values);
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
      <View style={styles.field}>
        <Text style={styles.label}>Apply mode</Text>
        <Chips label="Apply mode" options={MODES} value={values.applyMode} onChange={(m) => set('applyMode', m)} />
        <Text style={styles.hint}>
          Auto mode sends an application by email without a tap only when all of these are true: Gmail is connected, the job is from Remotive, MyJobMag or
          Jobberman, the contact email was found by Hunter (not guessed or pasted) with confidence 80 or more, the match score meets your threshold, and
          today's limit is not reached. Applications already in your queue are not sent.
        </Text>
      </View>
      <TextField label="Auto-apply threshold" keyboardType="number-pad" value={values.autoThreshold} onChangeText={(t) => set('autoThreshold', t)} error={errors.autoThreshold} />
      <TextField label="Daily application cap" keyboardType="number-pad" value={values.dailyCap} onChangeText={(t) => set('dailyCap', t)} error={errors.dailyCap} />
      <Checkbox label="Auto follow-up" checked={values.autoFollowup} onChange={(v) => set('autoFollowup', v)} />
      <Text style={styles.hint}>With this on, follow-up drafts are sent automatically three days after you apply instead of waiting for you.</Text>
      {serverError ? <Message kind="error" text={serverError} /> : null}
      {saved ? <Message kind="success" text="Saved." /> : null}
      <Button label={pending ? 'Saving…' : 'Save settings'} onPress={() => void submit()} disabled={pending} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space(4) },
  field: { gap: space(1.5) },
  label: { fontSize: font.small, fontWeight: '600', color: colors.text },
  hint: { fontSize: font.tiny, color: colors.muted },
});
