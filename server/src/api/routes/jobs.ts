import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

export function jobRoutes(d: Pick<AppDeps, 'jobs'>) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 3,
    keyGenerator: (req) => req.user!.id,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited' },
  });
  router.post('/refresh', limiter, asyncHandler(async (req, res) => {
    await d.jobs.refresh(req.user!.id);
    res.status(202).json({ queued: true });
  }));
  return router;
}
