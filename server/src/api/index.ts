import { getEnv } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';
import { createSupabaseAdmin } from '../lib/supabase.js';
import { createQueues, enqueueFetchJob } from '../queues.js';
import { createApplicationsService } from '../services/applications.js';
import { createAutofillService } from '../services/autofill.js';
import { renderCvPdf } from '../services/cv/pdf.js';
import { createCvService } from '../services/cv/upload.js';
import { gmailConfig } from '../services/gmail/config.js';
import { createFollowUpRepo } from '../services/followups/repo.js';
import { createFollowUpsService } from '../services/followups/service.js';
import { createGmailService } from '../services/gmail/service.js';
import { createGmailTokens } from '../services/gmail/tokens.js';
import { createJobsService } from '../services/jobs/service.js';
import { createHeartbeat } from '../services/scan/heartbeat.js';
import { createScanRunsRepo } from '../services/scan/runs.js';
import { createScanService } from '../services/scan/service.js';
import { createJobFetchesRepo } from '../services/jobs/fetches-repo.js';
import { createJobLinksService } from '../services/jobs/links.js';
import { findJobIdByUrl } from '../services/jobs/repo.js';
import { createFollowUpSender, createSendingService } from '../services/sending/wiring.js';
import { createSignedUrl, uploadFile } from '../services/storage.js';
import { createApp } from './app.js';
import { createApplicationsRepo, createGmailTokenStore, createProfileRepo, setCv } from './repos.js';

const env = getEnv();
const db = createSupabaseAdmin(env);
const redis = createRedis(env.UPSTASH_REDIS_URL);
const queues = createQueues(redis);
const applicationsRepo = createApplicationsRepo(db);
const profileRepo = createProfileRepo(db);
const gmailCfg = gmailConfig(env);
const gmailTokens = createGmailTokens({ store: createGmailTokenStore(db), cfg: gmailCfg, encryptionKey: env.ENCRYPTION_KEY });
const gmail = createGmailService({ cfg: gmailCfg, tokens: gmailTokens, encryptionKey: env.ENCRYPTION_KEY, redis });

const sending = createSendingService({ db, redis, tokens: gmailTokens, applicationsRepo });

const followUpRepo = createFollowUpRepo(db);
const followUpSender = createFollowUpSender({ db, redis, tokens: gmailTokens, applicationsRepo, repo: followUpRepo });
const followUps = createFollowUpsService({ repo: followUpRepo, send: followUpSender.send });

const app = createApp({
  webOrigin: env.WEB_ORIGIN,
  getUser: async (token) => {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },
  profiles: profileRepo,
  cv: createCvService({
    upload: (path, bytes, contentType) => uploadFile(db, path, bytes, contentType),
    setCv: (userId, v) => setCv(db, userId, v),
  }),
  applications: createApplicationsService({
    repo: applicationsRepo,
    renderPdf: renderCvPdf,
    uploadPdf: (path, bytes) => uploadFile(db, path, bytes, 'application/pdf'),
    signUrl: (path) => createSignedUrl(db, path),
  }),
  autofill: createAutofillService({
    applications: applicationsRepo,
    profiles: profileRepo,
    signUrl: (path) => createSignedUrl(db, path),
  }),
  jobs: createJobsService(queues),
  scan: createScanService({ runs: createScanRunsRepo(db), heartbeat: createHeartbeat(redis) }),
  jobLinks: createJobLinksService({
    findJobIdByUrl: (url) => findJobIdByUrl(db, url),
    fetches: createJobFetchesRepo(db),
    enqueueFetch: (data) => enqueueFetchJob(queues.fetchJob, data),
    enqueueUserMatch: async (userId, jobId) => {
      await queues.match.add('match', { kind: 'user-job', userId, jobId });
    },
  }),
  gmail,
  sending,
  followUps,
});

app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'api listening'));
