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

import type { ApplicationDetail } from '@joblume/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ApplicationDetailScreen } from '@/components/applications/ApplicationDetailScreen';
import { StatusActions } from '@/components/applications/StatusActions';
import * as hooks from '@/hooks/api';
import { detail, followUp, ok, type Mocked } from '../fixtures';

const mockHooks = hooks as unknown as Mocked<typeof hooks>;
const mutation = () => ({ mutate: jest.fn(), isPending: false, isSuccess: false, error: null, data: undefined });

function setup(data: ApplicationDetail, drafts = [followUp({ application_id: 'other' })]) {
  const m = {
    setStatus: mutation(),
    send: mutation(),
    next: mutation(),
    text: mutation(),
  };
  mockHooks.useApplication.mockReturnValue(ok(data));
  mockHooks.useGmailStatus.mockReturnValue(ok({ configured: true, connected: true, email: 'me@gmail.com' }));
  mockHooks.useFollowUps.mockReturnValue(ok(drafts));
  mockHooks.useSetStatus.mockReturnValue(m.setStatus);
  mockHooks.useSendApplication.mockReturnValue(m.send);
  mockHooks.useNextEmail.mockReturnValue(m.next);
  mockHooks.useUpdateApplicationText.mockReturnValue(m.text);
  for (const k of ['useUpdateFollowUp', 'useSendFollowUp', 'useDismissFollowUp'] as const) mockHooks[k].mockReturnValue(mutation());
  return m;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('StatusActions', () => {
  const props = { dirty: false, pending: false, onMove: jest.fn(), onSkip: jest.fn() };

  it('pending: Approve & Apply approves, Skip skips, and approving waits for saved edits', async () => {
    const onMove = jest.fn();
    const onSkip = jest.fn();
    const view = await render(<StatusActions {...props} status="pending_review" onMove={onMove} onSkip={onSkip} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Approve & Apply' }));
    expect(onMove).toHaveBeenCalledWith('approved');
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    await view.rerender(<StatusActions {...props} status="pending_review" dirty onMove={onMove} onSkip={onSkip} />);
    expect(screen.getByRole('button', { name: 'Approve & Apply' })).toBeDisabled();
    expect(screen.getByText('Save your changes before approving.')).toBeOnTheScreen();
  });

  it('approved: Back to pending; skipped: Restore', async () => {
    const onMove = jest.fn();
    const view = await render(<StatusActions {...props} status="approved" onMove={onMove} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back to pending' }));
    expect(onMove).toHaveBeenLastCalledWith('pending_review');
    await view.rerender(<StatusActions {...props} status="skipped" onMove={onMove} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Restore' }));
    expect(onMove).toHaveBeenLastCalledWith('pending_review');
  });

  it('applied: moves through the action sheet', async () => {
    const onMove = jest.fn();
    await render(<StatusActions {...props} status="applied" onMove={onMove} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Move to… (now Applied)' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Interviewing' }));
    expect(onMove).toHaveBeenCalledWith('interviewing');
  });
});

describe('ApplicationDetailScreen', () => {
  it('shows the match, keywords and texts of a pending application, with no send section', async () => {
    setup(detail({ match_score: 92, missing_keywords: ['Tableau'] }));
    await render(<ApplicationDetailScreen id="a1" />);
    expect(screen.getByLabelText('Match score 92 out of 100')).toBeOnTheScreen();
    expect(screen.getByText('Tableau')).toBeOnTheScreen();
    expect(screen.getByLabelText('Cover letter')).toHaveDisplayValue('Dear team, I would like to apply for the Data Analyst role at Acme.');
    expect(screen.queryByRole('button', { name: 'Send application' })).toBeNull();
  });

  it('approves only on tap', async () => {
    const m = setup(detail());
    await render(<ApplicationDetailScreen id="a1" />);
    expect(m.setStatus.mutate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Approve & Apply' }));
    expect(m.setStatus.mutate).toHaveBeenCalledWith({ id: 'a1', status: 'approved' });
  });

  it('an approved application shows the email and assisted panels and sends only on tap', async () => {
    const m = setup(detail({ status: 'approved' }));
    await render(<ApplicationDetailScreen id="a1" />);
    expect(m.send.mutate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Send application' }));
    expect(m.send.mutate).toHaveBeenCalledWith({ id: 'a1', body: { to: 'hr@acme.com' } }, expect.any(Object));
    expect(screen.getByRole('button', { name: '4. Mark as applied' })).toBeOnTheScreen();
  });

  it('locks sending and approving while the letter has unsaved edits, and saves the patch', async () => {
    const m = setup(detail({ status: 'approved' }));
    await render(<ApplicationDetailScreen id="a1" />);
    await fireEvent.changeText(screen.getByLabelText('Cover letter'), 'A new letter for Acme.');
    expect(screen.getByRole('button', { name: 'Send application' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(m.text.mutate).toHaveBeenCalledWith({ id: 'a1', patch: { cover_letter_text: 'A new letter for Acme.' } });
  });

  it('shows the follow-up draft for this application', async () => {
    setup(detail({ status: 'applied' }), [followUp({ application_id: 'a1', subject: 'Checking in on my application' })]);
    await render(<ApplicationDetailScreen id="a1" />);
    expect(screen.getByLabelText('Subject')).toHaveDisplayValue('Checking in on my application');
  });

  it('shows a retry state when the application cannot load', async () => {
    setup(detail());
    const refetch = jest.fn();
    mockHooks.useApplication.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x'), refetch });
    await render(<ApplicationDetailScreen id="a1" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
