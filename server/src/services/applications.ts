import type { ApplicationStatus } from '../db/types.js';
import type { ApplicationsRepo, ApplicationsService } from '../api/deps.js';
import { planStatusChange } from './application-status.js';
import { computeAnalytics } from './analytics.js';
import { ApiError } from '../lib/errors.js';
import { manualEmailChanges, nextCandidateChanges } from './email/choose.js';

const EMAIL_EDITABLE = new Set(['pending_review', 'approved']);

export function createApplicationsService(deps: {
  repo: ApplicationsRepo;
  renderPdf(text: string): Promise<Uint8Array>;
  uploadPdf(path: string, bytes: Uint8Array): Promise<string>;
  signUrl(path: string): Promise<string>;
  now?: () => Date;
}): ApplicationsService {
  return {
    list: (userId: string, status?: ApplicationStatus) => deps.repo.list(userId, status),

    async get(userId, id) {
      const app = await deps.repo.get(userId, id);
      if (!app) return null;
      let cv_pdf_url: string | null = null;
      if (app.tailored_cv_url) {
        try {
          cv_pdf_url = await deps.signUrl(app.tailored_cv_url);
        } catch {
          cv_pdf_url = null;
        }
      }
      return { ...app, cv_pdf_url };
    },

    async update(userId, id, patch) {
      const existing = await deps.repo.get(userId, id);
      if (!existing) return null;
      const changes: Record<string, unknown> = {};
      if (patch.tailored_cv_text !== undefined) changes.tailored_cv_text = patch.tailored_cv_text;
      if (patch.cover_letter_text !== undefined) changes.cover_letter_text = patch.cover_letter_text;
      if (patch.tailored_cv_text !== undefined && patch.tailored_cv_text !== existing.tailored_cv_text) {
        const pdf = await deps.renderPdf(patch.tailored_cv_text);
        changes.tailored_cv_url = await deps.uploadPdf(`${userId}/tailored/${existing.job_id}.pdf`, pdf);
      }
      return deps.repo.update(userId, id, changes);
    },

    async setStatus(userId, id, status) {
      const existing = await deps.repo.get(userId, id);
      if (!existing) return null;
      const now = deps.now ? deps.now() : new Date();
      return deps.repo.update(userId, id, planStatusChange(existing, status, now));
    },

    async nextEmail(userId, id) {
      const existing = await deps.repo.get(userId, id);
      if (!existing) return null;
      if (!EMAIL_EDITABLE.has(existing.status)) throw new ApiError(409, 'already_sent', 'This application is no longer pending');
      const plan = nextCandidateChanges(existing);
      if (plan.exhausted) return { exhausted: true, application: existing };
      const application = await deps.repo.update(userId, id, plan.changes);
      return application ? { exhausted: false, application } : null;
    },

    async setEmail(userId, id, email) {
      const existing = await deps.repo.get(userId, id);
      if (!existing) return null;
      if (!EMAIL_EDITABLE.has(existing.status)) throw new ApiError(409, 'already_sent', 'This application is no longer pending');
      return deps.repo.update(userId, id, manualEmailChanges(email));
    },

    async analytics(userId) {
      return computeAnalytics(await deps.repo.listForAnalytics(userId));
    },
  };
}
