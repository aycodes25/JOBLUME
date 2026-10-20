import { MOBILE_GMAIL_RETURN } from '@joblume/shared';
import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

/** Public: Google redirects the browser here. Protected by the signed state, not a bearer token. */
export function gmailCallbackRoutes(d: Pick<AppDeps, 'gmail' | 'webOrigin'>) {
  const router = Router();
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

  router.get('/callback', asyncHandler(async (req, res) => {
    const state = str(req.query.state);
    let result: { ok: true } | { ok: false; reason: string };
    try {
      result = await d.gmail.finishConnect({ code: str(req.query.code), state, error: str(req.query.error) });
    } catch (err) {
      logger.error({ err }, 'gmail callback failed');
      result = { ok: false, reason: 'server_error' };
    }
    // Only two targets exist: the web Settings page, or the fixed app deep link named in the signed state.
    let target: URL;
    if (d.gmail.returnTarget(state) === 'app') {
      target = new URL(MOBILE_GMAIL_RETURN);
      target.searchParams.set('status', result.ok ? 'connected' : 'error');
    } else {
      target = new URL('/settings', d.webOrigin);
      target.searchParams.set('gmail', result.ok ? 'connected' : 'error');
    }
    if (!result.ok) target.searchParams.set('reason', result.reason);
    res.redirect(302, target.toString());
  }));
  return router;
}

const connectBody = z.object({ return: z.literal(MOBILE_GMAIL_RETURN).optional() }).strict();

export function gmailRoutes(d: Pick<AppDeps, 'gmail'>) {
  const router = Router();

  router.post('/connect', asyncHandler(async (req, res) => {
    const body = connectBody.parse(req.body ?? {});
    const returnTo = body.return === MOBILE_GMAIL_RETURN ? 'app' : 'web';
    res.json({ url: await d.gmail.startConnect(req.user!.id, returnTo) });
  }));

  router.get('/status', asyncHandler(async (req, res) => {
    res.json(await d.gmail.status(req.user!.id));
  }));

  router.delete('/', asyncHandler(async (req, res) => {
    await d.gmail.disconnect(req.user!.id);
    res.json({ connected: false });
  }));

  return router;
}
