import { DelayedError, Worker } from 'bullmq';
import { getEnv } from '../lib/env.js';
import { fetchText, randomBetween, sleep } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';
import { createSupabaseAdmin } from '../lib/supabase.js';
import {
  QUEUES, createQueues, enqueueFindEmail, enqueueFollowUpDraft, enqueueSend, enqueueTailor as enqueueTailorJob,
  type FindEmailJobData, type FollowUpsJobData, type MatchJobData, type ScrapeJobData, type SendJobData, type TailorJobData,
} from '../queues.js';
import { SCRAPE_LIMITS, SCRAPE_SOURCES, createScrapers } from '../scrapers/index.js';
import { geminiProvider, openaiProvider } from '../services/ai/providers.js';
import { QuotaExhaustedError } from '../services/ai/generate.js';
import { delayForError } from '../services/ai/delay.js';
import { createQuota } from '../services/ai/quota.js';
import { createTailor } from '../services/ai/tailor.js';
import { createApplicationsRepo, createGmailTokenStore } from '../api/repos.js';
import { createFollowUpWriter } from '../services/followups/draft.js';
import { createFollowUpRepo } from '../services/followups/repo.js';
import { gmailConfig } from '../services/gmail/config.js';
import { createGmailTokens } from '../services/gmail/tokens.js';
import { createFollowUpSender, createSendingService } from '../services/sending/wiring.js';
import { runAutoApplyCheck } from '../services/sending/auto-apply.js';
import { createAutoApplyLoader } from '../services/sending/auto-repo.js';
import { createFinder } from '../services/email/finder.js';
import { createHunterClient } from '../services/email/hunter.js';
import { createMonthlyQuota } from '../services/email/quota.js';
import { renderCvPdf } from '../services/cv/pdf.js';
import { findSeenUrls, insertJobs } from '../services/jobs/repo.js';
import { uploadFile } from '../services/storage.js';
import { matchJob, matchUser } from './match.js';
import { runFindEmail } from './find-email.js';
import { runFollowUpsJob } from './followups.js';
import { runSendJob } from './send.js';
import { createCompanyCache, createWorkerRepos } from './repos.js';
import { runScrape } from './scrape.js';
import { runTailor } from './tailor.js';

const SIX_HOURS = 6 * 60 * 60 * 1000;

// Upstash free tier counts every Redis command. Poll idle queues rarely to stay inside the free allowance.
const idleTuning = { drainDelay: 60, stalledInterval: 120_000 } as const;

