import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type SessionStatus = 'loading' | 'signedIn' | 'signedOut';

export interface SessionValue {
  status: SessionStatus;
  email: string | null;
}

/** The two Supabase auth calls the provider needs (supabase.auth, or a fake in tests). */
export interface SessionSource {
  getSession(): Promise<{ data: { session: Session | null } }>;
  onAuthStateChange(cb: (event: string, session: Session | null) => void): { data: { subscription: { unsubscribe(): void } } };
}

const SessionContext = createContext<SessionValue>({ status: 'loading', email: null });

export function useSession(): SessionValue {
  return useContext(SessionContext);
}

/** Tracks the signed-in user. When the user changes or signs out, cached API data is dropped so nothing leaks between accounts. */
export function SessionProvider({ source, children }: { source: SessionSource; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState<SessionValue>({ status: 'loading', email: null });
  const userId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const apply = (session: Session | null) => {
      if (!active) return;
      const nextId = session?.user.id ?? null;
      if (userId.current !== undefined && userId.current !== nextId) queryClient.clear();
      userId.current = nextId;
      setValue(session ? { status: 'signedIn', email: session.user.email ?? null } : { status: 'signedOut', email: null });
    };
    void source.getSession().then(({ data }) => apply(data.session)).catch(() => apply(null));
    const { data } = source.onAuthStateChange((_event, session) => apply(session));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [source, queryClient]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** For tests and previews: a fixed session value. */
export function StaticSession({ value, children }: { value: SessionValue; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
