import { fireEvent, render, screen } from '@testing-library/react-native';
import { AuthForm } from '@/components/auth/AuthForm';

async function setup(over: Partial<{ onSignIn: jest.Mock; onSignUp: jest.Mock }> = {}) {
  const onSignIn = over.onSignIn ?? jest.fn().mockResolvedValue(undefined);
  const onSignUp = over.onSignUp ?? jest.fn().mockResolvedValue({ needsConfirmation: false });
  await render(<AuthForm onSignIn={onSignIn} onSignUp={onSignUp} />);
  return { onSignIn, onSignUp };
}

async function fill(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
}

describe('AuthForm', () => {
  it('signs in with the trimmed email and the password', async () => {
    const { onSignIn } = await setup();
    await fill('  me@example.com ', 'password123');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSignIn).toHaveBeenCalledWith('me@example.com', 'password123');
  });

  it('shows field errors and calls nothing for bad input', async () => {
    const { onSignIn } = await setup();
    await fill('nope', 'short');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address')).toBeOnTheScreen();
    expect(screen.getByText('Use at least 8 characters')).toBeOnTheScreen();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it('shows the Supabase error message when sign-in fails', async () => {
    await setup({ onSignIn: jest.fn().mockRejectedValue(new Error('Invalid login credentials')) });
    await fill('me@example.com', 'password123');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
  });

  it('creates an account and asks to confirm the email when Supabase requires it', async () => {
    const { onSignUp } = await setup({ onSignUp: jest.fn().mockResolvedValue({ needsConfirmation: true }) });
    await fireEvent.press(screen.getByRole('tab', { name: 'Create account' }));
    await fill('me@example.com', 'password123');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(onSignUp).toHaveBeenCalledWith('me@example.com', 'password123');
    expect(await screen.findByText('Check your email to confirm your account, then sign in.')).toBeOnTheScreen();
  });
});
