import type { FollowUpWithJob } from '@joblume/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FollowUpCard, type FollowUpCardProps } from '@/components/followups/FollowUpCard';

const followUp: FollowUpWithJob = {
  id: 'f1', application_id: 'a1', subject: 'Re: Application for Data Analyst',
  body: 'Dear Hiring Team, I applied on 20 October and wanted to ask whether there is any update. Kind regards, Ada.',
  status: 'pending_review', created_at: '2026-10-23T09:00:00.000Z', sent_at: null, job: { title: 'Data Analyst', company: 'Acme' },
};

function setup(over: Partial<FollowUpCardProps> = {}) {
  const handlers = { onSave: vi.fn(), onSend: vi.fn(), onDismiss: vi.fn() };
  render(<FollowUpCard followUp={followUp} pending={false} {...handlers} {...over} />);
  return { ...handlers, user: userEvent.setup() };
}

describe('FollowUpCard', () => {
  it('shows the role, company, subject and body', () => {
    setup();
    expect(screen.getByText(/Data Analyst/)).toBeInTheDocument();
    expect(screen.getByText(/Acme/)).toBeInTheDocument();
    expect(screen.getByLabelText('Subject')).toHaveValue('Re: Application for Data Analyst');
    expect(screen.getByLabelText('Message')).toHaveValue(followUp.body);
  });

  it('sends a clean draft and dismisses it', async () => {
    const { onSend, onDismiss, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Send follow-up' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('saves only what changed, and blocks sending until it is saved', async () => {
    const { onSave, user } = setup();
    const subject = screen.getByLabelText('Subject');
    await user.clear(subject);
    await user.type(subject, 'Re: Quick question about Data Analyst');
    expect(screen.getByRole('button', { name: 'Send follow-up' })).toBeDisabled();
    expect(screen.getByText('Save your changes first.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ subject: 'Re: Quick question about Data Analyst' });
  });

  it('blocks saving a message that is too short', async () => {
    const { onSave, user } = setup();
    const body = screen.getByLabelText('Message');
    await user.clear(body);
    await user.type(body, 'Too short');
    expect(screen.getByText(/at least 40/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('disables everything while a request is in flight and shows errors', () => {
    setup({ pending: true, error: 'That is no longer applicable because the application has moved on.' });
    expect(screen.getByRole('button', { name: 'Send follow-up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('no longer applicable');
  });
});
