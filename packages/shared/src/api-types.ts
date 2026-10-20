import type { JobFetchReason, JobFetchStatus } from './job-sources.js';
import type { ApplicationStatus } from './status.js';

export interface Profile {
  user_id: string;
  base_cv_text: string | null;
  base_cv_url: string | null;
  base_cv_filename: string | null;
  skills: string[];
  years_experience: number | null;
  desired_roles: string[];
  location: 'Lagos' | 'Abuja' | 'Remote' | null;
  salary_min: number | null;
  salary_max: number | null;
  apply_mode: 'manual' | 'auto';
  auto_threshold: number;
  daily_cap: number;
  auto_followup: boolean;
  notify_new_matches: boolean;
  updated_at: string;
}

export interface JobSummary {
  title: string;
  company: string;
  location: string;
  source: string;
  url: string;
  company_domain: string | null;
  /** When the source says the job was posted (ISO time). Missing or null: use the application's created_at. */
  posted_at?: string | null;
}

export interface Application {
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
  email_source: 'hunter' | 'guess' | 'manual' | null;
  email_candidates: EmailCandidate[];
  apply_method: 'email' | 'assisted' | 'auto' | null;
  status: ApplicationStatus;
  applied_at: string | null;
  follow_up_at: string | null;
  created_at: string;
  job: JobSummary | null;
}

export interface ApplicationDetail extends Application {
  cv_pdf_url: string | null;
}

export interface Analytics {
  total: number;
  by_status: Record<ApplicationStatus, number>;
  applied_ever: number;
  responded: number;
  response_rate: number;
  avg_match_score: number | null;
}

export interface CvUploadResult {
  characters: number;
}

export interface EmailCandidate {
  email: string;
  confidence: number;
  source: 'hunter' | 'guess';
  label: string;
  name?: string;
  position?: string;
}

export interface GmailStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
}

export interface FollowUp {
  id: string;
  application_id: string;
  subject: string;
  body: string;
  status: 'pending_review' | 'sent' | 'dismissed' | 'failed';
  created_at: string;
  sent_at: string | null;
}

export interface FollowUpWithJob extends FollowUp {
  job: { title: string; company: string } | null;
}

/** One job link the user pasted, as listed by GET /jobs/fetches. */
export interface JobFetch {
  id: string;
  url: string;
  status: JobFetchStatus;
  reason: JobFetchReason | null;
  job_id: string | null;
  created_at: string;
  updated_at: string;
}

/** POST /jobs/from-url: 202 { queued: true } for a new link, 200 { job_id } when the job is already stored. */
export type AddJobLinkResult = { queued: true } | { job_id: string };

/** One finished scan of one source, as listed by GET /scan/status. */
export interface ScanRun {
  /** A job board name ('myjobmag', 'remoteok', ...) or 'jsearch'. */
  source: string;
  started_at: string;
  finished_at: string;
  status: 'ok' | 'failed';
  /** A short reason when status is 'failed'. */
  error: string | null;
  listed: number;
  new_count: number;
  inserted: number;
  /** New jobs no user's roles matched on the title. */
  rejected_title: number;
  /** New jobs whose title matched somebody but whose place did not. */
  rejected_location: number;
}

/** GET /scan/status: the latest run per source and whether the worker has reported in lately. */
export interface ScanStatus {
  worker_alive: boolean;
  worker_last_seen: string | null;
  runs: ScanRun[];
}
