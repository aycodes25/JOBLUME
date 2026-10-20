import type { Application, ApplicationDetail, FollowUpWithJob, Profile } from '@joblume/shared';

/** Test data builders shared by the mobile tests. */
export const app = (over: Partial<Application> = {}): Application => ({
  id: 'a1',
  user_id: 'u1',
  job_id: 'j1',
  tailored_cv_text: 'Tailored CV text for the Data Analyst role at Acme, with SQL and Excel experience.',
  tailored_cv_url: 'u1/tailored/j1.pdf',
  cover_letter_text: 'Dear team, I would like to apply for the Data Analyst role at Acme.',
  match_score: 85,
  missing_keywords: [],
  hiring_manager_email: 'hr@acme.com',
  email_confidence: 90,
  email_source: 'hunter',
  email_candidates: [],
  apply_method: null,
  status: 'pending_review',
  applied_at: null,
  follow_up_at: null,
  created_at: '2026-10-18T10:00:00.000Z',
  job: { title: 'Data Analyst', company: 'Acme', location: 'Lagos', source: 'myjobmag', url: 'https://example.com/j', company_domain: null },
  ...over,
});

export const detail = (over: Partial<ApplicationDetail> = {}): ApplicationDetail => ({
  ...app(),
  cv_pdf_url: 'https://files.example.com/cv.pdf',
  ...over,
});

export const followUp = (over: Partial<FollowUpWithJob> = {}): FollowUpWithJob => ({
  id: 'f1',
  application_id: 'a1',
  subject: 'Following up on my application',
  body: 'Hello, I am following up on my application for the Data Analyst role. I remain very interested.',
  status: 'pending_review',
  created_at: '2026-10-18T10:00:00.000Z',
  sent_at: null,
  job: { title: 'Data Analyst', company: 'Acme' },
  ...over,
});

export const profile = (over: Partial<Profile> = {}): Profile => ({
  user_id: 'u1',
  base_cv_text: 'cv',
  base_cv_url: 'u1/base/cv.pdf',
  base_cv_filename: 'My CV.pdf',
  skills: ['SQL', 'Excel'],
  years_experience: 3,
  desired_roles: ['Data Analyst'],
  location: 'Lagos',
  salary_min: null,
  salary_max: null,
  apply_mode: 'manual',
  auto_threshold: 80,
  daily_cap: 10,
  auto_followup: false,
  updated_at: '2026-10-18T10:00:00.000Z',
  ...over,
});

/** A minimal successful TanStack Query result for mocked hooks. */
export const ok = <T,>(data: T) => ({ data, isLoading: false, error: null, refetch: jest.fn(), isRefetching: false });

/** A module replaced with jest.mock(path, () => ({ name: jest.fn(), ... })), typed for the test. */
export type Mocked<T> = { [K in keyof T]: jest.Mock };
