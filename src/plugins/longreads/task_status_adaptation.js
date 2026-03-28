// == task_status_adaptation.js (Версия 7.1, с поддержкой Доработки) ==

if (typeof window.__culmsLongreadFixInitialized === 'undefined') {
  window.__culmsLongreadFixInitialized = true;

  ('use strict');

  // --- КОНСТАНТЫ ---
  const SKIPPED_TASKS_KEY = 'cu.lms.skipped-tasks';
  const SKIPPED_STATUS_TEXT = 'Метод скипа';
  const REVISION_STATUS_TEXT = 'Доработка';
  const EMOJI_REGEX = /[🔴🔵⚫️⚫❤️💙🖤]/g;

  // Кэш для данных о задачах (чтобы не спамить API запросами)
  let tasksDataCache = null;
  let isFetchingData = false;

  // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
  function stripEmojis(text) {
    if (!text) return '';
    return text.replace(EMOJI_REGEX, '').trim();
  }

  function getSkippedTasks() {
    try {
      const skipped = localStorage.getItem(SKIPPED_TASKS_KEY);
      return skipped ? new Set(JSON.parse(skipped)) : new Set();
    } catch (e) {
      return new Set();
    }
  }

  /**
   * Загружает данные о задачах (даты и статусы) с API.
   * Выполняется один раз.
   */
  async function ensureTasksDataLoaded() {
    if (tasksDataCache || isFetchingData) return;
    isFetchingData = true;

    try {
      const response = await fetch('https://my.centraluniversity.ru/api/micro-lms/tasks/student');
      if (response.ok) {
        const data = await response.json();
        tasksDataCache = {};

        // Создаем карту: "очищенное название задачи" -> данные о датах
        data.forEach((task) => {
          if (task.exercise && task.exercise.name) {
            const cleanName = stripEmojis(task.exercise.name).toLowerCase();
            tasksDataCache[cleanName] = {
              state: task.state,
              submitAt: task.submitAt ? new Date(task.submitAt).getTime() : 0,
              rejectAt: task.rejectAt ? new Date(task.rejectAt).getTime() : 0,
            };
          }
        });
        window.cuLmsLog('Longread Fix: Tasks data loaded for revision check.');
      }
    } catch (e) {
      console.error('Longread Fix: Failed to load tasks data', e);
    } finally {
      isFetchingData = false;
    }
  }

  /**
   * Обрабатывает один конкретный элемент <cu-student-task>.
   */
  function processTaskElement(taskElement, skippedTasks) {
    const taskNameElement = taskElement.querySelector('.task-name');
    const statusChipElement = taskElement.querySelector('tui-chip');

    if (!taskNameElement || !statusChipElement) {
      return;
    }

    // Помечаем, что элемент обработан
    taskElement.setAttribute('data-culms-processed', 'true');

    // Сохраняем оригинальный статус, если еще не сохранили
    if (!statusChipElement.dataset.originalStatus) {
      statusChipElement.dataset.originalStatus = statusChipElement.textContent.trim();
    }

    const taskNameOnPage = stripEmojis(taskNameElement.textContent.trim()).toLowerCase();

    // 1. ПРОВЕРКА НА SKIP
    let isTaskSkipped = false;
    for (const skippedIdentifier of skippedTasks) {
      const storedTaskName = skippedIdentifier.split('::')[1];
      if (storedTaskName && storedTaskName === taskNameOnPage) {
        isTaskSkipped = true;
        break;
      }
    }

    if (isTaskSkipped) {
      window.cuLmsLog(`Longread Fix: Applying 'skipped' to "${taskNameOnPage}"`);
      statusChipElement.textContent = SKIPPED_STATUS_TEXT;
      statusChipElement.dataset.culmsStatus = 'skipped';
      return; // Если скипнут, дальше не проверяем
    }

    // 2. ПРОВЕРКА НА ДОРАБОТКУ (REVISION)
    // Нам нужны данные с API, чтобы сравнить даты
    if (tasksDataCache && tasksDataCache[taskNameOnPage]) {
      const apiTask = tasksDataCache[taskNameOnPage];

      // Логика: Если отклонено ПОЗЖЕ, чем отправлено, и статус "В работе"
      if (apiTask.state === 'inProgress' && apiTask.rejectAt > apiTask.submitAt) {
        window.cuLmsLog(`Longread Fix: Applying 'revision' to "${taskNameOnPage}"`);
        statusChipElement.textContent = REVISION_STATUS_TEXT;
        statusChipElement.dataset.culmsStatus = 'revision';
      }
      // Логика: Если отправлено ПОЗЖЕ, чем отклонено -> возвращаем "Есть решение" (если оно было "В работе")
      else if (apiTask.state === 'inProgress' && apiTask.submitAt > apiTask.rejectAt) {
        // Здесь можно принудительно ставить "Есть решение", если нужно,
        // но обычно UI и так показывает "В работе" или похожее.
        // Оставляем как есть или меняем стиль по желанию.
      }
    }
  }

  /**
   * Внедряет глобальные стили для статуса.
   */
  function injectGlobalStyles() {
    const styleId = 'culms-longread-fix-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
            /* Стилизуем чип внутри компонента по data-атрибуту с усиленным весом селектора */
            
            /* СКИП - Темно-серый */
            html body cu-student-task tui-chip[data-culms-status="skipped"][data-culms-status="skipped"] {
                background-color: #b516d7 !important;
                color: white !important;
                border: none !important;
            }

            /* ДОРАБОТКА - Красный */
            html body cu-student-task tui-chip[data-culms-status="revision"][data-culms-status="revision"] {
                background-color: #FE456A !important;
                color: white !important;
                border: none !important;
            }
        `;
    document.head.appendChild(style);
  }

  /**
   * Основная функция
   */
  async function runCheck() {
    // Сначала убеждаемся, что у нас есть данные для сверки дат
    if (!tasksDataCache && !isFetchingData) {
      await ensureTasksDataLoaded();
    }

    const skippedTasks = getSkippedTasks();

    // Ищем все контейнеры задач, которые еще не были обработаны.
    // Мы убрали проверку "if (skippedTasks.size === 0)", так как теперь нам нужно работать
    // даже если нет скипнутых задач (для отображения "Доработки").
    const taskElements = document.querySelectorAll('cu-student-task:not([data-culms-processed])');

    if (taskElements.length > 0) {
      taskElements.forEach((element) => processTaskElement(element, skippedTasks));
    }
  }

  // --- ЗАПУСК СКРИПТА ---

  if (window.location.href.includes('/longreads/')) {
    if (!window.cuLmsLog) {
      window.cuLmsLog = console.log.bind(
        window.console,
        '%cCU LMS Fix:',
        'background: #4A5568; color: #E2E8F0; padding: 2px 6px; border-radius: 4px;'
      );
    }

    injectGlobalStyles();

    // Запускаем инициализацию данных сразу
    ensureTasksDataLoaded();

    // Первая проверка с небольшой задержкой
    setTimeout(runCheck, 1000);

    // Наблюдатель
    const observer = new MutationObserver(() => {
      // Оборачиваем вызов, так как runCheck теперь async
      runCheck();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.cuLmsLog('Longread Fix: Observer initialized.');
  }
}
