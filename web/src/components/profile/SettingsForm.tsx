'use client';

import type { ProfilePatch } from '@joblume/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeApiError } from '@/lib/api/errors';
import { buildSettingsPatch, type SettingsField, type SettingsValues } from '@/lib/profile-form';

export interface SettingsFormProps {
  initial: SettingsValues;
  onSubmit(patch: ProfilePatch): Promise<void>;
}

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

  async function submit(e: FormEvent) {
    e.preventDefault();
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
    <form onSubmit={submit} noValidate className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Apply mode</legend>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="applyMode" checked={values.applyMode === 'manual'} onChange={() => set('applyMode', 'manual')} />
            Manual
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="applyMode" checked={values.applyMode === 'auto'} onChange={() => set('applyMode', 'auto')} />
            Auto
          </label>
        </div>
        <p className="text-xs text-muted-foreground">Auto mode only saves your preference for now. Sending arrives in a later update, and nothing is applied without your action today.</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="autoThreshold">Auto-apply threshold</Label>
          <Input id="autoThreshold" type="number" value={values.autoThreshold} onChange={(e) => set('autoThreshold', e.target.value)} aria-invalid={errors.autoThreshold ? true : undefined} />
          {errors.autoThreshold && <p className="text-sm text-destructive">{errors.autoThreshold}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="dailyCap">Daily application cap</Label>
          <Input id="dailyCap" type="number" value={values.dailyCap} onChange={(e) => set('dailyCap', e.target.value)} aria-invalid={errors.dailyCap ? true : undefined} />
          {errors.dailyCap && <p className="text-sm text-destructive">{errors.dailyCap}</p>}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={values.autoFollowup} onChange={(e) => set('autoFollowup', e.target.checked)} />
        Auto follow-up
      </label>

      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-emerald-400">
          Saved.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  );
}
