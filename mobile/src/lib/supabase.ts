import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { getPublicEnv } from './env';
import { createChunkedStorage } from './secure-storage';

let client: SupabaseClient | undefined;

/** Supabase is used only to sign in and keep the session fresh. The session lives in SecureStore, nowhere else. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const env = getPublicEnv();
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: createChunkedStorage(SecureStore),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** Supabase's React Native guidance: refresh tokens only while the app is in the foreground. Returns the unsubscribe. */
export function watchAppStateForRefresh(auth: Pick<SupabaseClient['auth'], 'startAutoRefresh' | 'stopAutoRefresh'>): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void auth.startAutoRefresh();
    else void auth.stopAutoRefresh();
  });
  return () => sub.remove();
}
