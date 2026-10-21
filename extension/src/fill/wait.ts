/**
 * Resolves with the probe's first non-null result: now if it already has one, otherwise on the first DOM change
 * that makes it succeed, or null after timeoutMs.
 */
export function waitFor<T>(doc: Document, probe: () => T | null, timeoutMs: number): Promise<T | null> {
  const now = probe();
  if (now !== null) return Promise.resolve(now);
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const obs = new MutationObserver(() => {
      const v = probe();
      if (v !== null) finish(v);
    });
    function finish(v: T | null) {
      obs.disconnect();
      if (timer !== undefined) clearTimeout(timer);
      resolve(v);
    }
    timer = setTimeout(() => finish(null), timeoutMs);
    obs.observe(doc.documentElement, { childList: true, subtree: true, attributes: true });
  });
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
