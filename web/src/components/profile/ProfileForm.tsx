'use client';

import type { ProfilePatch } from '@joblume/shared';
import { LOCATIONS } from '@joblume/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeApiError } from '@/lib/api/errors';
import { buildProfilePatch, type ProfileField, type ProfileFormValues } from '@/lib/profile-form';

export interface ProfileFormProps {
  initial: ProfileFormValues;
  onSubmit(patch: ProfilePatch): Promise<void>;
  submitLabel: string;
  requireRoles?: boolean;
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

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
  const invalid = (f: ProfileField) => (errors[f] ? true : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
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
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field id="desiredRoles" label="Roles you want" hint="Separate roles with commas, for example Data Analyst, BI Analyst. Every word of a role must appear in a job title to match." error={errors.desiredRoles}>
        <Input id="desiredRoles" value={values.desiredRoles} onChange={(e) => set('desiredRoles', e.target.value)} aria-invalid={invalid('desiredRoles')} aria-describedby={errors.desiredRoles ? 'desiredRoles-error' : undefined} />
      </Field>
      <Field id="skills" label="Skills" hint="Separate skills with commas." error={errors.skills}>
        <Input id="skills" value={values.skills} onChange={(e) => set('skills', e.target.value)} aria-invalid={invalid('skills')} />
      </Field>
      <Field id="location" label="Location" error={errors.location}>
        <select
          id="location"
          value={values.location}
          onChange={(e) => set('location', e.target.value as ProfileFormValues['location'])}
          className="flex h-9 w-full rounded-lg border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Any location</option>
          {LOCATIONS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field id="yearsExperience" label="Years of experience" error={errors.yearsExperience}>
        <Input id="yearsExperience" inputMode="numeric" value={values.yearsExperience} onChange={(e) => set('yearsExperience', e.target.value)} aria-invalid={invalid('yearsExperience')} aria-describedby={errors.yearsExperience ? 'yearsExperience-error' : undefined} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="salaryMin" label="Minimum salary" error={errors.salaryMin}>
          <Input id="salaryMin" inputMode="numeric" value={values.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} aria-invalid={invalid('salaryMin')} aria-describedby={errors.salaryMin ? 'salaryMin-error' : undefined} />
        </Field>
        <Field id="salaryMax" label="Maximum salary" error={errors.salaryMax}>
          <Input id="salaryMax" inputMode="numeric" value={values.salaryMax} onChange={(e) => set('salaryMax', e.target.value)} aria-invalid={invalid('salaryMax')} aria-describedby={errors.salaryMax ? 'salaryMax-error' : undefined} />
        </Field>
      </div>
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-emerald-600">
          Saved.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
