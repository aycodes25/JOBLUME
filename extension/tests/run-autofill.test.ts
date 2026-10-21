import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bytesToBase64 } from '../src/b64';
import { runAutofill } from '../src/run-autofill';
import { BANNER_ID } from '../src/ui/banner';
import { allowFileAssignment, byId, fileNames, installFakeDataTransfer, loadFixture, payload } from './helpers/dom';

type Send = (msg: unknown) => Promise<unknown>;

function scriptedSend(replies: { payload?: unknown; cv?: unknown }) {
  return vi.fn<Send>().mockImplementation(async (msg) => {
    const type = (msg as { type: string }).type;
    if (type === 'joblume:get-payload') return { payload: replies.payload ?? null };
    if (type === 'joblume:fetch-cv') return replies.cv;
    if (type === 'joblume:done') return { ok: true };
    return undefined;
  });
}

const deps = (send: ReturnType<typeof scriptedSend>, host = 'job-boards.greenhouse.io') => ({
  doc: document,
  host,
  send: send as unknown as <T>(msg: unknown) => Promise<T | undefined>,
  waitMs: 60,
  settleMs: 0,
});

const pdfReply = { ok: true, base64: bytesToBase64(new TextEncoder().encode('%PDF-1.4')), contentType: 'application/pdf' };

beforeEach(() => {
  document.body.innerHTML = loadFixture('greenhouse-form');
  allowFileAssignment(document);
  installFakeDataTransfer();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runAutofill', () => {
  it('asks once more when the background has nothing yet (load race) and then fills', async () => {
    let n = 0;
    const send = vi.fn<Send>().mockImplementation(async (msg) => {
      const type = (msg as { type: string }).type;
      if (type === 'joblume:get-payload') return { payload: ++n === 1 ? null : payload() };
      if (type === 'joblume:fetch-cv') return { ok: false, error: 'x' };
      return { ok: true };
    });
    const res = await runAutofill({ ...deps(send as ReturnType<typeof scriptedSend>), retryMs: 5 });
    expect(res.filled).toBeGreaterThan(0);
    expect(n).toBe(2);
  });

  it('gives up after the single retry', async () => {
    const send = scriptedSend({});
    expect(await runAutofill({ ...deps(send), retryMs: 5 })).toEqual({ filled: 0 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('fills the form, downloads the CV through the background, shows the banner and reports the count', async () => {
    const send = scriptedSend({ payload: payload(), cv: pdfReply });
    const res = await runAutofill(deps(send));
    expect(res.filled).toBe(7);
    expect(byId('first_name').value).toBe('Ada');
    expect(fileNames(byId('resume'))).toEqual(['Ada Lovelace CV.pdf']);
    expect(send).toHaveBeenCalledWith({ type: 'joblume:fetch-cv', url: payload().cv!.url });
    expect(send).toHaveBeenLastCalledWith({ type: 'joblume:done', filled: 7 });
    expect(document.getElementById(BANNER_ID)?.textContent).toContain('JobLume filled 7 fields.');
  });

  it('still fills the other fields when the CV cannot be downloaded', async () => {
    const send = scriptedSend({ payload: payload(), cv: { ok: false, error: 'http_403' } });
    const res = await runAutofill(deps(send));
    expect(res.filled).toBe(6);
    expect(fileNames(byId('resume'))).toEqual([]);
    expect(byId('email').value).toBe('ada@example.com');
  });

  it('does nothing without an armed payload', async () => {
    const send = scriptedSend({});
    expect(await runAutofill(deps(send))).toEqual({ filled: 0 });
    expect(byId('first_name').value).toBe('');
    expect(document.getElementById(BANNER_ID)).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a host without an adapter and does not even ask for the payload', async () => {
    const send = scriptedSend({ payload: payload() });
    expect(await runAutofill(deps(send, 'example.com'))).toEqual({ filled: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('gives up quietly when the form never appears', async () => {
    document.body.innerHTML = '<main>Not a form</main>';
    const send = scriptedSend({ payload: payload(), cv: pdfReply });
    expect(await runAutofill(deps(send))).toEqual({ filled: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(document.getElementById(BANNER_ID)).toBeNull();
  });

  it('waits for a form that renders late', async () => {
    document.body.innerHTML = '';
    const send = scriptedSend({ payload: payload(), cv: pdfReply });
    const run = runAutofill({ ...deps(send), waitMs: 2000 });
    setTimeout(() => {
      document.body.innerHTML = loadFixture('greenhouse-form');
      allowFileAssignment(document);
    }, 20);
    expect((await run).filled).toBe(7);
  });

  it('does not report a fill when nothing could be filled', async () => {
    document.body.innerHTML = '<input id="email" value="already@there.com">';
    const send = scriptedSend({ payload: payload({ cv: null, phone: null }) });
    expect(await runAutofill(deps(send))).toEqual({ filled: 0 });
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'joblume:done' }));
  });
});
