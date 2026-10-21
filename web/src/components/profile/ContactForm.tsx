'use client';

import type { ProfilePatch } from '@joblume/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeApiError } from '@/lib/api/errors';
import { buildContactPatch, type ContactField, type ContactValues } from '@/lib/profile-form';

export interface ContactFormProps {
  initial: ContactValues;
  onSubmit(patch: ProfilePatch): Promise<void>;
}

const FIELDS: Array<{ key: ContactField; label: string; type?: string; autoComplete: string; placeholder?: string }> = [
  { key: 'fullName', label: 'Full name', autoComplete: 'name' },
  { key: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel', placeholder: '+234 801 234 5678' },
  { key: 'city', label: 'City', autoComplete: 'address-level2', placeholder: 'Lagos' },
  { key: 'linkedinUrl', label: 'LinkedIn link', type: 'url', autoComplete: 'url', placeholder: 'https://www.linkedin.com/in/your-name' },
  { key: 'githubUrl', label: 'GitHub link', type: 'url', autoComplete: 'url', placeholder: 'https://github.com/your-name' },
  { key: 'portfolioUrl', label: 'Portfolio or website link', type: 'url', autoComplete: 'url', placeholder: 'https://your-site.example' },
];

export function ContactForm({ initial, onSubmit }: ContactFormProps) {
  const [values, setValues] = useState<ContactValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
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
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-2">
            <Label htmlFor={`contact-${f.key}`}>{f.label}</Label>
            <Input
              id={`contact-${f.key}`}
              type={f.type ?? 'text'}
              autoComplete={f.autoComplete}
              placeholder={f.placeholder}
              value={values[f.key]}
              onChange={(e) => {
                setValues((v) => ({ ...v, [f.key]: e.target.value }));
                setSaved(false);
              }}
              aria-invalid={errors[f.key] ? true : undefined}
            />
            {errors[f.key] && <p className="text-sm text-destructive">{errors[f.key]}</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Links must start with https://. Leave a box empty to remove it. These details are only used to fill employer forms through the JobLume extension, and only when you press the button.</p>
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
        {pending ? 'Saving…' : 'Save contact details'}
      </Button>
    </form>
  );
}
