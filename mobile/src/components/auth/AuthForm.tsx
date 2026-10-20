import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Chips } from '@/components/ui/Chips';
import { Message } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { space } from '@/theme';

export interface AuthFormProps {
  onSignIn(email: string, password: string): Promise<void>;
  onSignUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
}

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
});

type Mode = 'signin' | 'signup';
const MODES = [
  { value: 'signin', label: 'Sign in' },
  { value: 'signup', label: 'Create account' },
] as const;

/** Email and password only (Google sign-in is out of scope). Same rules and messages as the web form. */
export function AuthForm({ onSignIn, onSignUp }: AuthFormProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
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
        if (result.needsConfirmation) setMessage({ kind: 'info', text: 'Check your email to confirm your account, then sign in.' });
      }
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
    } finally {
      setPending(false);
    }
  }

  const label = mode === 'signin' ? 'Sign in' : 'Create account';

  return (
    <View style={styles.form}>
      <Chips
        label="Account"
        role="tab"
        options={MODES}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setMessage(null);
          setErrors({});
        }}
      />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
      />
      {message ? <Message kind={message.kind} text={message.text} /> : null}
      <Button label={pending ? 'Please wait…' : label} onPress={() => void submit()} disabled={pending} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space(4) },
});
