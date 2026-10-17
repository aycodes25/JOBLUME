'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { AppShell } from '@/components/layout/AppShell';
import { useApplications, useProfile } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { needsOnboarding } from '@/lib/onboarding';
import { createBrowserSupabase } from '@/lib/supabase/client';

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const apps = useApplications();
  const pendingCount = apps.data?.filter((a) => a.status === 'pending_review').length;
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    void createBrowserSupabase().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const mustOnboard = profile.data ? needsOnboarding(profile.data) && pathname !== '/onboarding' : false;

  useEffect(() => {
    if (mustOnboard) router.replace('/onboarding');
  }, [mustOnboard, router]);

  async function signOut() {
    await createBrowserSupabase().auth.signOut();
    queryClient.clear();
    router.replace('/login');
    router.refresh();
  }

  let body: ReactNode = children;
  if (profile.isLoading || mustOnboard) body = <PageSkeleton />;
  else if (profile.error) body = <ErrorState message={describeApiError(profile.error)} onRetry={() => void profile.refetch()} />;

  return (
    <AppShell email={email} pendingCount={pendingCount} onSignOut={() => void signOut()}>
      {body}
    </AppShell>
  );
}
