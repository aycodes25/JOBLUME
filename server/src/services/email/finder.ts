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
  quota: { consume(): Promise<boolean>; refund(): Promise<void> };
  now?: () => Date;
  log: Logger;
}

export function createFinder(d: FinderDeps) {
  const now = d.now ?? (() => new Date());
  return {
    async find(input: { company: string; knownDomain: string | null }): Promise<EmailCandidate[]> {
      const key = companyKey(input.company);
      if (!key) return [];

      // A known domain is a more precise identity than the company name, so name-keyed entries are not reused for it.
      const cacheKey = input.knownDomain ? `d:${input.knownDomain.trim().toLowerCase()}` : key;
      let entry = await d.cache.get(cacheKey);
      if (entry && now().getTime() - Date.parse(entry.fetchedAt) > CACHE_TTL_MS) entry = null;

      if (!entry && d.hunter && (await d.quota.consume())) {
        let result: HunterResult | null = null;
        try {
          result = await d.hunter.domainSearch(input.knownDomain ? { domain: input.knownDomain } : { company: input.company });
        } catch (err) {
          d.log.warn({ err, companyKey: key }, 'hunter lookup failed');
          // A failed call did not use the free-tier budget.
          try {
            await d.quota.refund();
          } catch (refundErr) {
            d.log.warn({ err: refundErr, companyKey: key }, 'hunter quota refund failed');
          }
        }
        if (result) {
          entry = { ...result, fetchedAt: now().toISOString() };
          try {
            await d.cache.put(cacheKey, { domain: result.domain, contacts: result.contacts, pattern: result.pattern });
          } catch (err) {
            d.log.warn({ err, companyKey: key }, 'hunter cache write failed');
          }
        }
      }

      const domain = input.knownDomain ?? entry?.domain ?? null;
      return buildCandidates(domain, entry?.contacts ?? []);
    },
  };
}
