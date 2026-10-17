import type {
  Analytics,
  Application,
  ApplicationDetail,
  ApplicationStatus,
  CvUploadResult,
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
  };
}

export type Api = ReturnType<typeof createApi>;
