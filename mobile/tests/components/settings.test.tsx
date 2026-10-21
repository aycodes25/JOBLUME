jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));
jest.mock('@/hooks/api', () => ({
  keys: { gmail: ['gmail'] },
  useProfile: jest.fn(),
  useUploadCv: jest.fn(),
  useUpdateProfile: jest.fn(),
  useGmailStatus: jest.fn(),
  useConnectGmail: jest.fn(),
  useDisconnectGmail: jest.fn(),
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { SettingsForm } from '@/components/profile/SettingsForm';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import * as hooks from '@/hooks/api';
import { StaticSession } from '@/lib/session';
import { ok, profile, type Mocked } from '../fixtures';

const mockHooks = hooks as unknown as Mocked<typeof hooks>;
const openAuth = WebBrowser.openAuthSessionAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe('SettingsForm', () => {
  const initial = { applyMode: 'manual' as const, autoThreshold: '80', dailyCap: '10', autoFollowup: false, notifyNewMatches: false };

  it('saves the apply mode, threshold, cap and follow-up choice', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<SettingsForm initial={initial} onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Auto' }));
    await fireEvent.changeText(screen.getByLabelText('Auto-apply threshold'), '90');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Auto follow-up' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save settings' }));
    expect(onSubmit).toHaveBeenCalledWith({ apply_mode: 'auto', auto_threshold: 90, daily_cap: 10, auto_followup: true, notify_new_matches: false });
    expect(await screen.findByText('Saved.')).toBeOnTheScreen();
  });

  it('has the new-match email switch off by default and saves it when ticked', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<SettingsForm initial={initial} onSubmit={onSubmit} />);
    expect(screen.getByRole('checkbox', { name: 'Email me about new matches' })).not.toBeChecked();
    expect(screen.getByText(/at most one email an hour/i)).toBeOnTheScreen();
    expect(screen.getByText(/never includes your CV/i)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Email me about new matches' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save settings' }));
    expect(onSubmit).toHaveBeenCalledWith({ apply_mode: 'manual', auto_threshold: 80, daily_cap: 10, auto_followup: false, notify_new_matches: true });
  });

  it('keeps the daily cap between 1 and 20', async () => {
    const onSubmit = jest.fn();
    await render(<SettingsForm initial={initial} onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByLabelText('Daily application cap'), '21');
    await fireEvent.press(screen.getByRole('button', { name: 'Save settings' }));
    expect(screen.getByText('Enter a whole number between 1 and 20.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('SettingsScreen', () => {
  function setup(onSignOut = jest.fn().mockResolvedValue(undefined)) {
    const start = jest.fn().mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=s' });
    mockHooks.useProfile.mockReturnValue(ok(profile()));
    mockHooks.useUploadCv.mockReturnValue({ mutateAsync: jest.fn() });
    mockHooks.useUpdateProfile.mockReturnValue({ mutateAsync: jest.fn() });
    mockHooks.useGmailStatus.mockReturnValue(ok({ configured: true, connected: false, email: null }));
    mockHooks.useConnectGmail.mockReturnValue({ mutateAsync: start });
    mockHooks.useDisconnectGmail.mockReturnValue({ mutate: jest.fn(), isPending: false, error: null });
    const qc = new QueryClient();
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const view = render(
      <QueryClientProvider client={qc}>
        <StaticSession value={{ status: 'signedIn', email: 'me@example.com' }}>
          <SettingsScreen onSignOut={onSignOut} />
        </StaticSession>
      </QueryClientProvider>,
    );
    return { view, start, invalidate, onSignOut };
  }

  it('shows the CV, preferences and account', async () => {
    await setup().view;
    expect(screen.getByText('Current CV: My CV.pdf')).toBeOnTheScreen();
    expect(screen.getByLabelText('Roles you want')).toHaveDisplayValue('Data Analyst');
    expect(screen.getByText('Contact details for application forms')).toBeOnTheScreen();
    expect(screen.getByLabelText('Full name')).toHaveDisplayValue('Ada Lovelace');
    expect(screen.getByText('Signed in as me@example.com')).toBeOnTheScreen();
  });

  it('connects Gmail in the in-app browser with the app return link and refreshes the status', async () => {
    openAuth.mockResolvedValue({ type: 'success', url: 'joblume://gmail-return?status=connected' });
    const { view, start, invalidate } = setup();
    await view;
    await fireEvent.press(screen.getByRole('button', { name: 'Connect Gmail' }));
    expect(start).toHaveBeenCalledTimes(1);
    expect(openAuth).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?state=s', 'joblume://gmail-return');
    expect(await screen.findByText('Gmail connected.')).toBeOnTheScreen();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['gmail'] });
  });

  it('shows the result handed over by the gmail-return route', async () => {
    mockParams = { gmail: 'error', reason: 'denied' };
    await setup().view;
    expect(screen.getByText(/You chose not to allow access/)).toBeOnTheScreen();
  });

  it('ignores unknown gmail-return values', async () => {
    mockParams = { gmail: 'weird', reason: 'denied' };
    await setup().view;
    expect(screen.queryByText(/You chose not to allow access/)).not.toBeOnTheScreen();
    expect(screen.queryByText('Gmail connected.')).not.toBeOnTheScreen();
  });

  it('signs out', async () => {
    const { view, onSignOut } = setup();
    await view;
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
