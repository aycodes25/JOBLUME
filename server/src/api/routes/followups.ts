import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { ApiError } from '../../lib/errors.js';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

const statusSchema = z.enum(['pending_review', 'sent', 'dismissed', 'failed']);
const patchSchema = z
  .object({ subject: z.string().trim().min(3).max(200), body: z.string().trim().min(40).max(2000) })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide a subject and/or a body');

const idSchema = z.string().uuid();
const parseId = (raw: unknown): string => {
  const r = idSchema.safeParse(raw);
  if (!r.success) throw new ApiError(404, 'follow_up_not_found');
  return r.data;
};

export function followUpRoutes(d: Pick<AppDeps, 'followUps'>) {
  const router = Router();
  const sendLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    keyGenerator: (req) => req.user!.id,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited' },
  });

  router.get('/', asyncHandler(async (req, res) => {
    const status = req.query.status === undefined ? 'pending_review' : statusSchema.parse(req.query.status);
    res.json(await d.followUps.list(req.user!.id, status));
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const patch = patchSchema.parse(req.body);
    const followUp = await d.followUps.update(req.user!.id, id, patch);
    if (!followUp) throw new ApiError(404, 'follow_up_not_found');
    res.json(followUp);
  }));

  router.post('/:id/send', sendLimiter, asyncHandler(async (req, res) => {
    res.json(await d.followUps.send(req.user!.id, parseId(req.params.id)));
  }));

  router.post('/:id/dismiss', asyncHandler(async (req, res) => {
    const followUp = await d.followUps.dismiss(req.user!.id, parseId(req.params.id));
    if (!followUp) throw new ApiError(404, 'follow_up_not_found');
    res.json(followUp);
  }));

  return router;
}
