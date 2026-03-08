'use strict';

// Общий кеш API-запросов для всех плагинов лонгридов.
// Хранит Promise по longreadsId — повторные вызовы возвращают тот же Promise,
// поэтому HTTP-запрос делается ровно один раз, даже если несколько скриптов
// или несколько циклов MutationObserver обратятся одновременно.

if (typeof window.__culmsLmsApi === 'undefined') {
  window.__culmsLmsApi = (() => {
    const _cache = {};

    function fetchMaterials(longreadsId) {
      if (!_cache[longreadsId]) {
        _cache[longreadsId] = fetch(
          `https://my.centraluniversity.ru/api/micro-lms/longreads/${longreadsId}/materials?limit=10000`,
          { credentials: 'include' }
        )
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          })
          .catch(() => {
            delete _cache[longreadsId]; // при ошибке позволяем повторить
            return null;
          });
      }
      return _cache[longreadsId];
    }

    return { fetchMaterials };
  })();
}
