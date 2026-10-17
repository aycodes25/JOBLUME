import { ApiError } from '../../lib/errors.js';
import type { GmailService } from '../../api/deps.js';
import type { GmailConfig } from './config.js';
import { buildAuthUrl, exchangeCode, GmailAuthError, signState, verifyState } from './oauth.js';
import type { GmailTokens } from './tokens.js';

export function createGmailService(deps: {
  cfg: GmailConfig | null;
  tokens: GmailTokens;
  encryptionKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): GmailService {
  const now = deps.now ?? Date.now;
  return {
    startConnect(userId) {
      if (!deps.cfg) throw new ApiError(503, 'gmail_not_configured', 'Gmail is not configured on this server');
      return buildAuthUrl(deps.cfg, signState(userId, deps.encryptionKey, now()));
    },

    async finishConnect({ code, state, error }) {
      if (!deps.cfg) return { ok: false, reason: 'not_configured' };
      if (error) return { ok: false, reason: 'denied' };
      if (!code || !state) return { ok: false, reason: 'invalid_state' };
      const verified = verifyState(state, deps.encryptionKey, now());
      if (!verified) return { ok: false, reason: 'invalid_state' };
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
