// advanced_statements.js (Версия 60 - Полная автоматизация через API + выравнивание слева)

(async function () {
  'use strict';

  // --- ЗАЩИТА ОТ ДУБЛИРОВАНИЯ ---
  if (window.isAdvancedStatementsRunning) return;
  window.isAdvancedStatementsRunning = true;

  // --- КОНФИГУРАЦИЯ ---
  const TARGET_PATH_REGEX = /^\/learn\/reports\/student-performance\/.*\d+\/activity$/;
  const API_URL_TEMPLATE =
    'https://my.centraluniversity.ru/api/micro-lms/courses/{courseId}/student-performance';

  // --- СЕЛЕКТОРЫ ---
  const TABLE_WRAPPER_SELECTOR = 'cu-student-activity-performance-table';
  const ORIGINAL_TABLE_SELECTOR = 'table.cu-table';
  const ROW_ID = 'adv-accumulated-row';

  let retryTimer = null;

  // --- ГЛАВНАЯ ФУНКЦИЯ ---
  async function tryRenderModule() {
    if (!TARGET_PATH_REGEX.test(window.location.pathname)) {
      resetState();
      return;
    }

    const rowEl = document.getElementById(ROW_ID);
    if (rowEl) {
      if (!document.body.contains(rowEl)) {
        resetState();
      } else {
        return;
      }
    }

    const tableWrapper = document.querySelector(TABLE_WRAPPER_SELECTOR);
    const originalTable = tableWrapper ? tableWrapper.querySelector(ORIGINAL_TABLE_SELECTOR) : null;

    if (!tableWrapper || !originalTable) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(tryRenderModule, 500);
      return;
    }

    console.log('[Adv. Statements] Таблица найдена. Читаем данные API...');
    try {
      const { endOfCourseCalcEnabled } = await browser.storage.sync.get('endOfCourseCalcEnabled');
      const calculationMode = endOfCourseCalcEnabled ? 'endOfCourse' : 'current';

      const courseId = getCourseId();
      const tasks = await fetchPerformanceData(courseId);

      if (tasks.length === 0) return;

      const calculatedData = calculateScoresFromAPI(tasks, calculationMode);
      renderAccumulatedMetric(calculatedData, originalTable);
    } catch (error) {
      console.error('[Adv. Statements] Ошибка:', error);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(tryRenderModule, 1000);
    }
  }

  // --- РАСЧЕТ БАЛЛОВ НАПРЯМУЮ ИЗ API ---
  function calculateScoresFromAPI(tasks, mode) {
    const activities = new Map();

    // Группируем таски по ID активности
    tasks.forEach((task) => {
      if (!task.activity) return;
      const actId = task.activity.id;

      if (!activities.has(actId)) {
        activities.set(actId, {
          name: task.activity.name,
          weight: task.activity.weight || 0,
          maxCount: task.activity.maxExercisesCount || 0,
          scores: [],
          sum: 0,
          maxPossibleSum: 0, // Для расчета максимума из того, что уже сдано
        });
      }

      // Если за таск стоит оценка (даже 0)
      if (task.score !== null) {
        const activity = activities.get(actId);
        activity.scores.push(task.score);
        activity.sum += task.score;
        activity.maxPossibleSum += task.maxScore || 10;
      }
    });

    let totalWeightedScore = 0;
    let totalMaxScoreSoFar = 0;

    for (const data of activities.values()) {
      const actualCount = data.scores.length;
      let divisor;

      // Режим "За весь курс" (endOfCourse)
      if (mode === 'endOfCourse' && data.maxCount > 0) {
        divisor = data.maxCount;
        // Максимум на данный момент: если бы за все сданные таски мы получили максимум
        totalMaxScoreSoFar += (data.maxPossibleSum / divisor) * data.weight;
      }
      // Режим "Только по сданным" (current)
      else {
        divisor = actualCount;
        if (actualCount > 0) {
          totalMaxScoreSoFar += (data.maxPossibleSum / divisor) * data.weight;
        }
      }

      const avg = divisor > 0 ? data.sum / divisor : 0;
      const weightedScore = avg * data.weight;

      totalWeightedScore += weightedScore;
    }

    return {
      totalWeightedScore: totalWeightedScore.toFixed(2),
      totalMaxScoreSoFar: totalMaxScoreSoFar.toFixed(2),
    };
  }

  // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
  function getCourseId() {
    const match = window.location.pathname.match(/\/(\d+)\/activity/);
    return match ? match[1] : null;
  }

  async function fetchPerformanceData(courseId) {
    if (!courseId) return [];
    try {
      const response = await fetch(API_URL_TEMPLATE.replace('{courseId}', courseId));
      if (!response.ok) throw new Error();
      const data = await response.json();
      return data.tasks || [];
    } catch (error) {
      return [];
    }
  }

  function resetState() {
    const rowEl = document.getElementById(ROW_ID);
    if (rowEl) rowEl.remove();

    clearTimeout(retryTimer);
    retryTimer = null;
  }

  function renderAccumulatedMetric(data, originalTable) {
    const existingRow = document.getElementById(ROW_ID);
    if (existingRow) existingRow.remove();

    const tfoot = originalTable.querySelector('tfoot');
    if (!tfoot) return;

    const actual = parseFloat(data.totalWeightedScore);
    const max = parseFloat(data.totalMaxScoreSoFar);
    let percentageStr = '0%';
    if (max > 0) {
      percentageStr = Math.round((actual / max) * 100) + '%';
    }

    const accumulationRow = document.createElement('tr');
    accumulationRow.id = ROW_ID;
    accumulationRow.setAttribute('tuitr', '');

    // Выравнивание слева (text-align: left) и удалены отступы справа
    accumulationRow.innerHTML = `
        <td colspan="7" tuitd style="text-align: left; padding: 12px 16px; color: #888; font-size: 13px; border-top: 1px solid rgba(255,255,255,0.08);">
            Накоплено на данный момент: <b style="color: var(--tui-text-01);">${data.totalWeightedScore}</b> / <b>${data.totalMaxScoreSoFar}</b> (${percentageStr})
        </td>
    `;

    tfoot.appendChild(accumulationRow);
  }

  // --- ОБРАБОТЧИК НАВИГАЦИИ ---
  const navigationObserver = new MutationObserver(() => {
    tryRenderModule();
  });

  navigationObserver.observe(document.body, { childList: true, subtree: true });
  tryRenderModule();

  console.log('[Adv. Statements] Скрипт загружен. Используются данные из API (без хардкода).');
})();
