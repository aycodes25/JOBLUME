import { fireEvent, render, screen } from '@testing-library/react-native';
import { app, followUp, ok, type Mocked } from '../fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mutation = () => ({ mutate: jest.fn(), isPending: false, isSuccess: false, error: null, data: undefined });
jest.mock('@/hooks/api', () => ({
  useApplications: jest.fn(),
  useFollowUps: jest.fn(),
  useJobFetches: jest.fn(),
  useAddJobLink: jest.fn(),
  useRefreshJobs: jest.fn(),
  useUpdateFollowUp: jest.fn(),
  useSendFollowUp: jest.fn(),
  useDismissFollowUp: jest.fn(),
}));

import { QueueScreen } from '@/components/queue/QueueScreen';
import * as hooks from '@/hooks/api';
import { StaticSession } from '@/lib/session';

const mockHooks = hooks as unknown as Mocked<typeof hooks>;

const recent = new Date(Date.now() - 2 * 3_600_000).toISOString();
const old = new Date(Date.now() - 20 * 86_400_000).toISOString();
const job = (title: string, company: string) => ({ title, company, location: 'Lagos', source: 'remotive', url: 'https://example.com/j', company_domain: null });

function setup() {
  mockHooks.useApplications.mockReturnValue(
    ok([
      app({ id: 'hi', match_score: 96, created_at: old, job: job('Senior Product Designer', 'TechFlow') }),
      app({ id: 'mid', match_score: 79, created_at: recent, job: job('Data Analyst', 'Acme') }),
      app({ id: 'ready', status: 'approved', match_score: 70, job: job('BI Analyst', 'Beta') }),
    ]),
  );
  mockHooks.useFollowUps.mockReturnValue(ok([followUp()]));
  mockHooks.useJobFetches.mockReturnValue(ok([]));
  for (const k of ['useAddJobLink', 'useRefreshJobs', 'useUpdateFollowUp', 'useSendFollowUp', 'useDismissFollowUp'] as const) {
    mockHooks[k].mockReturnValue(mutation());
  }
  return render(
    <StaticSession value={{ status: 'signedIn', email: 'me@example.com' }}>
      <QueueScreen />
    </StaticSession>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('QueueScreen filters', () => {
  it('shows the pending applications, best match first, with the counts', async () => {
    await setup();
    expect(screen.getByText('me@example.com')).toBeOnTheScreen();
    expect(screen.getByText('2 jobs')).toBeOnTheScreen();
    expect(screen.getByText('1 ≥ 90%')).toBeOnTheScreen();
    expect(screen.getByText('Senior Product Designer')).toBeOnTheScreen();
    expect(screen.getByText('Data Analyst')).toBeOnTheScreen();
    expect(screen.queryByText('BI Analyst')).toBeNull();
  });

  it('90%+ keeps only the high matches', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: '90%+' }));
    expect(screen.getByText('Senior Product Designer')).toBeOnTheScreen();
    expect(screen.queryByText('Data Analyst')).toBeNull();
  });

  it('Recent keeps only applications from the last 7 days', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Recent' }));
    expect(screen.getByText('Data Analyst')).toBeOnTheScreen();
    expect(screen.queryByText('Senior Product Designer')).toBeNull();
  });

  it('the search box narrows the list, and an empty result says so', async () => {
    await setup();
    await fireEvent.changeText(screen.getByLabelText('Search your queue'), 'acme');
    expect(screen.getByText('Data Analyst')).toBeOnTheScreen();
    expect(screen.queryByText('Senior Product Designer')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search your queue'), 'nothing like this');
    expect(screen.getByText('No matches for this filter')).toBeOnTheScreen();
  });

  it('switches to the Ready segment and opens an application', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('tab', { name: 'Ready (1)' }));
    expect(screen.getByText('BI Analyst')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Details for BI Analyst' }));
    expect(mockPush).toHaveBeenCalledWith('/application/ready');
  });

  it('shows the follow-up drafts as a segment', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('tab', { name: 'Follow-ups (1)' }));
    expect(screen.getByText('Data Analyst at Acme')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Send follow-up' })).toBeOnTheScreen();
  });

  it('shows a retry state when the list cannot load', async () => {
    mockHooks.useApplications.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x'), refetch: jest.fn() });
    mockHooks.useFollowUps.mockReturnValue(ok([]));
    mockHooks.useJobFetches.mockReturnValue(ok([]));
    for (const k of ['useAddJobLink', 'useRefreshJobs'] as const) mockHooks[k].mockReturnValue(mutation());
    await render(<QueueScreen />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });
});
