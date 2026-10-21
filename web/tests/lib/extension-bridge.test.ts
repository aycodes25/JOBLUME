import type { AutofillPayload } from '@joblume/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExtensionBridge } from '@/lib/extension-bridge';

const payload: AutofillPayload = {
  job_url: 'https://job-boards.greenhouse.io/acme/jobs/1', full_name: 'Ada Lovelace', first_name: 'Ada', last_name: 'Lovelace', email: 'a@b.c',
  phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null, cover_letter: null, cv: null,
};
const label = { title: 'Data Analyst', company: 'Acme' };

/** Delivers a message the way the extension's content script does: from this window, on this origin. */
function fromExtension(data: unknown, init: { origin?: string; source?: Window | null } = {}) {
  window.dispatchEvent(
    new MessageEvent('message', { data, origin: init.origin ?? window.location.origin, source: init.source === undefined ? window : init.source }),
  );
}

/** Makes window.postMessage answer like the extension would. */
function extensionAnswers(reply: (sent: Record<string, unknown>) => unknown) {
  return vi.spyOn(window, 'postMessage').mockImplementation(((sent: Record<string, unknown>) => {
    const r = reply(sent);
    if (r !== undefined) setTimeout(() => fromExtension(r), 0);
  }) as typeof window.postMessage);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('extension bridge', () => {
  it('pings with the web tag on this origin and sees the pong', async () => {
    const post = extensionAnswers((m) => (m.type === 'ping' ? { source: 'joblume-extension', type: 'pong' } : undefined));
    expect(await createExtensionBridge().ping()).toBe(true);
    expect(post).toHaveBeenCalledWith({ source: 'joblume-web', type: 'ping' }, window.location.origin);
  });

  it('reports not installed when nothing answers', async () => {
    extensionAnswers(() => undefined);
    expect(await createExtensionBridge(window, { ping: 20, fill: 20 }).ping()).toBe(false);
  });

  it('ignores a pong from another origin, another window or without the extension tag', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation((() => {
      fromExtension({ source: 'joblume-extension', type: 'pong' }, { origin: 'https://evil.example' });
      fromExtension({ source: 'joblume-extension', type: 'pong' }, { source: null });
      fromExtension({ source: 'someone-else', type: 'pong' });
    }) as typeof window.postMessage);
    expect(await createExtensionBridge(window, { ping: 30, fill: 30 }).ping()).toBe(false);
  });

  it('sends the payload and label in a fill message and resolves ok when the extension arms it', async () => {
    const post = extensionAnswers((m) => (m.type === 'fill' ? { source: 'joblume-extension', type: 'armed', ok: true } : undefined));
    expect(await createExtensionBridge().fill(payload, label)).toEqual({ ok: true });
    expect(post).toHaveBeenCalledWith({ source: 'joblume-web', type: 'fill', payload, label }, window.location.origin);
  });

  it('passes on a known refusal, maps an unknown one, and times out to no_reply', async () => {
    extensionAnswers(() => ({ source: 'joblume-extension', type: 'armed', ok: false, error: 'invalid_payload' }));
    expect(await createExtensionBridge().fill(payload, label)).toEqual({ ok: false, error: 'invalid_payload' });
    vi.restoreAllMocks();

    extensionAnswers(() => ({ source: 'joblume-extension', type: 'armed', ok: false, error: '<script>' }));
    expect(await createExtensionBridge().fill(payload, label)).toEqual({ ok: false, error: 'unknown' });
    vi.restoreAllMocks();

    extensionAnswers(() => undefined);
    expect(await createExtensionBridge(window, { ping: 20, fill: 20 }).fill(payload, label)).toEqual({ ok: false, error: 'no_reply' });
  });

  it('reports filled counts, ignores anything malformed, and stops after unsubscribe', () => {
    const seen: number[] = [];
    const stop = createExtensionBridge().onFilled((n) => seen.push(n));
    fromExtension({ source: 'joblume-extension', type: 'filled', count: 5 });
    fromExtension({ source: 'joblume-extension', type: 'filled', count: '5' });
    fromExtension({ source: 'joblume-extension', type: 'filled', count: -1 });
    fromExtension({ source: 'joblume-extension', type: 'filled', count: 5 }, { origin: 'https://evil.example' });
    fromExtension({ source: 'joblume-web', type: 'filled', count: 5 });
    expect(seen).toEqual([5]);
    stop();
    fromExtension({ source: 'joblume-extension', type: 'filled', count: 6 });
    expect(seen).toEqual([5]);
  });
});
