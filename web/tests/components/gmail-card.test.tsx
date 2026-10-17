import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GmailCard, type GmailCardProps } from '@/components/settings/GmailCard';

const base: GmailCardProps = {
  status: { configured: true, connected: false, email: null },
  connecting: false,
  disconnecting: false,
  onConnect: () => {},
  onDisconnect: () => {},
};
const setup = (over: Partial<GmailCardProps> = {}) => {
  const onConnect = vi.fn();
  const onDisconnect = vi.fn();
  render(<GmailCard {...base} onConnect={onConnect} onDisconnect={onDisconnect} {...over} />);
  return { onConnect, onDisconnect, user: userEvent.setup() };
};

describe('GmailCard', () => {
  it('offers Connect Gmail when configured and not connected', async () => {
    const { onConnect, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Connect Gmail' }));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('shows the connected address and a Disconnect button', async () => {
    const { onDisconnect, user } = setup({ status: { configured: true, connected: true, email: 'me@gmail.com' } });
    expect(screen.getByText('me@gmail.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect Gmail' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('explains that Gmail is not set up and offers no Connect button', () => {
    setup({ status: { configured: false, connected: false, email: null } });
    expect(screen.getByText(/not set up on this server/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect Gmail' })).toBeNull();
  });

  it('shows a loading line while the status is unknown', () => {
    setup({ status: undefined });
    expect(screen.getByText(/checking gmail/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('disables the buttons while working', () => {
    setup({ connecting: true });
    expect(screen.getByRole('button', { name: /opening google/i })).toBeDisabled();
  });

  it('shows the success banner and the failure reason, and an error message', () => {
    const { unmount } = render(<GmailCard {...base} returned={{ kind: 'connected' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Gmail connected.');
    unmount();
    render(<GmailCard {...base} returned={{ kind: 'error', reason: 'missing_scope' }} error="Something went wrong." />);
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts.some((t) => /permission to send/i.test(t ?? ''))).toBe(true);
    expect(alerts).toContain('Something went wrong.');
  });
});
