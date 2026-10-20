import type { GmailStatus } from '@joblume/shared';
import { decrypt, encrypt } from '../../lib/crypto.js';
import { ApiError } from '../../lib/errors.js';
import type { GmailConfig } from './config.js';

export interface GmailTokenStore {
  get(userId: string): Promise<{ encryptedToken: string | null; email: string | null }>;
  save(userId: string, value: { encryptedToken: string; email: string; connectedAt: string }): Promise<void>;
  clear(userId: string): Promise<void>;
}

export interface GmailTokenDeps {
  store: GmailTokenStore;
  cfg: GmailConfig | null;
  encryptionKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const EXPIRY_MARGIN_MS = 60_000;

export function createGmailTokens(deps: GmailTokenDeps) {
  const doFetch: typeof fetch = deps.fetchImpl ?? ((...args) => fetch(...args));
  const now = deps.now ?? Date.now;
  const cache = new Map<string, { accessToken: string; email: string; expiresAt: number }>();

  const requireCfg = (): GmailConfig => {
    if (!deps.cfg) throw new ApiError(503, 'gmail_not_configured', 'Gmail is not configured on this server');
    return deps.cfg;
  };

  async function dropConnection(userId: string): Promise<void> {
    cache.delete(userId);
    await deps.store.clear(userId);
  }

  return {
    async connect(userId: string, value: { refreshToken: string; email: string }): Promise<void> {
      requireCfg();
      cache.delete(userId);
      await deps.store.save(userId, {
        encryptedToken: encrypt(value.refreshToken, deps.encryptionKey),
        email: value.email,
        connectedAt: new Date(now()).toISOString(),
      });
    },

    async status(userId: string): Promise<GmailStatus> {
      const { encryptedToken, email } = await deps.store.get(userId);
      const connected = encryptedToken !== null;
      return { configured: deps.cfg !== null, connected, email: connected ? email : null };
    },

    async isConnected(userId: string): Promise<boolean> {
      return (await deps.store.get(userId)).encryptedToken !== null;
    },

    async getAccessToken(userId: string): Promise<{ accessToken: string; email: string }> {
      const cached = cache.get(userId);
      if (cached && cached.expiresAt > now() + EXPIRY_MARGIN_MS) return { accessToken: cached.accessToken, email: cached.email };

      const cfg = requireCfg();
      const { encryptedToken, email } = await deps.store.get(userId);
      if (!encryptedToken || !email) throw new ApiError(409, 'gmail_not_connected', 'Gmail is not connected');

      let refreshToken: string;
      try {
        refreshToken = decrypt(encryptedToken, deps.encryptionKey);
      } catch {
        await dropConnection(userId);
        throw new ApiError(409, 'gmail_reauth_required', 'Reconnect Gmail');
      }

      let res: Response;
      try {
        res = await doFetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }).toString(),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new ApiError(502, 'send_failed', 'Could not reach Google');
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (body?.error === 'invalid_grant') {
          await dropConnection(userId);
          throw new ApiError(409, 'gmail_reauth_required', 'Reconnect Gmail');
        }
        throw new ApiError(502, 'send_failed', 'Google refused the request');
      }

      let data: { access_token?: string; expires_in?: number };
      try {
        data = (await res.json()) as { access_token?: string; expires_in?: number };
      } catch {
        throw new ApiError(502, 'send_failed', 'Google sent an unreadable response');
      }
      if (typeof data !== 'object' || data === null) throw new ApiError(502, 'send_failed', 'Google sent an unreadable response');
      if (!data.access_token) throw new ApiError(502, 'send_failed', 'Google sent no access token');
      cache.set(userId, { accessToken: data.access_token, email, expiresAt: now() + (data.expires_in ?? 3600) * 1000 });
      return { accessToken: data.access_token, email };
    },

    async disconnect(userId: string): Promise<void> {
      const { encryptedToken } = await deps.store.get(userId);
      if (!encryptedToken) return;
      try {
        const refreshToken = decrypt(encryptedToken, deps.encryptionKey);
        await doFetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: refreshToken }).toString(),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        /* revoking is best effort: the local token is removed regardless */
      }
      await dropConnection(userId);
    },
  };
}

export type GmailTokens = ReturnType<typeof createGmailTokens>;
