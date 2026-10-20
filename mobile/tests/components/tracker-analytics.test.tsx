const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/hooks/api', () => ({ useApplications: jest.fn(), useSetStatus: jest.fn(), useAnalytics: jest.fn() }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { AnalyticsScreen } from '@/components/analytics/AnalyticsScreen';
import { TrackerScreen } from '@/components/tracker/TrackerScreen';
import * as hooks from '@/hooks/api';
import { app, ok, type Mocked } from '../fixtures';

const mockHooks = hooks as unknown as Mocked<typeof hooks>;
const job = (title: string, company: string) => ({ title, company, location: 'Remote', source: 'remotive', url: 'https://x', company_domain: null });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TrackerScreen', () => {
  function setup() {
    const setStatus = { mutate: jest.fn(), isPending: false, error: null };
    mockHooks.useSetStatus.mockReturnValue(setStatus);
    mockHooks.useApplications.mockReturnValue(
      ok([
        app({ id: 'a1', status: 'applied', match_score: 94, job: job('Senior Frontend Engineer', 'TechFlow') }),
        app({ id: 'a2', status: 'applied', match_score: 76, job: job('Solutions Architect', 'CloudNexus') }),
        app({ id: 'a3', status: 'interviewing', job: job('Staff Engineer', 'SecureLayer') }),
        app({ id: 'a4', status: 'approved', job: job('Ready Role', 'Beta') }),
      ]),
    );
    return setStatus;
  }

  it('shows the stats and the Applied tab first', async () => {
    setup();
    await render(<TrackerScreen />);
    expect(screen.getByText('TOTAL')).toBeOnTheScreen();
    expect(screen.getByText('Senior Frontend Engineer')).toBeOnTheScreen();
    expect(screen.getByText('94%')).toBeOnTheScreen();
    expect(screen.queryByText('Staff Engineer')).toBeNull();
  });

  it('switches status tabs and searches companies', async () => {
    setup();
    await render(<TrackerScreen />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Interviewing (1)' }));
    expect(screen.getByText('Staff Engineer')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Pending Review (1)' }));
    expect(screen.getByText('Ready Role')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Applied (2)' }));
    await fireEvent.changeText(screen.getByLabelText('Search companies'), 'cloud');
    expect(screen.getByText('Solutions Architect')).toBeOnTheScreen();
    expect(screen.queryByText('Senior Frontend Engineer')).toBeNull();
  });

  it('changes status through the action sheet instead of drag and drop', async () => {
    const setStatus = setup();
    await render(<TrackerScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Change status for Senior Frontend Engineer' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Offer' }));
    expect(setStatus.mutate).toHaveBeenCalledWith({ id: 'a1', status: 'offer' });
  });

  it('opens a card', async () => {
    setup();
    await render(<TrackerScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Open Solutions Architect' }));
    expect(mockPush).toHaveBeenCalledWith('/application/a2');
  });
});

describe('AnalyticsScreen', () => {
  const byStatus = { pending_review: 2, approved: 0, applied: 3, interviewing: 1, rejected: 0, offer: 0, skipped: 0 };

  it('shows the KPI tiles and one bar per status from the API', async () => {
    mockHooks.useAnalytics.mockReturnValue(ok({ total: 6, by_status: byStatus, applied_ever: 4, responded: 1, response_rate: 0.25, avg_match_score: 81.5 }));
    await render(<AnalyticsScreen />);
    expect(screen.getByText('6')).toBeOnTheScreen();
    expect(screen.getByText('25%')).toBeOnTheScreen();
    expect(screen.getByText('81.5')).toBeOnTheScreen();
    expect(screen.getByLabelText('Applied: 3')).toBeOnTheScreen();
    expect(screen.getByLabelText('Pending Review: 2')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/Offer:/)).toBeNull();
  });

  it('shows an empty state with no applications', async () => {
    mockHooks.useAnalytics.mockReturnValue(ok({ total: 0, by_status: { ...byStatus, pending_review: 0, applied: 0, interviewing: 0 }, applied_ever: 0, responded: 0, response_rate: 0, avg_match_score: null }));
    await render(<AnalyticsScreen />);
    expect(screen.getByText('No applications yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Go to the review queue' }));
    expect(mockPush).toHaveBeenCalledWith('/queue');
  });
});
