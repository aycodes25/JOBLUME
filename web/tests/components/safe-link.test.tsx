import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafeLink } from '@/components/common/SafeLink';

describe('SafeLink', () => {
  it('renders an external anchor for an https URL', () => {
    render(<SafeLink href="https://example.com/job/1">View posting</SafeLink>);
    const link = screen.getByRole('link', { name: 'View posting' });
    expect(link).toHaveAttribute('href', 'https://example.com/job/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', '/relative', '', null, undefined])('renders only the fallback for %s', (href) => {
    render(<SafeLink href={href as string} fallback={<span>no link</span>}>View posting</SafeLink>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('no link')).toBeInTheDocument();
  });
});
