import * as cheerio from 'cheerio';
import type { JobFetchReason, LinkSource } from '@joblume/shared';
import { domainFromWebsite, normaliseJob, tidyLocation, type NormalisedJob } from '../domain/jobs.js';
import { htmlToText } from '../lib/html.js';

/** What the browser saw: the main document's HTTP status (null when unknown), the URL after redirects, and the HTML. */
export interface FetchedPage {
  status: number | null;
  finalUrl: string;
  html: string;
}

export type ExtractResult = { ok: true; job: NormalisedJob } | { ok: false; reason: JobFetchReason };

type Json = Record<string, unknown>;
type Doc = ReturnType<typeof cheerio.load>;

const BLOCKED_STATUS = new Set([403, 429, 999]); // LinkedIn answers 999 to traffic it thinks is automated
const LOGIN_PATH = /^\/(?:login|authwall|checkpoint|signup|uas\/login|account\/login|auth)(?:\/|$)/i;
// Only checked when no job could be read, so a word inside a real job page cannot cause a false failure.
const BLOCK_MARKERS = [/captcha/i, /verify you are human/i, /unusual (?:traffic|activity)/i, /security check/i, /<title>\s*just a moment/i, /challenge-platform|cf-challenge/i];
const GONE_MARKERS = [/no longer available/i, /this job has expired/i, /job has been removed/i, /page not found/i, /could not be found/i];
const LOGIN_MARKERS = /name="session_key"|id="login-email"|action="[^"]*(?:uas\/login|\/login|signin)[^"]*"/i;

const SELECTORS: Record<LinkSource, Record<'title' | 'company' | 'location' | 'description', string[]>> = {
  linkedin: {
    title: ['h1.top-card-layout__title', 'h1.topcard__title', 'h1'],
    company: ['a.topcard__org-name-link', '.topcard__org-name-link', 'span.topcard__flavor a'],
    location: ['span.topcard__flavor--bullet', '.topcard__flavor--bullet'],
    description: ['div.show-more-less-html__markup', 'div.description__text'],
  },
  indeed: {
    title: ['h1[data-testid="jobsearch-JobInfoHeader-title"]', 'h1.jobsearch-JobInfoHeader-title', 'h2.jobsearch-JobInfoHeader-title', 'h1'],
    company: ['[data-testid="inlineHeader-companyName"]', '[data-company-name="true"]', '.jobsearch-CompanyInfoContainer a'],
    location: ['[data-testid="inlineHeader-companyLocation"]', '[data-testid="job-location"]'],
    description: ['#jobDescriptionText', '.jobsearch-jobDescriptionText'],
  },
};

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
function hasType(node: Json, type: string): boolean {
  const t = node['@type'];
  return t === type || (Array.isArray(t) && t.includes(type));
}

function findJobPosting(value: unknown, depth = 0): Json | null {
  if (depth > 4) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isObj(value)) return null;
  if (hasType(value, 'JobPosting')) return value;
  return findJobPosting(value['@graph'], depth + 1);
}

function readJsonLd($: Doc): Json | null {
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const found = findJobPosting(JSON.parse($(el).contents().text()));
      if (found) return found;
    } catch {
      // A broken block is skipped; the selectors still get a chance.
    }
  }
  return null;
}

function ldCompany(ld: Json): { name: string; domain: string | null } {
  const org = ld.hiringOrganization;
  if (!isObj(org)) return { name: str(org), domain: null };
  return { name: str(org.name), domain: domainFromWebsite(org.sameAs) ?? domainFromWebsite(org.url) };
}

const placeName = (v: unknown) => (isObj(v) ? str(v.name) : str(v));

function ldLocation(ld: Json): string {
  if (str(ld.jobLocationType).toUpperCase() === 'TELECOMMUTE') return 'Remote';
  const places: unknown[] = Array.isArray(ld.jobLocation) ? ld.jobLocation : [ld.jobLocation];
  const place = places.find(isObj);
  const address = place && isObj(place.address) ? place.address : null;
  if (!address) return '';
  return tidyLocation([str(address.addressLocality), str(address.addressRegion), placeName(address.addressCountry)]);
}

function ldDescription(ld: Json): string {
  const raw = str(ld.description);
  // LinkedIn escapes the HTML inside JSON-LD ("&lt;p&gt;"): decode it once, then strip the tags.
  return htmlToText(/&lt;\/?[a-z]/i.test(raw) ? htmlToText(raw) : raw);
}

function firstText($: Doc, selectors: string[]): string {
  for (const s of selectors) {
    const text = $(s).first().text().replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return '';
}

function firstBlockText($: Doc, selectors: string[]): string {
  for (const s of selectors) {
    const el = $(s).first();
    if (!el.length) continue;
    const text = htmlToText(el.html() ?? '');
    if (text) return text;
  }
  return '';
}

const cleanTitle = (t: string) => t.replace(/\s*-\s*job post$/i, '').trim();

function isLoginUrl(finalUrl: string): boolean {
  try {
    const u = new URL(finalUrl);
    return LOGIN_PATH.test(u.pathname) || u.hostname.toLowerCase() === 'secure.indeed.com';
  } catch {
    return false;
  }
}

const fail = (reason: JobFetchReason): ExtractResult => ({ ok: false, reason });

/** Pure: turns one loaded LinkedIn or Indeed job page into a job, or a reason it cannot be used. */
export function extractJobPage(page: FetchedPage, input: { url: string; source: LinkSource }): ExtractResult {
  if (page.status === 404 || page.status === 410) return fail('not_found');
  if (page.status === 401 || isLoginUrl(page.finalUrl)) return fail('login_required');
  if (page.status !== null && BLOCKED_STATUS.has(page.status)) return fail('blocked');

  const $ = cheerio.load(page.html);
  const ld = readJsonLd($) ?? {};
  const sel = SELECTORS[input.source];
  const company = ldCompany(ld);
  const job = normaliseJob({
    title: str(ld.title) || cleanTitle(firstText($, sel.title)),
    company: company.name || firstText($, sel.company),
    location: ldLocation(ld) || firstText($, sel.location),
    description: ldDescription(ld) || firstBlockText($, sel.description),
    source: input.source,
    url: input.url,
    companyDomain: company.domain,
  });
  if (job) return { ok: true, job };

  if (BLOCK_MARKERS.some((re) => re.test(page.html))) return fail('blocked');
  if (GONE_MARKERS.some((re) => re.test(page.html))) return fail('not_found');
  if (LOGIN_MARKERS.test(page.html)) return fail('login_required');
  return fail('unparseable');
}
