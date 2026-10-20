export interface PublicEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiUrl: string;
}

/** Checks the three public values. Nothing secret belongs here: everything EXPO_PUBLIC_ ends up in the app bundle. */
export function readPublicEnv(values: { supabaseUrl?: string; supabaseAnonKey?: string; apiUrl?: string }): PublicEnv {
  const { supabaseUrl, supabaseAnonKey, apiUrl } = values;
  if (!supabaseUrl || !supabaseAnonKey || !apiUrl) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY or EXPO_PUBLIC_API_URL. Copy mobile/.env.example to mobile/.env and fill it in.',
    );
  }
  return { supabaseUrl, supabaseAnonKey, apiUrl: apiUrl.replace(/\/+$/, '') };
}

/** Each variable is referenced literally so Expo can inline it into the bundle. */
export function getPublicEnv(): PublicEnv {
  return readPublicEnv({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
  });
}
