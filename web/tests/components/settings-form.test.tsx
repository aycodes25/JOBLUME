import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsForm } from '@/components/profile/SettingsForm';
import type { SettingsValues } from '@/lib/profile-form';

const initial: SettingsValues = { applyMode: 'manual', autoThreshold: '80', dailyCap: '20', autoFollowup: false };

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
    expect(onSubmit).toHaveBeenCalledWith({ apply_mode: 'auto', auto_threshold: 80, daily_cap: 10, auto_followup: true });
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
