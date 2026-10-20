import type { ApplicationDetail } from '@joblume/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistedApplyPanel } from '@/components/applications/AssistedApplyPanel';

const detail = (over: Partial<ApplicationDetail> = {}): ApplicationDetail => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'cv', tailored_cv_url: 'u1/tailored/j1.pdf',
  cover_letter_text: 'Dear team, hello.', match_score: 80, missing_keywords: [], hiring_manager_email: null,
  email_confidence: null, email_source: null, email_candidates: [], apply_method: null, status: 'approved', applied_at: null, follow_up_at: null,
  created_at: '2026-10-01T00:00:00.000Z', cv_pdf_url: 'https://files.example.com/cv.pdf',
  job: { title: 'Data Analyst', company: 'Acme', location: 'Lagos', source: 'myjobmag', url: 'https://example.com/job/1', company_domain: null },
  ...over,
});

function mockClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('AssistedApplyPanel', () => {
  it('offers the job link and the CV download with safe link attributes', () => {
    render(<AssistedApplyPanel app={detail()} onMarkApplied={() => {}} />);
    const job = screen.getByRole('link', { name: 'Open job link' });
    expect(job).toHaveAttribute('href', 'https://example.com/job/1');
    expect(job).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Download CV PDF' })).toHaveAttribute('href', 'https://files.example.com/cv.pdf');
  });

  it('hides unsafe or missing links and explains why', () => {
    render(<AssistedApplyPanel app={detail({ cv_pdf_url: null, job: { title: 'T', company: 'C', location: '', source: 'x', url: 'javascript:alert(1)', company_domain: null } })} onMarkApplied={() => {}} />);
    expect(screen.queryByRole('link', { name: 'Open job link' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Download CV PDF' })).toBeNull();
    expect(screen.getByText(/no valid link/i)).toBeInTheDocument();
  });

  it('copies the cover letter text to the clipboard', async () => {
    const user = userEvent.setup(); // setup() installs its own clipboard stub, so mock afterwards
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    render(<AssistedApplyPanel app={detail()} onMarkApplied={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Copy cover letter' }));
    expect(writeText).toHaveBeenCalledWith('Dear team, hello.');
    expect(await screen.findByText('Copied.')).toBeInTheDocument();
  });

  it('tells the user when copying is not possible', async () => {
    const user = userEvent.setup(); // setup() installs its own clipboard stub, so mock afterwards
    mockClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    render(<AssistedApplyPanel app={detail()} onMarkApplied={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Copy cover letter' }));
    expect(await screen.findByText(/could not copy/i)).toBeInTheDocument();
  });

  it('marks the application as applied', async () => {
    const onMarkApplied = vi.fn();
    render(<AssistedApplyPanel app={detail()} onMarkApplied={onMarkApplied} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mark as applied' }));
    expect(onMarkApplied).toHaveBeenCalledTimes(1);
  });

  it('shows only the reason and no actions when locked', () => {
    render(<AssistedApplyPanel app={detail()} onMarkApplied={() => {}} lockedReason="You have unsaved changes." />);
    expect(screen.getByRole('alert')).toHaveTextContent('You have unsaved changes.');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Copy cover letter' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark as applied' })).toBeNull();
  });

  it('disables Mark as applied while a change is pending', () => {
    render(<AssistedApplyPanel app={detail()} onMarkApplied={() => {}} pending />);
    expect(screen.getByRole('button', { name: 'Mark as applied' })).toBeDisabled();
  });
});
