/** Public configuration. Each variable is referenced literally so Next.js can inline it into the browser bundle. */
export function getPublicEnv(): { supabaseUrl: string; supabaseAnonKey: string; apiUrl: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!supabaseUrl || !supabaseAnonKey || !apiUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_API_URL. Copy web/.env.example to web/.env.local and fill it in.');
  }
  return { supabaseUrl, supabaseAnonKey, apiUrl: apiUrl.replace(/\/+$/, '') };
}
