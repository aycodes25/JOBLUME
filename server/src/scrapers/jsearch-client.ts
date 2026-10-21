import type { Logger } from '../lib/logger.js';

export const JSEARCH_HOST = 'jsearch.p.rapidapi.com';

export interface JSearchQuery {
  query: string;
  remote: boolean;
}

/** One raw JSearch result. Every field is untrusted, so it is typed unknown and checked when parsed. */
export interface JSearchJob {
  job_id?: unknown;
  employer_name?: unknown;
  employer_website?: unknown;
  job_publisher?: unknown;
  job_title?: unknown;
  job_description?: unknown;
  job_apply_link?: unknown;
  job_city?: unknown;
  job_state?: unknown;
  job_country?: unknown;
  job_is_remote?: unknown;
  job_posted_at_datetime_utc?: unknown;
  job_apply_is_direct?: unknown;
  apply_options?: unknown;
}

export class JSearchError extends Error {
  constructor(
    public readonly kind: 'auth' | 'rate_limited' | 'timeout' | 'failed' | 'malformed',
    message?: string,
    /** True only when the request clearly never reached RapidAPI (a network error with no response), so it used no quota. */
    public readonly neverSent: boolean = false,
    /** The system error code behind a network failure (ENOTFOUND, ECONNREFUSED, ...). Only a plain code word: never a URL, key or message. */
    public readonly networkCode?: string,
    /** The HTTP status of a non-OK answer other than 401/403/429. Only a number: the response body never goes into an error. */
    public readonly httpStatus?: number,
    /** True when a 404 body said the endpoint "does not exist" (the address was removed). A flag only: the body never goes into an error. */
    public readonly endpointMissing: boolean = false,
  ) {
    super(message ?? kind);
    this.name = 'JSearchError';
  }
}

const CODE_WORD = /^[A-Za-z][A-Za-z0-9_]{1,63}$/;

interface CauseLike {
  name?: unknown;
  code?: unknown;
  syscall?: unknown;
  hostname?: unknown;
  errno?: unknown;
  address?: unknown;
  port?: unknown;
  message?: unknown;
  cause?: unknown;
  errors?: unknown;
}

/** The first plain error code found on an error's cause chain (including an AggregateError's members), else undefined. */
export function networkCodeOf(err: unknown, depth = 0): string | undefined {
  if (depth > 4 || typeof err !== 'object' || err === null) return undefined;
  const e = err as CauseLike;
  if (depth > 0 && typeof e.code === 'string' && CODE_WORD.test(e.code)) return e.code;
  const inner = [e.cause, ...(Array.isArray(e.errors) ? e.errors : [])];
  for (const c of inner) {
    const code = networkCodeOf(c, depth + 1);
    if (code) return code;
  }
  return undefined;
}

/** A loggable description of the underlying cause, with the API key scrubbed from its text. No headers, no request. */
function describeCause(err: unknown, apiKey: string): Record<string, unknown> {
  const scrub = (v: unknown) => (typeof v === 'string' ? (apiKey ? v.split(apiKey).join('[key]') : v).slice(0, 300) : undefined);
  const cause = (err as CauseLike | null)?.cause;
  const e = (typeof cause === 'object' && cause !== null ? cause : err) as CauseLike;
  const inner = Array.isArray(e.errors) ? (e.errors as unknown[]).slice(0, 4).map((x) => describeCause({ cause: x }, apiKey)) : undefined;
  return {
    name: scrub(e.name),
    code: scrub(e.code),
    syscall: scrub(e.syscall),
    hostname: scrub(e.hostname),
    address: scrub(e.address),
    port: typeof e.port === 'number' ? e.port : undefined,
    message: scrub(e.message),
    ...(inner ? { errors: inner } : {}),
  };
}

export type JSearchProvider = 'rapidapi' | 'openwebninja';
/** '/search' is the legacy path (removed on RapidAPI); '/search-v2' is the current one. */
export type JSearchPath = '/search' | '/search-v2';

/** The full request URL (no query) for a provider and path. */
export function jsearchUrl(provider: JSearchProvider | undefined, path: JSearchPath): string {
  return provider === 'openwebninja' ? `https://api.openwebninja.com/jsearch${path}` : `https://${JSEARCH_HOST}${path}`;
}

