import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockReplace = jest.fn();
let mockSegments: string[] = [];
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSegments: () => mockSegments,
}));

import { AuthGate } from '@/components/auth/AuthGate';
import { StaticSession, type SessionStatus } from '@/lib/session';

async function setup(status: SessionStatus, segments: string[]) {
  mockSegments = segments;
  await render(
    <StaticSession value={{ status, email: status === 'signedIn' ? 'me@example.com' : null }}>
      <AuthGate>
        <Text>App content</Text>
      </AuthGate>
    </StaticSession>,
  );
}

beforeEach(() => {
  mockReplace.mockClear();
});

describe('AuthGate', () => {
  it('sends a signed-out user to /login and covers the screen meanwhile', async () => {
    await setup('signedOut', ['(tabs)', 'queue']);
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
  });

  it('sends a signed-out user on the app root to /login', async () => {
    await setup('signedOut', []);
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('leaves a signed-out user on /login alone', async () => {
    await setup('signedOut', ['login']);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Loading')).toBeNull();
    expect(screen.getByText('App content')).toBeOnTheScreen();
  });

  it('moves a signed-in user off /login to the queue', async () => {
    await setup('signedIn', ['login']);
    expect(mockReplace).toHaveBeenCalledWith('/queue');
  });

  it('shows the app to a signed-in user without redirecting', async () => {
    await setup('signedIn', ['(tabs)', 'tracker']);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Loading')).toBeNull();
  });

  it('waits while the session is loading', async () => {
    await setup('loading', ['(tabs)', 'queue']);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
  });
});
