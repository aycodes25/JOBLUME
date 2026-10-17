import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

export function analyticsRoutes(d: Pick<AppDeps, 'applications'>) {
  const router = Router();
  router.get('/', asyncHandler(async (req, res) => {
    res.json(await d.applications.analytics(req.user!.id));
  }));
  return router;
}
