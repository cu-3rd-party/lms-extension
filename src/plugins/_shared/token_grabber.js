// plugins/apricot/token_grabber.js
(function () {
  const access = localStorage.getItem('auth-token') || localStorage.getItem('access');
  // Ищем возможные ключи для рефреш-токена
  const refresh =
    localStorage.getItem('refresh-token') ||
    localStorage.getItem('refresh_token') ||
    localStorage.getItem('auth-refresh') ||
    localStorage.getItem('refresh');

  if (access) {
    chrome.runtime.sendMessage({
      action: 'AKH_SAVE_TOKENS',
      access: access.replace(/"/g, ''),
      refresh: refresh ? refresh.replace(/"/g, '') : null,
    });
  }
})();
