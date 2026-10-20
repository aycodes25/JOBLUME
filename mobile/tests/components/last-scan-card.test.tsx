import type { ScanRun, ScanStatus } from '@joblume/shared';
import { render, screen } from '@testing-library/react-native';
import { LastScanCard } from '@/components/queue/LastScanCard';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const run = (over: Partial<ScanRun> = {}): ScanRun => ({
  source: 'myjobmag', started_at: '2026-10-20T11:46:00.000Z', finished_at: '2026-10-20T11:48:00.000Z', status: 'ok', error: null,
  listed: 35, new_count: 6, inserted: 6, rejected_title: 3, rejected_location: 1, ...over,
});
const status = (over: Partial<ScanStatus> = {}): ScanStatus => ({ worker_alive: true, worker_last_seen: '2026-10-20T11:59:00.000Z', runs: [run()], ...over });

describe('LastScanCard', () => {
  it('shows nothing until the status has loaded', async () => {
    await render(<LastScanCard status={undefined} now={NOW} />);
    expect(screen.queryByText('Last scan')).toBeNull();
  });

  it('shows each source with its counts and the worker as running', async () => {
    await render(
      <LastScanCard
        now={NOW}
        status={status({ runs: [run(), run({ source: 'remoteok', listed: 99, new_count: 12, inserted: 12, rejected_title: 10, rejected_location: 0 })] })}
      />,
    );
    expect(screen.getByRole('header', { name: 'Last scan' })).toBeOnTheScreen();
    expect(screen.getByText('Worker running')).toBeOnTheScreen();
    expect(screen.getByText('MyJobMag')).toBeOnTheScreen();
    expect(screen.getByText('12 min ago · 35 listed · 6 new · 6 added · skipped 4 (3 by title, 1 by location)')).toBeOnTheScreen();
    expect(screen.getByText('RemoteOK')).toBeOnTheScreen();
    expect(screen.getByText('12 min ago · 99 listed · 12 new · 12 added · skipped 10 (10 by title, 0 by location)')).toBeOnTheScreen();
  });

  it('warns when the worker is not running', async () => {
    await render(<LastScanCard now={NOW} status={status({ worker_alive: false, worker_last_seen: null })} />);
    expect(screen.getByText('Worker not running')).toBeOnTheScreen();
    expect(screen.getByText(/New jobs are not being checked until it is started/)).toBeOnTheScreen();
  });

  it('shows a failed source with its reason', async () => {
    await render(<LastScanCard now={NOW} status={status({ runs: [run({ status: 'failed', error: 'http_403' })] })} />);
    expect(screen.getByText('12 min ago · failed: The site refused the request (403)')).toBeOnTheScreen();
  });

  it('says so when no scan has finished yet', async () => {
    await render(<LastScanCard now={NOW} status={status({ runs: [] })} />);
    expect(screen.getByText(/No scan has finished yet/)).toBeOnTheScreen();
  });
});
