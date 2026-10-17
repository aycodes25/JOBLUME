export const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0',
];

export const pickUserAgent = (rand: () => number = Math.random): string =>
  USER_AGENTS[Math.floor(rand() * USER_AGENTS.length)]!;

export const randomBetween = (min: number, max: number, rand: () => number = Math.random): number =>
  Math.floor(min + rand() * (max - min));

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class HttpError extends Error {
  constructor(public readonly status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

export type FetchText = (url: string) => Promise<string>;

interface FetchOptions {
  retries?: number;
  backoffMs?: number;
  timeoutMs?: number;
}

const retryable = (status: number) => status === 429 || status >= 500;

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const { retries = 2, backoffMs = 1500, timeoutMs = 30_000 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': pickUserAgent(), accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return await res.text();
      lastError = new HttpError(res.status, url);
      if (!retryable(res.status)) throw lastError;
    } catch (err) {
      if (err instanceof HttpError && !retryable(err.status)) throw err;
      lastError = err;
    }
    if (attempt < retries) await sleep(backoffMs * 2 ** attempt);
  }
  throw lastError;
}
