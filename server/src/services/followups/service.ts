import type { FollowUp, FollowUpWithJob } from '@joblume/shared';
import type { FollowUpsService } from '../../api/deps.js';
import { ApiError } from '../../lib/errors.js';

export interface FollowUpsRepo {
  listForUser(userId: string, status?: FollowUp['status']): Promise<FollowUpWithJob[]>;
  getForUser(userId: string, id: string): Promise<FollowUp | null>;
  updateForUser(userId: string, id: string, patch: Record<string, unknown>): Promise<FollowUp | null>;
}

export function createFollowUpsService(deps: {
  repo: FollowUpsRepo;
  send(userId: string, id: string): Promise<void>;
}): FollowUpsService {
  const pendingOrThrow = async (userId: string, id: string): Promise<FollowUp | null> => {
    const existing = await deps.repo.getForUser(userId, id);
    if (existing && existing.status !== 'pending_review') throw new ApiError(409, 'already_sent', 'This follow-up was already handled');
    return existing;
  };

  return {
    list: (userId, status) => deps.repo.listForUser(userId, status),

    async update(userId, id, patch) {
      if (!(await pendingOrThrow(userId, id))) return null;
      return deps.repo.updateForUser(userId, id, patch);
    },

    async send(userId, id) {
      if (!(await deps.repo.getForUser(userId, id))) throw new ApiError(404, 'follow_up_not_found');
      await deps.send(userId, id);
      const refreshed = await deps.repo.getForUser(userId, id);
      if (!refreshed) throw new ApiError(404, 'follow_up_not_found');
      return refreshed;
    },

    async dismiss(userId, id) {
      if (!(await pendingOrThrow(userId, id))) return null;
      return deps.repo.updateForUser(userId, id, { status: 'dismissed' });
    },
  };
}
