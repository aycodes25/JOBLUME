import type { Application, ApplicationDetail } from '@joblume/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setApplicationStatus } = vi.hoisted(() => ({ setApplicationStatus: vi.fn() }));
vi.mock('@/lib/api/runtime', () => ({ getApi: () => ({ setApplicationStatus }) }));

import { keys, useSetStatus } from '@/hooks/api';

const app = (over: Partial<Application> = {}): Application => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'cv', tailored_cv_url: null, cover_letter_text: 'l',
  match_score: 70, missing_keywords: [], hiring_manager_email: null, email_confidence: null, apply_method: null,
  status: 'pending_review', applied_at: null, follow_up_at: null, created_at: '2026-10-01T00:00:00.000Z', job: null, ...over,
});

function setup(initial: Application[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData(keys.applications, initial);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
}

const statusOf = (qc: QueryClient) => (qc.getQueryData(keys.applications) as Application[])[0]!.status;

beforeEach(() => { setApplicationStatus.mockReset(); });

describe('useSetStatus', () => {
  it('updates the cached list before the server answers', async () => {
    let resolve!: (v: unknown) => void;
    setApplicationStatus.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { qc, wrapper } = setup([app()]);
    const { result } = renderHook(() => useSetStatus(), { wrapper });

    act(() => { result.current.mutate({ id: 'a1', status: 'applied' }); });
    await waitFor(() => expect(statusOf(qc)).toBe('applied'));
    expect(setApplicationStatus).toHaveBeenCalledWith('a1', 'applied');
    resolve({});
  });

  it('rolls the list back when the server refuses', async () => {
    setApplicationStatus.mockRejectedValue(new Error('refused'));
    const { qc, wrapper } = setup([app()]);
    const { result } = renderHook(() => useSetStatus(), { wrapper });

    act(() => { result.current.mutate({ id: 'a1', status: 'applied' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(statusOf(qc)).toBe('pending_review');
  });

  const detailOf = (): ApplicationDetail => ({ ...app(), cv_pdf_url: null });
  const detailStatus = (qc: QueryClient) => (qc.getQueryData(keys.application('a1')) as ApplicationDetail).status;

  it('updates the cached detail before the server answers', async () => {
    let resolve!: (v: unknown) => void;
    setApplicationStatus.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { qc, wrapper } = setup([app()]);
    qc.setQueryData(keys.application('a1'), detailOf());
    const { result } = renderHook(() => useSetStatus(), { wrapper });

    act(() => { result.current.mutate({ id: 'a1', status: 'applied' }); });
    await waitFor(() => expect(detailStatus(qc)).toBe('applied'));
    resolve({});
  });

  it('rolls the detail back when the server refuses', async () => {
    setApplicationStatus.mockRejectedValue(new Error('refused'));
    const { qc, wrapper } = setup([app()]);
    qc.setQueryData(keys.application('a1'), detailOf());
    const { result } = renderHook(() => useSetStatus(), { wrapper });

    act(() => { result.current.mutate({ id: 'a1', status: 'applied' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(detailStatus(qc)).toBe('pending_review');
  });

  it('works with an empty list cache', async () => {
    setApplicationStatus.mockResolvedValue({});
    const { qc, wrapper } = setup([app()]);
    qc.removeQueries({ queryKey: keys.applications });
    const { result } = renderHook(() => useSetStatus(), { wrapper });

    act(() => { result.current.mutate({ id: 'a1', status: 'applied' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(setApplicationStatus).toHaveBeenCalledWith('a1', 'applied');
  });

  it('cancels an in-flight detail fetch when mutating', async () => {
    setApplicationStatus.mockResolvedValue({});
    const { qc, wrapper } = setup([app()]);
    const cancel = vi.spyOn(qc, 'cancelQueries');
    const { result } = renderHook(() => useSetStatus(), { wrapper });
    act(() => { result.current.mutate({ id: 'a1', status: 'applied' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(cancel).toHaveBeenCalledWith({ queryKey: keys.application('a1') });
  });
});
