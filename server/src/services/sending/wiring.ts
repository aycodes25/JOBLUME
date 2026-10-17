import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { ApplicationsRepo, ApplicationWithJob } from '../../api/deps.js';
import type { Db } from '../../lib/supabase.js';
import { sendGmailMessage } from '../gmail/send.js';
import type { GmailTokens } from '../gmail/tokens.js';
import { downloadFile } from '../storage.js';
import { sendApplication, type SendDeps, type SendInput } from './send-application.js';

export function createSendDeps(d: {
  db: Db;
  redis: Pick<Redis, 'set' | 'del'>;
  tokens: GmailTokens;
  applicationsRepo: ApplicationsRepo;
  now?: () => Date;
}): SendDeps {
  const { db } = d;
  return {
    loadApplication: (userId, id) => d.applicationsRepo.get(userId, id),
    async loadProfile(userId) {
      const { data, error } = await db.from('profiles').select('daily_cap').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return (data as { daily_cap: number } | null) ?? null;
    },
    async appliedToday(userId) {
      const { data, error } = await db.rpc('applications_applied_today', { uid: userId });
      if (error) throw error;
      return Number(data ?? 0);
    },
    async hasSentApplicationEmail(applicationId) {
      const { count, error } = await db
        .from('email_logs')
        .select('id', { count: 'exact', head: true })
        .eq('application_id', applicationId)
        .eq('type', 'application')
        .eq('status', 'sent');
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    isGmailConnected: (userId) => d.tokens.isConnected(userId),
    getAccessToken: (userId) => d.tokens.getAccessToken(userId),
    downloadPdf: (path) => downloadFile(db, path),
    sendMessage: (args) => sendGmailMessage(args),
    lock: {
      acquire: async (key, ttlSeconds) => (await d.redis.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK',
      release: async (key) => {
        await d.redis.del(key);
      },
    },
    saveSent: (userId, id, changes) => d.applicationsRepo.update(userId, id, changes),
    async logEmail(row) {
      const { error } = await db.from('email_logs').insert(row);
      if (error) throw error;
    },
    now: d.now ?? (() => new Date()),
    newMessageId: (fromEmail) => `<${randomUUID()}@${fromEmail.split('@')[1] ?? 'joblume.app'}>`,
  };
}

export function createSendingService(d: Parameters<typeof createSendDeps>[0]) {
  const deps = createSendDeps(d);
  return {
    send: (userId: string, id: string, input: { to?: string; confirmGuess?: boolean }): Promise<ApplicationWithJob> =>
      sendApplication(userId, id, { ...input, method: 'email' } satisfies SendInput, deps),
    sendAuto: (userId: string, id: string): Promise<ApplicationWithJob> =>
      sendApplication(userId, id, { method: 'auto' }, deps),
  };
}
