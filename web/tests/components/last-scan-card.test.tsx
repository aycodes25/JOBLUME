import type { ScanRun, ScanStatus } from '@joblume/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LastScanCard } from '@/components/jobs/LastScanCard';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const run = (over: Partial<ScanRun> = {}): ScanRun => ({
  source: 'myjobmag', started_at: '2026-10-20T11:46:00.000Z', finished_at: '2026-10-20T11:48:00.000Z', status: 'ok', error: null,
  listed: 35, new_count: 6, inserted: 6, rejected_title: 3, rejected_location: 1, ...over,
});
const status = (over: Partial<ScanStatus> = {}): ScanStatus => ({ worker_alive: true, worker_last_seen: '2026-10-20T11:59:00.000Z', runs: [run()], ...over });

describe('LastScanCard', () => {
  it('shows nothing until the status has loaded', () => {
    const { container } = render(<LastScanCard status={undefined} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows each source with its counts and the worker as running', () => {
    render(
      <LastScanCard
        now={NOW}
        status={status({ runs: [run(), run({ source: 'remoteok', listed: 99, new_count: 12, inserted: 12, rejected_title: 10, rejected_location: 0 })] })}
      />,
    );
    const card = screen.getByRole('region', { name: 'Last scan' });
    expect(within(card).getByText('Worker running')).toBeInTheDocument();
    expect(within(card).getByText('MyJobMag')).toBeInTheDocument();
    expect(within(card).getByText('12 min ago · 35 listed · 6 new · 6 added · skipped 4 (3 by title, 1 by location)')).toBeInTheDocument();
    expect(within(card).getByText('RemoteOK')).toBeInTheDocument();
    expect(within(card).getByText('12 min ago · 99 listed · 12 new · 12 added · skipped 10 (10 by title, 0 by location)')).toBeInTheDocument();
  });

  it('warns when the worker is not running', () => {
    render(<LastScanCard now={NOW} status={status({ worker_alive: false, worker_last_seen: null })} />);
    const card = screen.getByRole('region', { name: 'Last scan' });
    expect(within(card).getByText('Worker not running')).toBeInTheDocument();
    expect(within(card).getByText(/New jobs are not being checked until it is started/)).toBeInTheDocument();
  });

  it('shows a failed source with its reason', () => {
    render(<LastScanCard now={NOW} status={status({ runs: [run({ status: 'failed', error: 'http_403' })] })} />);
    expect(screen.getByText(/failed: The site refused the request \(403\)/)).toBeInTheDocument();
  });

  it('says so when no scan has finished yet', () => {
    render(<LastScanCard now={NOW} status={status({ runs: [] })} />);
    expect(screen.getByText(/No scan has finished yet/)).toBeInTheDocument();
  });
});
