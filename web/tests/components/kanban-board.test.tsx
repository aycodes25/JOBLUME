import type { Application } from '@joblume/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from '@/components/tracker/KanbanBoard';

const app = (id: string, status: Application['status'], over: Partial<Application> = {}): Application => ({
  id, user_id: 'u1', job_id: `j-${id}`, tailored_cv_text: 'cv', tailored_cv_url: null, cover_letter_text: 'l',
  match_score: 70, missing_keywords: [], hiring_manager_email: null, email_confidence: null, email_source: null, email_candidates: [], apply_method: null,
  status, applied_at: status === 'pending_review' || status === 'approved' || status === 'skipped' ? null : '2026-10-20T10:00:00.000Z',
  follow_up_at: null, created_at: '2026-10-01T00:00:00.000Z',
  job: { title: `Role ${id}`, company: `Company ${id}`, location: 'Lagos', source: 'myjobmag', url: 'https://example.com', company_domain: null },
  ...over,
});

const apps = [
  app('p1', 'pending_review'),
  app('p2', 'approved'),
  app('s1', 'skipped'),
  app('a1', 'applied'),
  app('i1', 'interviewing'),
  app('i2', 'interviewing'),
];

describe('KanbanBoard', () => {
  it('renders the five columns in order with counts', () => {
    render(<KanbanBoard apps={apps} onMove={() => {}} onOpen={() => {}} />);
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(regions).toEqual(['Pending Review', 'Applied', 'Interviewing', 'Rejected', 'Offer']);
    expect(within(screen.getByRole('region', { name: 'Pending Review' })).getByLabelText('2 applications')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Interviewing' })).getByLabelText('2 applications')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Offer' })).getByLabelText('0 applications')).toBeInTheDocument();
  });

  it('shows approved applications in Pending Review with a badge, and hides skipped ones', () => {
    render(<KanbanBoard apps={apps} onMove={() => {}} onOpen={() => {}} />);
    const pending = within(screen.getByRole('region', { name: 'Pending Review' }));
    expect(pending.getByText('Role p1')).toBeInTheDocument();
    expect(pending.getByText('Role p2')).toBeInTheDocument();
    expect(pending.getByText('Ready to apply')).toBeInTheDocument();
    expect(screen.queryByText('Role s1')).toBeNull();
  });

  it('shows the applied date on applied cards', () => {
    render(<KanbanBoard apps={apps} onMove={() => {}} onOpen={() => {}} />);
    expect(within(screen.getByRole('region', { name: 'Applied' })).getByText(/20 Oct/)).toBeInTheDocument();
  });

  it('shows a hint in empty columns', () => {
    render(<KanbanBoard apps={[]} onMove={() => {}} onOpen={() => {}} />);
    expect(screen.getAllByText('Drop a card here')).toHaveLength(5);
  });

  it('opens a card from its title', async () => {
    const onOpen = vi.fn();
    render(<KanbanBoard apps={apps} onMove={() => {}} onOpen={onOpen} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Role a1' }));
    expect(onOpen).toHaveBeenCalledWith('a1');
  });

  it('opens a card with the keyboard from the focused title', async () => {
    const onOpen = vi.fn();
    render(<KanbanBoard apps={apps} onMove={() => {}} onOpen={onOpen} />);
    screen.getByRole('button', { name: 'Role a1' }).focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith('a1');
  });
});