async function main() {
  const env = getEnv();
  const db = createSupabaseAdmin(env);
  const repos = createWorkerRepos(db);
  const queues = createQueues(createRedis(env.UPSTASH_REDIS_URL));
  const scrapers = createScrapers(fetchText);

  const quota = createQuota(createRedis(env.UPSTASH_REDIS_URL), env.AI_DAILY_LIMIT);
  const gemini = geminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
  const primary: typeof gemini = async (p) => {
    if (!(await quota.consume())) throw new QuotaExhaustedError();
    return gemini(p);
  };
  const fallback = env.OPENAI_API_KEY
    ? openaiProvider({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL })
    : undefined;
  const tailor = createTailor({ primary, fallback });

  const hunter = env.HUNTER_API_KEY ? createHunterClient({ apiKey: env.HUNTER_API_KEY }) : null;
  const finder = createFinder({
    cache: createCompanyCache(db),
    hunter,
    quota: createMonthlyQuota(createRedis(env.UPSTASH_REDIS_URL), env.HUNTER_MONTHLY_LIMIT),
    log: logger,
  });

  const lockRedis = createRedis(env.UPSTASH_REDIS_URL);
  const gmailCfg = gmailConfig(env);
  const gmailTokens = createGmailTokens({ store: createGmailTokenStore(db), cfg: gmailCfg, encryptionKey: env.ENCRYPTION_KEY });
  const applicationsRepo = createApplicationsRepo(db);
  const sendingBase = { db, redis: lockRedis, tokens: gmailTokens, applicationsRepo };
  const sending = createSendingService(sendingBase);
  const followUpRepo = createFollowUpRepo(db);
  const followUpSender = createFollowUpSender({ ...sendingBase, repo: followUpRepo });
  const loadAutoContext = createAutoApplyLoader(db, (userId) => gmailTokens.isConnected(userId));
  const writeFollowUp = createFollowUpWriter({ primary, fallback });

  const enqueueTailor = (userId: string, jobId: string) => enqueueTailorJob(queues.tailor, userId, jobId);
  const matchDeps = { ...repos, enqueueTailor };

  const scrapeWorker = new Worker<ScrapeJobData>(
    QUEUES.scrape,
    async (job) => {
      const { source } = job.data;
      return runScrape({
        scraper: scrapers[source],
        maxNew: SCRAPE_LIMITS[source],
        findSeenUrls: (urls) => findSeenUrls(db, urls),
        insertJobs: (jobs) => insertJobs(db, jobs),
        enqueueMatch: async (jobId) => {
          await queues.match.add('match', { kind: 'job', jobId }, { jobId: `match-job-${jobId}` });
        },
        sleep,
        log: logger,
      });
    },
    { connection: createRedis(env.UPSTASH_REDIS_URL), concurrency: 1, ...idleTuning },
  );

  const matchWorker = new Worker<MatchJobData>(
    QUEUES.match,
    async (job) => (job.data.kind === 'job' ? matchJob(job.data.jobId, matchDeps) : matchUser(job.data.userId, matchDeps)),
    { connection: createRedis(env.UPSTASH_REDIS_URL), concurrency: 2, ...idleTuning },
  );

  const tailorWorker = new Worker<TailorJobData>(
    QUEUES.tailor,
    async (job, token) => {
      try {
        return await runTailor(job.data, {
          ...repos,
          tailor,
          renderPdf: renderCvPdf,
          uploadPdf: (path, bytes) => uploadFile(db, path, bytes, 'application/pdf'),
          onCreated: async (applicationId) => {
            try {
              await enqueueFindEmail(queues.findEmail, applicationId);
            } catch (err) {
              logger.error({ err, applicationId }, 'could not queue the email lookup');
            }
          },
        });
      } catch (err) {
        // Local quota spent or provider 429: wait instead of burning retry attempts.
        const wait = delayForError(err);
        if (wait !== null) {
          await job.moveToDelayed(Date.now() + wait, token);
          throw new DelayedError();
        }
        throw err;
      }
    },
    {
      connection: createRedis(env.UPSTASH_REDIS_URL),
      concurrency: 2,
      limiter: { max: 10, duration: 60_000 }, // about 10 AI calls a minute
      ...idleTuning,
    },
  );

  const findEmailWorker = new Worker<FindEmailJobData>(
    QUEUES.findEmail,
    async (job) =>
      runFindEmail(job.data, {
        loadApplication: repos.loadApplicationForEmail,
        find: finder.find,
        saveCandidates: repos.saveApplicationFields,
        // Failures are logged, never thrown: a retry would skip the lookup and lose the check.
        afterFound: async (applicationId) => {
          try {
            const outcome = await runAutoApplyCheck(applicationId, {
              load: loadAutoContext,
              enqueueSend: ({ userId, applicationId: id, delayMs }) => enqueueSend(queues.send, { kind: 'application', userId, applicationId: id }, delayMs),
              randomDelay: () => randomBetween(5_000, 15_000),
            });
            logger.info({ applicationId, outcome }, 'auto-apply check');
          } catch (err) {
            logger.error({ err, applicationId }, 'auto-apply check failed');
          }
        },
      }),
    {
      connection: createRedis(env.UPSTASH_REDIS_URL),
      concurrency: 1,
      limiter: { max: 1, duration: 1000 }, // Hunter allows about one request a second
      ...idleTuning,
    },
  );

  const followUpsWorker = new Worker<FollowUpsJobData>(
    QUEUES.followups,
    async (job, token) => {
      try {
        return await runFollowUpsJob(job.data, {
          scan: {
            findDue: (limit) => followUpRepo.findDue(limit),
            enqueueDraft: (applicationId) => enqueueFollowUpDraft(queues.followups, applicationId),
          },
          draft: {
            loadContext: (id) => followUpRepo.loadDraftContext(id),
            followUpExists: (id) => followUpRepo.followUpExists(id),
            write: writeFollowUp,
            insertFollowUp: (row) => followUpRepo.insertFollowUp(row),
            clearFollowUpDate: (id) => followUpRepo.clearFollowUpDate(id),
            enqueueAutoSend: ({ userId, followUpId, delayMs }) =>
              enqueueSend(queues.send, { kind: 'followup', userId, followUpId }, delayMs),
            randomDelay: () => randomBetween(5_000, 15_000),
          },
        });
      } catch (err) {
        const wait = delayForError(err);
        if (wait !== null) {
          await job.moveToDelayed(Date.now() + wait, token);
          throw new DelayedError();
        }
        throw err;
      }
    },
    { connection: createRedis(env.UPSTASH_REDIS_URL), concurrency: 1, limiter: { max: 10, duration: 60_000 }, ...idleTuning },
  );

  const sendWorker = new Worker<SendJobData>(
    QUEUES.send,
    async (job) => {
      const result = await runSendJob(job.data, {
        sendApplication: (userId, applicationId) => sending.sendAuto(userId, applicationId),
        sendFollowUp: (userId, followUpId) => followUpSender.sendAutomatic(userId, followUpId),
      });
      if (!result.ok) logger.info({ jobId: job.id, code: result.code }, 'automatic send refused');
      return result;
    },
    { connection: createRedis(env.UPSTASH_REDIS_URL), concurrency: 1, limiter: { max: 1, duration: 10_000 }, ...idleTuning },
  );

  for (const w of [scrapeWorker, matchWorker, tailorWorker, findEmailWorker, followUpsWorker, sendWorker]) {
    w.on('failed', (job, err) => logger.error({ queue: w.name, jobId: job?.id, err }, 'job failed'));
    w.on('error', (err) => logger.error({ queue: w.name, err }, 'worker error'));
  }

  for (const source of SCRAPE_SOURCES) {
    // upsertJobScheduler enqueues the first run immediately, so no separate boot job is needed
    await queues.scrape.upsertJobScheduler(`scrape-${source}`, { every: SIX_HOURS }, { name: 'scrape', data: { source } });
  }
  await queues.followups.upsertJobScheduler('followup-scan', { every: 60 * 60 * 1000 }, { name: 'followups', data: { kind: 'scan' } });
  logger.info({ sources: SCRAPE_SOURCES }, 'worker started; scraping every 6 hours');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    const closeAll = Promise.allSettled([scrapeWorker.close(), matchWorker.close(), tailorWorker.close(), findEmailWorker.close(), followUpsWorker.close(), sendWorker.close()]).then(() =>
      Promise.allSettled([queues.scrape.close(), queues.match.close(), queues.tailor.close(), queues.findEmail.close(), queues.followups.close(), queues.send.close()]),
    );
    await Promise.race([closeAll, sleep(25_000)]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
}

main().catch((err) => {
  logger.error({ err }, 'worker failed to start');
  process.exit(1);
});
