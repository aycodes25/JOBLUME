import { getPublicEnv } from '../env';
import { createBrowserSupabase } from '../supabase/client';
import { createApiClient } from './client';
import { createApi, type Api } from './endpoints';

let api: Api | undefined;

/** The API used by the browser UI: Bearer token from the current Supabase session. */
export function getApi(): Api {
  if (api) return api;
  const env = getPublicEnv();
  const supabase = createBrowserSupabase();
  api = createApi(
    createApiClient({
      baseUrl: env.apiUrl,
      getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
      onUnauthorized: async () => {
        await supabase.auth.signOut();
        window.location.assign('/login');
      },
    }),
  );
  return api;
}
