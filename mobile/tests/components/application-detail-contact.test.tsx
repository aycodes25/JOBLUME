jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: {} }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) }) }));
jest.mock('@/lib/external', () => ({ openExternalUrl: jest.fn().mockResolvedValue(true) }));
jest.mock('@/hooks/api', () => ({
  useApplication: jest.fn(),
  useUpdateApplicationText: jest.fn(),
  useSetStatus: jest.fn(),
  useGmailStatus: jest.fn(),
  useSendApplication: jest.fn(),
  useNextEmail: jest.fn(),
  useFollowUps: jest.fn(),
  useUpdateFollowUp: jest.fn(),
  useSendFollowUp: jest.fn(),
  useDismissFollowUp: jest.fn(),
}));

import type { ApplicationDetail } from '@joblume/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ApplicationDetailScreen } from '@/components/applications/ApplicationDetailScreen';
import * as hooks from '@/hooks/api';
import { openExternalUrl } from '@/lib/external';
import { detail, ok, type Mocked } from '../fixtures';

const mockHooks = hooks as unknown as Mocked<typeof hooks>;
const mutation = () => ({ mutate: jest.fn(), isPending: false, isSuccess: false, error: null, data: undefined });

function setup(data: ApplicationDetail) {
  mockHooks.useApplication.mockReturnValue(ok(data));
  mockHooks.useGmailStatus.mockReturnValue(ok({ configured: true, connected: true, email: 'me@gmail.com' }));
  mockHooks.useFollowUps.mockReturnValue(ok([]));
  for (const k of ['useSetStatus', 'useSendApplication', 'useNextEmail', 'useUpdateApplicationText', 'useUpdateFollowUp', 'useSendFollowUp', 'useDismissFollowUp'] as const) {
    mockHooks[k].mockReturnValue(mutation());
  }
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ApplicationDetailScreen contact methods', () => {
  it('shows the Email badge and no WhatsApp button or site hint', async () => {
    setup(detail());
    await render(<ApplicationDetailScreen id="a1" />);
    expect(screen.getByText('Email')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Message on WhatsApp' })).toBeNull();
    expect(screen.queryByText(/No contact email was published/)).toBeNull();
  });

  it('shows the site hint for an application with no contact', async () => {
    setup(detail({ hiring_manager_email: null }));
    await render(<ApplicationDetailScreen id="a1" />);
    expect(screen.getByText('Employer site')).toBeOnTheScreen();
    expect(screen.getByText("No contact email was published. Use Apply on the employer's site below.")).toBeOnTheScreen();
  });

  it('opens WhatsApp through the safe link helper only on tap', async () => {
    setup(detail({ hiring_manager_email: null, whatsapp_number: '2348031234567', cover_letter_text: 'Dear team,\nhello & welcome.' }));
    await render(<ApplicationDetailScreen id="a1" />);
    expect(screen.getByText('WhatsApp')).toBeOnTheScreen();
    expect(screen.getByText('Opens WhatsApp with a message ready. You press send there.')).toBeOnTheScreen();
    expect(openExternalUrl).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Message on WhatsApp' }));
    expect(openExternalUrl).toHaveBeenCalledWith(`https://wa.me/2348031234567?text=${encodeURIComponent('Dear team, hello & welcome.')}`);
  });

  it('hides the WhatsApp button for a malformed number', async () => {
    setup(detail({ hiring_manager_email: null, whatsapp_number: '+23480abc' }));
    await render(<ApplicationDetailScreen id="a1" />);
    expect(screen.queryByRole('button', { name: 'Message on WhatsApp' })).toBeNull();
  });
});
