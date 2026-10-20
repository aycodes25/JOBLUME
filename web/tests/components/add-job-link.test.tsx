import type { JobFetch } from '@joblume/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddJobLink, type AddJobLinkProps } from '@/components/jobs/AddJobLink';
import { FETCH_REASON_TEXT, INVALID_LINK_MESSAGE } from '@/lib/job-fetches';

const fetches: JobFetch[] = [
  { id: 'f1', url: 'https://www.linkedin.com/jobs/view/4012345678/', status: 'queued', reason: null, job_id: null, created_at: '2026-10-18T09:00:00.000Z', updated_at: '2026-10-18T09:00:00.000Z' },
  { id: 'f2', url: 'https://ng.indeed.com/viewjob?jk=0123456789abcdef', status: 'failed', reason: 'login_required', job_id: null, created_at: '2026-10-18T08:00:00.000Z', updated_at: '2026-10-18T08:01:00.000Z' },
  { id: 'f3', url: 'https://www.linkedin.com/jobs/view/4099999999/', status: 'done', reason: null, job_id: 'j1', created_at: '2026-10-18T07:00:00.000Z', updated_at: '2026-10-18T07:01:00.000Z' },
];

function setup(over: Partial<AddJobLinkProps> = {}) {
  const onAdd = vi.fn<AddJobLinkProps['onAdd']>();
  const props: AddJobLinkProps = { fetches: [], pending: false, error: null, result: null, onAdd, ...over };
  const utils = render(<AddJobLink {...props} />);
  return { onAdd, props, user: userEvent.setup(), ...utils };
}

describe('AddJobLink', () => {
  it('sends the link in its canonical form', async () => {
    const { onAdd, user } = setup();
    await user.type(screen.getByLabelText('Add a job link'), 'https://www.linkedin.com/jobs/view/4012345678/?trk=public_jobs');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).toHaveBeenCalledWith('https://www.linkedin.com/jobs/view/4012345678/');
  });

  it('refuses a link that is not a LinkedIn or Indeed job without calling the server', async () => {
    const { onAdd, user } = setup();
    await user.type(screen.getByLabelText('Add a job link'), 'https://www.glassdoor.com/job-listing/123');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_LINK_MESSAGE);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('disables Add while the box is empty and while adding', () => {
    const { rerender, props } = setup();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    rerender(<AddJobLink {...props} pending />);
    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
  });

  it('confirms a queued link and clears the box', async () => {
    const { user, rerender, props } = setup();
    const input = screen.getByLabelText('Add a job link');
    await user.type(input, 'https://ng.indeed.com/viewjob?jk=0123456789abcdef');
    rerender(<AddJobLink {...props} result={{ queued: true }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/reading the job now/i);
    expect(input).toHaveValue('');
  });

  it('explains when we already have the job', () => {
    setup({ result: { job_id: 'j1' } });
    expect(screen.getByRole('status')).toHaveTextContent(/already have this job/i);
  });

  it('shows the server error in plain language', () => {
    setup({ error: 'You are doing that too often. Try again later.' });
    expect(screen.getByRole('alert')).toHaveTextContent('You are doing that too often. Try again later.');
  });

  it('lists the recent links with their site and status', () => {
    setup({ fetches });
    const list = screen.getByRole('list', { name: 'Recent job links' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByText('LinkedIn')).toBeInTheDocument();
    expect(within(items[0]!).getByText(/Reading the job…/)).toBeInTheDocument();
    expect(within(items[1]!).getByText('Indeed')).toBeInTheDocument();
    expect(within(items[1]!).getByText(new RegExp(FETCH_REASON_TEXT.login_required.replace('.', '\\.')))).toBeInTheDocument();
    expect(within(items[2]!).getByText(/Job added/)).toBeInTheDocument();
  });

  it('shows no list when there are no links yet', () => {
    setup();
    expect(screen.queryByRole('list', { name: 'Recent job links' })).not.toBeInTheDocument();
  });
});
