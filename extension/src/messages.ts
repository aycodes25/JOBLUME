import type { AutofillPayload } from '@joblume/shared';

/** Value of `source` on window.postMessage data sent by the JobLume web page. */
export const WEB_SOURCE = 'joblume-web';
/** Value of `source` on window.postMessage data sent by the extension's bridge. */
export const EXT_SOURCE = 'joblume-extension';

/** Job title and company shown in the popup. They come from the web page, never from the autofill payload. */
export interface JobLabel {
  title: string;
  company: string;
}

/** Messages the background service worker understands. */
export type ToBackground =
  | { type: 'joblume:arm'; payload: unknown; label?: unknown }
  | { type: 'joblume:get-payload' }
  | { type: 'joblume:fetch-cv'; url: string }
  | { type: 'joblume:done'; filled: number }
  | { type: 'joblume:status'; tabId?: number }
  | { type: 'joblume:clear'; tabId?: number };

export type ArmReply = { ok: true } | { ok: false; error: 'invalid_payload' | 'tab_failed' | 'not_allowed' };
export type PayloadReply = { payload: AutofillPayload | null };
export type CvReply = { ok: true; base64: string; contentType: string } | { ok: false; error: string };
export interface StatusReply {
  armed: boolean;
  label: JobLabel | null;
  expiresAt: number | null;
}

/** Sent by the background to the JobLume tab that armed the fill. */
export interface FilledMessage {
  type: 'joblume:filled';
  count: number;
}
