import { fireEvent, render, screen } from '@testing-library/react-native';
import { app, followUp, ok, profile, type Mocked } from '../fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => ({}) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
const mutation = () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false, isSuccess: false, error: null, data: undefined });
jest.mock('@/hooks/api', () => ({
  keys: { gmail: ['gmail'] },
  useApplications: jest.fn(),
  useFollowUps: jest.fn(),
  useJobFetches: jest.fn(),
  useAddJobLink: jest.fn(),
  useRefreshJobs: jest.fn(),
  useUpdateFollowUp: jest.fn(),
  useSendFollowUp: jest.fn(),
  useDismissFollowUp: jest.fn(),
  useSetStatus: jest.fn(),
  useProfile: jest.fn(),
  useUploadCv: jest.fn(),
  useUpdateProfile: jest.fn(),
  useGmailStatus: jest.fn(),
  useConnectGmail: jest.fn(),
  useDisconnectGmail: jest.fn(),
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { QueueScreen } from '@/components/queue/QueueScreen';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { TrackerScreen } from '@/components/tracker/TrackerScreen';
import * as hooks from '@/hooks/api';
import { StaticSession } from '@/lib/session';

const mockHooks = hooks as unknown as Mocked<typeof hooks>;
const failed = (data: unknown) => ({ ...ok(data), data, error: new Error('Network request failed') });
const failedEmpty = () => ({ ...ok(undefined), data: undefined, error: new Error('Network request failed') });
const job = { title: 'Data Analyst', company: 'Acme', location: 'Lagos', source: 'x', url: 'https://x', company_domain: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockHooks.useFollowUps.mockReturnValue(ok([followUp()]));
  mockHooks.useJobFetches.mockReturnValue(ok([]));
  for (const k of ['useAddJobLink', 'useRefreshJobs', 'useUpdateFollowUp', 'useSendFollowUp', 'useDismissFollowUp', 'useSetStatus', 'useUploadCv', 'useUpdateProfile', 'useConnectGmail'] as const) {
    mockHooks[k].mockReturnValue(mutation());
  }
  mockHooks.useGmailStatus.mockReturnValue(ok({ configured: true, connected: false, email: null }));
  mockHooks.useDisconnectGmail.mockReturnValue({ mutate: jest.fn(), isPending: false, error: null });
});

const session = (node: ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>
    <StaticSession value={{ status: 'signedIn', email: 'me@example.com' }}>{node}</StaticSession>
  </QueryClientProvider>
);

describe('failed background refetch keeps cached data', () => {
  it('Queue: cards stay and a retry message appears', async () => {
    const apps = failed([app({ job })]);
    mockHooks.useApplications.mockReturnValue(apps);
    await render(session(<QueueScreen />));
    expect(screen.getByText('Data Analyst')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(apps.refetch).toHaveBeenCalledTimes(1);
  });

  it('Queue: shows the error screen when there is no data', async () => {
    mockHooks.useApplications.mockReturnValue(failedEmpty());
    await render(session(<QueueScreen />));
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(screen.queryByText('Welcome back,')).toBeNull();
  });

  it('Tracker: cards stay and a retry message appears', async () => {
    const apps = failed([app({ status: 'applied', job })]);
    mockHooks.useApplications.mockReturnValue(apps);
    await render(<TrackerScreen />);
    expect(screen.getByText('Data Analyst')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(apps.refetch).toHaveBeenCalledTimes(1);
  });

  it('Tracker: shows the error screen when there is no data', async () => {
    mockHooks.useApplications.mockReturnValue(failedEmpty());
    await render(<TrackerScreen />);
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(screen.queryByText('TOTAL')).toBeNull();
  });

  it('Settings: the form stays and a retry message appears', async () => {
    const p = failed(profile());
    mockHooks.useProfile.mockReturnValue(p);
    await render(session(<SettingsScreen onSignOut={jest.fn()} />));
    expect(screen.getByLabelText('Roles you want')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(p.refetch).toHaveBeenCalledTimes(1);
  });

  it('Settings: shows the error screen when there is no data', async () => {
    mockHooks.useProfile.mockReturnValue(failedEmpty());
    await render(session(<SettingsScreen onSignOut={jest.fn()} />));
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Roles you want')).toBeNull();
  });
});
