'use strict';
if (typeof window.__akhCheckApi === 'undefined') {
  window.__akhCheckApi = (() => {
    async function _callProxy(action, params = {}) {
      const requestId = Math.random().toString(36).substring(7);

      return new Promise((resolve) => {
        const handler = (e) => {
          window.removeEventListener(`AKH_PROXY_RESPONSE_${requestId}`, handler);

          // 1. Восстанавливаем объект из строки ответа
          let response;
          try {
            response = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
          } catch (err) {
            response = null;
          }

          if (response && response.success) resolve(response.data);
          else resolve(null);
        };

        window.addEventListener(`AKH_PROXY_RESPONSE_${requestId}`, handler);

        window.dispatchEvent(
          new CustomEvent('AKH_PROXY_REQUEST', {
            // 2. Отправляем запрос строкой
            detail: JSON.stringify({ action, params, requestId }),
          })
        );
      });
    }

    return {
      fetchCourseDetails: (id) => _callProxy('AKH_FETCH_COURSE_DETAILS', { courseId: id }),
      fetchTaskProgress: (id) => _callProxy('AKH_FETCH_PROGRESS', { taskId: id }),
      fetchAllProgress: () => _callProxy('AKH_FETCH_ALL_PROGRESS'),
    };
  })();
}
