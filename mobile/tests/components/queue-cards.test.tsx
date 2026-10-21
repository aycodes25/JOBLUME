import { fireEvent, render, screen } from '@testing-library/react-native';
import { ApplicationCard } from '@/components/applications/ApplicationCard';
import { FollowUpCard } from '@/components/followups/FollowUpCard';
import { AddJobLink } from '@/components/jobs/AddJobLink';
import { app, followUp } from '../fixtures';

describe('ApplicationCard', () => {
  it('shows the title, company, match badge, place, time, source and up to two keywords', async () => {
    const now = new Date('2026-10-18T12:00:00.000Z');
    await render(<ApplicationCard app={app({ match_score: 96, missing_keywords: ['Figma', 'UI/UX', 'Sketch'] })} onOpen={jest.fn()} now={now} />);
    expect(screen.getByText('Data Analyst')).toBeOnTheScreen();
    expect(screen.getByText('Acme')).toBeOnTheScreen();
    expect(screen.getByText('96% MATCH')).toBeOnTheScreen();
    expect(screen.getByText('Lagos')).toBeOnTheScreen();
    expect(screen.getByText('Found 2 hours ago')).toBeOnTheScreen();
    expect(screen.getByText('MyJobMag')).toBeOnTheScreen();
    expect(screen.getByText('Figma')).toBeOnTheScreen();
    expect(screen.queryByText('Sketch')).toBeNull();
    expect(screen.getByText('+1')).toBeOnTheScreen();
  });

  it('shows when the source says the job was posted', async () => {
    const job = { title: 'Data Analyst', company: 'Acme', location: 'Lagos', source: 'remoteok', url: 'https://example.com/j', company_domain: null, posted_at: '2026-10-18T09:00:00.000Z' };
    await render(<ApplicationCard app={app({ job })} onOpen={jest.fn()} now={new Date('2026-10-18T12:00:00.000Z')} />);
    expect(screen.getByText('Posted 3 hours ago')).toBeOnTheScreen();
    expect(screen.getByText('RemoteOK')).toBeOnTheScreen();
  });

  it('opens the application from Details', async () => {
    const onOpen = jest.fn();
    await render(<ApplicationCard app={app({ id: 'a9' })} onOpen={onOpen} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Details for Data Analyst' }));
    expect(onOpen).toHaveBeenCalledWith('a9');
  });

  it('marks an approved application as ready to apply', async () => {
    await render(<ApplicationCard app={app({ status: 'approved' })} onOpen={jest.fn()} />);
    expect(screen.getByText('Ready to apply')).toBeOnTheScreen();
  });
});

describe('AddJobLink', () => {
  const base = { fetches: [], pending: false, error: null, result: null };

  it('refuses a link that is not a LinkedIn or Indeed job, without calling the server', async () => {
    const onAdd = jest.fn();
    await render(<AddJobLink {...base} onAdd={onAdd} />);
    await fireEvent.changeText(screen.getByLabelText('Add a job link'), 'https://www.glassdoor.com/job/123');
    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/not a LinkedIn or Indeed job link/);
  });

  it('sends the canonical link without tracking parameters', async () => {
    const onAdd = jest.fn();
    await render(<AddJobLink {...base} onAdd={onAdd} />);
    await fireEvent.changeText(screen.getByLabelText('Add a job link'), 'https://www.linkedin.com/jobs/view/4012345678/?trk=abc');
    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).toHaveBeenCalledWith('https://www.linkedin.com/jobs/view/4012345678/');
  });

  it('lists recent links with their status', async () => {
    await render(
      <AddJobLink
        {...base}
        onAdd={jest.fn()}
        result={{ queued: true }}
        fetches={[{ id: 'x', url: 'https://ng.indeed.com/viewjob?jk=0123456789abcdef', status: 'failed', reason: 'not_found', job_id: null, created_at: '', updated_at: '' }]}
      />,
    );
    expect(screen.getByText(/We are reading the job now/)).toBeOnTheScreen();
    expect(screen.getByText(/This job is no longer available/)).toBeOnTheScreen();
  });
});

describe('FollowUpCard', () => {
  const handlers = () => ({ onSave: jest.fn(), onSend: jest.fn(), onDismiss: jest.fn() });

  it('sends only when Send follow-up is tapped', async () => {
    const h = handlers();
    await render(<FollowUpCard followUp={followUp()} pending={false} {...h} />);
    expect(h.onSend).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Send follow-up' }));
    expect(h.onSend).toHaveBeenCalledTimes(1);
  });

  it('blocks sending until edits are saved, then saves the trimmed patch', async () => {
    const h = handlers();
    await render(<FollowUpCard followUp={followUp()} pending={false} {...h} />);
    await fireEvent.changeText(screen.getByLabelText('Subject'), '  A better subject  ');
    expect(screen.getByRole('button', { name: 'Send follow-up' })).toBeDisabled();
    expect(screen.getByText('Save your changes first.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(h.onSave).toHaveBeenCalledWith({ subject: 'A better subject' });
  });

  it('shows validation errors and dismisses', async () => {
    const h = handlers();
    await render(<FollowUpCard followUp={followUp()} pending={false} {...h} />);
    await fireEvent.changeText(screen.getByLabelText('Message'), 'Too short');
    expect(screen.getByText('The message must be at least 40 characters.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(h.onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('ApplicationCard apply-method badge', () => {
  it('shows Email, WhatsApp or Employer site', async () => {
    const view = await render(<ApplicationCard app={app()} onOpen={jest.fn()} />);
    expect(screen.getByText('Email')).toBeOnTheScreen();
    await view.rerender(<ApplicationCard app={app({ hiring_manager_email: null, whatsapp_number: '2348031234567' })} onOpen={jest.fn()} />);
    expect(screen.getByText('WhatsApp')).toBeOnTheScreen();
    await view.rerender(<ApplicationCard app={app({ hiring_manager_email: null })} onOpen={jest.fn()} />);
    expect(screen.getByText('Employer site')).toBeOnTheScreen();
  });
});
