import { adapterForHost } from './adapters';
import { base64ToBytes } from './b64';
import { fillForm, formPresent } from './fill/engine';
import { sleep, waitFor } from './fill/wait';
import type { CvReply, PayloadReply } from './messages';
import { showBanner } from './ui/banner';

export interface RunDeps {
  doc: Document;
  host: string;
  /** Sends a runtime message to the background and returns its reply (undefined when there is none). */
  send<T>(msg: unknown): Promise<T | undefined>;
  /** How long to wait for the form to appear. */
  waitMs: number;
  /** Pause after the form appears, so a framework finishes its first render before values are set. */
  settleMs: number;
  /** When the background has nothing yet (the tab can load before the fill is stored), ask once more after this long. */
  retryMs?: number;
}

/** One attempt on the current page. Returns how many fields were filled (0 when nothing applies). */
export async function runAutofill(d: RunDeps): Promise<{ filled: number }> {
  const adapter = adapterForHost(d.host);
  if (!adapter) return { filled: 0 };
  let reply = await d.send<PayloadReply>({ type: 'joblume:get-payload' });
  if (!reply?.payload && d.retryMs) {
    await sleep(d.retryMs);
    reply = await d.send<PayloadReply>({ type: 'joblume:get-payload' });
  }
  const payload = reply?.payload;
  if (!payload) return { filled: 0 };

  const found = await waitFor(d.doc, () => (formPresent(d.doc, adapter) ? true : null), d.waitMs);
  if (!found) return { filled: 0 };
  await sleep(d.settleMs);

  let cv: File | null = null;
  if (payload.cv && adapter.find(d.doc, 'cv_file')) {
    const res = await d.send<CvReply>({ type: 'joblume:fetch-cv', url: payload.cv.url });
    if (res?.ok) cv = new File([base64ToBytes(res.base64) as BlobPart], payload.cv.filename, { type: res.contentType });
  }

  const result = fillForm(d.doc, adapter, payload, cv);
  if (result.filled > 0) {
    showBanner(d.doc, result.filled);
    await d.send({ type: 'joblume:done', filled: result.filled });
  }
  return { filled: result.filled };
}
