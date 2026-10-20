import { getPublicEnv } from '../env';
import { getSupabase } from '../supabase';
import { createApiClient } from './client';
import { createApi, type Api } from './endpoints';

let api: Api | undefined;

/** The API the screens use: Bearer token from the current Supabase session. */
export function getApi(): Api {
  if (api) return api;
  const env = getPublicEnv();
  const supabase = getSupabase();
  api = createApi(
    createApiClient({
      baseUrl: env.apiUrl,
      getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
      // Local sign-out needs no network; the session listener then sends the user to /login.
      onUnauthorized: async () => {
        await supabase.auth.signOut({ scope: 'local' });
      },
    }),
  );
  return api;
}
