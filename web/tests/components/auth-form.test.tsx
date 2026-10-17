import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthForm } from '@/components/auth/AuthForm';

function setup(over: Partial<React.ComponentProps<typeof AuthForm>> = {}) {
  const onSignIn = vi.fn().mockResolvedValue(undefined);
  const onSignUp = vi.fn().mockResolvedValue({ needsConfirmation: true });
  render(<AuthForm onSignIn={onSignIn} onSignUp={onSignUp} {...over} />);
  return { onSignIn, onSignUp, user: userEvent.setup() };
}

describe('AuthForm', () => {
  it('shows validation errors and calls nothing for a bad email and short password', async () => {
    const { onSignIn, user } = setup();
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it('signs in with the trimmed email and the password', async () => {
    const { onSignIn, user } = setup();
    await user.type(screen.getByLabelText('Email'), '  me@example.com ');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSignIn).toHaveBeenCalledWith('me@example.com', 'correct-horse');
  });

  it('shows the error message when sign in fails', async () => {
    const { user } = setup({ onSignIn: vi.fn().mockRejectedValue(new Error('Invalid login credentials')) });
    await user.type(screen.getByLabelText('Email'), 'me@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
  });

  it('switches to Create account and asks the user to confirm their email', async () => {
    const { onSignUp, user } = setup();
    await user.click(screen.getByRole('tab', { name: 'Create account' }));
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(onSignUp).toHaveBeenCalledWith('new@example.com', 'correct-horse');
    expect(await screen.findByRole('status')).toHaveTextContent(/check your email/i);
  });

  it('shows no confirmation message when sign up already signed the user in', async () => {
    const { user } = setup({ onSignUp: vi.fn().mockResolvedValue({ needsConfirmation: false }) });
    await user.click(screen.getByRole('tab', { name: 'Create account' }));
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
