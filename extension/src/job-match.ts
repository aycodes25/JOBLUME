/** Which employer a page belongs to, so a fill is only handed to the job the extension opened. */

/** Hosts of the four supported platforms, mapped to the platform they belong to. */
const FORM_FAMILY: Record<string, string> = {
  'boards.greenhouse.io': 'greenhouse',
  'job-boards.greenhouse.io': 'greenhouse',
  'jobs.lever.co': 'lever',
  'jobs.ashbyhq.com': 'ashby',
  'apply.workable.com': 'workable',
};

function parse(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

export function isFormHost(url: string | undefined): boolean {
  const u = parse(url);
  return u !== null && u.hostname.toLowerCase() in FORM_FAMILY;
}

/**
 * "platform/company" for a URL on one of the four form hosts (for example "lever/acme"), else null.
 * The company is the first path segment; Greenhouse's embed form names it in the `for` parameter.
 */
export function formKey(url: string | undefined): string | null {
  const u = parse(url);
  if (!u) return null;
  const family = FORM_FAMILY[u.hostname.toLowerCase()];
  if (!family) return null;
  const first = u.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  const company = first === 'embed' && family === 'greenhouse' ? u.searchParams.get('for')?.toLowerCase() : first;
  return company ? `${family}/${company}` : null;
}

export function originOf(url: string | undefined): string | null {
  return parse(url)?.origin ?? null;
}

export interface JobIdentity {
  /** Origin of the job link the extension opened. */
  origin: string;
  /** Form key of the job link when it is itself on a form host; null for an employer's own site. */
  key: string | null;
  /** Set on first fill when the job link was on an employer's own site. */
  pinnedKey: string | null;
}

export function identityOf(jobUrl: string): JobIdentity {
  return { origin: originOf(jobUrl) ?? '', key: formKey(jobUrl), pinnedKey: null };
}

export type Verdict = 'allow' | 'pin' | 'deny' | 'drop';

/** Decides whether a page may receive the armed fill. `pin` means allow and remember this company. */
export function judge(id: JobIdentity, senderUrl: string | undefined): { verdict: Verdict; key: string | null } {
  const sender = parse(senderUrl);
  if (!sender) return { verdict: 'deny', key: null };
  const key = formKey(senderUrl);
  if (isFormHost(senderUrl)) {
    if (key === null) return { verdict: 'deny', key };
    if (id.pinnedKey !== null) return { verdict: key === id.pinnedKey ? 'allow' : 'drop', key };
    if (id.key !== null) return { verdict: key === id.key ? 'allow' : 'deny', key };
    return { verdict: 'pin', key };
  }
  // A page that is not a supported form host is only trusted when it is the job's own site.
  return { verdict: id.key === null && id.pinnedKey === null && sender.origin === id.origin ? 'allow' : 'deny', key };
}
