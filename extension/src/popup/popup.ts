import type { StatusReply } from '../messages';
import { renderPopup } from './render';

async function main() {
  const root = document.getElementById('app');
  if (!root) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;

  const draw = async () => {
    const status = tabId === undefined ? undefined : ((await chrome.runtime.sendMessage({ type: 'joblume:status', tabId })) as StatusReply | null);
    renderPopup(root, status ?? { armed: false, label: null, expiresAt: null }, Date.now(), {
      docsUrl: __DOCS_URL__,
      onClear: () => {
        void chrome.runtime.sendMessage({ type: 'joblume:clear', tabId }).then(draw);
      },
    });
  };
  await draw();
}

void main();