/** The job list of a reply: a legacy array, or an object with a jobs array (v2). Anything else is undefined. */
export function extractJobs(data: unknown): JSearchJob[] | undefined {
  if (Array.isArray(data)) return data as JSearchJob[];
  if (typeof data === 'object' && data !== null && Array.isArray((data as { jobs?: unknown }).jobs)) return (data as { jobs: JSearchJob[] }).jobs;
  return undefined;
}

/** A short, safe piece of an error body for the log: the JSON message/error field if there is one, else the start of the text. */
async function bodySnippet(res: Response, apiKey: string): Promise<string | undefined> {
  const text = await res.text().catch(() => '');
  if (!text) return undefined;
  let snippet = text;
  try {
    const parsed = JSON.parse(text) as { message?: unknown; error?: unknown } | null;
    const field = parsed?.message ?? parsed?.error;
    if (typeof field === 'string') snippet = field;
  } catch {
    // not JSON: use the raw text
  }
  return (apiKey ? snippet.split(apiKey).join('[key]') : snippet).slice(0, 200);
}

export function createJSearchClient(
  cfg: { apiKey: string; provider?: JSearchProvider; searchPath?: JSearchPath; timeoutMs?: number; log?: Pick<Logger, 'warn'> },
  fetchImpl: typeof fetch = fetch,
) {
  const timeoutMs = cfg.timeoutMs ?? 20_000;
  const openWebNinja = cfg.provider === 'openwebninja';
  const searchPath: JSearchPath = cfg.searchPath ?? '/search-v2';
  const base = jsearchUrl(cfg.provider, searchPath);
  const headers: Record<string, string> = openWebNinja
    ? { 'x-api-key': cfg.apiKey }
    : { 'x-rapidapi-key': cfg.apiKey, 'x-rapidapi-host': JSEARCH_HOST };
  return {
    async search(q: JSearchQuery): Promise<JSearchJob[]> {
      const params = new URLSearchParams({ query: q.query, num_pages: '1', date_posted: 'week' });
      // The legacy path takes a page; v2 has no page parameter (it pages by cursor).
      if (searchPath === '/search') params.set('page', '1');
      if (q.remote) params.set('work_from_home', 'true');
      else params.set('country', 'ng');

      let res: Response;
      try {
        // The key goes only in a header: never in the URL, an error message or a log line.
        res = await fetchImpl(`${base}?${params.toString()}`, {
          headers,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const name = (err as { name?: unknown } | null)?.name;
        if (name === 'TimeoutError' || name === 'AbortError') throw new JSearchError('timeout', 'JSearch did not answer in time');
        const networkCode = networkCodeOf(err);
        cfg.log?.warn({ source: 'jsearch', networkCode, cause: describeCause(err, cfg.apiKey) }, 'JSearch could not be reached');
        throw new JSearchError('failed', 'Could not reach JSearch', true, networkCode);
      }
      if (res.status === 401 || res.status === 403) throw new JSearchError('auth', `JSearch refused the key (${res.status})`);
      if (res.status === 429) throw new JSearchError('rate_limited', 'JSearch rate limit reached');
      if (!res.ok) {
        const body = await bodySnippet(res, cfg.apiKey);
        cfg.log?.warn({ source: 'jsearch', status: res.status, path: new URL(base).pathname, body }, 'JSearch answered with an error status');
        const endpointMissing = res.status === 404 && /does not exist/i.test(body ?? '');
        throw new JSearchError('failed', `JSearch answered ${res.status}`, false, undefined, res.status, endpointMissing);
      }

      const body = (await res.json().catch(() => null)) as { status?: unknown; data?: unknown } | null;
      // A 200 without a job list is not a real answer: fail so it is never read as "no jobs".
      const jobs = body && typeof body === 'object' ? extractJobs(body.data) : undefined;
      if (!jobs) throw new JSearchError('malformed', 'JSearch sent no job list');
      if (body!.status !== undefined && body!.status !== 'OK') throw new JSearchError('failed', 'JSearch reported an error');
      return jobs;
    },
  };
}

export type JSearchClient = ReturnType<typeof createJSearchClient>;
