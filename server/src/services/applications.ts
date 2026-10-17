import type { ApplicationStatus } from '../db/types.js';
import type { ApplicationsRepo, ApplicationsService } from '../api/deps.js';

export function createApplicationsService(deps: {
  repo: ApplicationsRepo;
  renderPdf(text: string): Promise<Uint8Array>;
  uploadPdf(path: string, bytes: Uint8Array): Promise<string>;
  signUrl(path: string): Promise<string>;
}): ApplicationsService {
  return {
    list: (userId: string, status?: ApplicationStatus) => deps.repo.list(userId, status),

    async get(userId, id) {
      const app = await deps.repo.get(userId, id);
      if (!app) return null;
      return { ...app, cv_pdf_url: app.tailored_cv_url ? await deps.signUrl(app.tailored_cv_url) : null };
    },

    async update(userId, id, patch) {
      const existing = await deps.repo.get(userId, id);
      if (!existing) return null;
      const changes: Record<string, unknown> = { ...patch };
      if (patch.tailored_cv_text !== undefined && patch.tailored_cv_text !== existing.tailored_cv_text) {
        const pdf = await deps.renderPdf(patch.tailored_cv_text);
        changes.tailored_cv_url = await deps.uploadPdf(`${userId}/tailored/${existing.job_id}.pdf`, pdf);
      }
      return deps.repo.update(userId, id, changes);
    },
  };
}
