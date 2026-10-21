import type { AutofillPayload } from '@joblume/shared';
import { bytesToBase64 } from './b64';
import type { ArmReply, CvReply, FilledMessage, JobLabel, StatusReply } from './messages';
import { validatePayload } from './payload';

export const EXPIRY_MS = 30 * 60 * 1000;
export const MAX_CV_BYTES = 10 * 1024 * 1024;
const PREFIX = 'armed:';
const key = (tabId: number) => `${PREFIX}${tabId}`;

export interface ArmedRecord {
  payload: AutofillPayload;
  label: JobLabel | null;
  expiresAt: number;
  /** The JobLume tab that armed this fill; it is told how many fields were filled. */
  originTabId: number | null;
  /** The signed CV link is fetched at most once. */
  cvFetched: boolean;
}

/** In production chrome.storage.session; a Map in tests. */
export interface SessionStore {
  get(k: string): Promise<unknown>;
  set(k: string, value: unknown): Promise<void>;
  remove(k: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface CoreDeps {
  store: SessionStore;
  /** Opens the job in a new tab and returns its id (null when Chrome gave none). */
  openTab(url: string): Promise<number | null>;
  notifyTab(tabId: number, msg: FilledMessage): Promise<void>;
  fetchImpl(url: string, init: RequestInit): Promise<Response>;
  now(): number;
  /** Allowed host for the signed CV link: an exact host or a wildcard such as *.supabase.co. */
  storageHost: string;
}

export function hostAllowed(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase();
  if (p.startsWith('*.')) return h.length > p.length - 1 && h.endsWith(p.slice(1));
  return h === p;
}

export function cleanLabel(raw: unknown): JobLabel | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.trim().slice(0, 120) : '';
  const company = typeof o.company === 'string' ? o.company.trim().slice(0, 120) : '';
  return title || company ? { title, company } : null;
}

export function createBackground(d: CoreDeps) {
  async function read(tabId: number): Promise<ArmedRecord | null> {
    const raw = (await d.store.get(key(tabId))) as ArmedRecord | undefined;
    if (!raw) return null;
    if (raw.expiresAt <= d.now()) {
      await d.store.remove(key(tabId));
      return null;
    }
    return raw;
  }

  async function sweep(): Promise<void> {
    for (const k of await d.store.keys()) {
      if (!k.startsWith(PREFIX)) continue;
      const rec = (await d.store.get(k)) as ArmedRecord | undefined;
      if (!rec || rec.expiresAt <= d.now()) await d.store.remove(k);
    }
  }

  return {
    async arm(raw: unknown, rawLabel: unknown, originTabId: number | null): Promise<ArmReply> {
      const payload = validatePayload(raw);
      if (!payload) return { ok: false, error: 'invalid_payload' };
      await sweep();
      const tabId = await d.openTab(payload.job_url);
      if (tabId === null) return { ok: false, error: 'tab_failed' };
      const record: ArmedRecord = { payload, label: cleanLabel(rawLabel), expiresAt: d.now() + EXPIRY_MS, originTabId, cvFetched: false };
      await d.store.set(key(tabId), record);
      return { ok: true };
    },

    async getPayload(tabId: number): Promise<AutofillPayload | null> {
      return (await read(tabId))?.payload ?? null;
    },

    async fetchCv(tabId: number, url: string): Promise<CvReply> {
      const rec = await read(tabId);
      if (!rec?.payload.cv) return { ok: false, error: 'no_cv' };
      if (rec.payload.cv.url !== url) return { ok: false, error: 'url_mismatch' };
      if (rec.cvFetched) return { ok: false, error: 'already_used' };
      let u: URL;
      try {
        u = new URL(url);
      } catch {
        return { ok: false, error: 'bad_url' };
      }
      if (u.protocol !== 'https:' || !hostAllowed(u.hostname, d.storageHost)) return { ok: false, error: 'host_not_allowed' };
      try {
        const res = await d.fetchImpl(url, { credentials: 'omit', redirect: 'error', cache: 'no-store' });
        if (!res.ok) return { ok: false, error: `http_${res.status}` };
        if (Number(res.headers.get('content-length') ?? '0') > MAX_CV_BYTES) return { ok: false, error: 'too_large' };
        const buf = await res.arrayBuffer();
        if (buf.byteLength > MAX_CV_BYTES) return { ok: false, error: 'too_large' };
        await d.store.set(key(tabId), { ...rec, cvFetched: true });
        return { ok: true, base64: bytesToBase64(new Uint8Array(buf)), contentType: 'application/pdf' };
      } catch {
        return { ok: false, error: 'fetch_failed' };
      }
    },

    /** The form was filled: forget the payload and tell the JobLume tab how many fields were filled. */
    async complete(tabId: number, filled: number): Promise<void> {
      const rec = await read(tabId);
      await d.store.remove(key(tabId));
      if (rec?.originTabId != null) {
        try {
          await d.notifyTab(rec.originTabId, { type: 'joblume:filled', count: filled });
        } catch {
          // The JobLume tab may be closed; nothing to do.
        }
      }
    },

    async clear(tabId: number): Promise<void> {
      await d.store.remove(key(tabId));
    },

    async status(tabId: number): Promise<StatusReply> {
      const rec = await read(tabId);
      return rec ? { armed: true, label: rec.label, expiresAt: rec.expiresAt } : { armed: false, label: null, expiresAt: null };
    },

    async onTabRemoved(tabId: number): Promise<void> {
      await d.store.remove(key(tabId));
    },
  };
}

export type Background = ReturnType<typeof createBackground>;
