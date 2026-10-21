import { describe, expect, it, vi } from 'vitest';
import type { Background } from '../src/background-core';
import { routeMessage, type RouterConfig } from '../src/router';
import { payload } from './helpers/dom';

const cfg: RouterConfig = { joblumeOrigins: ['http://localhost:3000'], extensionBase: 'chrome-extension://abc/' };

function fakeCore() {
  return {
    arm: vi.fn<Background['arm']>().mockImplementation(async () => ({ ok: true })),
    getPayload: vi.fn<Background['getPayload']>().mockImplementation(async () => payload()),
    fetchCv: vi.fn<Background['fetchCv']>().mockImplementation(async () => ({ ok: true, base64: 'AA==', contentType: 'application/pdf' })),
    complete: vi.fn<Background['complete']>().mockImplementation(async () => undefined),
    clear: vi.fn<Background['clear']>().mockImplementation(async () => undefined),
    status: vi.fn<Background['status']>().mockImplementation(async () => ({ armed: false, label: null, expiresAt: null })),
    onTabRemoved: vi.fn<Background['onTabRemoved']>().mockImplementation(async () => undefined),
  };
}

describe('routeMessage', () => {
  it('arms only for a tab on a configured JobLume origin', async () => {
    const core = fakeCore();
    const msg = { type: 'joblume:arm', payload: payload(), label: { title: 'T', company: 'C' } };
    expect(await routeMessage(core, cfg, msg, { tab: { id: 3 }, url: 'http://localhost:3000/queue' })).toEqual({ ok: true });
    expect(core.arm).toHaveBeenCalledWith(msg.payload, msg.label, 3);

    core.arm.mockClear();
    const denied = { ok: false, error: 'not_allowed' };
    expect(await routeMessage(core, cfg, msg, { tab: { id: 3 }, url: 'https://boards.greenhouse.io/x' })).toEqual(denied);
    expect(await routeMessage(core, cfg, msg, { tab: { id: 3 }, url: 'http://localhost:3000.evil.com/' })).toEqual(denied);
    expect(await routeMessage(core, cfg, msg, { url: 'http://localhost:3000/' })).toEqual(denied);
    expect(await routeMessage(core, cfg, msg, { tab: { id: 3 } })).toEqual(denied);
    expect(core.arm).not.toHaveBeenCalled();
  });

  it('answers get-payload, fetch-cv and done for the sending tab only', async () => {
    const core = fakeCore();
    const from = { tab: { id: 7 }, url: 'https://jobs.lever.co/x' };
    expect((await routeMessage(core, cfg, { type: 'joblume:get-payload' }, from) as { payload: unknown }).payload).toEqual(payload());
    expect(core.getPayload).toHaveBeenCalledWith(7, 'https://jobs.lever.co/x');
    await routeMessage(core, cfg, { type: 'joblume:fetch-cv', url: 'https://abcd1234.supabase.co/x.pdf' }, from);
    expect(core.fetchCv).toHaveBeenCalledWith(7, 'https://abcd1234.supabase.co/x.pdf', 'https://jobs.lever.co/x');
    expect(await routeMessage(core, cfg, { type: 'joblume:done', filled: 4 }, from)).toEqual({ ok: true });
    expect(core.complete).toHaveBeenCalledWith(7, 4);

    expect(await routeMessage(core, cfg, { type: 'joblume:get-payload' }, {})).toBeNull();
    expect(await routeMessage(core, cfg, { type: 'joblume:fetch-cv', url: 5 }, from)).toBeNull();
    expect(await routeMessage(core, cfg, { type: 'joblume:done', filled: -1 }, from)).toBeNull();
    expect(await routeMessage(core, cfg, { type: 'joblume:done', filled: 1.5 }, from)).toBeNull();
  });

  it('lets the popup name a tab for status and clear, but never a web page', async () => {
    const core = fakeCore();
    const popup = { url: 'chrome-extension://abc/popup.html' };
    await routeMessage(core, cfg, { type: 'joblume:status', tabId: 12 }, popup);
    expect(core.status).toHaveBeenCalledWith(12);
    expect(await routeMessage(core, cfg, { type: 'joblume:clear', tabId: 12 }, popup)).toEqual({ ok: true });
    expect(core.clear).toHaveBeenCalledWith(12);

    core.status.mockClear();
    const page = { tab: { id: 7 }, url: 'https://jobs.lever.co/x' };
    await routeMessage(core, cfg, { type: 'joblume:status', tabId: 12 }, page);
    expect(core.status).toHaveBeenCalledWith(7);
    expect(await routeMessage(core, cfg, { type: 'joblume:status', tabId: 12 }, { url: 'https://evil.example/' })).toBeNull();
  });

  it('ignores unknown and malformed messages', async () => {
    const core = fakeCore();
    expect(await routeMessage(core, cfg, 'hello', { tab: { id: 1 } })).toBeNull();
    expect(await routeMessage(core, cfg, null, { tab: { id: 1 } })).toBeNull();
    expect(await routeMessage(core, cfg, { type: 'joblume:nope' }, { tab: { id: 1 } })).toBeNull();
  });
});
