'use client';

import { useRouter } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { createBrowserSupabase } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();

  async function onSignIn(email: string, password: string) {
    const { error } = await createBrowserSupabase().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    router.replace('/queue');
    router.refresh();
  }

  async function onSignUp(email: string, password: string) {
    const { data, error } = await createBrowserSupabase().auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (data.session) {
      router.replace('/onboarding');
      router.refresh();
      return { needsConfirmation: false };
    }
    return { needsConfirmation: true };
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">JobLume</h1>
        <p className="text-sm text-muted-foreground">AI-tailored applications that you approve before anything is sent.</p>
      </div>
      <AuthForm onSignIn={onSignIn} onSignUp={onSignUp} />
    </main>
  );
}
