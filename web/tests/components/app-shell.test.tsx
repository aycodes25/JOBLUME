import { render, screen, within } from '@testing-library/react';
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

  it('shows the sidebar navigation and a mobile bottom tab bar with the four sections', () => {
    render(<AppShell email={null} onSignOut={() => {}} pendingCount={3}><p>content</p></AppShell>);
    for (const nav of ['Main', 'Mobile']) {
      const links = within(screen.getByRole('navigation', { name: nav })).getAllByRole('link').map((l) => l.textContent);
      expect(links).toEqual(['Queue', 'Tracker', 'Analytics', 'Settings']);
    }
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
