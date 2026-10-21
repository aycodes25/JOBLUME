import { describe, expect, it, vi } from 'vitest';
import { EXPIRY_MS, MAX_CV_BYTES, createBackground, hostAllowed, type CoreDeps, type SessionStore } from '../src/background-core';
import type { FilledMessage } from '../src/messages';
import { payload } from './helpers/dom';

function memoryStore(): SessionStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (k) => data.get(k),
    set: async (k, v) => {
      data.set(k, v);
    },
    remove: async (k) => {
      data.delete(k);
    },
    keys: async () => [...data.keys()],
  };
}

type OpenTab = (url: string) => Promise<number | null>;
type NotifyTab = (tabId: number, msg: FilledMessage) => Promise<void>;
type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

function setup(over: Partial<CoreDeps> = {}) {
  const store = memoryStore();
  const clock = { now: 1_000_000 };
  const openTab = vi.fn<OpenTab>().mockImplementation(async () => 7);
  const notifyTab = vi.fn<NotifyTab>().mockImplementation(async () => undefined);
  const fetchImpl = vi.fn<FetchImpl>().mockImplementation(async () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 }));
  const core = createBackground({
    store, openTab, notifyTab, fetchImpl, now: () => clock.now, storageHost: 'abcd1234.supabase.co', ...over,
  });
  return { core, store, clock, openTab, notifyTab, fetchImpl };
}

describe('hostAllowed', () => {
  it('matches exact hosts and wildcard sub-domains only', () => {
    expect(hostAllowed('abcd1234.supabase.co', 'abcd1234.supabase.co')).toBe(true);
    expect(hostAllowed('other.supabase.co', 'abcd1234.supabase.co')).toBe(false);
    expect(hostAllowed('abcd1234.supabase.co', '*.supabase.co')).toBe(true);
    expect(hostAllowed('supabase.co', '*.supabase.co')).toBe(false);
    expect(hostAllowed('evilsupabase.co', '*.supabase.co')).toBe(false);
    expect(hostAllowed('abcd1234.supabase.co.evil.com', '*.supabase.co')).toBe(false);
  });
});

describe('arming', () => {
  it('opens the job in a new tab and stores the payload for that tab with a 30 minute expiry', async () => {
    const { core, store, openTab, clock } = setup();
    const res = await core.arm(payload(), { title: 'Data Analyst', company: 'Acme' }, 3);
    expect(res).toEqual({ ok: true });
    expect(openTab).toHaveBeenCalledWith('https://job-boards.greenhouse.io/gitlab/jobs/8860302002');
    const rec = store.data.get('armed:7') as { expiresAt: number; originTabId: number; label: unknown };
    expect(rec.expiresAt).toBe(clock.now + EXPIRY_MS);
    expect(rec.originTabId).toBe(3);
    expect(rec.label).toEqual({ title: 'Data Analyst', company: 'Acme' });
  });

  it('rejects an invalid payload without opening a tab or storing anything', async () => {
    const { core, store, openTab } = setup();
    const res = await core.arm({ ...payload(), job_url: 'http://insecure.example/job' }, null, 3);
    expect(res).toEqual({ ok: false, error: 'invalid_payload' });
    expect(openTab).not.toHaveBeenCalled();
    expect(store.data.size).toBe(0);
  });

  it('reports tab_failed when Chrome gives no tab id', async () => {
    const { core, store } = setup({ openTab: vi.fn<OpenTab>().mockImplementation(async () => null) });
    expect(await core.arm(payload(), null, 3)).toEqual({ ok: false, error: 'tab_failed' });
    expect(store.data.size).toBe(0);
  });

  it('keeps only a clean job label and drops a malformed one', async () => {
    const { core, store } = setup();
    await core.arm(payload(), { title: 'x'.repeat(500), company: 5 }, null);
    expect((store.data.get('armed:7') as { label: { title: string; company: string } }).label).toEqual({ title: 'x'.repeat(120), company: '' });
    await core.arm(payload(), 'nope', null);
    expect((store.data.get('armed:7') as { label: unknown }).label).toBeNull();
  });

  it('removes expired records of other tabs when arming', async () => {
    const { core, store, clock } = setup();
    await core.arm(payload(), null, null);
    store.data.set('unrelated', 'keep');
    clock.now += EXPIRY_MS + 1;
    await core.arm(payload(), null, null);
    expect([...store.data.keys()].sort()).toEqual(['armed:7', 'unrelated']);
    expect((store.data.get('armed:7') as { expiresAt: number }).expiresAt).toBe(clock.now + EXPIRY_MS);
  });
});

