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
  apply_options?: unknown;
}

export class JSearchError extends Error {
  constructor(
    public readonly kind: 'auth' | 'rate_limited' | 'timeout' | 'failed' | 'malformed',
    message?: string,
    /** True only when the request clearly never reached RapidAPI (a network error with no response), so it used no quota. */
    public readonly neverSent: boolean = false,
  ) {
    super(message ?? kind);
    this.name = 'JSearchError';
  }
}

export function createJSearchClient(cfg: { apiKey: string; timeoutMs?: number }, fetchImpl: typeof fetch = fetch) {
  const timeoutMs = cfg.timeoutMs ?? 20_000;
  return {
    async search(q: JSearchQuery): Promise<JSearchJob[]> {
      const params = new URLSearchParams({ query: q.query, page: '1', num_pages: '1', date_posted: 'week' });
      if (q.remote) params.set('work_from_home', 'true');
      else params.set('country', 'ng');

      let res: Response;
      try {
        // The key goes only in a header: never in the URL, an error message or a log line.
        res = await fetchImpl(`https://${JSEARCH_HOST}/search?${params.toString()}`, {
          headers: { 'x-rapidapi-key': cfg.apiKey, 'x-rapidapi-host': JSEARCH_HOST },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const name = (err as { name?: unknown } | null)?.name;
        if (name === 'TimeoutError' || name === 'AbortError') throw new JSearchError('timeout', 'JSearch did not answer in time');
        throw new JSearchError('failed', 'Could not reach JSearch', true);
      }
      if (res.status === 401 || res.status === 403) throw new JSearchError('auth', `JSearch refused the key (${res.status})`);
      if (res.status === 429) throw new JSearchError('rate_limited', 'JSearch rate limit reached');
      if (!res.ok) throw new JSearchError('failed', `JSearch answered ${res.status}`);

      const body = (await res.json().catch(() => null)) as { status?: unknown; data?: unknown } | null;
      // A 200 without a job list is not a real answer: fail so it is never read as "no jobs".
      if (!body || typeof body !== 'object' || !Array.isArray(body.data)) throw new JSearchError('malformed', 'JSearch sent no job list');
      if (body.status !== undefined && body.status !== 'OK') throw new JSearchError('failed', 'JSearch reported an error');
      return body.data as JSearchJob[];
    },
  };
}

export type JSearchClient = ReturnType<typeof createJSearchClient>;
