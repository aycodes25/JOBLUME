import type { AutofillPayload } from '@joblume/shared';
import { bytesToBase64 } from './b64';
import type { ArmReply, CvReply, FilledMessage, JobLabel, StatusReply } from './messages';
import { identityOf, judge, type JobIdentity } from './job-match';
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
  /** Which job (and company) this fill belongs to. */
  job: JobIdentity;
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

/** Reads a body stream, giving up as soon as it passes the cap. Returns null when too large. */
async function readCapped(res: Response): Promise<Uint8Array | null> {
  if (!res.body) {
    const buf = await res.arrayBuffer();
    return buf.byteLength > MAX_CV_BYTES ? null : new Uint8Array(buf);
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_CV_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
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

  /** The record when the sender page belongs to the armed job; null (record kept) otherwise. */
  async function authorise(tabId: number, senderUrl: string | undefined): Promise<ArmedRecord | null> {
    const rec = await read(tabId);
    if (!rec) return null;
    const { verdict, key: formKeyOfSender } = judge(rec.job, senderUrl);
    if (verdict === 'drop') {
      await d.store.remove(key(tabId));
      return null;
    }
    if (verdict === 'deny') return null;
    if (verdict === 'pin') {
      const pinned = { ...rec, job: { ...rec.job, pinnedKey: formKeyOfSender } };
      await d.store.set(key(tabId), pinned);
      return pinned;
    }
    return rec;
  }

  return {
    async arm(raw: unknown, rawLabel: unknown, originTabId: number | null): Promise<ArmReply> {
      const payload = validatePayload(raw);
      if (!payload) return { ok: false, error: 'invalid_payload' };
      await sweep();
      const tabId = await d.openTab(payload.job_url);
      if (tabId === null) return { ok: false, error: 'tab_failed' };
      const record: ArmedRecord = { payload, label: cleanLabel(rawLabel), expiresAt: d.now() + EXPIRY_MS, originTabId, cvFetched: false, job: identityOf(payload.job_url) };
      await d.store.set(key(tabId), record);
      return { ok: true };
    },

    /** The payload, only for a page of the job (and company) the extension opened in this tab. */
    async getPayload(tabId: number, senderUrl: string | undefined): Promise<AutofillPayload | null> {
      return (await authorise(tabId, senderUrl))?.payload ?? null;
    },

    async fetchCv(tabId: number, url: string, senderUrl: string | undefined): Promise<CvReply> {
      const rec = await authorise(tabId, senderUrl);
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
        const bytes = await readCapped(res);
        if (!bytes) return { ok: false, error: 'too_large' };
        await d.store.set(key(tabId), { ...rec, cvFetched: true });
        return { ok: true, base64: bytesToBase64(bytes), contentType: 'application/pdf' };
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