describe('tab binding and expiry', () => {
  it('hands the payload only to the tab it was armed for', async () => {
    const { core } = setup();
    await core.arm(payload(), null, null);
    expect((await core.getPayload(7))?.email).toBe('ada@example.com');
    expect(await core.getPayload(8)).toBeNull();
  });

  it('forgets the payload after 30 minutes', async () => {
    const { core, store, clock } = setup();
    await core.arm(payload(), null, null);
    clock.now += EXPIRY_MS - 1;
    expect(await core.getPayload(7)).not.toBeNull();
    clock.now += 1;
    expect(await core.getPayload(7)).toBeNull();
    expect(store.data.has('armed:7')).toBe(false);
    expect(await core.status(7)).toEqual({ armed: false, label: null, expiresAt: null });
  });

  it('forgets the payload when the tab closes or the user clears it', async () => {
    const { core, store } = setup();
    await core.arm(payload(), null, null);
    await core.onTabRemoved(7);
    expect(store.data.size).toBe(0);
    await core.arm(payload(), null, null);
    await core.clear(7);
    expect(store.data.size).toBe(0);
  });

  it('reports status with the label and expiry', async () => {
    const { core, clock } = setup();
    await core.arm(payload(), { title: 'Data Analyst', company: 'Acme' }, null);
    expect(await core.status(7)).toEqual({ armed: true, label: { title: 'Data Analyst', company: 'Acme' }, expiresAt: clock.now + EXPIRY_MS });
  });
});

describe('completing a fill', () => {
  it('deletes the payload and tells the JobLume tab how many fields were filled', async () => {
    const { core, store, notifyTab } = setup();
    await core.arm(payload(), null, 3);
    await core.complete(7, 5);
    expect(store.data.size).toBe(0);
    expect(notifyTab).toHaveBeenCalledWith(3, { type: 'joblume:filled', count: 5 });
  });

  it('still deletes the payload when the JobLume tab is gone', async () => {
    const { core, store } = setup({ notifyTab: vi.fn<NotifyTab>().mockImplementation(async () => { throw new Error('no receiver'); }) });
    await core.arm(payload(), null, 3);
    await core.complete(7, 2);
    expect(store.data.size).toBe(0);
  });

  it('does not notify anyone when no tab armed it', async () => {
    const { core, notifyTab } = setup();
    await core.arm(payload(), null, null);
    await core.complete(7, 2);
    expect(notifyTab).not.toHaveBeenCalled();
  });
});

describe('fetching the CV', () => {
  const url = payload().cv!.url;

  it('downloads the armed link once, with no cookies and no redirects, and returns it as base64', async () => {
    const { core, fetchImpl } = setup();
    await core.arm(payload(), null, null);
    const res = await core.fetchCv(7, url);
    expect(res).toEqual({ ok: true, base64: 'JVBERg==', contentType: 'application/pdf' });
    expect(fetchImpl).toHaveBeenCalledWith(url, { credentials: 'omit', redirect: 'error', cache: 'no-store' });
    expect(await core.fetchCv(7, url)).toEqual({ ok: false, error: 'already_used' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses a url other than the armed one, a tab with no payload and a payload with no cv', async () => {
    const { core, fetchImpl } = setup();
    await core.arm(payload(), null, null);
    expect(await core.fetchCv(7, 'https://abcd1234.supabase.co/other.pdf')).toEqual({ ok: false, error: 'url_mismatch' });
    expect(await core.fetchCv(9, url)).toEqual({ ok: false, error: 'no_cv' });
    await core.arm(payload({ cv: null }), null, null);
    expect(await core.fetchCv(7, url)).toEqual({ ok: false, error: 'no_cv' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a host that is not the configured storage host', async () => {
    const { core, fetchImpl } = setup();
    const evil = 'https://evil.example/x.pdf';
    await core.arm(payload({ cv: { url: evil, filename: 'cv.pdf' } }), null, null);
    expect(await core.fetchCv(7, evil)).toEqual({ ok: false, error: 'host_not_allowed' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a file over 10 MB, by header and by size', async () => {
    const big = vi.fn<FetchImpl>().mockImplementation(async () => new Response('x', { status: 200, headers: { 'content-length': String(MAX_CV_BYTES + 1) } }));
    const a = setup({ fetchImpl: big });
    await a.core.arm(payload(), null, null);
    expect(await a.core.fetchCv(7, url)).toEqual({ ok: false, error: 'too_large' });

    const body = vi.fn<FetchImpl>().mockImplementation(async () => new Response(new Uint8Array(MAX_CV_BYTES + 1), { status: 200 }));
    const b = setup({ fetchImpl: body });
    await b.core.arm(payload(), null, null);
    expect(await b.core.fetchCv(7, url)).toEqual({ ok: false, error: 'too_large' });
  });

  it('reports http errors and network errors, and allows a retry after a failure', async () => {
    const fetchImpl = vi.fn<FetchImpl>();
    fetchImpl.mockImplementationOnce(async () => new Response('no', { status: 403 }));
    fetchImpl.mockImplementationOnce(async () => { throw new TypeError('network'); });
    fetchImpl.mockImplementation(async () => new Response(new Uint8Array([1]), { status: 200 }));
    const { core } = setup({ fetchImpl });
    await core.arm(payload(), null, null);
    expect(await core.fetchCv(7, url)).toEqual({ ok: false, error: 'http_403' });
    expect(await core.fetchCv(7, url)).toEqual({ ok: false, error: 'fetch_failed' });
    expect((await core.fetchCv(7, url)).ok).toBe(true);
  });
});
