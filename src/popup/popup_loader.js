// popup_loader.js
// Loads browser-polyfill first (absolute extension URL), then popup.js.
// External module script — complies with MV3 CSP (no inline scripts allowed).
// chrome is available as a global in extension page contexts even for module scripts.
export {};

const polyfill = document.createElement('script');
polyfill.src = chrome.runtime.getURL('browser-polyfill.js');
polyfill.onload = () => {
  const main = document.createElement('script');
  main.src = chrome.runtime.getURL('popup/popup.js');
  document.body.appendChild(main);
};
document.body.appendChild(polyfill);
