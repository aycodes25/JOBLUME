import { getEnv } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { createJSearchClient, jsearchUrl } from '../scrapers/jsearch-client.js';
import { parseJSearchJob } from '../scrapers/jsearch.js';
import { keyNames, parseDiagArgs } from './diag-jsearch-args.js';

/**
 * One-off check: sends ONE JSearch request (uses one request of the monthly allowance), then prints what came back:
 * how many results, which publishers, which hosts the apply links point to, and how many JobLume would keep per category (linkedin, indeed, jsearch-direct, dropped).
 * Nothing is saved. The API key is never printed.
 *
 *   npm run diag:jsearch -w server -- "full stack developer remote"
 *   npm run diag:jsearch -w server -- "software engineer in Lagos, Nigeria" --onsite
 *   npm run diag:jsearch -w server -- --path=/search-v2 --provider=openwebninja
 *
 * --path=/search|/search-v2 and --provider=rapidapi|openwebninja override JSEARCH_SEARCH_PATH and JSEARCH_PROVIDER.
 * Also prints the field names (never values) of the first result and, for a v2 reply, of the reply's data object.
 */
async function main(): Promise<void> {
  const env = getEnv();
  if (!env.JSEARCH_API_KEY) {
    console.log('JSEARCH_API_KEY is not set in .env');
    return;
  }
  const { query, onsite, provider, path } = parseDiagArgs(process.argv.slice(2), { provider: env.JSEARCH_PROVIDER, path: env.JSEARCH_SEARCH_PATH });
  let dataKeys: string[] = [];
  const spy: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    // Read a copy of the body for the key names only; nothing from it is printed except names.
    const parsed = (await res.clone().json().catch(() => null)) as { data?: unknown } | null;
    dataKeys = keyNames(parsed?.data);
    console.log(`HTTP outcome: ${res.status} ${res.ok ? 'OK' : 'not OK'}`);
    return res;
  };
  const client = createJSearchClient({ apiKey: env.JSEARCH_API_KEY, provider, searchPath: path, log: logger }, spy);
  console.log(`provider: ${provider} | path: ${new URL(jsearchUrl(provider, path)).pathname} | query: "${query}" | ${onsite ? 'on-site (country ng)' : 'remote only'}`);
  const results = await client.search({ query, remote: !onsite });
  console.log(`results returned: ${results.length}`);
  if (dataKeys.length) console.log(`data keys (v2 reply): ${dataKeys.join(', ')}`);
  if (results[0]) console.log(`first result keys: ${keyNames(results[0]).join(', ')}`);

  const publishers = new Map<string, number>();
  const hosts = new Map<string, number>();
  const categories = { linkedin: 0, indeed: 0, 'jsearch-direct': 0, dropped: 0 };
  for (const raw of results) {
    const p = typeof raw.job_publisher === 'string' ? raw.job_publisher : '(none)';
    publishers.set(p, (publishers.get(p) ?? 0) + 1);
    try {
      const h = new URL(String(raw.job_apply_link)).hostname;
      hosts.set(h, (hosts.get(h) ?? 0) + 1);
    } catch {
      hosts.set('(no valid apply link)', (hosts.get('(no valid apply link)') ?? 0) + 1);
    }
    const job = parseJSearchJob(raw);
    if (!job) categories.dropped++;
    else if (job.source === 'linkedin' || job.source === 'indeed') categories[job.source]++;
    else categories['jsearch-direct']++;
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `  ${n}  ${k}`).join('\n');
  console.log('publishers:\n' + (top(publishers) || '  (none)'));
  console.log('apply link hosts:\n' + (top(hosts) || '  (none)'));
  console.log(`JobLume would keep ${results.length - categories.dropped} of ${results.length}: linkedin ${categories.linkedin} | indeed ${categories.indeed} | jsearch-direct (employer link) ${categories['jsearch-direct']} | dropped ${categories.dropped}`);
}

main().catch((err: unknown) => {
  const e = err as { kind?: string; httpStatus?: number; networkCode?: string; message?: string };
  console.log(`request failed: kind=${e.kind ?? 'unknown'} status=${e.httpStatus ?? '-'} network=${e.networkCode ?? '-'} message=${e.message ?? ''}`);
  process.exitCode = 1;
});
