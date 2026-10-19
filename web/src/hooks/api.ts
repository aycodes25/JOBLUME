'use client';

import type { Application, ApplicationDetail, ApplicationStatus, ProfilePatch } from '@joblume/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApi } from '@/lib/api/runtime';
import { applyStatusLocal } from '@/lib/applications';

export const keys = {
  profile: ['profile'] as const,
  applications: ['applications'] as const,
  application: (id: string) => ['application', id] as const,
  analytics: ['analytics'] as const,
  gmail: ['gmail'] as const,
  followUps: ['follow-ups'] as const,
  jobFetches: ['job-fetches'] as const,
};

export function useProfile() {
  return useQuery({ queryKey: keys.profile, queryFn: () => getApi().getProfile() });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => getApi().updateProfile(patch),
    onSuccess: (profile) => {
      qc.setQueryData(keys.profile, profile);
    },
  });
}

export function useUploadCv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => getApi().uploadCv(file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.profile });
    },
  });
}

export function useApplications(options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: keys.applications,
    queryFn: () => getApi().listApplications(),
    refetchInterval: options.poll ? 60_000 : false,
    refetchOnWindowFocus: true,
  });
}

export function useApplication(id: string | null) {
  return useQuery({
    queryKey: keys.application(id ?? ''),
    queryFn: () => getApi().getApplication(id as string),
    enabled: id !== null,
  });
}

export function useUpdateApplicationText() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { tailored_cv_text?: string; cover_letter_text?: string } }) =>
      getApi().updateApplicationText(id, patch),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: keys.application(id) });
      void qc.invalidateQueries({ queryKey: keys.applications });
    },
  });
}

export function useSetStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicationStatus }) => getApi().setApplicationStatus(id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: keys.applications });
      await qc.cancelQueries({ queryKey: keys.application(id) });
      const previous = qc.getQueryData<Application[]>(keys.applications);
      const previousDetail = qc.getQueryData<ApplicationDetail>(keys.application(id));
      if (previous) qc.setQueryData(keys.applications, applyStatusLocal(previous, id, status));
      if (previousDetail) qc.setQueryData(keys.application(id), applyStatusLocal([previousDetail], id, status)[0]);
      return { previous, previousDetail };
    },
    onError: (_err, { id }, context) => {
      if (context?.previous) qc.setQueryData(keys.applications, context.previous);
      if (context?.previousDetail) qc.setQueryData(keys.application(id), context.previousDetail);
    },
    onSettled: (_data, _err, { id }) => {
      void qc.invalidateQueries({ queryKey: keys.applications });
      void qc.invalidateQueries({ queryKey: keys.application(id) });
      void qc.invalidateQueries({ queryKey: keys.analytics });
    },
  });
}

export function useAnalytics() {
  return useQuery({ queryKey: keys.analytics, queryFn: () => getApi().getAnalytics() });
}

export function useRefreshJobs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => getApi().refreshJobs(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.applications });
    },
  });
}

export function useJobFetches() {
  return useQuery({
    queryKey: keys.jobFetches,
    queryFn: () => getApi().listJobFetches(),
    // Poll faster while a link is still being read.
    refetchInterval: (query) => (query.state.data?.some((f) => f.status === 'queued') ? 10_000 : 60_000),
    refetchOnWindowFocus: true,
  });
}

export function useAddJobLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => getApi().addJobLink(url),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.jobFetches });
      void qc.invalidateQueries({ queryKey: keys.applications });
    },
  });
}

export function useGmailStatus() {
  return useQuery({ queryKey: keys.gmail, queryFn: () => getApi().getGmailStatus() });
}

export function useConnectGmail() {
  return useMutation({
    mutationFn: () => getApi().startGmailConnect(),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
}

export function useDisconnectGmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => getApi().disconnectGmail(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.gmail });
    },
  });
}

export function useSendApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { to?: string; confirmGuess?: boolean } }) => getApi().sendApplication(id, body),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: keys.applications });
      void qc.invalidateQueries({ queryKey: keys.application(id) });
      void qc.invalidateQueries({ queryKey: keys.analytics });
    },
  });
}

export function useNextEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getApi().nextEmail(id),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: keys.application(id) });
      void qc.invalidateQueries({ queryKey: keys.applications });
    },
  });
}

export function useSetEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) => getApi().setEmail(id, email),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: keys.application(id) });
      void qc.invalidateQueries({ queryKey: keys.applications });
    },
  });
}

export function useFollowUps(status: 'pending_review' | 'sent' | 'dismissed' | 'failed' = 'pending_review') {
  return useQuery({
    queryKey: [...keys.followUps, status],
    queryFn: () => getApi().listFollowUps(status),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useUpdateFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { subject?: string; body?: string } }) => getApi().updateFollowUp(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.followUps });
    },
  });
}

export function useSendFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getApi().sendFollowUp(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.followUps });
      void qc.invalidateQueries({ queryKey: keys.applications });
    },
  });
}

export function useDismissFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getApi().dismissFollowUp(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.followUps });
    },
  });
}
