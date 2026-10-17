import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { ApplicationsRepo, ApplicationWithJob } from '../../api/deps.js';
import { logger } from '../../lib/logger.js';
import type { Db } from '../../lib/supabase.js';
import { sendGmailMessage } from '../gmail/send.js';
import type { GmailTokens } from '../gmail/tokens.js';
import { downloadFile } from '../storage.js';
import type { FollowUpRepo } from '../followups/repo.js';
import { sendFollowUp, type FollowUpSendDeps } from '../followups/send-followup.js';
import { sendApplication, type SendDeps, type SendInput } from './send-application.js';

const PDF_TIMEOUT_MS = 20_000;
const RELEASE_SCRIPT = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createSendDeps(d: {
  db: Db;
  redis: Pick<Redis, 'set' | 'eval'>;
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
    downloadPdf: (path) => withTimeout(downloadFile(db, path), PDF_TIMEOUT_MS),
    sendMessage: (args) => sendGmailMessage(args),
    lock: {
      acquire: async (key, ttlSeconds) => {
        const token = randomUUID();
        return (await d.redis.set(key, token, 'EX', ttlSeconds, 'NX')) === 'OK' ? token : null;
      },
      release: async (key, token) => {
        await d.redis.eval(RELEASE_SCRIPT, 1, key, token);
      },
    },
    saveSent: (userId, id, changes) => d.applicationsRepo.update(userId, id, changes),
    async logEmail(row) {
      const { error } = await db.from('email_logs').insert(row);
      if (error) throw error;
    },
    warn: (message, meta) => logger.warn(meta ?? {}, message),
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

export function createFollowUpSender(d: Parameters<typeof createSendDeps>[0] & { repo: FollowUpRepo }) {
  const base = createSendDeps(d);
  const deps: FollowUpSendDeps = {
    loadContext: (userId, id) => d.repo.loadSendContext(userId, id),
    loadProfile: base.loadProfile,
    followUpsSentToday: (userId) => d.repo.followUpsSentToday(userId),
    isGmailConnected: base.isGmailConnected,
    getAccessToken: base.getAccessToken,
    sendMessage: base.sendMessage,
    lock: base.lock,
    markSent: (followUpId, applicationId, sentAt) => d.repo.markSent(followUpId, applicationId, sentAt),
    markFailed: (followUpId) => d.repo.markFailed(followUpId),
    dismiss: (followUpId) => d.repo.dismiss(followUpId),
    logEmail: base.logEmail,
    now: base.now,
    newMessageId: base.newMessageId,
  };
  return {
    send: (userId: string, followUpId: string) => sendFollowUp(userId, followUpId, { automatic: false }, deps),
    sendAutomatic: (userId: string, followUpId: string) => sendFollowUp(userId, followUpId, { automatic: true }, deps),
  };
}
