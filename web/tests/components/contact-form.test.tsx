import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContactForm } from '@/components/profile/ContactForm';
import type { ContactValues } from '@/lib/profile-form';

const initial: ContactValues = { fullName: 'Ada Lovelace', phone: '', city: '', linkedinUrl: '', githubUrl: '', portfolioUrl: '' };

function setup() {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<ContactForm initial={initial} onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
}

describe('ContactForm', () => {
  it('shows the stored values and explains the https rule', () => {
    setup();
    expect(screen.getByLabelText('Full name')).toHaveValue('Ada Lovelace');
    expect(screen.getByLabelText('Phone')).toHaveValue('');
    expect(screen.getByText(/must start with https/i)).toBeInTheDocument();
  });

  it('submits the changed details', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('Phone'), '+234 801 234 5678');
    await user.type(screen.getByLabelText('City'), 'Lagos');
    await user.type(screen.getByLabelText('LinkedIn link'), 'https://www.linkedin.com/in/ada');
    await user.click(screen.getByRole('button', { name: 'Save contact details' }));
    expect(onSubmit).toHaveBeenCalledWith({
      full_name: 'Ada Lovelace', phone: '+234 801 234 5678', city: 'Lagos', linkedin_url: 'https://www.linkedin.com/in/ada', github_url: null, portfolio_url: null,
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('shows a message under a bad link and does not submit', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('GitHub link'), 'http://github.com/ada');
    await user.click(screen.getByRole('button', { name: 'Save contact details' }));
    expect(await screen.findByText('Enter a full link that starts with https://')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a server error', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    render(<ContactForm initial={initial} onSubmit={onSubmit} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save contact details' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
