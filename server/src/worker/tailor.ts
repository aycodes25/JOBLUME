import type { JobRow, ProfileRow } from '../db/types.js';
import type { TailorInput, TailorResult } from '../services/ai/tailor.js';
import type { TailorJobData } from '../queues.js';

export interface NewApplication {
  user_id: string;
  job_id: string;
  tailored_cv_text: string;
  tailored_cv_url: string;
  cover_letter_text: string;
  match_score: number;
  missing_keywords: string[];
  status: 'pending_review';
}

export interface TailorDeps {
  loadJob(id: string): Promise<JobRow | null>;
  loadProfile(userId: string): Promise<ProfileRow | null>;
  applicationExists(userId: string, jobId: string): Promise<boolean>;
  tailor(input: TailorInput): Promise<TailorResult>;
  renderPdf(text: string): Promise<Uint8Array>;
  uploadPdf(path: string, bytes: Uint8Array): Promise<string>;
  insertApplication(row: NewApplication): Promise<void>;
}

export async function runTailor({ userId, jobId }: TailorJobData, d: TailorDeps): Promise<'created' | 'skipped'> {
  if (await d.applicationExists(userId, jobId)) return 'skipped';
  const [job, profile] = await Promise.all([d.loadJob(jobId), d.loadProfile(userId)]);
  if (!job || !profile || !profile.base_cv_text) return 'skipped';

  const result = await d.tailor({
    cvText: profile.base_cv_text,
    job: { title: job.title, company: job.company, location: job.location, description: job.description },
    profile: { skills: profile.skills, yearsExperience: profile.years_experience, location: profile.location },
  });

  const pdf = await d.renderPdf(result.tailored_cv_text);
  const path = await d.uploadPdf(`${userId}/tailored/${jobId}.pdf`, pdf);

  await d.insertApplication({
    user_id: userId,
    job_id: jobId,
    tailored_cv_text: result.tailored_cv_text,
    tailored_cv_url: path,
    cover_letter_text: result.cover_letter_text,
    match_score: result.match_score_0_to_100,
    missing_keywords: result.missing_keywords,
    status: 'pending_review',
  });
  return 'created';
}
