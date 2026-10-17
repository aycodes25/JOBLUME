import { describe, expect, it } from 'vitest';
import { delayForError } from '../../src/services/ai/delay.js';
import { QuotaExhaustedError } from '../../src/services/ai/generate.js';
import { msUntilUtcMidnight } from '../../src/services/ai/quota.js';
import { ProviderError } from '../../src/services/ai/providers.js';

const now = new Date('2026-03-05T18:30:00Z');

describe('delayForError', () => {
  it('waits until UTC midnight on a quota error', () => {
    expect(delayForError(new QuotaExhaustedError(), now)).toBe(msUntilUtcMidnight(now));
    expect(delayForError(new QuotaExhaustedError(), now)).toBe(5.5 * 3_600_000);
  });

  it('waits 15 minutes on a provider 429', () => {
    expect(delayForError(new ProviderError('rate limited', true, 429), now)).toBe(900_000);
  });

  it('does not delay on a provider 500', () => {
    expect(delayForError(new ProviderError('boom', true, 500), now)).toBeNull();
  });

  it('applies the rules to err.cause', () => {
    const err = new ProviderError('x', true, 500);
    (err as { cause?: unknown }).cause = new QuotaExhaustedError();
    expect(delayForError(err, now)).toBe(msUntilUtcMidnight(now));
  });

  it('returns null for a plain error and non-errors', () => {
    expect(delayForError(new Error('nope'), now)).toBeNull();
    expect(delayForError('str', now)).toBeNull();
  });
});
