import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../../lib/errors.js';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

const statusSchema = z.enum(['pending_review', 'approved', 'applied', 'interviewing', 'rejected', 'offer', 'skipped']);
const patchSchema = z
  .object({ tailored_cv_text: z.string().min(50).max(30_000), cover_letter_text: z.string().trim().min(1).max(10_000) })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide tailored_cv_text and/or cover_letter_text');

const idSchema = z.string().uuid();
const parseId = (raw: unknown): string => {
  const r = idSchema.safeParse(raw);
  if (!r.success) throw new ApiError(404, 'application_not_found');
  return r.data;
};

export function applicationRoutes(d: Pick<AppDeps, 'applications'>) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const status = req.query.status === undefined ? undefined : statusSchema.parse(req.query.status);
    res.json(await d.applications.list(req.user!.id, status));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const app = await d.applications.get(req.user!.id, parseId(req.params.id));
    if (!app) throw new ApiError(404, 'application_not_found');
    res.json(app);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const patch = patchSchema.parse(req.body);
    const app = await d.applications.update(req.user!.id, id, patch);
    if (!app) throw new ApiError(404, 'application_not_found');
    res.json(app);
  }));

  return router;
}
