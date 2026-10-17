'use client';

import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface AuthFormProps {
  onSignIn(email: string, password: string): Promise<void>;
  onSignUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
}

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
});

type Mode = 'signin' | 'signup';

export function AuthForm({ onSignIn, onSignUp }: AuthFormProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setErrors({ email: fields.email?.[0], password: fields.password?.[0] });
      return;
    }
    setErrors({});
    setPending(true);
    try {
      if (mode === 'signin') {
        await onSignIn(parsed.data.email, parsed.data.password);
      } else {
        const result = await onSignUp(parsed.data.email, parsed.data.password);
        if (result.needsConfirmation) {
          setMessage({ kind: 'info', text: 'Check your email to confirm your account, then sign in.' });
        }
      }
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
    } finally {
      setPending(false);
    }
  }

  const label = mode === 'signin' ? 'Sign in' : 'Create account';

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Account" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(['signin', 'signup'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === m ? 'bg-background shadow' : 'text-muted-foreground'}`}
            onClick={() => {
              setMode(m);
              setMessage(null);
              setErrors({});
            }}
          >
            {m === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {errors.email && (
            <p id="email-error" role="alert" className="text-sm text-destructive">
              {errors.email}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? 'password-error' : undefined}
          />
          {errors.password && (
            <p id="password-error" role="alert" className="text-sm text-destructive">
              {errors.password}
            </p>
          )}
        </div>
        {message && (
          <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
            {message.text}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Please wait…' : label}
        </Button>
      </form>
    </div>
  );
}
