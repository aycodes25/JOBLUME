import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicEnv } from '@/lib/env';

afterEach(() => vi.unstubAllEnvs());

describe('getPublicEnv', () => {
  it('returns the values and strips trailing slashes from the API URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://sb.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.test//');
    expect(getPublicEnv()).toEqual({ supabaseUrl: 'http://sb.test', supabaseAnonKey: 'anon', apiUrl: 'http://api.test' });
  });

  it('throws naming all three variables when one is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://sb.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.test');
    expect(() => getPublicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL.*NEXT_PUBLIC_SUPABASE_ANON_KEY.*NEXT_PUBLIC_API_URL/);
  });
});
