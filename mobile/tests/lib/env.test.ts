import { readPublicEnv } from '@/lib/env';

describe('readPublicEnv', () => {
  it('returns the values and trims trailing slashes from the API address', () => {
    expect(readPublicEnv({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', apiUrl: 'http://192.168.1.20:4000//' })).toEqual({
      supabaseUrl: 'https://x.supabase.co',
      supabaseAnonKey: 'anon',
      apiUrl: 'http://192.168.1.20:4000',
    });
  });

  it.each([
    [{ supabaseAnonKey: 'anon', apiUrl: 'http://a' }],
    [{ supabaseUrl: 'https://x', apiUrl: 'http://a' }],
    [{ supabaseUrl: 'https://x', supabaseAnonKey: 'anon', apiUrl: '' }],
  ])('names the missing variables and the file to copy for %j', (values) => {
    expect(() => readPublicEnv(values)).toThrow(/EXPO_PUBLIC_API_URL.*mobile\/\.env\.example/);
  });
});
