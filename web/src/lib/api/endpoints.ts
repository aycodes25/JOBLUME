import type {
  Analytics,
  Application,
  ApplicationDetail,
  ApplicationStatus,
  CvUploadResult,
  FollowUp,
  FollowUpWithJob,
  GmailStatus,
  Profile,
  ProfilePatch,
} from '@joblume/shared';
import type { ApiClient } from './client';

export function createApi(request: ApiClient) {
  return {
    getProfile: () => request<Profile>('/profile'),
    updateProfile: (patch: ProfilePatch) => request<Profile>('/profile', { method: 'PUT', json: patch }),
    uploadCv: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return request<CvUploadResult>('/cv', { method: 'POST', formData: form });
    },
    listApplications: (status?: ApplicationStatus) =>
      request<Application[]>(status ? `/applications?status=${encodeURIComponent(status)}` : '/applications'),
    getApplication: (id: string) => request<ApplicationDetail>(`/applications/${encodeURIComponent(id)}`),
    updateApplicationText: (id: string, patch: { tailored_cv_text?: string; cover_letter_text?: string }) =>
      request<Application>(`/applications/${encodeURIComponent(id)}`, { method: 'PATCH', json: patch }),
    setApplicationStatus: (id: string, status: ApplicationStatus) =>
      request<Application>(`/applications/${encodeURIComponent(id)}/status`, { method: 'PATCH', json: { status } }),
    getAnalytics: () => request<Analytics>('/analytics'),
    refreshJobs: () => request<{ queued: boolean }>('/jobs/refresh', { method: 'POST' }),
    getGmailStatus: () => request<GmailStatus>('/gmail/status'),
    startGmailConnect: () => request<{ url: string }>('/gmail/connect', { method: 'POST' }),
    disconnectGmail: () => request<{ connected: false }>('/gmail', { method: 'DELETE' }),
    sendApplication: (id: string, body: { to?: string; confirmGuess?: boolean }) =>
      request<Application>(`/applications/${encodeURIComponent(id)}/send`, { method: 'POST', json: body }),
    nextEmail: (id: string) =>
      request<{ exhausted: boolean; application: Application }>(`/applications/${encodeURIComponent(id)}/email/next`, { method: 'POST' }),
    setEmail: (id: string, email: string) =>
      request<Application>(`/applications/${encodeURIComponent(id)}/email`, { method: 'PUT', json: { email } }),
    listFollowUps: (status?: FollowUp['status']) =>
      request<FollowUpWithJob[]>(status ? `/follow-ups?status=${encodeURIComponent(status)}` : '/follow-ups'),
    updateFollowUp: (id: string, patch: { subject?: string; body?: string }) =>
      request<FollowUp>(`/follow-ups/${encodeURIComponent(id)}`, { method: 'PATCH', json: patch }),
    sendFollowUp: (id: string) => request<FollowUp>(`/follow-ups/${encodeURIComponent(id)}/send`, { method: 'POST' }),
    dismissFollowUp: (id: string) => request<FollowUp>(`/follow-ups/${encodeURIComponent(id)}/dismiss`, { method: 'POST' }),
  };
}

export type Api = ReturnType<typeof createApi>;
