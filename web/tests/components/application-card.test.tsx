import type { Application } from '@joblume/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationCard } from '@/components/applications/ApplicationCard';

const app = (over: Partial<Application> = {}): Application => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'Experienced analyst. '.repeat(30), tailored_cv_url: null,
  cover_letter_text: 'Dear hiring team, I would like to join. '.repeat(20), match_score: 82,
  missing_keywords: ['Docker', 'Kubernetes'], hiring_manager_email: null, email_confidence: null, email_source: null, email_candidates: [], apply_method: null,
  status: 'pending_review', applied_at: null, follow_up_at: null, created_at: '2026-10-01T00:00:00.000Z',
  job: { title: 'Data Analyst', company: 'Acme Ltd', location: 'Lagos', source: 'myjobmag', url: 'https://example.com/job/1', company_domain: null },
  ...over,
});

describe('ApplicationCard', () => {
  it('shows the role, company, location, source and score', () => {
    render(<ApplicationCard app={app()} onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Data Analyst' })).toBeInTheDocument();
    expect(screen.getByText(/Acme Ltd/)).toBeInTheDocument();
    expect(screen.getByText(/Lagos/)).toBeInTheDocument();
    expect(screen.getByText('MyJobMag')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Match score 82 out of 100' })).toBeInTheDocument();
  });

  it('links to the posting only for http(s) URLs, with safe link attributes', () => {
    const { unmount } = render(<ApplicationCard app={app()} onOpen={() => {}} />);
    const link = screen.getByRole('link', { name: 'View posting' });
    expect(link).toHaveAttribute('href', 'https://example.com/job/1');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    unmount();

    render(<ApplicationCard app={app({ job: { title: 'X', company: 'Y', location: '', source: 'remotive', url: 'javascript:alert(1)', company_domain: null } })} onOpen={() => {}} />);
    expect(screen.queryByRole('link', { name: 'View posting' })).toBeNull();
  });

  it('shows at most five missing keywords and a +N more badge', () => {
    render(<ApplicationCard app={app({ missing_keywords: ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7'] })} onOpen={() => {}} />);
    const group = screen.getByLabelText('Missing keywords');
    expect(group).toHaveTextContent('a1');
    expect(group).toHaveTextContent('e5');
    expect(group).not.toHaveTextContent('f6');
    expect(group).toHaveTextContent('+2 more');
  });

  it('truncates the previews', () => {
    render(<ApplicationCard app={app()} onOpen={() => {}} />);
    const previews = screen.getAllByText(/…$/);
    expect(previews.length).toBe(2);
    for (const p of previews) expect(p.textContent!.length).toBeLessThanOrEqual(181);
  });

  it('marks an approved application as ready to apply', () => {
    render(<ApplicationCard app={app({ status: 'approved' })} onOpen={() => {}} />);
    expect(screen.getByText('Ready to apply')).toBeInTheDocument();
  });

  it('opens the detail from the title and from the Review button', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<ApplicationCard app={app()} onOpen={onOpen} />);
    await user.click(screen.getByRole('button', { name: 'Data Analyst' }));
    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(onOpen).toHaveBeenNthCalledWith(1, 'a1');
    expect(onOpen).toHaveBeenNthCalledWith(2, 'a1');
  });

  it('copes with a missing job and no score', () => {
    render(<ApplicationCard app={app({ job: null, match_score: null })} onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Untitled role' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'No match score' })).toBeInTheDocument();
  });
});
