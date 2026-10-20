import type { Session } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SessionProvider, useSession, type SessionSource } from '@/lib/session';

const session = (id: string, email: string) => ({ user: { id, email } }) as unknown as Session;

function fakeSource(initial: Session | null) {
  let listener: ((event: string, s: Session | null) => void) | null = null;
  const unsubscribe = jest.fn();
  const source: SessionSource = {
    getSession: jest.fn(async () => ({ data: { session: initial } })),
    onAuthStateChange: jest.fn((cb) => {
      listener = cb;
      return { data: { subscription: { unsubscribe } } };
    }),
  };
  return { source, unsubscribe, emit: (s: Session | null) => listener?.('EVENT', s) };
}

function Probe() {
  const { status, email } = useSession();
  return <Text>{`${status}:${email ?? '-'}`}</Text>;
}

async function setup(initial: Session | null) {
  const qc = new QueryClient();
  const clear = jest.spyOn(qc, 'clear');
  const fake = fakeSource(initial);
  const view = await render(
    <QueryClientProvider client={qc}>
      <SessionProvider source={fake.source}>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  );
  return { ...fake, clear, view };
}

describe('SessionProvider', () => {
  it('reports signed in with the email from the stored session', async () => {
    await setup(session('u1', 'me@example.com'));
    expect(await screen.findByText('signedIn:me@example.com')).toBeOnTheScreen();
  });

  it('reports signed out when there is no session', async () => {
    await setup(null);
    expect(await screen.findByText('signedOut:-')).toBeOnTheScreen();
  });

  it('follows sign-out and clears cached API data', async () => {
    const { emit, clear } = await setup(session('u1', 'me@example.com'));
    await screen.findByText('signedIn:me@example.com');
    await act(async () => emit(null));
    expect(screen.getByText('signedOut:-')).toBeOnTheScreen();
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('clears cached data when a different user signs in, but not on a token refresh for the same user', async () => {
    const { emit, clear } = await setup(session('u1', 'me@example.com'));
    await screen.findByText('signedIn:me@example.com');
    await act(async () => emit(session('u1', 'me@example.com')));
    expect(clear).not.toHaveBeenCalled();
    await act(async () => emit(session('u2', 'other@example.com')));
    expect(screen.getByText('signedIn:other@example.com')).toBeOnTheScreen();
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes when unmounted', async () => {
    const { view, unsubscribe } = await setup(null);
    await view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
