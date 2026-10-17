import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { generateJson, InvalidOutputError, QuotaExhaustedError } from '../../src/services/ai/generate.js';
import { ProviderError, type ProviderFn } from '../../src/services/ai/providers.js';

const schema = z.object({ n: z.coerce.number() });
const base = { system: 's', user: 'u', schema };

describe('generateJson', () => {
  it('returns validated data from the primary provider', async () => {
    const primary: ProviderFn = vi.fn().mockResolvedValue('{"n": "5"}');
    expect(await generateJson({ ...base, primary })).toEqual({ data: { n: 5 }, provider: 'primary' });
  });

  it('strips markdown code fences', async () => {
    const primary: ProviderFn = vi.fn().mockResolvedValue('```json\n{"n":1}\n```');
    expect((await generateJson({ ...base, primary })).data.n).toBe(1);
  });

  it('retries once on invalid output, telling the model what was wrong', async () => {
    const primary = vi.fn<ProviderFn>()
      .mockResolvedValueOnce('not json at all')
      .mockResolvedValueOnce('{"n":2}');
    const res = await generateJson({ ...base, primary });
    expect(res).toEqual({ data: { n: 2 }, provider: 'primary' });
    expect(primary.mock.calls[1]![0].user).toContain('previous reply was invalid');
  });

  it('falls back when the primary fails with a ProviderError', async () => {
    const primary: ProviderFn = vi.fn().mockRejectedValue(new ProviderError('429', true, 429));
    const fallback: ProviderFn = vi.fn().mockResolvedValue('{"n":3}');
    expect(await generateJson({ ...base, primary, fallback })).toEqual({ data: { n: 3 }, provider: 'fallback' });
  });

  it('falls back when the primary stays invalid after its retry', async () => {
    const primary: ProviderFn = vi.fn().mockResolvedValue('nope');
    const fallback: ProviderFn = vi.fn().mockResolvedValue('{"n":4}');
    const res = await generateJson({ ...base, primary, fallback });
    expect(res.provider).toBe('fallback');
    expect(primary).toHaveBeenCalledTimes(2);
  });

  it('falls back when the primary quota is exhausted', async () => {
    const primary: ProviderFn = vi.fn().mockRejectedValue(new QuotaExhaustedError());
    const fallback: ProviderFn = vi.fn().mockResolvedValue('{"n":6}');
    expect((await generateJson({ ...base, primary, fallback })).provider).toBe('fallback');
  });

  it('rethrows QuotaExhaustedError when there is no fallback', async () => {
    const primary: ProviderFn = vi.fn().mockRejectedValue(new QuotaExhaustedError());
    await expect(generateJson({ ...base, primary })).rejects.toBeInstanceOf(QuotaExhaustedError);
  });

  it('throws InvalidOutputError when the only provider never returns valid JSON', async () => {
    const primary: ProviderFn = vi.fn().mockResolvedValue('nope');
    await expect(generateJson({ ...base, primary })).rejects.toBeInstanceOf(InvalidOutputError);
  });

  it('throws when both providers fail', async () => {
    const primary: ProviderFn = vi.fn().mockRejectedValue(new ProviderError('500', true, 500));
    const fallback: ProviderFn = vi.fn().mockRejectedValue(new ProviderError('500', true, 500));
    await expect(generateJson({ ...base, primary, fallback })).rejects.toBeInstanceOf(ProviderError);
  });

  it('keeps the primary quota error as the cause when the fallback also fails', async () => {
    const primary: ProviderFn = vi.fn().mockRejectedValue(new QuotaExhaustedError());
    const fallback: ProviderFn = vi.fn().mockRejectedValue(new ProviderError('500', true, 500));
    const err = await generateJson({ ...base, primary, fallback }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as Error).cause).toBeInstanceOf(QuotaExhaustedError);
  });
});
