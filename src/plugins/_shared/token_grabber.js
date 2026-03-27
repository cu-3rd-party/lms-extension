// plugins/apricot/token_grabber.js
(function () {
  const extApi = typeof chrome !== 'undefined' ? chrome : browser;
  if (!extApi || !extApi.runtime) return;

  const access = localStorage.getItem('auth-token') || localStorage.getItem('access');
  const refresh =
    localStorage.getItem('refresh-token') ||
    localStorage.getItem('refresh_token') ||
    localStorage.getItem('auth-refresh') ||
    localStorage.getItem('refresh');

  if (access) {
    extApi.runtime.sendMessage({
      action: 'AKH_SAVE_TOKENS',
      access: access.replace(/"/g, ''),
      refresh: refresh ? refresh.replace(/"/g, '') : null,
    });
  }
})();
