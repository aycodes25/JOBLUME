import type { Db } from '../../lib/supabase.js';
import type { GmailTokenStore } from './tokens.js';

export function createGmailTokenStore(db: Db): GmailTokenStore {
  return {
    async get(userId) {
      const { data, error } = await db.from('users').select('gmail_refresh_token_enc, gmail_email').eq('id', userId).maybeSingle();
      if (error) throw error;
      const row = data as { gmail_refresh_token_enc: string | null; gmail_email: string | null } | null;
      return { encryptedToken: row?.gmail_refresh_token_enc ?? null, email: row?.gmail_email ?? null };
    },
    async save(userId, value) {
      const { error } = await db
        .from('users')
        .update({ gmail_refresh_token_enc: value.encryptedToken, gmail_email: value.email, gmail_connected_at: value.connectedAt })
        .eq('id', userId);
      if (error) throw error;
    },
    async clear(userId) {
      const { error } = await db
        .from('users')
        .update({ gmail_refresh_token_enc: null, gmail_email: null, gmail_connected_at: null })
        .eq('id', userId);
      if (error) throw error;
    },
  };
}
