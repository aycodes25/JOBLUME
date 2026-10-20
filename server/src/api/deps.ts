import { profilePatchSchema, type ProfilePatch } from '@joblume/shared';
import type { AddJobLinkResult, Analytics, FollowUp, FollowUpWithJob, GmailReturnTarget, GmailStatus, JobFetch, JobLink } from '@joblume/shared';
import type { ApplicationRow, ApplicationStatus, ProfileRow } from '../db/types.js';
import type { AnalyticsRow } from '../services/analytics.js';
import type { GetUser } from './auth.js';

export { profilePatchSchema };
export type { ProfilePatch };

export interface ProfileRepo {
  get(userId: string): Promise<ProfileRow | null>;
  update(userId: string, patch: ProfilePatch): Promise<ProfileRow>;
}

export interface ApplicationWithJob extends ApplicationRow {
  job: { title: string; company: string; location: string; source: string; url: string; company_domain: string | null } | null;
}

export interface ApplicationsRepo {
  list(userId: string, status?: ApplicationStatus): Promise<ApplicationWithJob[]>;
  get(userId: string, id: string): Promise<ApplicationWithJob | null>;
  update(userId: string, id: string, patch: Record<string, unknown>): Promise<ApplicationWithJob | null>;
  listForAnalytics(userId: string): Promise<AnalyticsRow[]>;
}

export interface ApplicationsService {
  list(userId: string, status?: ApplicationStatus): Promise<ApplicationWithJob[]>;
  get(userId: string, id: string): Promise<(ApplicationWithJob & { cv_pdf_url: string | null }) | null>;
  update(userId: string, id: string, patch: { tailored_cv_text?: string; cover_letter_text?: string }): Promise<ApplicationWithJob | null>;
  setStatus(userId: string, id: string, status: ApplicationStatus): Promise<ApplicationWithJob | null>;
  analytics(userId: string): Promise<Analytics>;
  nextEmail(userId: string, id: string): Promise<{ exhausted: boolean; application: ApplicationWithJob } | null>;
  setEmail(userId: string, id: string, email: string): Promise<ApplicationWithJob | null>;
}

export interface JobsService {
  refresh(userId: string): Promise<void>;
  rematch(userId: string): Promise<void>;
}

export interface JobLinksService {
  addFromUrl(userId: string, link: JobLink): Promise<AddJobLinkResult>;
  listFetches(userId: string): Promise<JobFetch[]>;
}

export interface GmailService {
  startConnect(userId: string, returnTo?: GmailReturnTarget): Promise<string>;
  finishConnect(input: { code?: string; state?: string; error?: string }): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** 'app' only for a state this server signed for a flow started in the phone app. */
  returnTarget(state: string | undefined): GmailReturnTarget;
  status(userId: string): Promise<GmailStatus>;
  disconnect(userId: string): Promise<void>;
}

export interface SendingService {
  send(userId: string, id: string, input: { to?: string; confirmGuess?: boolean }): Promise<ApplicationWithJob>;
}

export interface FollowUpsService {
  list(userId: string, status?: FollowUp['status']): Promise<FollowUpWithJob[]>;
  update(userId: string, id: string, patch: { subject?: string; body?: string }): Promise<FollowUp | null>;
  send(userId: string, id: string): Promise<FollowUp>;
  dismiss(userId: string, id: string): Promise<FollowUp | null>;
}

export interface AppDeps {
  webOrigin: string;
  getUser: GetUser;
  profiles: ProfileRepo;
  cv: { upload(userId: string, file: { buffer: Buffer; originalname?: string }): Promise<{ characters: number }> };
  applications: ApplicationsService;
  jobs: JobsService;
  jobLinks: JobLinksService;
  gmail: GmailService;
  sending: SendingService;
  followUps: FollowUpsService;
}
