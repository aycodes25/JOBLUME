import { Router } from 'express';
import { logger } from '../../lib/logger.js';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

/** Public: Google redirects the browser here. Protected by the signed state, not a bearer token. */
export function gmailCallbackRoutes(d: Pick<AppDeps, 'gmail' | 'webOrigin'>) {
  const router = Router();
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

  router.get('/callback', asyncHandler(async (req, res) => {
    let result: { ok: true } | { ok: false; reason: string };
    try {
      result = await d.gmail.finishConnect({ code: str(req.query.code), state: str(req.query.state), error: str(req.query.error) });
    } catch (err) {
      logger.error({ err }, 'gmail callback failed');
      result = { ok: false, reason: 'server_error' };
    }
    const target = new URL('/settings', d.webOrigin);
    target.searchParams.set('gmail', result.ok ? 'connected' : 'error');
    if (!result.ok) target.searchParams.set('reason', result.reason);
    res.redirect(302, target.toString());
  }));
  return router;
}

export function gmailRoutes(d: Pick<AppDeps, 'gmail'>) {
  const router = Router();

  router.post('/connect', asyncHandler(async (req, res) => {
    res.json({ url: await d.gmail.startConnect(req.user!.id) });
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
