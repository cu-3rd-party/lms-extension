const DEBUG_MODE = true;

// debug_utils.js
(function () {
  'use strict';

  // Создаем простую и надежную функцию
  window.cuLmsLog = function (...args) {
    if (DEBUG_MODE) {
      console.log('[CU LMS Enhancer]:', ...args);
    }
  };

  // Цель анонимной статистики (см. src/metrics.ts). Список целей знает
  // background — незнакомую он молча отбросит. Ошибки глотаем: статистика не
  // должна ломать функцию, а после обновления расширения контекст скрипта
  // бывает уже мёртв.
  window.cuLmsTrack = function (goal) {
    try {
      const api = typeof browser !== 'undefined' ? browser : chrome;
      if (!api?.runtime?.id) return;
      const sent = api.runtime.sendMessage({ action: 'METRICS_GOAL', goal });
      if (sent && typeof sent.catch === 'function') sent.catch(() => {});
    } catch (_error) {
      // Контекст расширения инвалидирован.
    }
  };

  // Немедленно проверяем и создаем fallback
  if (typeof window.cuLmsLog !== 'function') {
    window.cuLmsLog = function (...args) {
      if (DEBUG_MODE) {
        console.log('[CU LMS Enhancer]:', ...args);
      }
    };
  }
})();
