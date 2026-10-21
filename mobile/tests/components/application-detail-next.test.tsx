jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: {} }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
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

import type { ApplicationStatus } from '@joblume/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ApplicationDetailScreen } from '@/components/applications/ApplicationDetailScreen';
import * as hooks from '@/hooks/api';
import { detail, ok, type Mocked } from '../fixtures';

const mockHooks = hooks as unknown as Mocked<typeof hooks>;
const mutation = () => ({ mutate: jest.fn(), isPending: false, isSuccess: false, error: null, data: undefined });

const q = (id: string, status: ApplicationStatus) => ({ id, status });

function setup() {
  const setStatus = {
    ...mutation(),
    mutate: jest.fn((_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
  };
  mockHooks.useApplication.mockReturnValue(ok(detail({ id: 'a1', status: 'approved', hiring_manager_email: null })));
  mockHooks.useGmailStatus.mockReturnValue(ok({ configured: true, connected: true, email: 'me@gmail.com' }));
  mockHooks.useFollowUps.mockReturnValue(ok([]));
  mockHooks.useSetStatus.mockReturnValue(setStatus);
  for (const k of ['useSendApplication', 'useNextEmail', 'useUpdateApplicationText', 'useUpdateFollowUp', 'useSendFollowUp', 'useDismissFollowUp'] as const) {
    mockHooks[k].mockReturnValue(mutation());
  }
  return setStatus;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ApplicationDetailScreen apply-next flow', () => {
  it('offers the next open job after marking applied and opens it without marking anything', async () => {
    const setStatus = setup();
    await render(<ApplicationDetailScreen id="a1" queue={[q('a1', 'approved'), q('a2', 'applied'), q('a3', 'approved')]} />);
    await fireEvent.press(screen.getByRole('button', { name: '4. Mark as applied' }));
    expect(setStatus.mutate).toHaveBeenCalledTimes(1);
    expect(setStatus.mutate.mock.calls[0]![0]).toEqual({ id: 'a1', status: 'applied' });
    expect(mockRouter.back).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Applied: open next job' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/application/a3');
    expect(setStatus.mutate).toHaveBeenCalledTimes(1);
  });

  it('offers no next button when it was the last open job', async () => {
    setup();
    await render(<ApplicationDetailScreen id="a1" queue={[q('a1', 'approved')]} />);
    await fireEvent.press(screen.getByRole('button', { name: '4. Mark as applied' }));
    expect(screen.getByText('Marked as applied.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Applied: open next job' })).toBeNull();
  });

  it('leaves as before when there is no queue', async () => {
    setup();
    await render(<ApplicationDetailScreen id="a1" />);
    await fireEvent.press(screen.getByRole('button', { name: '4. Mark as applied' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});
