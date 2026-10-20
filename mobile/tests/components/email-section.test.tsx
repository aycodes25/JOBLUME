import type { ApplicationDetail } from '@joblume/shared';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { EmailSection, type EmailSectionProps } from '@/components/applications/EmailSection';
import { detail } from '../fixtures';

const connected = { configured: true, connected: true, email: 'me@gmail.com' };
const guess = (over: Partial<ApplicationDetail> = {}) =>
  detail({ status: 'approved', hiring_manager_email: 'careers@acme.com', email_source: 'guess', email_confidence: 30, ...over });

async function setup(over: Partial<EmailSectionProps> = {}) {
  const onSend = jest.fn();
  const onNextEmail = jest.fn();
  const onOpenSettings = jest.fn();
  const view = await render(
    <EmailSection
      app={detail({ status: 'approved' })}
      gmail={connected}
      pending={false}
      onSend={onSend}
      onNextEmail={onNextEmail}
      onOpenSettings={onOpenSettings}
      {...over}
    />,
  );
  return { onSend, onNextEmail, onOpenSettings, view };
}

const sendButton = () => screen.getByRole('button', { name: 'Send application' });

describe('EmailSection send flow', () => {
  it('never sends by itself: rendering, editing and ticking call nothing', async () => {
    const { onSend } = await setup({ app: guess() });
    await fireEvent.changeText(screen.getByLabelText('Recipient'), 'careers@acme.com');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Send to this guessed address' }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows the recipient, its confidence, the subject and a body preview', async () => {
    await setup();
    expect(screen.getByLabelText('Recipient')).toHaveDisplayValue('hr@acme.com');
    expect(screen.getByText('Found, high confidence')).toBeOnTheScreen();
    expect(screen.getByText('Subject: Application for Data Analyst')).toBeOnTheScreen();
    expect(screen.getByText(/I would like to apply for the Data Analyst role/)).toBeOnTheScreen();
    expect(screen.getByText('Your tailored CV (PDF) is attached.')).toBeOnTheScreen();
  });

  it('sends the recipient shown, with no other options, only when Send is tapped', async () => {
    const { onSend } = await setup();
    await fireEvent.press(sendButton());
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith({ to: 'hr@acme.com' });
  });

  it('requires confirming a guessed address before Send works', async () => {
    const { onSend } = await setup({ app: guess() });
    expect(screen.getByText('Guess, low confidence')).toBeOnTheScreen();
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText('Tick the box to send to this guessed address.')).toBeOnTheScreen();
    await fireEvent.press(sendButton());
    expect(onSend).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Send to this guessed address' }));
    expect(sendButton()).toBeEnabled();
    await fireEvent.press(sendButton());
    expect(onSend).toHaveBeenCalledWith({ to: 'careers@acme.com', confirmGuess: true });
  });

  it('treats a typed address as entered by the user, with no guess box', async () => {
    const { onSend } = await setup({ app: guess() });
    await fireEvent.changeText(screen.getByLabelText('Recipient'), 'jane@acme.com');
    expect(screen.getByText('Entered by you')).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: 'Send to this guessed address' })).toBeNull();
    await fireEvent.press(sendButton());
    expect(onSend).toHaveBeenCalledWith({ to: 'jane@acme.com' });
  });

  it('blocks an empty or invalid address with a reason', async () => {
    await setup();
    await fireEvent.changeText(screen.getByLabelText('Recipient'), '');
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText('Add a contact email first.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Recipient'), 'nope');
    expect(screen.getByText('Enter a valid email address.')).toBeOnTheScreen();
  });

  it('blocks sending without Gmail and offers Connect Gmail', async () => {
    const { onOpenSettings } = await setup({ gmail: { configured: true, connected: false, email: null } });
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText('Connect Gmail to send emails.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('link', { name: 'Connect Gmail' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('blocks sending while there are unsaved edits', async () => {
    await setup({ lockedReason: 'You have unsaved changes. Save them first so the copied letter and the PDF match.' });
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText(/unsaved changes/)).toBeOnTheScreen();
  });

  it('shows Sending… and disables both buttons while a request is in flight', async () => {
    await setup({ pending: true });
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Find another email' })).toBeDisabled();
  });

  it('asks for the next suggested address, and shows a notice and an error', async () => {
    const { onNextEmail } = await setup({ notice: 'No more suggested addresses. Paste one yourself.', error: 'Gmail could not send that email. Please try again.' });
    await fireEvent.press(screen.getByRole('button', { name: 'Find another email' }));
    expect(onNextEmail).toHaveBeenCalledTimes(1);
    expect(screen.getByText('No more suggested addresses. Paste one yourself.')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent('Gmail could not send that email. Please try again.');
  });

  it('resets the recipient and the guess box when the application changes', async () => {
    const { view } = await setup({ app: guess() });
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Send to this guessed address' }));
    await view.rerender(
      <EmailSection
        app={guess({ id: 'a2', hiring_manager_email: 'jobs@other.com' })}
        gmail={connected}
        pending={false}
        onSend={jest.fn()}
        onNextEmail={jest.fn()}
        onOpenSettings={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Recipient')).toHaveDisplayValue('jobs@other.com');
    expect(screen.getByRole('checkbox', { name: 'Send to this guessed address' })).not.toBeChecked();
  });

  it('sends once when Send is tapped twice in the same frame', async () => {
    const { onSend } = await setup();
    const press = screen.getByRole('button', { name: 'Send application' }).props.onClick;
    await act(async () => {
      press();
      press();
    });
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
