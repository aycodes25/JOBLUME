import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBridge, type BridgeRuntime } from '../src/bridge-core';
import { payload } from './helpers/dom';

type Send = (msg: unknown) => Promise<unknown>;

function setup(reply: unknown = { ok: true }) {
  const sendMessage = vi.fn<Send>().mockImplementation(async () => reply);
  let listener: ((msg: unknown) => void) | undefined;
  const rt: BridgeRuntime = { sendMessage, onMessage: (cb) => { listener = cb; } };
  const post = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
  const remove = installBridge(window, rt);
  return { sendMessage, post, remove, fromBackground: (m: unknown) => listener?.(m) };
}

function deliver(data: unknown, init: { origin?: string; source?: Window | null } = {}) {
  window.dispatchEvent(new MessageEvent('message', { data, origin: init.origin ?? window.location.origin, source: init.source === undefined ? window : init.source }));
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('web bridge', () => {
  let remove: (() => void) | undefined;
  beforeEach(() => {
    remove = undefined;
  });
  afterEach(() => {
    remove?.();
    vi.restoreAllMocks();
  });

  it('answers a ping from the page with a pong on the same origin', () => {
    const t = setup();
    remove = t.remove;
    deliver({ source: 'joblume-web', type: 'ping' });
    expect(t.post).toHaveBeenCalledWith({ source: 'joblume-extension', type: 'pong' }, window.location.origin);
  });

  it('ignores messages from another origin, another window, or without the JobLume source tag', () => {
    const t = setup();
    remove = t.remove;
    deliver({ source: 'joblume-web', type: 'ping' }, { origin: 'https://evil.example' });
    deliver({ source: 'joblume-web', type: 'ping' }, { source: null });
    deliver({ source: 'joblume-web', type: 'ping' }, { source: {} as Window });
    deliver({ source: 'something-else', type: 'ping' });
    deliver('ping');
    deliver(null);
    expect(t.post).not.toHaveBeenCalled();
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it('forwards a fill request to the background and tells the page whether it was armed', async () => {
    const t = setup({ ok: true });
    remove = t.remove;
    const label = { title: 'Data Analyst', company: 'Acme' };
    deliver({ source: 'joblume-web', type: 'fill', payload: payload(), label });
    await flush();
    expect(t.sendMessage).toHaveBeenCalledWith({ type: 'joblume:arm', payload: payload(), label });
    expect(t.post).toHaveBeenCalledWith({ source: 'joblume-extension', type: 'armed', ok: true }, window.location.origin);
  });

  it('reports a rejected or unanswered fill as not armed', async () => {
    const rejected = setup({ ok: false, error: 'invalid_payload' });
    remove = rejected.remove;
    deliver({ source: 'joblume-web', type: 'fill', payload: { nope: 1 } });
    await flush();
    expect(rejected.post).toHaveBeenCalledWith({ source: 'joblume-extension', type: 'armed', ok: false, error: 'invalid_payload' }, window.location.origin);
    rejected.remove();
    vi.restoreAllMocks();

    const t = setup();
    remove = t.remove;
    t.sendMessage.mockImplementation(async () => { throw new Error('worker asleep'); });
    deliver({ source: 'joblume-web', type: 'fill', payload: payload() });
    await flush();
    expect(t.post).toHaveBeenCalledWith({ source: 'joblume-extension', type: 'armed', ok: false, error: 'no_reply' }, window.location.origin);
  });

  it('does not forward a fill from the wrong origin', async () => {
    const t = setup();
    remove = t.remove;
    deliver({ source: 'joblume-web', type: 'fill', payload: payload() }, { origin: 'https://evil.example' });
    await flush();
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it('relays the filled count from the background to the page and ignores anything else', () => {
    const t = setup();
    remove = t.remove;
    t.fromBackground({ type: 'joblume:filled', count: 6 });
    expect(t.post).toHaveBeenCalledWith({ source: 'joblume-extension', type: 'filled', count: 6 }, window.location.origin);
    t.post.mockClear();
    t.fromBackground({ type: 'joblume:filled', count: 'many' });
    t.fromBackground({ type: 'joblume:filled', count: -2 });
    t.fromBackground({ type: 'other' });
    t.fromBackground(null);
    expect(t.post).not.toHaveBeenCalled();
  });

  it('stops listening once removed', () => {
    const t = setup();
    t.remove();
    deliver({ source: 'joblume-web', type: 'ping' });
    expect(t.post).not.toHaveBeenCalled();
  });
});
