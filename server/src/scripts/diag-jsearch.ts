import { getEnv } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { createJSearchClient } from '../scrapers/jsearch-client.js';
import { parseJSearchJob } from '../scrapers/jsearch.js';

/**
 * One-off check: sends ONE JSearch request (uses one request of the monthly allowance), then prints what came back:
 * how many results, which publishers, which hosts the apply links point to, and how many JobLume would keep.
 * Nothing is saved. The API key is never printed.
 *
 *   npm run diag:jsearch -w server -- "full stack developer remote"
 *   npm run diag:jsearch -w server -- "software engineer in Lagos, Nigeria" --onsite
 */
async function main(): Promise<void> {
  const env = getEnv();
  if (!env.JSEARCH_API_KEY) {
    console.log('JSEARCH_API_KEY is not set in .env');
    return;
  }
  const args = process.argv.slice(2);
  const onsite = args.includes('--onsite');
  const query = args.find((a) => !a.startsWith('--')) ?? 'full stack developer remote';
  const client = createJSearchClient({ apiKey: env.JSEARCH_API_KEY, provider: env.JSEARCH_PROVIDER, log: logger });
  console.log(`provider: ${env.JSEARCH_PROVIDER ?? 'rapidapi'} | query: "${query}" | ${onsite ? 'on-site (country ng)' : 'remote only'}`);
  const results = await client.search({ query, remote: !onsite });
  console.log(`results returned: ${results.length}`);

  const publishers = new Map<string, number>();
  const hosts = new Map<string, number>();
  let kept = 0;
  for (const raw of results) {
    const p = typeof raw.job_publisher === 'string' ? raw.job_publisher : '(none)';
    publishers.set(p, (publishers.get(p) ?? 0) + 1);
    try {
      const h = new URL(String(raw.job_apply_link)).hostname;
      hosts.set(h, (hosts.get(h) ?? 0) + 1);
    } catch {
      hosts.set('(no valid apply link)', (hosts.get('(no valid apply link)') ?? 0) + 1);
    }
    if (parseJSearchJob(raw)) kept++;
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `  ${n}  ${k}`).join('\n');
  console.log('publishers:\n' + (top(publishers) || '  (none)'));
  console.log('apply link hosts:\n' + (top(hosts) || '  (none)'));
  console.log(`JobLume would keep (LinkedIn/Indeed with a LinkedIn/Indeed link): ${kept} of ${results.length}`);
}

main().catch((err: unknown) => {
  const e = err as { kind?: string; httpStatus?: number; networkCode?: string; message?: string };
  console.log(`request failed: kind=${e.kind ?? 'unknown'} status=${e.httpStatus ?? '-'} network=${e.networkCode ?? '-'} message=${e.message ?? ''}`);
  process.exitCode = 1;
});
