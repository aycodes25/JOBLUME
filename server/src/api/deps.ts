import { z } from 'zod';
import type { ApplicationRow, ApplicationStatus, ProfileRow } from '../db/types.js';
import type { GetUser } from './auth.js';

export const profilePatchSchema = z
  .object({
    skills: z.array(z.string().trim().min(1).max(60)).max(100),
    years_experience: z.number().int().min(0).max(60).nullable(),
    desired_roles: z.array(z.string().trim().min(2).max(80)).max(20),
    location: z.enum(['Lagos', 'Abuja', 'Remote']).nullable(),
    salary_min: z.number().int().min(0).nullable(),
    salary_max: z.number().int().min(0).nullable(),
    apply_mode: z.enum(['manual', 'auto']),
    auto_threshold: z.number().int().min(0).max(100),
    daily_cap: z.number().int().min(1).max(20),
    auto_followup: z.boolean(),
  })
  .partial()
  .strict();
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

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
}

export interface ApplicationsService {
  list(userId: string, status?: ApplicationStatus): Promise<ApplicationWithJob[]>;
  get(userId: string, id: string): Promise<(ApplicationWithJob & { cv_pdf_url: string | null }) | null>;
  update(userId: string, id: string, patch: { tailored_cv_text?: string; cover_letter_text?: string }): Promise<ApplicationWithJob | null>;
}

export interface JobsService {
  refresh(userId: string): Promise<void>;
  rematch(userId: string): Promise<void>;
}

export interface AppDeps {
  webOrigin: string;
  getUser: GetUser;
  profiles: ProfileRepo;
  cv: { upload(userId: string, file: { buffer: Buffer }): Promise<{ characters: number }> };
  applications: ApplicationsService;
  jobs: JobsService;
}
