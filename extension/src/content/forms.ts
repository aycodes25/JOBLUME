import { adapterForHost } from '../adapters';
import { runAutofill } from '../run-autofill';

const WAIT_MS = 15_000;
const SETTLE_MS = 400;

async function send<T>(msg: unknown): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as T | undefined;
  } catch {
    return undefined;
  }
}

if (adapterForHost(location.hostname)) {
  let running = false;
  let finished = false;

  const attempt = async () => {
    if (running || finished) return;
    running = true;
    try {
      const { filled } = await runAutofill({ doc: document, host: location.hostname, send, waitMs: WAIT_MS, settleMs: SETTLE_MS });
      if (filled > 0) finished = true;
    } finally {
      running = false;
    }
  };

  void attempt();

  // Ashby and Workable change pages without a reload: try again when the address changes.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      void attempt();
    }
  }, 1000);
}
