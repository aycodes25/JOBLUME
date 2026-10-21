/** Hosts of the four supported employer application forms. */
export const FORM_MATCHES = [
  'https://boards.greenhouse.io/*',
  'https://job-boards.greenhouse.io/*',
  'https://jobs.lever.co/*',
  'https://jobs.ashbyhq.com/*',
  'https://apply.workable.com/*',
] as const;

export const DEFAULT_ORIGINS = 'http://localhost:3000';
export const DEFAULT_STORAGE_HOST = '*.supabase.co';

export interface BuildConfig {
  /** JobLume web origins such as http://localhost:3000 (no path). */
  origins: string[];
  /** Supabase storage host the signed CV link may point to, e.g. abcd1234.supabase.co or *.supabase.co. */
  storageHost: string;
}

const ORIGIN_RE = /^(https?):\/\/([a-z0-9.-]+)(:\d{1,5})?$/;
const HOST_RE = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function parseBuildConfig(env: Record<string, string | undefined>): BuildConfig {
  const rawOrigins = (env.EXTENSION_JOBLUME_ORIGINS ?? DEFAULT_ORIGINS)
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, '').toLowerCase())
    .filter(Boolean);
  if (rawOrigins.length === 0) throw new Error('EXTENSION_JOBLUME_ORIGINS must list at least one origin');
  for (const o of rawOrigins) {
    const m = ORIGIN_RE.exec(o);
    if (!m) throw new Error(`Bad origin in EXTENSION_JOBLUME_ORIGINS: ${o} (use scheme://host[:port], no path)`);
    const host = m[2]!;
    if (m[1] === 'http' && host !== 'localhost' && host !== '127.0.0.1') {
      throw new Error(`Only https origins are allowed except localhost: ${o}`);
    }
  }
  const storageHost = (env.EXTENSION_STORAGE_HOST ?? DEFAULT_STORAGE_HOST).trim().toLowerCase();
  if (!HOST_RE.test(storageHost)) throw new Error(`Bad EXTENSION_STORAGE_HOST: ${storageHost} (host name only, e.g. abcd1234.supabase.co)`);
  return { origins: [...new Set(rawOrigins)], storageHost };
}

/** Build-time warnings about settings that widen what the extension trusts. */
export function configWarnings(cfg: BuildConfig, env: Record<string, string | undefined>): string[] {
  const warnings: string[] = [];
  if (!env.EXTENSION_STORAGE_HOST) {
    warnings.push(
      'EXTENSION_STORAGE_HOST is not set: the CV download is allowed from any *.supabase.co host. Set it to your project host (for example abcd1234.supabase.co).',
    );
  }
  const local = cfg.origins.filter((o) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o));
  if (local.length > 0) {
    warnings.push(
      `EXTENSION_JOBLUME_ORIGINS includes ${local.join(', ')}: the extension will trust any app running on that local address, not only JobLume. Low impact, but remove it from builds you use on a shared computer.`,
    );
  }
  return warnings;
}

export function buildManifest(cfg: BuildConfig) {
  const webMatches = cfg.origins.map((o) => `${o}/*`);
  return {
    manifest_version: 3,
    name: 'JobLume Autofill',
    version: '0.1.0',
    description: 'Fills the standard fields of employer application forms from JobLume. It never submits anything.',
    minimum_chrome_version: '116',
    permissions: ['storage'],
    host_permissions: [...FORM_MATCHES, ...webMatches, `https://${cfg.storageHost}/*`],
    background: { service_worker: 'background.js' },
    content_scripts: [
      { matches: webMatches, js: ['bridge.js'], run_at: 'document_start' },
      { matches: [...FORM_MATCHES], js: ['forms.js'], run_at: 'document_idle', all_frames: true },
    ],
    action: { default_title: 'JobLume Autofill', default_popup: 'popup.html' },
  };
}
