import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { ApiRequestError } from '@/lib/api/client';
import type { ProfileFormValues } from '@/lib/profile-form';

const initial: ProfileFormValues = { desiredRoles: '', skills: '', location: '', yearsExperience: '', salaryMin: '', salaryMax: '' };

function setup(props: Partial<React.ComponentProps<typeof ProfileForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<ProfileForm initial={initial} onSubmit={onSubmit} submitLabel="Save" {...props} />);
  return { onSubmit, user: userEvent.setup() };
}

describe('ProfileForm', () => {
  it('renders the initial values', () => {
    setup({ initial: { ...initial, desiredRoles: 'Data Analyst', location: 'Abuja' } });
    expect(screen.getByLabelText('Roles you want')).toHaveValue('Data Analyst');
    expect(screen.getByLabelText('Location')).toHaveValue('Abuja');
  });

  it('shows a required-roles error and does not submit', async () => {
    const { onSubmit, user } = setup({ requireRoles: true });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Add at least one role you are looking for.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the built patch', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('Roles you want'), 'Data Analyst, BI Analyst');
    await user.type(screen.getByLabelText('Skills'), 'SQL, Excel');
    await user.selectOptions(screen.getByLabelText('Location'), 'Lagos');
    await user.type(screen.getByLabelText('Years of experience'), '3');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({
      desired_roles: ['Data Analyst', 'BI Analyst'], skills: ['SQL', 'Excel'], location: 'Lagos',
      years_experience: 3, salary_min: null, salary_max: null,
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.');
  });

  it('shows a field error for a salary range that is the wrong way round', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('Minimum salary'), '500000');
    await user.type(screen.getByLabelText('Maximum salary'), '100000');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Minimum salary cannot be higher than maximum salary.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the plain-language server error', async () => {
    const { user } = setup({ onSubmit: vi.fn().mockRejectedValue(new ApiRequestError(0, 'network_error')) });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot reach the server/i);
  });
});
