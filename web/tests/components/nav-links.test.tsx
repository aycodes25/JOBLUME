import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state } = vi.hoisted(() => ({ state: { pathname: '/queue' } }));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));

import { NavLinks } from '@/components/layout/NavLinks';

beforeEach(() => { state.pathname = '/queue'; });

describe('NavLinks', () => {
  it('lists the four sections', () => {
    render(<NavLinks />);
    for (const name of ['Queue', 'Tracker', 'Analytics', 'Settings']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('marks only the current section', () => {
    state.pathname = '/tracker';
    render(<NavLinks />);
    expect(screen.getByRole('link', { name: 'Tracker' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Queue' })).not.toHaveAttribute('aria-current');
  });

  it('treats nested paths as inside the section', () => {
    state.pathname = '/settings/profile';
    render(<NavLinks />);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  });
});
