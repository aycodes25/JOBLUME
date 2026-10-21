import {
  MOBILE_GMAIL_RETURN,
  type AddJobLinkResult,
  type Analytics,
  type Application,
  type ApplicationDetail,
  type ApplicationStatus,
  type CvUploadResult,
  type FollowUp,
  type FollowUpWithJob,
  type GmailStatus,
  type JobFetch,
  type Profile,
  type ProfilePatch,
  type ScanStatus,
} from '@joblume/shared';
import type { CvFile } from '../cv-file';
import type { ApiClient } from './client';

/** React Native's FormData takes { uri, name, type } for a local file. */
export function cvFormData(file: CvFile): FormData {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  return form;
}

/** Same endpoints and shapes as web/src/lib/api/endpoints.ts, except the CV file and the Gmail return target. */
export function createApi(request: ApiClient) {
  return {
    getProfile: () => request<Profile>('/profile'),
    updateProfile: (patch: ProfilePatch) => request<Profile>('/profile', { method: 'PUT', json: patch }),
    uploadCv: (file: CvFile) => request<CvUploadResult>('/cv', { method: 'POST', formData: cvFormData(file) }),
    listApplications: (status?: ApplicationStatus) =>
      request<Application[]>(status ? `/applications?status=${encodeURIComponent(status)}` : '/applications'),
    getApplication: (id: string) => request<ApplicationDetail>(`/applications/${encodeURIComponent(id)}`),
    updateApplicationText: (id: string, patch: { tailored_cv_text?: string; cover_letter_text?: string }) =>
      request<Application>(`/applications/${encodeURIComponent(id)}`, { method: 'PATCH', json: patch }),
    setApplicationStatus: (id: string, status: ApplicationStatus) =>
      request<Application>(`/applications/${encodeURIComponent(id)}/status`, { method: 'PATCH', json: { status } }),
    getAnalytics: () => request<Analytics>('/analytics'),
    refreshJobs: () => request<{ queued: boolean }>('/jobs/refresh', { method: 'POST' }),
    addJobLink: (url: string) => request<AddJobLinkResult>('/jobs/from-url', { method: 'POST', json: { url } }),
    listJobFetches: () => request<JobFetch[]>('/jobs/fetches'),
    getScanStatus: () => request<ScanStatus>('/scan/status'),
    getGmailStatus: () => request<GmailStatus>('/gmail/status'),
    /** The phone always asks the server to send Google's callback back to the app. */
    startGmailConnect: () => request<{ url: string }>('/gmail/connect', { method: 'POST', json: { return: MOBILE_GMAIL_RETURN } }),
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
