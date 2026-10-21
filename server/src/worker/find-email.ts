import type { ApplicationStatus, EmailCandidate, EmailSource } from '@joblume/shared';
import { extractContacts } from '../domain/contacts.js';
import { postingCandidates } from '../services/email/candidates.js';
import type { FindEmailJobData } from '../queues.js';

export interface FindEmailDeps {
  loadApplication(id: string): Promise<{
    id: string;
    user_id: string;
    status: ApplicationStatus;
    email_candidates: EmailCandidate[];
    email_source?: EmailSource | null;
    whatsapp_number?: string | null;
    job: { company: string; company_domain: string | null; description?: string | null } | null;
  } | null>;
  find(input: { company: string; knownDomain: string | null }): Promise<EmailCandidate[]>;
  /** Resolves true only when a row was actually updated. The write is conditional: still pending and no email source chosen yet. */
  saveCandidates(id: string, changes: Record<string, unknown>): Promise<boolean>;
  afterFound?(applicationId: string): Promise<void>;
}

export async function runFindEmail({ applicationId }: FindEmailJobData, d: FindEmailDeps): Promise<'found' | 'none' | 'skipped'> {
  const app = await d.loadApplication(applicationId);
  if (!app || !app.job) return 'skipped';
  // A manual or Hunter address (or any stored candidate) is never replaced.
  if (app.status !== 'pending_review' || app.email_candidates.length > 0 || app.email_source) return 'skipped';

  const posted = extractContacts(app.job.description ?? '');
  const whatsapp = app.whatsapp_number ? {} : posted.whatsapp[0] ? { whatsapp_number: posted.whatsapp[0] } : {};

  // An address the employer printed beats any lookup, and Hunter's quota is only spent when the posting has none.
  const fromPosting = postingCandidates(posted.emails);
  const candidates = fromPosting.length > 0 ? fromPosting : await d.find({ company: app.job.company, knownDomain: app.job.company_domain });
  const best = candidates[0];
  if (!best) {
    if (Object.keys(whatsapp).length > 0) await d.saveCandidates(app.id, whatsapp);
    return 'none';
  }

  const saved = await d.saveCandidates(app.id, {
    email_candidates: candidates,
    hiring_manager_email: best.email,
    email_confidence: best.confidence,
    email_source: best.source,
    ...whatsapp,
  });
  if (!saved) return 'skipped';
  await d.afterFound?.(app.id);
  return 'found';
}
