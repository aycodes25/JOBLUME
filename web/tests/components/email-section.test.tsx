import type { ApplicationDetail } from '@joblume/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmailSection, type EmailSectionProps } from '@/components/applications/EmailSection';

const detail = (over: Partial<ApplicationDetail> = {}): ApplicationDetail => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'cv', tailored_cv_url: 'u1/tailored/j1.pdf',
  cover_letter_text: 'Dear team, I would like to apply for the Data Analyst role at Acme.', match_score: 85, missing_keywords: [],
  hiring_manager_email: 'hr@acme.com', email_confidence: 90, email_source: 'hunter', email_candidates: [],
  apply_method: null, status: 'approved', applied_at: null, follow_up_at: null, created_at: '', cv_pdf_url: 'https://files.example.com/cv.pdf',
  job: { title: 'Data Analyst', company: 'Acme', location: 'Lagos', source: 'myjobmag', url: 'https://example.com/j', company_domain: null },
  ...over,
});

function setup(over: Partial<EmailSectionProps> = {}) {
  const onSend = vi.fn();
  const onNextEmail = vi.fn();
  render(
    <EmailSection
      app={detail()}
      gmail={{ configured: true, connected: true, email: 'me@gmail.com' }}
      pending={false}
      onSend={onSend}
      onNextEmail={onNextEmail}
      {...over}
    />,
  );
  return { onSend, onNextEmail, user: userEvent.setup() };
}

describe('EmailSection', () => {
  it('shows the recipient, its confidence, the subject and a body preview', () => {
    setup();
    expect(screen.getByLabelText('Recipient')).toHaveValue('hr@acme.com');
    expect(screen.getByText('Found, high confidence')).toBeInTheDocument();
    expect(screen.getByText('Subject: Application for Data Analyst')).toBeInTheDocument();
    expect(screen.getByText(/I would like to apply for the Data Analyst role/)).toBeInTheDocument();
    expect(screen.getByText(/tailored CV \(PDF\) is attached/i)).toBeInTheDocument();
  });

  it('sends with no extra options for a stored, trusted address', async () => {
    const { onSend, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Send application' }));
    expect(onSend).toHaveBeenCalledWith({});
  });

  it('requires confirming a guessed address before sending', async () => {
    const { onSend, user } = setup({ app: detail({ hiring_manager_email: 'careers@acme.com', email_source: 'guess', email_confidence: 30 }) });
    expect(screen.getByText('Guess, low confidence')).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send application' });
    expect(send).toBeDisabled();
    expect(screen.getByText('Tick the box to send to this guessed address.')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Send to this guessed address'));
    expect(send).toBeEnabled();
    await user.click(send);
    expect(onSend).toHaveBeenCalledWith({ confirmGuess: true });
  });

  it('sends to an address the user typed, marked as entered by them, with no guess checkbox', async () => {
    const { onSend, user } = setup({ app: detail({ hiring_manager_email: 'careers@acme.com', email_source: 'guess', email_confidence: 30 }) });
    const input = screen.getByLabelText('Recipient');
    await user.clear(input);
    await user.type(input, 'jane@acme.com');
    expect(screen.getByText('Entered by you')).toBeInTheDocument();
    expect(screen.queryByLabelText('Send to this guessed address')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Send application' }));
    expect(onSend).toHaveBeenCalledWith({ to: 'jane@acme.com' });
  });

  it('blocks an empty or invalid address with a reason', async () => {
    const { user } = setup();
    const input = screen.getByLabelText('Recipient');
    await user.clear(input);
    expect(screen.getByRole('button', { name: 'Send application' })).toBeDisabled();
    expect(screen.getByText('Add a contact email first.')).toBeInTheDocument();
    await user.type(input, 'nope');
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
  });

  it('offers a Connect Gmail link and blocks sending when Gmail is not connected', () => {
    setup({ gmail: { configured: true, connected: false, email: null } });
    expect(screen.getByRole('link', { name: 'Connect Gmail' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('button', { name: 'Send application' })).toBeDisabled();
  });

  it('blocks sending while the letter or CV has unsaved edits', () => {
    setup({ lockedReason: 'You have unsaved changes. Save them first so the copied letter and the PDF match.' });
    expect(screen.getByRole('button', { name: 'Send application' })).toBeDisabled();
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it('shows Sending… and disables the buttons while a request is in flight', () => {
    setup({ pending: true });
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Find another email' })).toBeDisabled();
  });

  it('asks for the next suggested address', async () => {
    const { onNextEmail, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Find another email' }));
    expect(onNextEmail).toHaveBeenCalledTimes(1);
  });

  it('shows an error and a notice', () => {
    setup({ error: 'Gmail could not send that email. Please try again.', notice: 'No more suggested addresses. Paste one yourself.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Gmail could not send that email.');
    expect(screen.getByRole('status')).toHaveTextContent('No more suggested addresses.');
  });

  it('resets the recipient when the application changes', () => {
    const { rerender } = render(
      <EmailSection app={detail()} gmail={{ configured: true, connected: true, email: 'me@gmail.com' }} pending={false} onSend={() => {}} onNextEmail={() => {}} />,
    );
    rerender(
      <EmailSection app={detail({ id: 'a2', hiring_manager_email: 'jobs@other.com' })} gmail={{ configured: true, connected: true, email: 'me@gmail.com' }} pending={false} onSend={() => {}} onNextEmail={() => {}} />,
    );
    expect(screen.getByLabelText('Recipient')).toHaveValue('jobs@other.com');
  });
});
