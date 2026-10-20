import { fireEvent, render, screen } from '@testing-library/react-native';

const mockSignOut = jest.fn();
jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({ auth: { signOut: mockSignOut } }) }));
jest.mock('@/components/settings/SettingsScreen', () => {
  const { Pressable, Text } = require('react-native');
  return {
    SettingsScreen: ({ onSignOut }: { onSignOut(): Promise<void> }) => (
      <Pressable accessibilityRole="button" onPress={() => void onSignOut().catch(() => {})}>
        <Text>Sign out</Text>
      </Pressable>
    ),
  };
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsTab from '@/app/(tabs)/settings';

async function signOut(qc: QueryClient) {
  await render(
    <QueryClientProvider client={qc}>
      <SettingsTab />
    </QueryClientProvider>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
}

beforeEach(() => mockSignOut.mockReset());

describe('Settings tab sign out', () => {
  it('signs out globally and clears the cache', async () => {
    mockSignOut.mockResolvedValue({ error: null });
    const qc = new QueryClient();
    const clear = jest.spyOn(qc, 'clear');
    await signOut(qc);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith();
    expect(clear).toHaveBeenCalled();
  });

  it('falls back to a local sign-out when the global one fails (offline)', async () => {
    mockSignOut.mockResolvedValueOnce({ error: new Error('Network request failed') }).mockResolvedValueOnce({ error: null });
    const qc = new QueryClient();
    const clear = jest.spyOn(qc, 'clear');
    await signOut(qc);
    expect(mockSignOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
    expect(clear).toHaveBeenCalled();
  });

  it('reports failure only when the local sign-out fails too', async () => {
    mockSignOut.mockResolvedValue({ error: new Error('nope') });
    const qc = new QueryClient();
    const clear = jest.spyOn(qc, 'clear');
    await signOut(qc);
    expect(mockSignOut).toHaveBeenCalledTimes(2);
    expect(clear).not.toHaveBeenCalled();
  });
});
