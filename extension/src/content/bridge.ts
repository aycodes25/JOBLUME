import { installBridge } from '../bridge-core';

installBridge(window, {
  sendMessage: (msg) => chrome.runtime.sendMessage(msg),
  onMessage: (cb) => {
    chrome.runtime.onMessage.addListener((m: unknown) => {
      cb(m);
    });
  },
});
