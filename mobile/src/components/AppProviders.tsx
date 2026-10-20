import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ErrorState } from '@/components/ui/States';
import { getPublicEnv } from '@/lib/env';
import { createQueryClient, watchAppFocus } from '@/lib/query-client';
import { SessionProvider } from '@/lib/session';
import { getSupabase, watchAppStateForRefresh } from '@/lib/supabase';

function configProblem(): string | null {
  try {
    getPublicEnv();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'The app is not configured.';
  }
}

/** Query cache, foreground refetching, the Supabase session and token refresh, in that order. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [problem] = useState(configProblem);
  const [queryClient] = useState(createQueryClient);

  useEffect(() => watchAppFocus(), []);
  useEffect(() => (problem ? undefined : watchAppStateForRefresh(getSupabase().auth)), [problem]);

  if (problem) return <ErrorState message={problem} />;
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider source={getSupabase().auth}>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
