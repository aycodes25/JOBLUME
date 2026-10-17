export interface HunterContact {
  email: string;
  type: 'personal' | 'generic';
  confidence: number;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  department: string | null;
}

export interface HunterResult {
  domain: string | null;
  pattern: string | null;
  contacts: HunterContact[];
}

export class HunterError extends Error {
  constructor(public readonly kind: 'auth' | 'rate_limited' | 'bad_request' | 'failed', message?: string) {
    super(message ?? kind);
    this.name = 'HunterError';
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

export function parseHunterDomainSearch(json: unknown): HunterResult {
  const data = (json as { data?: { domain?: unknown; pattern?: unknown; emails?: unknown } } | null | undefined)?.data;
  if (!data || typeof data !== 'object') return { domain: null, pattern: null, contacts: [] };
  const contacts: HunterContact[] = [];
  if (Array.isArray(data.emails)) {
    for (const raw of data.emails as Array<Record<string, unknown>>) {
      const email = str(raw?.value);
      if (!email || !email.includes('@') || typeof raw.confidence !== 'number') continue;
      contacts.push({
        email,
        type: raw.type === 'generic' ? 'generic' : 'personal',
        confidence: raw.confidence,
        firstName: str(raw.first_name),
        lastName: str(raw.last_name),
        position: str(raw.position),
        department: str(raw.department),
      });
    }
  }
  return { domain: str(data.domain), pattern: str(data.pattern), contacts };
}

export function createHunterClient(cfg: { apiKey: string }, fetchImpl: typeof fetch = fetch) {
  return {
    async domainSearch(q: { company?: string; domain?: string }): Promise<HunterResult> {
      if (!q.company && !q.domain) throw new HunterError('bad_request', 'A company or a domain is required');
      const params = new URLSearchParams({ limit: '10' });
      if (q.domain) params.set('domain', q.domain);
      else params.set('company', q.company as string);

      let res: Response;
      try {
        res = await fetchImpl(`https://api.hunter.io/v2/domain-search?${params.toString()}`, {
          headers: { 'x-api-key': cfg.apiKey },
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new HunterError('failed', 'Could not reach Hunter');
      }
      if (res.status === 401) throw new HunterError('auth');
      if (res.status === 403 || res.status === 429) throw new HunterError('rate_limited');
      if (res.status === 400 || res.status === 404) throw new HunterError('bad_request');
      if (!res.ok) throw new HunterError('failed');
      return parseHunterDomainSearch(await res.json().catch(() => null));
    },
  };
}

export type HunterClient = ReturnType<typeof createHunterClient>;
