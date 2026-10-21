import type { AutofillPayload } from '@joblume/shared';

/** Tags on window.postMessage data. They must match extension/src/messages.ts. */
export const WEB_SOURCE = 'joblume-web';
export const EXT_SOURCE = 'joblume-extension';

export interface JobLabel {
  title: string;
  company: string;
}

export type FillResult = { ok: true } | { ok: false; error: 'invalid_payload' | 'not_allowed' | 'tab_failed' | 'no_reply' | 'unknown' };

export interface ExtensionBridge {
  /** True when the extension answers the handshake (it is installed and allowed on this site). */
  ping(): Promise<boolean>;
  /** Hands the payload to the extension, which opens the job in a new tab. Resolves once it says whether it accepted it. */
  fill(payload: AutofillPayload, label: JobLabel): Promise<FillResult>;
  /** Calls back with how many fields the extension filled. Returns a function that stops listening. */
  onFilled(cb: (count: number) => void): () => void;
}

const KNOWN_ERRORS = ['invalid_payload', 'not_allowed', 'tab_failed', 'no_reply'] as const;

/**
 * Only what the page itself received from the extension's content script counts: same window, same origin,
 * tagged as coming from the extension. Anything else is ignored.
 */
function fromExtension(win: Window, event: MessageEvent): Record<string, unknown> | null {
  if (event.source !== win || event.origin !== win.location.origin) return null;
  const d: unknown = event.data;
  if (typeof d !== 'object' || d === null) return null;
  const msg = d as Record<string, unknown>;
  return msg.source === EXT_SOURCE ? msg : null;
}

export function createExtensionBridge(win: Window = window, timeouts = { ping: 800, fill: 5000 }): ExtensionBridge {
  const post = (data: Record<string, unknown>) => win.postMessage({ source: WEB_SOURCE, ...data }, win.location.origin);

  function once<T>(type: string, ms: number, pick: (msg: Record<string, unknown>) => T, onTimeout: T, send: () => void): Promise<T> {
    return new Promise((resolve) => {
      const done = (value: T) => {
        win.removeEventListener('message', listener);
        clearTimeout(timer);
        resolve(value);
      };
      const listener = (event: MessageEvent) => {
        const msg = fromExtension(win, event);
        if (msg && msg.type === type) done(pick(msg));
      };
      const timer = setTimeout(() => done(onTimeout), ms);
      win.addEventListener('message', listener);
      send();
    });
  }

  return {
    ping: () => once('pong', timeouts.ping, () => true, false, () => post({ type: 'ping' })),

    fill: (payload, label) =>
      once<FillResult>(
        'armed',
        timeouts.fill,
        (msg) => {
          if (msg.ok === true) return { ok: true };
          const error = KNOWN_ERRORS.find((e) => e === msg.error);
          return { ok: false, error: error ?? 'unknown' };
        },
        { ok: false, error: 'no_reply' },
        () => post({ type: 'fill', payload, label }),
      ),

    onFilled(cb) {
      const listener = (event: MessageEvent) => {
        const msg = fromExtension(win, event);
        if (msg && msg.type === 'filled' && typeof msg.count === 'number' && Number.isInteger(msg.count) && msg.count >= 0 && msg.count <= 999) cb(msg.count);
      };
      win.addEventListener('message', listener);
      return () => win.removeEventListener('message', listener);
    },
  };
}
