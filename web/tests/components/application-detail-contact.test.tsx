import type { ApplicationDetail as Detail } from '@joblume/shared';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mutation = () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isSuccess: false, error: null });
let current: Detail;

vi.mock('@/hooks/api', () => ({
  useApplication: () => ({ data: current, isLoading: false, error: null, refetch: vi.fn() }),
  useGmailStatus: () => ({ data: { configured: true, connected: true, email: 'me@gmail.com' } }),
  useUpdateApplicationText: () => mutation(),
  useSetStatus: () => mutation(),
  useSendApplication: () => mutation(),
  useNextEmail: () => mutation(),
}));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { ApplicationDetail } from '@/components/applications/ApplicationDetail';

const detail = (over: Partial<Detail> = {}): Detail => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'cv '.repeat(30), tailored_cv_url: null,
  cover_letter_text: 'Dear team,\nhello & welcome.', match_score: 80, missing_keywords: [], hiring_manager_email: null,
  email_confidence: null, email_source: null, email_candidates: [], apply_method: null, status: 'pending_review', applied_at: null, follow_up_at: null,
  created_at: '2026-10-01T00:00:00.000Z', cv_pdf_url: null,
  job: { title: 'Data Analyst', company: 'Acme', location: 'Lagos', source: 'myjobmag', url: 'https://example.com/job/1', company_domain: null },
  ...over,
});

describe('ApplicationDetail contact methods', () => {
  beforeEach(() => {
    current = detail();
  });

  it('shows the site hint and no WhatsApp button when nothing was published', () => {
    render(<ApplicationDetail id="a1" onClose={() => {}} />);
    expect(screen.getByText('Employer site')).toBeInTheDocument();
    expect(screen.getByText("No contact email was published. Use Apply on the employer's site below.")).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Message on WhatsApp' })).toBeNull();
  });

  it('shows a safe WhatsApp link that only opens a chat', () => {
    current = detail({ whatsapp_number: '2348031234567' });
    render(<ApplicationDetail id="a1" onClose={() => {}} />);
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Message on WhatsApp' });
    expect(link).toHaveAttribute('href', `https://wa.me/2348031234567?text=${encodeURIComponent('Dear team, hello & welcome.')}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Opens WhatsApp with a message ready. You press send there.')).toBeInTheDocument();
    expect(screen.queryByText(/No contact email was published/)).toBeNull();
  });

  it('shows no WhatsApp button for a malformed number', () => {
    current = detail({ whatsapp_number: '+23480<script>' });
    render(<ApplicationDetail id="a1" onClose={() => {}} />);
    expect(screen.queryByRole('link', { name: 'Message on WhatsApp' })).toBeNull();
  });

  it('shows the Email badge and no site hint when a candidate exists', () => {
    current = detail({ email_candidates: [{ email: 'a@b.co', confidence: 95, source: 'posting', label: 'Published in the job post' }] });
    render(<ApplicationDetail id="a1" onClose={() => {}} />);
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.queryByText(/No contact email was published/)).toBeNull();
  });
});
