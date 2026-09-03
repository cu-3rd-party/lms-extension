// Safari does not reliably expose history.pushState/replaceState navigation
// through browser.webNavigation. Keep this detector isolated from the page
// plugins so Chrome and Firefox retain their existing navigation path.
(() => {
  'use strict';

  const userAgent = navigator.userAgent;
  const isSafari =
    /Safari\//.test(userAgent) && !/(?:Chrome|Chromium|CriOS|Edg|FxiOS|Firefox)\//.test(userAgent);

  if (!isSafari) return;

  const extensionApi = globalThis.chrome ?? globalThis.browser;
  const sendMessage = extensionApi?.runtime?.sendMessage;
  if (typeof sendMessage !== 'function') return;

  let previousUrl = location.href;

  function reportNavigation() {
    const currentUrl = location.href;
    if (currentUrl === previousUrl) return;

    previousUrl = currentUrl;
    try {
      const result = sendMessage.call(extensionApi.runtime, {
        action: 'SAFARI_NAVIGATION',
        url: currentUrl,
      });
      // Chrome-style APIs return undefined; Safari may return a Promise.
      result?.catch?.(() => {});
    } catch (_error) {
      // The extension can be reloaded while the page remains open.
    }
  }

  window.addEventListener('popstate', reportNavigation);
  window.addEventListener('hashchange', reportNavigation);

  // pushState/replaceState do not consistently emit an event, and wrapping
  // history from an isolated content-script world is not portable. Polling
  // the URL is reliable in Safari and costs one cheap string comparison.
  window.setInterval(reportNavigation, 250);
})();
