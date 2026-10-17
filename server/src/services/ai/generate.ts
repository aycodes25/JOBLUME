import type { z } from 'zod';
import type { ProviderFn } from './providers.js';

export class QuotaExhaustedError extends Error {
  constructor() {
    super('AI daily quota exhausted');
    this.name = 'QuotaExhaustedError';
  }
}

export class InvalidOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOutputError';
  }
}

const stripFences = (raw: string) =>
  raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

async function attempt<T>(
  provider: ProviderFn,
  system: string,
  user: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T> {
  let prompt = user;
  let lastIssue = 'unknown';
  for (let i = 0; i < 2; i++) {
    const raw = await provider({ system, user: prompt });
    let problem: string;
    try {
      const parsed = schema.safeParse(JSON.parse(stripFences(raw)));
      if (parsed.success) return parsed.data;
      problem = parsed.error.issues.map((x) => `${x.path.join('.') || '(root)'}: ${x.message}`).join('; ');
    } catch (err) {
      problem = `not valid JSON (${(err as Error).message})`;
    }
    lastIssue = problem;
    prompt = `${user}\n\nYour previous reply was invalid: ${problem}. Reply again with ONLY valid JSON that matches the required structure.`;
  }
  throw new InvalidOutputError(`Model output failed validation twice: ${lastIssue}`);
}

export async function generateJson<T>(opts: {
  system: string;
  user: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  primary: ProviderFn;
  fallback?: ProviderFn;
}): Promise<{ data: T; provider: 'primary' | 'fallback' }> {
  try {
    return { data: await attempt(opts.primary, opts.system, opts.user, opts.schema), provider: 'primary' };
  } catch (err) {
    if (!opts.fallback) throw err;
    return { data: await attempt(opts.fallback, opts.system, opts.user, opts.schema), provider: 'fallback' };
  }
}
