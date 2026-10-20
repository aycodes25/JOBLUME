import type { Application, ApplicationDetail } from '@joblume/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockApi = {
  setApplicationStatus: jest.fn(),
  startGmailConnect: jest.fn(),
  uploadCv: jest.fn(),
};
jest.mock('@/lib/api/runtime', () => ({ getApi: () => mockApi }));

import { keys, useConnectGmail, useSetStatus, useUploadCv } from '@/hooks/api';

const app = (over: Partial<Application> = {}): Application => ({
  id: 'a1', user_id: 'u1', job_id: 'j1', tailored_cv_text: 'cv', tailored_cv_url: null, cover_letter_text: 'l',
  match_score: 70, missing_keywords: [], hiring_manager_email: null, email_confidence: null, email_source: null, email_candidates: [],
  apply_method: null, status: 'pending_review', applied_at: null, follow_up_at: null, created_at: '2026-10-01T00:00:00.000Z', job: null, ...over,
});

function setup(initial: Application[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  qc.setQueryData(keys.applications, initial);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
}

const statusOf = (qc: QueryClient) => (qc.getQueryData(keys.applications) as Application[])[0]!.status;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('keys', () => {
  it('match the web query keys', () => {
    expect(keys.applications).toEqual(['applications']);
    expect(keys.application('a1')).toEqual(['application', 'a1']);
    expect(keys.followUps).toEqual(['follow-ups']);
    expect(keys.jobFetches).toEqual(['job-fetches']);
  });
});

describe('useSetStatus', () => {
  it('updates the cached list and detail before the server answers', async () => {
    let resolve!: (v: unknown) => void;
    mockApi.setApplicationStatus.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { qc, wrapper } = setup([app()]);
    qc.setQueryData<ApplicationDetail>(keys.application('a1'), { ...app(), cv_pdf_url: null });
    const { result } = await renderHook(() => useSetStatus(), { wrapper });
    await act(async () => {
      result.current.mutate({ id: 'a1', status: 'applied' });
    });
    await waitFor(() => expect(statusOf(qc)).toBe('applied'));
    expect((qc.getQueryData(keys.application('a1')) as ApplicationDetail).status).toBe('applied');
    expect(mockApi.setApplicationStatus).toHaveBeenCalledWith('a1', 'applied');
    await act(async () => resolve({}));
  });

  it('rolls back when the server refuses', async () => {
    mockApi.setApplicationStatus.mockRejectedValue(new Error('refused'));
    const { qc, wrapper } = setup([app()]);
    const { result } = await renderHook(() => useSetStatus(), { wrapper });
    await act(async () => {
      result.current.mutate({ id: 'a1', status: 'applied' });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(statusOf(qc)).toBe('pending_review');
  });
});

describe('useConnectGmail', () => {
  it('only fetches the Google URL (the screen opens it)', async () => {
    mockApi.startGmailConnect.mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });
    const { wrapper } = setup([]);
    const { result } = await renderHook(() => useConnectGmail(), { wrapper });
    let url = '';
    await act(async () => {
      url = (await result.current.mutateAsync()).url;
    });
    expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth?x=1');
  });
});

describe('useUploadCv', () => {
  it('uploads the picked file and refreshes the profile', async () => {
    mockApi.uploadCv.mockResolvedValue({ characters: 1200 });
    const { qc, wrapper } = setup([]);
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useUploadCv(), { wrapper });
    const file = { uri: 'file:///cv.pdf', name: 'cv.pdf', mimeType: 'application/pdf' };
    await act(async () => {
      await result.current.mutateAsync(file);
    });
    expect(mockApi.uploadCv).toHaveBeenCalledWith(file);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.profile });
  });
});
