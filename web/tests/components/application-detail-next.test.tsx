import type { ApplicationDetail as Detail } from '@joblume/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MutateFn = (vars: { id: string; status: string }, opts?: { onSuccess?: () => void }) => void;
const mutate = vi.fn<MutateFn>();
let current: Detail;

const mutation = () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isSuccess: false, error: null });

vi.mock('@/hooks/api', () => ({
  useApplication: () => ({ data: current, isLoading: false, error: null, refetch: vi.fn() }),
  useGmailStatus: () => ({ data: { configured: true, connected: true, email: 'me@gmail.com' } }),
  useUpdateApplicationText: () => mutation(),
  useSetStatus: () => ({ ...mutation(), mutate }),
  useSendApplication: () => mutation(),
  useNextEmail: () => mutation(),
}));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { ApplicationDetail } from '@/components/applications/ApplicationDetail';

const detail = (over: Partial<Detail> = {}): Detail => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'cv '.repeat(30), tailored_cv_url: null,
  cover_letter_text: 'Dear team, hello.', match_score: 80, missing_keywords: [], hiring_manager_email: null,
  email_confidence: null, email_source: null, email_candidates: [], apply_method: null, status: 'approved', applied_at: null, follow_up_at: null,
  created_at: '2026-10-01T00:00:00.000Z', cv_pdf_url: null,
  job: { title: 'Data Analyst', company: 'Acme', location: 'Lagos', source: 'myjobmag', url: 'https://example.com/job/1', company_domain: null },
  ...over,
});

const queue = [
  { id: 'a1', status: 'approved' as const },
  { id: 'a2', status: 'applied' as const },
  { id: 'a3', status: 'approved' as const },
];

describe('ApplicationDetail apply-next flow', () => {
  beforeEach(() => {
    current = detail();
    mutate.mockReset();
    mutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
  });

  it('offers the next open job after marking applied, and opening it only navigates', async () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    render(<ApplicationDetail id="a1" onClose={onClose} queue={queue} onOpen={onOpen} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mark as applied' }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({ id: 'a1', status: 'applied' });
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Applied: open next job' }));
    expect(onOpen).toHaveBeenCalledWith('a3');
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('offers no next button when it was the last open job', async () => {
    render(<ApplicationDetail id="a1" onClose={() => {}} queue={[{ id: 'a1', status: 'approved' }]} onOpen={() => {}} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mark as applied' }));
    expect(screen.getByRole('status')).toHaveTextContent('Marked as applied.');
    expect(screen.queryByRole('button', { name: 'Applied: open next job' })).toBeNull();
  });

  it('closes as before when opened without a queue', async () => {
    const onClose = vi.fn();
    render(<ApplicationDetail id="a1" onClose={onClose} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mark as applied' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
