import { z } from 'zod';

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = z.preprocess(blankToUndefined, z.string().min(1).optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(4000)),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1),
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.preprocess(blankToUndefined, z.string().min(1).default('gpt-4o-mini')),
  AI_DAILY_LIMIT: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(200)),
  UPSTASH_REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must start with redis:// or rediss://'),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters (32 bytes)'),
  WEB_ORIGIN: z.string().url(),
  GMAIL_CLIENT_ID: optionalString,
  GMAIL_CLIENT_SECRET: optionalString,
  GMAIL_REDIRECT_URI: z.preprocess(blankToUndefined, z.string().url().optional()),
  HUNTER_API_KEY: optionalString,
  HUNTER_MONTHLY_LIMIT: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(25)),
  JSEARCH_API_KEY: optionalString,
  /** Where the JSearch key was bought: RapidAPI (default) or directly from OpenWeb Ninja. */
  JSEARCH_PROVIDER: z.preprocess(blankToUndefined, z.enum(['rapidapi', 'openwebninja']).default('rapidapi')),
  /** The JSearch request path: the current /search-v2 (default) or the legacy /search. */
  JSEARCH_SEARCH_PATH: z.preprocess(blankToUndefined, z.enum(['/search-v2', '/search']).default('/search-v2')),
  JSEARCH_MONTHLY_LIMIT: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(50)),
  /** How often the job boards are scanned. At least 30, so the boards are never hit more than twice an hour. */
  SCRAPE_EVERY_MINUTES: z.preprocess(blankToUndefined, z.coerce.number().int().min(30).default(120)),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return result.data;
}

let cached: Env | undefined;
export function getEnv(): Env {
  cached ??= loadEnv(process.env);
  return cached;
}
