import { createBackground, type SessionStore } from './background-core';
import { routeMessage } from './router';

const store: SessionStore = {
  async get(k) {
    return (await chrome.storage.session.get(k))[k];
  },
  async set(k, value) {
    await chrome.storage.session.set({ [k]: value });
  },
  async remove(k) {
    await chrome.storage.session.remove(k);
  },
  async keys() {
    return Object.keys(await chrome.storage.session.get(null));
  },
};

const core = createBackground({
  store,
  openTab: async (url) => (await chrome.tabs.create({ url })).id ?? null,
  notifyTab: async (tabId, msg) => {
    await chrome.tabs.sendMessage(tabId, msg);
  },
  fetchImpl: (url, init) => fetch(url, init),
  now: () => Date.now(),
  storageHost: __STORAGE_HOST__,
});

// Listeners must be registered synchronously at the top level of a service worker.
chrome.tabs.onRemoved.addListener((tabId) => {
  void core.onTabRemoved(tabId);
});

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  const cfg = { joblumeOrigins: __JOBLUME_ORIGINS__, extensionBase: chrome.runtime.getURL('') };
  void routeMessage(core, cfg, msg, sender).then(sendResponse);
  return true;
});
