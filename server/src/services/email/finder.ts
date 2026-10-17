import type { EmailCandidate } from '@joblume/shared';
import { companyKey } from '../../domain/jobs.js';
import type { Logger } from '../../lib/logger.js';
import { buildCandidates } from './candidates.js';
import type { HunterContact, HunterResult } from './hunter.js';

export const CACHE_TTL_MS = 30 * 86_400_000;

export interface CachedContacts {
  domain: string | null;
  contacts: HunterContact[];
  pattern: string | null;
  fetchedAt: string;
}

export interface FinderDeps {
  cache: {
    get(key: string): Promise<CachedContacts | null>;
    put(key: string, value: Omit<CachedContacts, 'fetchedAt'>): Promise<void>;
  };
  hunter: { domainSearch(q: { company?: string; domain?: string }): Promise<HunterResult> } | null;
  quota: { consume(): Promise<boolean> };
  now?: () => Date;
  log: Logger;
}

export function createFinder(d: FinderDeps) {
  const now = d.now ?? (() => new Date());
  return {
    async find(input: { company: string; knownDomain: string | null }): Promise<EmailCandidate[]> {
      const key = companyKey(input.company);
      if (!key) return [];

      let entry = await d.cache.get(key);
      if (entry && now().getTime() - Date.parse(entry.fetchedAt) > CACHE_TTL_MS) entry = null;

      if (!entry && d.hunter && (await d.quota.consume())) {
        try {
          const result = await d.hunter.domainSearch(input.knownDomain ? { domain: input.knownDomain } : { company: input.company });
          entry = { ...result, fetchedAt: now().toISOString() };
          await d.cache.put(key, { domain: result.domain, contacts: result.contacts, pattern: result.pattern });
        } catch (err) {
          d.log.warn({ err, companyKey: key }, 'hunter lookup failed');
        }
      }

      const domain = input.knownDomain ?? entry?.domain ?? null;
      return buildCandidates(domain, entry?.contacts ?? []);
    },
  };
}
