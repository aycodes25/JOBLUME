import { QuotaExhaustedError } from './generate.js';
import { ProviderError } from './providers.js';
import { msUntilUtcMidnight } from './quota.js';

const RATE_LIMIT_WAIT_MS = 900_000;

function direct(err: unknown, now: Date): number | null {
  if (err instanceof QuotaExhaustedError) return msUntilUtcMidnight(now);
  if (err instanceof ProviderError && err.status === 429) return RATE_LIMIT_WAIT_MS;
  return null;
}

/** How long a tailor job should wait before retrying, or null when the error is not a quota/rate-limit one. */
export function delayForError(err: unknown, now: Date = new Date()): number | null {
  const wait = direct(err, now);
  if (wait !== null) return wait;
  // generateJson attaches the primary (quota) error as `.cause` of the fallback's error.
  const cause = err instanceof Error ? err.cause : undefined;
  return cause === undefined ? null : direct(cause, now);
}
