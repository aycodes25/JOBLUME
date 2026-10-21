import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

/** Mounted after requireAuth: any signed-in user may read the shared scan status. */
export function scanRoutes(d: Pick<AppDeps, 'scan'>) {
  const router = Router();

  router.get('/status', asyncHandler(async (_req, res) => {
    res.json(await d.scan.status());
  }));

  return router;
}
