import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { ApiError } from '../../lib/errors.js';
import type { GmailService } from '../../api/deps.js';
import type { GmailConfig } from './config.js';
import { buildAuthUrl, exchangeCode, GmailAuthError, signState, verifyState } from './oauth.js';
import type { GmailTokens } from './tokens.js';

const STATE_TTL_SECONDS = 10 * 60;

export function createGmailService(deps: {
  cfg: GmailConfig | null;
  tokens: GmailTokens;
  encryptionKey: string;
  /** Holds a one-time marker per issued state, so a state can be used for exactly one callback. */
  redis: Pick<Redis, 'set' | 'del'>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): GmailService {
  const now = deps.now ?? Date.now;
  const stateKey = (state: string) => `gmail-oauth-state:${createHash('sha256').update(state).digest('hex')}`;
  return {
    async startConnect(userId) {
      if (!deps.cfg) throw new ApiError(503, 'gmail_not_configured', 'Gmail is not configured on this server');
      const state = signState(userId, deps.encryptionKey, now());
      await deps.redis.set(stateKey(state), userId, 'EX', STATE_TTL_SECONDS, 'NX');
      return buildAuthUrl(deps.cfg, state);
    },

    async finishConnect({ code, state, error }) {
      if (!deps.cfg) return { ok: false, reason: 'not_configured' };
      if (error) return { ok: false, reason: 'denied' };
      if (!code || !state) return { ok: false, reason: 'invalid_state' };
      const verified = verifyState(state, deps.encryptionKey, now());
      if (!verified) return { ok: false, reason: 'invalid_state' };
      // Single use: only the first callback for a state removes its marker; replays and unknown states are refused.
      if ((await deps.redis.del(stateKey(state))) !== 1) return { ok: false, reason: 'invalid_state' };
      try {
        const { refreshToken, email } = await exchangeCode(deps.cfg, code, deps.fetchImpl);
        await deps.tokens.connect(verified.userId, { refreshToken, email });
        return { ok: true };
      } catch (err) {
        if (err instanceof GmailAuthError) return { ok: false, reason: err.code };
        throw err;
      }
    },

    status: (userId) => deps.tokens.status(userId),
    disconnect: (userId) => deps.tokens.disconnect(userId),
  };
}
