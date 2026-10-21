import type { Background } from './background-core';
import type { ArmReply, CvReply, PayloadReply, StatusReply } from './messages';

export interface Sender {
  tab?: { id?: number };
  url?: string;
}

export interface RouterConfig {
  /** Origins of the JobLume web app: the only senders that may arm a fill. */
  joblumeOrigins: string[];
  /** chrome.runtime.getURL('') of this extension: only the popup (no tab) may name a tab id. */
  extensionBase: string;
}

export type RouterReply = ArmReply | PayloadReply | CvReply | StatusReply | { ok: true } | null;

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Routes one runtime message to the background core. Unknown or malformed messages get null. */
export async function routeMessage(core: Background, cfg: RouterConfig, msg: unknown, sender: Sender): Promise<RouterReply> {
  if (typeof msg !== 'object' || msg === null) return null;
  const m = msg as Record<string, unknown>;
  const senderTab = sender.tab?.id;

  switch (m.type) {
    case 'joblume:arm': {
      const origin = originOf(sender.url);
      if (senderTab === undefined || origin === null || !cfg.joblumeOrigins.includes(origin)) return { ok: false, error: 'not_allowed' };
      return core.arm(m.payload, m.label, senderTab);
    }
    case 'joblume:get-payload':
      return senderTab === undefined ? null : { payload: await core.getPayload(senderTab, sender.url) };
    case 'joblume:fetch-cv':
      return senderTab === undefined || typeof m.url !== 'string' ? null : core.fetchCv(senderTab, m.url, sender.url);
    case 'joblume:done':
      if (senderTab === undefined || typeof m.filled !== 'number' || !Number.isInteger(m.filled) || m.filled < 0) return null;
      await core.complete(senderTab, m.filled);
      return { ok: true };
    case 'joblume:status':
    case 'joblume:clear': {
      const fromPopup = senderTab === undefined && typeof sender.url === 'string' && sender.url.startsWith(cfg.extensionBase);
      const tabId = senderTab ?? (fromPopup && typeof m.tabId === 'number' ? m.tabId : undefined);
      if (tabId === undefined) return null;
      if (m.type === 'joblume:status') return core.status(tabId);
      await core.clear(tabId);
      return { ok: true };
    }
    default:
      return null;
  }
}
