// --- ДОБАВИТЬ В content.js (или main.js) ---

if (!window.__cu_reset_loaded) {
  window.__cu_reset_loaded = true;

  const clearLmsData = () => {
    try {
      const keysToRemove = [
        'cu.lms.actual-student-tasks-custom-filter',
        'cu.lms.actual-student-tasks-filter',
        'cu.lms.skipped-tasks',
        'cu_friends_list',
      ];
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      console.log('[CU Extension] LMS LocalStorage очищен (Фильтры и Друзья).');

      // Опционально: перезагрузить страницу
      // window.location.reload();
      return true;
    } catch (e) {
      console.error('[CU Extension] Ошибка очистки:', e);
      return false;
    }
  };

  // 1. Слушаем сообщения от обычного Popup (через background/browser action)
  try {
    browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'RESET_LMS_LOCAL_STORAGE_FROM_POPUP') {
        const success = clearLmsData();
        sendResponse({ success: success });
      }
    });
  } catch (e) {
    console.warn('[CU Extension] Extension context invalidated in reset.js:', e);
  }

  // 2. Слушаем сообщения от Iframe (если меню встроено в страницу)
  window.addEventListener('message', (event) => {
    // Проверка безопасности: убедитесь, что сообщение от расширения (опционально)
    if (event.data && event.data.action === 'RESET_LMS_LOCAL_STORAGE_IFRAME') {
      clearLmsData();
    }
  });
}
