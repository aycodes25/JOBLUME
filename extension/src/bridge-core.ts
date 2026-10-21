import { EXT_SOURCE, WEB_SOURCE } from './messages';

export interface BridgeRuntime {
  sendMessage(msg: unknown): Promise<unknown>;
  onMessage(cb: (msg: unknown) => void): void;
}

/**
 * Listens on the JobLume page for the handshake. Only messages the page itself posted
 * (same window, same origin) are considered; everything else is ignored.
 * Returns a function that removes the listener.
 */
export function installBridge(win: Window, rt: BridgeRuntime): () => void {
  const post = (data: Record<string, unknown>) => {
    win.postMessage({ source: EXT_SOURCE, ...data }, win.location.origin);
  };

  const onWindowMessage = (event: MessageEvent) => {
    if (event.source !== win || event.origin !== win.location.origin) return;
    const d: unknown = event.data;
    if (typeof d !== 'object' || d === null) return;
    const msg = d as Record<string, unknown>;
    if (msg.source !== WEB_SOURCE) return;

    if (msg.type === 'ping') {
      post({ type: 'pong' });
      return;
    }
    if (msg.type === 'fill') {
      rt.sendMessage({ type: 'joblume:arm', payload: msg.payload, label: msg.label })
        .then((reply) => {
          const r = reply as { ok?: boolean; error?: string } | null | undefined;
          post(r?.ok === true ? { type: 'armed', ok: true } : { type: 'armed', ok: false, error: r?.error ?? 'no_reply' });
        })
        .catch(() => post({ type: 'armed', ok: false, error: 'no_reply' }));
    }
  };
  win.addEventListener('message', onWindowMessage);

  rt.onMessage((m) => {
    const f = m as { type?: unknown; count?: unknown } | null;
    if (f?.type === 'joblume:filled' && typeof f.count === 'number' && Number.isInteger(f.count) && f.count >= 0) {
      post({ type: 'filled', count: f.count });
    }
  });

  return () => win.removeEventListener('message', onWindowMessage);
}
