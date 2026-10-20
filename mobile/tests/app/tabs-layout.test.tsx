import { render, screen } from '@testing-library/react-native';
import { ok, profile, type Mocked } from '../fixtures';

let mockMounts = 0;
jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Tabs = () => {
    React.useEffect(() => {
      mockMounts += 1;
    }, []);
    return <Text>Tabs navigator</Text>;
  };
  Tabs.Screen = () => null;
  return { Tabs, Redirect: () => <Text>Redirected</Text> };
});
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@/hooks/api', () => ({ useProfile: jest.fn(), useApplications: jest.fn() }));

import TabsLayout from '@/app/(tabs)/_layout';
import * as hooks from '@/hooks/api';

const mockHooks = hooks as unknown as Mocked<typeof hooks>;

beforeEach(() => {
  mockMounts = 0;
  mockHooks.useApplications.mockReturnValue(ok([]));
});

describe('TabsLayout', () => {
  it('keeps the tabs mounted when a background refetch of the profile fails', async () => {
    mockHooks.useProfile.mockReturnValue(ok(profile()));
    const view = await render(<TabsLayout />);
    mockHooks.useProfile.mockReturnValue({ ...ok(profile()), error: new Error('Network request failed') });
    await view.rerender(<TabsLayout />);
    expect(screen.getByText('Tabs navigator')).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockMounts).toBe(1);
  });

  it('shows the error screen when the profile never loaded', async () => {
    mockHooks.useProfile.mockReturnValue({ ...ok(undefined), data: undefined, error: new Error('Network request failed') });
    await render(<TabsLayout />);
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(screen.queryByText('Tabs navigator')).toBeNull();
  });
});
