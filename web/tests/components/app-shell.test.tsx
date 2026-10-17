import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/queue' }));

import { AppShell } from '@/components/layout/AppShell';

describe('AppShell', () => {
  it('shows the signed-in email and signs out', async () => {
    const onSignOut = vi.fn();
    render(<AppShell email="me@example.com" onSignOut={onSignOut}><p>content</p></AppShell>);
    expect(screen.getByText('me@example.com')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('opens and closes the mobile menu', async () => {
    const user = userEvent.setup();
    render(<AppShell email={null} onSignOut={() => {}}><p>content</p></AppShell>);
    expect(screen.getAllByRole('link', { name: 'Queue' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('link', { name: 'Queue' })).toHaveLength(2);

    await user.click(screen.getAllByRole('link', { name: 'Tracker' })[1]!);
    expect(screen.getAllByRole('link', { name: 'Queue' })).toHaveLength(1);
  });
});
