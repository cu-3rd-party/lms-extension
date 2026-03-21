window.addEventListener('AKH_PROXY_REQUEST', (event) => {
  // 1. Безопасно парсим данные (если они пришли строкой из-за Firefox)
  let data;
  try {
    data = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
  } catch (e) {
    console.error('Failed to parse AKH_PROXY_REQUEST detail', e);
    return;
  }

  const { action, params, requestId } = data;

  chrome.runtime.sendMessage({ action, ...params }, (response) => {
    window.dispatchEvent(
      new CustomEvent(`AKH_PROXY_RESPONSE_${requestId}`, {
        // 2. Оборачиваем ответ в строку, чтобы Firefox не ругался на права доступа
        detail: JSON.stringify(response),
      })
    );
  });
});
