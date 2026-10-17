import type { ApplicationStatus, EmailCandidate } from '@joblume/shared';
import type { FindEmailJobData } from '../queues.js';

export interface FindEmailDeps {
  loadApplication(id: string): Promise<{
    id: string;
    user_id: string;
    status: ApplicationStatus;
    email_candidates: EmailCandidate[];
    job: { company: string; company_domain: string | null } | null;
  } | null>;
  find(input: { company: string; knownDomain: string | null }): Promise<EmailCandidate[]>;
  saveCandidates(id: string, changes: Record<string, unknown>): Promise<void>;
  afterFound?(applicationId: string): Promise<void>;
}

export async function runFindEmail({ applicationId }: FindEmailJobData, d: FindEmailDeps): Promise<'found' | 'none' | 'skipped'> {
  const app = await d.loadApplication(applicationId);
  if (!app || !app.job) return 'skipped';
  if (app.status !== 'pending_review' || app.email_candidates.length > 0) return 'skipped';

  const candidates = await d.find({ company: app.job.company, knownDomain: app.job.company_domain });
  const best = candidates[0];
  if (!best) return 'none';

  await d.saveCandidates(app.id, {
    email_candidates: candidates,
    hiring_manager_email: best.email,
    email_confidence: best.confidence,
    email_source: best.source,
  });
  await d.afterFound?.(app.id);
  return 'found';
}
