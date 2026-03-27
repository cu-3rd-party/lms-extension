// akh_bridge.js
const extApi = typeof chrome !== 'undefined' ? chrome : browser;

window.addEventListener('AKH_PROXY_REQUEST', (event) => {
  let data;
  try {
    data = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
  } catch (e) {
    return;
  }

  const { action, params, requestId } = data;
  const message = { action, ...params };

  const sendResponseBack = (payload) => {
    window.dispatchEvent(
      new CustomEvent(`AKH_PROXY_RESPONSE_${requestId}`, {
        detail: JSON.stringify(payload),
      })
    );
  };

  try {
    if (extApi && extApi.runtime && extApi.runtime.sendMessage) {
      extApi.runtime.sendMessage(message, (response) => {
        const err = extApi.runtime.lastError;
        if (err) {
          sendResponseBack({ success: false, error: err.message || 'Extension network error' });
        } else {
          sendResponseBack(response || { success: false, error: 'Empty response' });
        }
      });
    } else {
      sendResponseBack({ success: false, error: 'Extension API not found' });
    }
  } catch (err) {
    sendResponseBack({ success: false, error: err.message });
  }
});
