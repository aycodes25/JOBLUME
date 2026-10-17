import { DelayedError, Worker } from 'bullmq';
import { getEnv } from '../lib/env.js';
import { fetchText, sleep } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';
import { createSupabaseAdmin } from '../lib/supabase.js';
import {
  QUEUES, createQueues, enqueueTailor as enqueueTailorJob,
  type MatchJobData, type ScrapeJobData, type TailorJobData,
} from '../queues.js';
import { SCRAPE_LIMITS, SCRAPE_SOURCES, createScrapers } from '../scrapers/index.js';
import { geminiProvider, openaiProvider } from '../services/ai/providers.js';
import { QuotaExhaustedError } from '../services/ai/generate.js';
import { createQuota, msUntilUtcMidnight } from '../services/ai/quota.js';
import { createTailor } from '../services/ai/tailor.js';
import { renderCvPdf } from '../services/cv/pdf.js';
import { findSeenUrls, insertJobs } from '../services/jobs/repo.js';
import { uploadFile } from '../services/storage.js';
import { matchJob, matchUser } from './match.js';
import { createWorkerRepos } from './repos.js';
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
        });
      } catch (err) {
        if (err instanceof QuotaExhaustedError) {
          // No fallback provider and today's budget is spent: wait for tomorrow instead of failing.
          await job.moveToDelayed(Date.now() + msUntilUtcMidnight(), token);
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

  for (const w of [scrapeWorker, matchWorker, tailorWorker]) {
    w.on('failed', (job, err) => logger.error({ queue: w.name, jobId: job?.id, err }, 'job failed'));
    w.on('error', (err) => logger.error({ queue: w.name, err }, 'worker error'));
  }

  for (const source of SCRAPE_SOURCES) {
    // upsertJobScheduler enqueues the first run immediately, so no separate boot job is needed
    await queues.scrape.upsertJobScheduler(`scrape-${source}`, { every: SIX_HOURS }, { name: 'scrape', data: { source } });
  }
  logger.info({ sources: SCRAPE_SOURCES }, 'worker started; scraping every 6 hours');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    const closeAll = Promise.allSettled([scrapeWorker.close(), matchWorker.close(), tailorWorker.close()]).then(() =>
      Promise.allSettled([queues.scrape.close(), queues.match.close(), queues.tailor.close()]),
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
