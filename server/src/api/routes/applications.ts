import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { APPLICATION_STATUSES } from '@joblume/shared';
import { z } from 'zod';
import { ApiError } from '../../lib/errors.js';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

const statusSchema = z.enum(APPLICATION_STATUSES);
const patchSchema = z
  .object({ tailored_cv_text: z.string().min(50).max(30_000), cover_letter_text: z.string().trim().min(1).max(10_000) })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide tailored_cv_text and/or cover_letter_text');

const statusBodySchema = z.object({ status: statusSchema }).strict();

const sendBodySchema = z
  .object({ to: z.string().trim().toLowerCase().email().max(254).optional(), confirmGuess: z.boolean().optional() })
  .strict();

const emailBodySchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict();

const idSchema = z.string().uuid();
const parseId = (raw: unknown): string => {
  const r = idSchema.safeParse(raw);
  if (!r.success) throw new ApiError(404, 'application_not_found');
  return r.data;
};

export function applicationRoutes(d: Pick<AppDeps, 'applications' | 'sending' | 'autofill'>) {
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

  // The payload carries a signed CV link, so it is never cached.
  router.get('/:id/autofill', asyncHandler(async (req, res) => {
    const payload = await d.autofill.get(req.user!, parseId(req.params.id));
    if (!payload) throw new ApiError(404, 'application_not_found');
    res.set('Cache-Control', 'no-store');
    res.json(payload);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const patch = patchSchema.parse(req.body);
    const app = await d.applications.update(req.user!.id, id, patch);
    if (!app) throw new ApiError(404, 'application_not_found');
    res.json(app);
  }));

  router.patch('/:id/status', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { status } = statusBodySchema.parse(req.body);
    const app = await d.applications.setStatus(req.user!.id, id, status);
    if (!app) throw new ApiError(404, 'application_not_found');
    res.json(app);
  }));

  const sendLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    keyGenerator: (req) => req.user!.id,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited' },
  });

  router.post('/:id/send', sendLimiter, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const input = sendBodySchema.parse(req.body ?? {});
    res.json(await d.sending.send(req.user!.id, id, input));
  }));

  router.post('/:id/email/next', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const result = await d.applications.nextEmail(req.user!.id, id);
    if (!result) throw new ApiError(404, 'application_not_found');
    res.json(result);
  }));

  router.put('/:id/email', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { email } = emailBodySchema.parse(req.body);
    const app = await d.applications.setEmail(req.user!.id, id, email);
    if (!app) throw new ApiError(404, 'application_not_found');
    res.json(app);
  }));

  return router;
}
