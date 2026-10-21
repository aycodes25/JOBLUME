import { getEnv } from '../lib/env.js';
import { createRedis } from '../lib/redis.js';
import { createQueues } from '../queues.js';
import { SCRAPE_SOURCES, type ScrapeSource } from '../scrapers/index.js';

/**
 * Asks the RUNNING worker to scan one source right now (the worker must be running: `npm run dev`).
 * JSearch still obeys its monthly request allowance.
 *
 *   npm run scan:now -w server -- jsearch
 */
async function main(): Promise<void> {
  const source = process.argv[2] as ScrapeSource | undefined;
  if (!source || !(SCRAPE_SOURCES as readonly string[]).includes(source)) {
    console.log(`Usage: npm run scan:now -w server -- <source>\nSources: ${SCRAPE_SOURCES.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const env = getEnv();
  const connection = createRedis(env.UPSTASH_REDIS_URL);
  const queues = createQueues(connection);
  try {
    await queues.scrape.add('scrape', { source }, { jobId: `manual-${source}-${Date.now()}` });
    console.log(`Queued a ${source} scan. Watch the "Last scan" card on the Queue page (it updates within a minute or two).`);
  } finally {
    await queues.scrape.close();
    connection.disconnect();
  }
}

main().catch((err: unknown) => {
  console.log(`Could not queue the scan: ${(err as { message?: string }).message ?? 'unknown error'}`);
  process.exitCode = 1;
});
