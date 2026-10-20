import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsForm } from '@/components/profile/SettingsForm';
import type { SettingsValues } from '@/lib/profile-form';

const initial: SettingsValues = { applyMode: 'manual', autoThreshold: '80', dailyCap: '20', autoFollowup: false, notifyNewMatches: false };

function setup() {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<SettingsForm initial={initial} onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
}

describe('SettingsForm', () => {
  it('renders the stored settings and the Phase 3 note', () => {
    setup();
    expect(screen.getByLabelText('Manual')).toBeChecked();
    expect(screen.getByLabelText('Auto-apply threshold')).toHaveValue(80);
    expect(screen.getByLabelText('Daily application cap')).toHaveValue(20);
    expect(screen.getByText(/sends an application by email without a click/i)).toBeInTheDocument();
  });

  it('submits changed settings', async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByLabelText('Auto'));
    await user.clear(screen.getByLabelText('Daily application cap'));
    await user.type(screen.getByLabelText('Daily application cap'), '10');
    await user.click(screen.getByLabelText('Auto follow-up'));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(onSubmit).toHaveBeenCalledWith({ apply_mode: 'auto', auto_threshold: 80, daily_cap: 10, auto_followup: true, notify_new_matches: false });
  });

  it('has the new-match email switch off by default and saves it when ticked', async () => {
    const { onSubmit, user } = setup();
    const box = screen.getByLabelText('Email me about new matches');
    expect(box).not.toBeChecked();
    expect(screen.getByText(/at most one email an hour/i)).toBeInTheDocument();
    expect(screen.getByText(/never includes your CV/i)).toBeInTheDocument();
    await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(onSubmit).toHaveBeenCalledWith({ apply_mode: 'manual', auto_threshold: 80, daily_cap: 20, auto_followup: false, notify_new_matches: true });
  });

  it('rejects a daily cap above 20', async () => {
    const { onSubmit, user } = setup();
    await user.clear(screen.getByLabelText('Daily application cap'));
    await user.type(screen.getByLabelText('Daily application cap'), '25');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Enter a whole number between 1 and 20.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
