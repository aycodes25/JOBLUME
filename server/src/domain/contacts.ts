/**
 * Contact details an employer printed in a job posting. Pure: no I/O.
 * The input is untrusted text. Every scan is linear in the (capped) input: no unbounded
 * regex quantifiers run over the whole text, and the number of "@" and "whatsapp" hits is capped.
 */

export const MAX_INPUT_CHARS = 100_000;
export const MAX_EMAILS = 5;
export const MAX_WHATSAPP = 3;
const MAX_HITS = 500;
const MAX_LOCAL = 64;
const MAX_DOMAIN = 190;
const NEAR_WHATSAPP = 40;

export interface ExtractedContacts {
  emails: string[];
  whatsapp: string[];
}

const NOT_A_CONTACT_LOCAL = /^(?:no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|mailer-daemon|postmaster|bounce[s]?|unsubscribe)(?:[-_.+].*)?$/;
const NOT_A_CONTACT_DOMAIN = /(?:^|\.)(?:example\.(?:com|org|net)|domain\.com|yourcompany\.com|yourdomain\.com|sentry\.io|wixpress\.com|localhost)$/;
const FILE_TLDS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'avif', 'tif', 'tiff', 'heic', 'css', 'js', 'mjs', 'json', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'map', 'pdf', 'html', 'htm',
]);
const LOW_PRIORITY_LOCAL = /^(?:privacy|support|abuse|legal|dpo|security|webmaster|help|info-?security|compliance|gdpr|press|media|billing|sales)$/;

const isLocalChar = (c: string) => /[a-z0-9._%+-]/.test(c);
const isDomainChar = (c: string) => /[a-z0-9.-]/.test(c);
const EMAIL = /^[a-z0-9._%+-]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){1,5}[a-z]{2,24}$/;

/** "name [at] company dot com" and "name(at)company.com" become real addresses. Bounded whitespace, no nested quantifiers. */
function deobfuscate(text: string): string {
  return text
    .replace(/[ \t]{0,3}[[({][ \t]?at[ \t]?[\])}][ \t]{0,3}/gi, '@')
    .replace(/[ \t]{0,3}[[({][ \t]?dot[ \t]?[\])}][ \t]{0,3}/gi, '.')
    .replace(/@[a-z0-9-]{1,63}(?: dot [a-z0-9-]{1,63}){1,4}/gi, (m) => m.replace(/ dot /gi, '.'));
}

function cleanEmail(local: string, domain: string): string | null {
  // Trailing sentence punctuation and stray separators are not part of the address.
  const d = domain.replace(/^[.-]+/, '').replace(/[.-]+$/, '');
  const l = local.replace(/^[^a-z0-9]+/, '').replace(/[._%+-]+$/, '');
  if (!l || !d || l.includes('..') || d.includes('..')) return null;
  const email = `${l}@${d}`;
  if (email.length > 254 || !EMAIL.test(email)) return null;
  const tld = d.slice(d.lastIndexOf('.') + 1);
  if (FILE_TLDS.has(tld)) return null;
  if (NOT_A_CONTACT_LOCAL.test(l) || NOT_A_CONTACT_DOMAIN.test(d)) return null;
  return email;
}

function extractEmails(raw: string): string[] {
  const text = deobfuscate(raw).toLowerCase();
  const found: string[] = [];
  let at = text.indexOf('@');
  let hits = 0;
  while (at !== -1 && hits < MAX_HITS) {
    hits += 1;
    let start = at;
    while (start > 0 && at - start < MAX_LOCAL && isLocalChar(text[start - 1] as string)) start -= 1;
    let end = at + 1;
    while (end < text.length && end - at <= MAX_DOMAIN && isDomainChar(text[end] as string)) end += 1;
    const email = cleanEmail(text.slice(start, at), text.slice(at + 1, end));
    if (email && !found.includes(email)) found.push(email);
    at = text.indexOf('@', at + 1);
  }
  const preferred = found.filter((e) => !LOW_PRIORITY_LOCAL.test(e.slice(0, e.indexOf('@'))));
  return (preferred.length > 0 ? preferred : found).slice(0, MAX_EMAILS);
}

/** Digits with country code, or null when the text does not look like a phone number. */
function normalisePhone(raw: string): string | null {
  const plus = raw.trim().startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (plus) return /^\d{8,15}$/.test(digits) ? digits : null;
  if (digits.startsWith('00') && /^\d{10,17}$/.test(digits)) return digits.slice(2);
  if (/^0[789]\d{9}$/.test(digits)) return `234${digits.slice(1)}`;
  if (/^234[789]\d{9}$/.test(digits)) return digits;
  return null;
}

const LINK_WA_ME = /\bwa\.me\/\+?(\d{7,15})(?!\d)/gi;
const LINK_API = /whatsapp\.com\/send\/?\?[^\s"'<>]{0,200}?phone=(?:\+|%2[bB])?(\d{7,15})(?!\d)/gi;
const PHONE_IN_WINDOW = /\+?\d[\d\s().-]{5,18}\d/g;

function extractWhatsapp(text: string): string[] {
  const found: string[] = [];
  const add = (n: string | null) => {
    if (n && !found.includes(n)) found.push(n);
  };
  for (const re of [LINK_WA_ME, LINK_API]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    let hits = 0;
    while ((m = re.exec(text)) !== null && hits < MAX_HITS) {
      hits += 1;
      add(m[1] ?? null);
    }
  }
  const lower = text.toLowerCase();
  let idx = lower.indexOf('whatsapp');
  let hits = 0;
  while (idx !== -1 && hits < MAX_HITS && found.length < MAX_WHATSAPP) {
    hits += 1;
    const window = text.slice(Math.max(0, idx - NEAR_WHATSAPP), idx + 'whatsapp'.length + NEAR_WHATSAPP);
    for (const m of window.matchAll(PHONE_IN_WINDOW)) add(normalisePhone(m[0]));
    idx = lower.indexOf('whatsapp', idx + 8);
  }
  return found.slice(0, MAX_WHATSAPP);
}

export function extractContacts(input: string): ExtractedContacts {
  if (typeof input !== 'string' || input === '') return { emails: [], whatsapp: [] };
  const text = input.slice(0, MAX_INPUT_CHARS);
  return { emails: extractEmails(text), whatsapp: extractWhatsapp(text) };
}
