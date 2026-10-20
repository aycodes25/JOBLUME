'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { createBrowserSupabase } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  async function onSignIn(email: string, password: string) {
    const { error } = await createBrowserSupabase().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    queryClient.clear();
    router.replace('/queue');
    router.refresh();
  }

  async function onSignUp(email: string, password: string) {
    const { data, error } = await createBrowserSupabase().auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (data.session) {
      queryClient.clear();
      router.replace('/onboarding');
      router.refresh();
      return { needsConfirmation: false };
    }
    return { needsConfirmation: true };
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-primary">JobLume</h1>
        <p className="text-sm text-muted-foreground">AI-tailored applications that you approve before anything is sent.</p>
      </div>
      <div className="rounded-xl border border-border/70 bg-white p-6 shadow-card">
        <AuthForm onSignIn={onSignIn} onSignUp={onSignUp} />
      </div>
    </main>
  );
}
