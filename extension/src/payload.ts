import type { AutofillPayload } from '@joblume/shared';

export type { AutofillPayload };

/** Hard caps; anything longer is rejected, never truncated. */
export const LIMITS = { name: 120, email: 254, phone: 20, city: 80, url: 2048, coverLetter: 10_000, filename: 120 } as const;

const KEYS = [
  'job_url', 'full_name', 'first_name', 'last_name', 'email', 'phone', 'city',
  'linkedin_url', 'github_url', 'portfolio_url', 'cover_letter', 'cv',
] as const;
const PHONE_RE = /^[0-9 +()-]{7,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FILENAME_RE = /^[A-Za-z0-9 _.()-]{1,120}$/;
// eslint-disable-next-line no-control-regex
const BAD_URL_CHARS = /[\x00-\x1f\x7f\s]/;

type Res<T> = { ok: true; value: T } | { ok: false };
const bad = { ok: false } as const;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_NO_NEWLINE = /[\x00-\x1f\x7f]/;

function optText(v: unknown, max: number, multiline = false): Res<string | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== 'string' || v.length > max) return bad;
  if ((multiline ? CONTROL_CHARS : CONTROL_CHARS_NO_NEWLINE).test(v)) return bad;
  const t = v.trim();
  return { ok: true, value: t === '' ? null : t };
}

/** The normalised https URL, or null when v is not a plain https URL without credentials. */
export function httpsHref(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0 || v.length > LIMITS.url || BAD_URL_CHARS.test(v)) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.hostname === '') return null;
    return u.href;
  } catch {
    return null;
  }
}

function optUrl(v: unknown): Res<string | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  const href = httpsHref(v);
  return href ? { ok: true, value: href } : bad;
}

/** Strict shape check of what the web page sent. Returns a clean copy, or null when anything is wrong. */
export function validatePayload(input: unknown): AutofillPayload | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  if (Object.keys(o).some((k) => !(KEYS as readonly string[]).includes(k))) return null;

  const jobUrl = httpsHref(o.job_url);
  if (!jobUrl) return null;

  const fullName = optText(o.full_name, LIMITS.name);
  const firstName = optText(o.first_name, LIMITS.name);
  const lastName = optText(o.last_name, LIMITS.name);
  const email = optText(o.email, LIMITS.email);
  const phone = optText(o.phone, LIMITS.phone);
  const city = optText(o.city, LIMITS.city);
  const linkedin = optUrl(o.linkedin_url);
  const github = optUrl(o.github_url);
  const portfolio = optUrl(o.portfolio_url);
  const cover = optText(o.cover_letter, LIMITS.coverLetter, true);
  if (!fullName.ok || !firstName.ok || !lastName.ok || !email.ok || !phone.ok || !city.ok) return null;
  if (!linkedin.ok || !github.ok || !portfolio.ok || !cover.ok) return null;
  if (email.value !== null && !EMAIL_RE.test(email.value)) return null;
  if (phone.value !== null && !PHONE_RE.test(phone.value)) return null;

  let cv: AutofillPayload['cv'] = null;
  if (o.cv !== null && o.cv !== undefined) {
    if (typeof o.cv !== 'object' || Array.isArray(o.cv)) return null;
    const c = o.cv as Record<string, unknown>;
    if (Object.keys(c).some((k) => k !== 'url' && k !== 'filename')) return null;
    const url = httpsHref(c.url);
    if (!url || typeof c.filename !== 'string' || !FILENAME_RE.test(c.filename)) return null;
    cv = { url, filename: c.filename };
  }

  return {
    job_url: jobUrl,
    full_name: fullName.value,
    first_name: firstName.value,
    last_name: lastName.value,
    email: email.value,
    phone: phone.value,
    city: city.value,
    linkedin_url: linkedin.value,
    github_url: github.value,
    portfolio_url: portfolio.value,
    cover_letter: cover.value,
    cv,
  };
}
