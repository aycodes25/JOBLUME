import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBar } from '@/components/analytics/StatusBar';

const zero = { pending_review: 0, approved: 0, applied: 0, interviewing: 0, rejected: 0, offer: 0, skipped: 0 };

describe('StatusBar', () => {
  it('lists each non-zero status with its count', () => {
    render(<StatusBar byStatus={{ ...zero, applied: 3, offer: 1 }} />);
    expect(screen.getByRole('img', { name: 'Applications by status' })).toBeInTheDocument();
    expect(screen.getByText('Applied: 3')).toBeInTheDocument();
    expect(screen.getByText('Offer: 1')).toBeInTheDocument();
    expect(screen.queryByText(/Rejected/)).toBeNull();
  });

  it('renders nothing when there are no applications', () => {
    const { container } = render(<StatusBar byStatus={zero} />);
    expect(container).toBeEmptyDOMElement();
  });
});
