import { LOCATIONS, type ProfilePatch } from '@joblume/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Chips } from '@/components/ui/Chips';
import { Message } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { describeApiError } from '@/lib/api/errors';
import { buildProfilePatch, type ProfileField, type ProfileFormValues } from '@/lib/profile-form';
import { colors, font, space } from '@/theme';

export interface ProfileFormProps {
  initial: ProfileFormValues;
  onSubmit(patch: ProfilePatch): Promise<void>;
  submitLabel: string;
  requireRoles?: boolean;
}

const LOCATION_OPTIONS = [{ value: '', label: 'Any location' }, ...LOCATIONS.map((l) => ({ value: l, label: l }))] as const;

/** Roles, skills, location, experience and salary, with the same validation as the web form. */
export function ProfileForm({ initial, onSubmit, submitLabel, requireRoles = false }: ProfileFormProps) {
  const [values, setValues] = useState<ProfileFormValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const set = <K extends ProfileField>(key: K, value: ProfileFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  };

  async function submit() {
    setServerError(null);
    setSaved(false);
    const result = buildProfilePatch(values, { requireRoles });
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
      <TextField
        label="Roles you want"
        hint="Separate roles with commas, for example Data Analyst, BI Analyst. Every word of a role must appear in a job title to match."
        value={values.desiredRoles}
        onChangeText={(t) => set('desiredRoles', t)}
        error={errors.desiredRoles}
      />
      <TextField label="Skills" hint="Separate skills with commas." value={values.skills} onChangeText={(t) => set('skills', t)} error={errors.skills} />
      <View style={styles.field}>
        <Text style={styles.label}>Location</Text>
        <Chips label="Location" options={LOCATION_OPTIONS} value={values.location} onChange={(l) => set('location', l)} />
      </View>
      <TextField label="Years of experience" keyboardType="number-pad" value={values.yearsExperience} onChangeText={(t) => set('yearsExperience', t)} error={errors.yearsExperience} />
      <TextField label="Minimum salary" keyboardType="number-pad" value={values.salaryMin} onChangeText={(t) => set('salaryMin', t)} error={errors.salaryMin} />
      <TextField label="Maximum salary" keyboardType="number-pad" value={values.salaryMax} onChangeText={(t) => set('salaryMax', t)} error={errors.salaryMax} />
      {serverError ? <Message kind="error" text={serverError} /> : null}
      {saved ? <Message kind="success" text="Saved." /> : null}
      <Button label={pending ? 'Saving…' : submitLabel} onPress={() => void submit()} disabled={pending} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space(4) },
  field: { gap: space(1.5) },
  label: { fontSize: font.small, fontWeight: '600', color: colors.text },
});
