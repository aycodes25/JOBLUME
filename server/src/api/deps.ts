import { profilePatchSchema, type ProfilePatch } from '@joblume/shared';
import type { Analytics, GmailStatus } from '@joblume/shared';
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
}

export interface JobsService {
  refresh(userId: string): Promise<void>;
  rematch(userId: string): Promise<void>;
}

export interface GmailService {
  startConnect(userId: string): string;
  finishConnect(input: { code?: string; state?: string; error?: string }): Promise<{ ok: true } | { ok: false; reason: string }>;
  status(userId: string): Promise<GmailStatus>;
  disconnect(userId: string): Promise<void>;
}

export interface SendingService {
  send(userId: string, id: string, input: { to?: string; confirmGuess?: boolean }): Promise<ApplicationWithJob>;
}

export interface AppDeps {
  webOrigin: string;
  getUser: GetUser;
  profiles: ProfileRepo;
  cv: { upload(userId: string, file: { buffer: Buffer; originalname?: string }): Promise<{ characters: number }> };
  applications: ApplicationsService;
  jobs: JobsService;
  gmail: GmailService;
  sending: SendingService;
}
