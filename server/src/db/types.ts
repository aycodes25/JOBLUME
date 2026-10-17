import type { ApplicationStatus } from '@joblume/shared';
export type { ApplicationStatus };

export type JobSourceName = 'linkedin' | 'indeed' | 'jobberman' | 'myjobmag' | 'remotive';
export type ApplyMode = 'manual' | 'auto';

export interface JobRow {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  source: JobSourceName;
  url: string;
  company_domain: string | null;
  dedupe_key: string;
  created_at: string;
}

export interface ProfileRow {
  user_id: string;
  base_cv_text: string | null;
  base_cv_url: string | null;
  skills: string[];
  years_experience: number | null;
  desired_roles: string[];
  location: 'Lagos' | 'Abuja' | 'Remote' | null;
  salary_min: number | null;
  salary_max: number | null;
  apply_mode: ApplyMode;
  auto_threshold: number;
  daily_cap: number;
  auto_followup: boolean;
  updated_at: string;
}

export interface ApplicationRow {
  id: string;
  user_id: string;
  job_id: string;
  tailored_cv_text: string | null;
  tailored_cv_url: string | null;
  cover_letter_text: string | null;
  match_score: number | null;
  missing_keywords: string[];
  hiring_manager_email: string | null;
  email_confidence: number | null;
  apply_method: 'email' | 'assisted' | 'auto' | null;
  status: ApplicationStatus;
  applied_at: string | null;
  follow_up_at: string | null;
  created_at: string;
}
