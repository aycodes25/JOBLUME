import { Router } from 'express';
import { asyncHandler } from '../errors.js';
import { profilePatchSchema, type AppDeps } from '../deps.js';
import { ApiError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export function profileRoutes(d: Pick<AppDeps, 'profiles' | 'jobs'>) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const profile = await d.profiles.get(req.user!.id);
    if (!profile) throw new ApiError(404, 'profile_not_found');
    res.json(profile);
  }));

  router.put('/', asyncHandler(async (req, res) => {
    const patch = profilePatchSchema.parse(req.body);
    const updated = await d.profiles.update(req.user!.id, patch);
    d.jobs.rematch(req.user!.id).catch((err) => logger.warn({ err }, 'rematch after profile update failed'));
    res.json(updated);
  }));

  return router;
}
