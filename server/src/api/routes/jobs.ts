import { canonicalJobUrl, MAX_JOB_LINK_LENGTH } from '@joblume/shared';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { ApiError } from '../../lib/errors.js';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

const jobLinkBody = z.object({ url: z.string().trim().min(1).max(MAX_JOB_LINK_LENGTH) }).strict();

const perUserPerHour = (limit: number) =>
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit,
    keyGenerator: (req) => req.user!.id,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited' },
  });

export function jobRoutes(d: Pick<AppDeps, 'jobs' | 'jobLinks'>) {
  const router = Router();

  router.post('/refresh', perUserPerHour(3), asyncHandler(async (req, res) => {
    await d.jobs.refresh(req.user!.id);
    res.status(202).json({ queued: true });
  }));

  router.post('/from-url', perUserPerHour(10), asyncHandler(async (req, res) => {
    const { url } = jobLinkBody.parse(req.body);
    const link = canonicalJobUrl(url);
    if (!link) throw new ApiError(400, 'unsupported_job_link', 'Paste a LinkedIn or Indeed job link');
    const result = await d.jobLinks.addFromUrl(req.user!.id, link);
    res.status('job_id' in result ? 200 : 202).json(result);
  }));

  router.get('/fetches', asyncHandler(async (req, res) => {
    res.json(await d.jobLinks.listFetches(req.user!.id));
  }));

  return router;
}
