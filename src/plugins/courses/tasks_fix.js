if (typeof window.__culmsTasksFixInitialized === 'undefined') {
  window.__culmsTasksFixInitialized = true;

  ('use strict');

  // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ УПРАВЛЕНИЯ СОСТОЯНИЕМ ---
  let dropdownObserver = null;
  let isCleanedUp = false;

  // --- ПРОВЕРКА URL ПРИ НАВИГАЦИИ ВНУТРИ SPA ---
  const isArchivedPage = () => window.location.href.includes('/tasks/archived-student-tasks');

  // --- ОБНОВЛЕННАЯ ФУНКЦИЯ ОЧИСТКИ ---
  function cleanupModifications() {
    if (dropdownObserver) {
      dropdownObserver.disconnect();
      dropdownObserver = null;
      window.cuLmsLog('Task Status Updater: Dropdown observer disconnected.');
    }

    document.querySelector('[data-culms-weight-header]')?.remove();
    document.querySelectorAll('tr[class*="task-table__task"]').forEach((row) => {
      row.querySelector('[data-culms-weight-cell]')?.remove();
      row.querySelector('.culms-action-button')?.remove();
      row.style.display = '';
    });

    document.getElementById('culms-tasks-fix-styles')?.remove();

    isCleanedUp = true;
    window.cuLmsLog('Task Status Updater: Cleaned up DOM modifications for archived page.');
  }

  // --- КОНСТАНТЫ ДЛЯ LOCALSTORAGE ---
  const FILTER_STORAGE_KEY = 'cu.lms.actual-student-tasks-custom-filter';
  const DEFAULT_FILTER_KEY = 'cu.lms.actual-student-tasks-filter';
  const SKIPPED_TASKS_KEY = 'cu.lms.skipped-tasks';

  // --- КОНСТАНТЫ СТАТУСОВ ---
  const SKIPPED_STATUS_TEXT = 'Метод скипа';

  // --- КЭШ ДЛЯ ЗАГРУЖЕННЫХ ИКОНОК ---
  const svgIconCache = {};

  // --- БЛОК ОЧИСТКИ ФИЛЬТРОВ В LOCALSTORAGE ---
  (function cleanFiltersInLocalStorage() {
    try {
      const storedFilterJSON = localStorage.getItem(DEFAULT_FILTER_KEY);
      if (storedFilterJSON) {
        const filterData = JSON.parse(storedFilterJSON);
        if (filterData.course?.length > 0 || filterData.state?.length > 0) {
          window.cuLmsLog('Task Status Updater: Cleaning default filters...');
          filterData.course = [];
          filterData.state = [];
          localStorage.setItem(DEFAULT_FILTER_KEY, JSON.stringify(filterData));
        }
      }
    } catch (error) {
      window.cuLmsLog('Task Status Updater: Failed to clean localStorage filters.', error);
    }
  })();

  // --- ВСТРОЕННАЯ ЛОГИКА EMOJI_SWAP ---
  const EMOJI_TO_HEARTS_MAP = new Map([
    ['🔵', '💙'],
    ['🔴', '❤️'],
    ['⚫️', '🖤'],
    ['⚫', '🖤'],
  ]);

  function replaceTextInNode(node, map) {
    let out = node.nodeValue;
    for (const [from, to] of map) {
      if (out.includes(from)) out = out.split(from).join(to);
    }
    node.nodeValue = out;
  }

  const EMOJI_REGEX = /(?:🔴|🔵|⚫️|⚫|❤️|💙|🖤)/g;

  function normalizeText(text) {
    if (!text) return '';
    let out = text;
    out = out.split('❤️').join('🔴');
    out = out.split('💙').join('🔵');
    out = out.split('🖤').join('⚫️');
    return out.trim();
  }

  // --- БЕЗОПАСНАЯ ЗАМЕНА ТЕКСТА СТАТУСА ---
  // Чтобы не затирать кружочки платформы, меняем только span внутри
  function setStatusText(badgeElement, text) {
    const span = badgeElement.querySelector('span');
    if (span) {
      span.textContent = text;
    } else {
      badgeElement.textContent = text;
    }
  }

  // --- ОБНОВЛЕННАЯ ЛОГИКА: Троттлинг для MutationObserver ---
  let canRunLogic = true;

  function throttledCheckAndRun() {
    if (isArchivedPage()) {
      if (!isCleanedUp) {
        cleanupModifications();
      }
      return;
    }

    isCleanedUp = false;

    if (!canRunLogic) return;

    const taskTableExists = document.querySelector('.task-table');
    const isHeaderMissing = !document.querySelector('[data-culms-weight-header]');

    if (taskTableExists && isHeaderMissing) {
      canRunLogic = false;
      runLogic();
      setTimeout(() => {
        canRunLogic = true;
      }, 1000);
    }
  }

  function initializeObserver() {
    const observer = new MutationObserver(throttledCheckAndRun);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function runLogic() {
    try {
      refreshDynamicStyles();
      await waitForElement('tr[class*="task-table__task"]');
      window.cuLmsLog('Task Status Updater: Task rows found. Starting DOM modification.');
      const settings = await browser.storage.sync.get('emojiHeartsEnabled');
      const isEmojiSwapEnabled = !!settings.emojiHeartsEnabled;
      const tasksData = await fetchTasksData();
      buildTableStructure();
      if (tasksData && tasksData.length > 0) {
        await populateTableData(tasksData, isEmojiSwapEnabled);
      }
      initializeFilters();
      setupDropdownInterceptor();
    } catch (error) {
      window.cuLmsLog('Task Status Updater: Error in runLogic:', error);
    }
  }

  async function getIconSVG(iconName) {
    if (svgIconCache[iconName]) {
      return svgIconCache[iconName];
    }
    try {
      const url = browser.runtime.getURL(`icons/${iconName}.svg`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
      let text = await response.text();
      text = text.replace(/ (fill|stroke)="[^"]+"/g, '');
      const sanitizedText = text.replace(/<\?xml.*?\?>/g, '').replace(/<!DOCTYPE.*?>/g, '');
      svgIconCache[iconName] = sanitizedText;
      return sanitizedText;
    } catch (error) {
      console.error(`Error fetching icon ${iconName}:`, error);
      return `<span style="color: red; font-weight: bold;">!</span>`;
    }
  }

  function refreshDynamicStyles() {
    const styleId = 'culms-tasks-fix-styles';
    if (document.getElementById(styleId)) {
      document.getElementById(styleId).remove();
    }

    const isDarkTheme = !!document.getElementById('culms-dark-theme-style-base');
    const seminarRowBg = isDarkTheme ? 'rgb(20,20,20)' : '#E0E0E0';
    const modalBgColor = `var(--tui-base-01, ${isDarkTheme ? '#2d2d2d' : 'white'})`;
    const modalTextColor = `var(--tui-text-01, ${isDarkTheme ? '#e0e0e0' : '#333'})`;
    const iconColor = isDarkTheme ? '#FFFFFF' : 'var(--tui-status-attention, #000000)';

    const checkboxThemeStyle = isDarkTheme
      ? `
            input[tuicheckbox][data-appearance="primary"]:checked {
                filter: brightness(0) invert(1) !important;
            }
            input[tuicheckbox][data-appearance="outline-grayscale"]:checked {
                 filter: brightness(0) invert(1) !important;
            }
        `
      : '';

    // --- НОВЫЙ ДИЗАЙН СТАТУСОВ (ПЛАШКА + КРУЖОЧЕК) ---
    const customStatusStyles = isDarkTheme
      ? `
            /* В работе */
            cu-task-state-badge.task-state_custom_in-progress {
                background-color: rgba(249, 171, 0, 0.56) !important;
                color: var(--culms-dark-text-primary, #fff) !important;
                border: none !important;
            }
            /* Задано */
            cu-task-state-badge.task-state_custom_assigned {
                background-color: var(--culms-dark-status-backlog, #444) !important;
                color: var(--culms-dark-text-primary, #fff) !important;
                border: none !important;
            }
            
            /* Метод скипа (Темная тема) */
            cu-task-state-badge[data-culms-status="skipped"] {
                background-color: rgba(181, 22, 215, 0.35) !important;
                color: var(--culms-dark-text-primary, #fff) !important;
                border: none !important;
            }
            cu-task-state-badge[data-culms-status="skipped"] .circle {
                background-color: #d633ff !important; /* Яркий фиолетовый кружок */
                display: block !important;
            }

            /* Аудиторная (Темная тема) */
            cu-task-state-badge[data-culms-status="seminar"] {
                background-color: rgba(255, 255, 255, 0.15) !important;
                color: var(--culms-dark-text-primary, #fff) !important;
                border: none !important;
            }
            cu-task-state-badge[data-culms-status="seminar"] .circle {
                background-color: #e0e0e0 !important; /* Светло-серый кружок */
                display: block !important;
            }
        `
      : `
            /* В работе */
            cu-task-state-badge.task-state_custom_in-progress {
                background-color: rgba(249, 171, 0, 0.2) !important; 
            }
            /* Задано */
            cu-task-state-badge.task-state_custom_assigned {
                /* Дефолт платформы */
            }

            /* Метод скипа (Светлая тема) */
            cu-task-state-badge[data-culms-status="skipped"] {
                background-color: rgba(181, 22, 215, 0.15) !important;
                color: #000 !important;
                border: none !important;
            }
            cu-task-state-badge[data-culms-status="skipped"] .circle {
                background-color: #b516d7 !important; /* Насыщенный фиолетовый кружок */
                display: block !important;
            }

            /* Аудиторная (Светлая тема) */
            cu-task-state-badge[data-culms-status="seminar"] {
                background-color: rgba(0, 0, 0, 0.08) !important;
                color: #000 !important;
                border: none !important;
            }
            cu-task-state-badge[data-culms-status="seminar"] .circle {
                background-color: #333333 !important; /* Темный кружок */
                display: block !important;
            }
        `;

    const cssRules = `
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');

            /* --- Стили таблицы --- */
            tr[data-culms-row-type="seminar"] { background-color: ${seminarRowBg} !important; }
            
            /* --- СТИЛИ ДЛЯ РАЗДЕЛЕНИЯ СТАТУСОВ --- */
            ${customStatusStyles}

            .task-table__late-days {
                min-width: 120px !important;
                width: 120px !important;
                white-space: nowrap !important;
                box-sizing: border-box !important;
            }

            .culms-late-days-container { 
                display: flex; 
                align-items: center; 
                justify-content: flex-start; 
                gap: 4px; 
                flex-wrap: nowrap; 
            }
            
            .culms-action-button { 
                display: inline-flex; 
                align-items: center; 
                justify-content: center; 
                background: transparent; 
                border: none; 
                cursor: pointer; 
                height: 24px; 
                width: 24px; 
                padding: 0; 
                opacity: 0.6; 
                transition: opacity 0.2s; 
                flex-shrink: 0; 
            }
            
            .culms-action-button:hover { opacity: 1; }
            .culms-action-button svg { width: 18px; height: 18px; color: ${iconColor}; fill: currentColor; }

            /* --- Стили модального окна --- */
            .culms-modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); z-index: 1050; display: flex; align-items: center; justify-content: center; }
            
            .culms-modal-content {
                background: ${modalBgColor};
                color: ${modalTextColor};
                padding: 24px 30px;
                border-radius: 12px;
                text-align: center;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                max-width: 400px;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Segoe UI", "Helvetica Neue", sans-serif;
            }

            .culms-modal-content p {
                margin: 0 0 20px 0;
                font-weight: 400;
                font-size: 1rem;
                line-height: 1.5rem;
                font-style: normal;
            }

            .culms-modal-buttons button {
                margin: 0 10px;
                padding: 8px 16px;
                border-radius: 5px;
                border: 1px solid transparent;
                cursor: pointer;
                font-weight: bold;
                font-family: inherit;
            }
            
            .culms-modal-confirm { background-color: #28a745; color: white; border-color: #28a745; }
            .culms-modal-cancel { background-color: #dc3545; color: white; border-color: #dc3545; }
            
            /* --- Фикс для нового выпадающего списка курсов --- */
            cu-multiselect-searchable-list cdk-virtual-scroll-viewport {
                height: auto !important;
                max-height: 400px !important;
                contain: none !important; /* Отключаем оптимизацию отрисовки */
            }
            cu-multiselect-searchable-list .cdk-virtual-scroll-content-wrapper {
                 transform: none !important; /* Убираем сдвиги виртуального скролла */
                 position: relative !important;
            }
            cu-multiselect-searchable-list .cdk-virtual-scroll-spacer {
                display: none !important; /* Убираем пустой спейсер */
            }

            ${checkboxThemeStyle}
        `;
    const styleElement = document.createElement('style');
    styleElement.id = styleId;
    styleElement.textContent = cssRules;
    document.head.appendChild(styleElement);
  }

  function buildTableStructure() {
    const headerRow = document.querySelector('.task-table__header');
    if (headerRow) {
      if (!headerRow.querySelector('[data-culms-weight-header]')) {
        const scoreHeader = headerRow.querySelector('.task-table__score');
        const stateHeader = headerRow.querySelector('.task-table__state');
        if (scoreHeader && stateHeader) {
          const weightHeader = scoreHeader.cloneNode(true);
          weightHeader.setAttribute('data-culms-weight-header', 'true');
          weightHeader.textContent = 'Вес';
          stateHeader.parentNode.insertBefore(weightHeader, stateHeader.nextSibling);
        }
      }
      // Принудительно расширяем заголовок последней ячейки, чтобы было место для кнопок
      const lateDaysHeader = headerRow.querySelector('.task-table__late-days');
      if (lateDaysHeader) {
        lateDaysHeader.style.minWidth = '120px';
        lateDaysHeader.style.width = '120px';
      }
    }

    document.querySelectorAll('tr[class*="task-table__task"]').forEach((row) => {
      if (row.querySelector('[data-culms-weight-cell]')) return;
      const originalScoreCell = row.querySelector('.task-table__score');
      const stateCell = row.querySelector('.task-table__state');
      if (originalScoreCell && stateCell) {
        const weightCell = originalScoreCell.cloneNode(true);
        weightCell.setAttribute('data-culms-weight-cell', 'true');
        weightCell.textContent = '';
        stateCell.parentNode.insertBefore(weightCell, stateCell.nextSibling);
      }
    });
  }

  async function populateTableData(tasksData, isEmojiSwapEnabled) {
    const skippedTasks = getSkippedTasks();
    const rows = document.querySelectorAll('tr[class*="task-table__task"]');

    const processingPromises = Array.from(rows).map(async (row) => {
      // Ищем по новому тегу
      const statusBadge = row.querySelector('cu-task-state-badge');
      const weightCell = row.querySelector('[data-culms-weight-cell]');
      const lateDaysCell = row.querySelector('.task-table__late-days');

      if (!statusBadge || !weightCell) return;

      if (!statusBadge.dataset.originalStatus) {
        // Текст статуса теперь безопасно достаем так
        statusBadge.dataset.originalStatus = statusBadge.textContent.trim();
        statusBadge.dataset.originalCulmsStatus =
          statusBadge.getAttribute('data-culms-status') || '';
      }

      statusBadge.removeAttribute('data-culms-status');
      row.removeAttribute('data-culms-row-type');

      const htmlNames = extractTaskAndCourseNamesFromElement(statusBadge);
      const task = findMatchingTask(htmlNames, tasksData);

      const taskIdentifier = getTaskIdentifier(htmlNames.taskName, htmlNames.courseName);
      const legacyIdentifier = getLegacyTaskIdentifier(htmlNames.taskName, htmlNames.courseName);
      const isSkipped = skippedTasks.has(taskIdentifier) || skippedTasks.has(legacyIdentifier);

      if (task) {
        if (lateDaysCell) {
          let container = lateDaysCell.querySelector('.culms-late-days-container');
          if (!container) {
            container = document.createElement('div');
            container.className = 'culms-late-days-container';
            while (lateDaysCell.firstChild) {
              container.appendChild(lateDaysCell.firstChild);
            }
            lateDaysCell.appendChild(container);
          }

          let skipButton = container.querySelector('.culms-action-button');
          if (!skipButton) {
            skipButton = document.createElement('button');
            skipButton.className = 'culms-action-button';
            container.prepend(skipButton);
            skipButton.addEventListener('click', (e) => {
              e.stopPropagation();
              onSkipButtonClick(task, row, statusBadge, skipButton);
            });
          }
          await updateButtonIcon(skipButton, isSkipped);
        }

        if (isSkipped) {
          setStatusText(statusBadge, SKIPPED_STATUS_TEXT);
          statusBadge.setAttribute('data-culms-status', 'skipped');
          statusBadge.classList.remove(
            'task-state_custom_in-progress',
            'task-state_custom_assigned'
          );
        } else {
          setStatusText(statusBadge, statusBadge.dataset.originalStatus);

          // ДОБАВЛЕНА ЛОГИКА ДЛЯ "В РАБОТЕ" И "ЗАДАНО"
          const originalText = statusBadge.dataset.originalStatus;
          statusBadge.classList.remove(
            'task-state_custom_in-progress',
            'task-state_custom_assigned'
          );

          if (originalText === 'В работе') {
            statusBadge.classList.add('task-state_custom_in-progress');
          } else if (originalText === 'Задано') {
            statusBadge.classList.add('task-state_custom_assigned');
          }

          const activityName = task.exercise?.activity?.name || '';
          // Список слов-триггеров, которые считаем "Семинаром/Аудиторной"
          const seminarKeywords = ['Аудиторная', 'Семинар', 'Активность'];

          if (seminarKeywords.some((keyword) => activityName.includes(keyword))) {
            setStatusText(statusBadge, 'Аудиторная');
            statusBadge.setAttribute('data-culms-status', 'seminar');
            row.setAttribute('data-culms-row-type', 'seminar');
            // Убираем кастомные классы, если это Семинар
            statusBadge.classList.remove(
              'task-state_custom_in-progress',
              'task-state_custom_assigned'
            );
          }
          // Остальные статусы теперь отрисовываются сайтом нативно
        }

        const weight = task.exercise?.activity?.weight;
        weightCell.textContent =
          weight !== undefined && weight !== null ? `${Math.round(weight * 100)}%` : '';
      } else {
        weightCell.textContent = '';
      }

      if (isEmojiSwapEnabled) {
        const courseNameElement = row.querySelector('.task-table__course-name');
        if (courseNameElement) {
          const walker = document.createTreeWalker(courseNameElement, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            replaceTextInNode(node, EMOJI_TO_HEARTS_MAP);
          }
        }
      }
    });

    await Promise.all(processingPromises);
  }

  // --- ЛОГИКА ПРОПУСКА ЗАДАЧ И МОДАЛЬНОГО ОКНА ---
  function onSkipButtonClick(task, row, statusBadge, button) {
    const taskIdentifier = getTaskIdentifier(task.exercise.name, task.course.name);
    const legacyIdentifier = getLegacyTaskIdentifier(task.exercise.name, task.course.name);

    // Проверяем по обоим форматам ID
    const isCurrentlySkipped =
      getSkippedTasks().has(taskIdentifier) || getSkippedTasks().has(legacyIdentifier);

    if (isCurrentlySkipped) {
      handleCancelSkipTask(task, row, statusBadge, button);
    } else {
      handleSkipTask(task, row, statusBadge, button);
    }
  }

  async function updateButtonIcon(button, isSkipped) {
    const iconName = isSkipped ? 'cancelskip' : 'skip';
    button.innerHTML = await getIconSVG(iconName);
    button.title = isSkipped ? 'Отменить метод скипа' : 'Применить метод скипа';
    button.dataset.isSkipped = isSkipped;
  }

  function handleSkipTask(task, row, statusBadge, button) {
    showConfirmationModal(
      'Вы уверены, что хотите применить метод скипа(статус виден только вам)?',
      (confirmed) => {
        if (confirmed) {
          // Передаем task.name и course.name в явном виде
          addSkippedTask(task.exercise.name, task.course.name);
          setStatusText(statusBadge, SKIPPED_STATUS_TEXT);
          statusBadge.setAttribute('data-culms-status', 'skipped');
          statusBadge.classList.remove(
            'task-state_custom_in-progress',
            'task-state_custom_assigned'
          );
          row.removeAttribute('data-culms-row-type');
          updateButtonIcon(button, true);
          applyCombinedFilter();
        }
      }
    );
  }

  function handleCancelSkipTask(task, row, statusBadge, button) {
    // Передаем task.name и course.name в явном виде, чтобы сработало удаление
    removeSkippedTask(task.exercise.name, task.course.name);

    setStatusText(statusBadge, statusBadge.dataset.originalStatus);

    // ВОЗВРАЩАЕМ ЦВЕТА СТАТУСА ПРИ ОТМЕНЕ СКИПА
    const originalText = statusBadge.dataset.originalStatus;
    statusBadge.classList.remove('task-state_custom_in-progress', 'task-state_custom_assigned');
    if (originalText === 'В работе') {
      statusBadge.classList.add('task-state_custom_in-progress');
    } else if (originalText === 'Задано') {
      statusBadge.classList.add('task-state_custom_assigned');
    }

    const originalCulmsStatus = statusBadge.dataset.originalCulmsStatus;
    if (originalCulmsStatus) {
      statusBadge.setAttribute('data-culms-status', originalCulmsStatus);
    } else {
      statusBadge.removeAttribute('data-culms-status');
    }

    const activityName = task.exercise?.activity?.name || '';
    // Список слов-триггеров, которые считаем "Семинаром/Аудиторной"
    const seminarKeywords = ['Аудиторная', 'Семинар', 'Активность'];

    if (seminarKeywords.some((keyword) => activityName.includes(keyword))) {
      setStatusText(statusBadge, 'Аудиторная');
      statusBadge.setAttribute('data-culms-status', 'seminar');
      row.setAttribute('data-culms-row-type', 'seminar');
      statusBadge.classList.remove('task-state_custom_in-progress', 'task-state_custom_assigned');
    }

    updateButtonIcon(button, false);
    applyCombinedFilter();
  }

  function showConfirmationModal(message, callback) {
    if (document.querySelector('.culms-modal-backdrop'))
      document.querySelector('.culms-modal-backdrop').remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'culms-modal-backdrop';
    backdrop.innerHTML = `
            <div class="culms-modal-content">
                <p>${message}</p>
                <div class="culms-modal-buttons">
                    <button class="culms-modal-confirm">Да</button>
                    <button class="culms-modal-cancel">Нет</button>
                </div>
            </div>`;
    document.body.appendChild(backdrop);
    const closeModal = (result) => {
      backdrop.remove();
      callback(result);
    };
    backdrop.querySelector('.culms-modal-confirm').onclick = () => closeModal(true);
    backdrop.querySelector('.culms-modal-cancel').onclick = () => closeModal(false);
    backdrop.onclick = (e) => {
      if (e.target === backdrop) closeModal(false);
    };
  }

  // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
  function getTaskIdentifier(taskName, courseName) {
    if (!taskName || !courseName) return null;
    return `${normalizeText(courseName).toLowerCase()}::${normalizeText(taskName).toLowerCase()}`;
  }

  // Для поддержки ранее скипнутых заданий, которые сохранились в localStorage без эмодзи
  function getLegacyTaskIdentifier(taskName, courseName) {
    if (!taskName || !courseName) return null;
    const strip = (t) => t.replace(EMOJI_REGEX, '').trim().toLowerCase();
    return `${strip(courseName)}::${strip(taskName)}`;
  }

  function getSkippedTasks() {
    try {
      const skipped = localStorage.getItem(SKIPPED_TASKS_KEY);
      return skipped ? new Set(JSON.parse(skipped)) : new Set();
    } catch (_e) {
      return new Set();
    }
  }

  function saveSkippedTasks(skippedSet) {
    localStorage.setItem(SKIPPED_TASKS_KEY, JSON.stringify(Array.from(skippedSet)));
  }

  function addSkippedTask(taskName, courseName) {
    if (!taskName || !courseName) return;
    const skipped = getSkippedTasks();
    skipped.add(getTaskIdentifier(taskName, courseName));
    saveSkippedTasks(skipped);
  }

  function removeSkippedTask(taskName, courseName) {
    if (!taskName || !courseName) return;
    const skipped = getSkippedTasks();
    skipped.delete(getTaskIdentifier(taskName, courseName));
    // На всякий случай подчищаем и по старой логике
    skipped.delete(getLegacyTaskIdentifier(taskName, courseName));
    saveSkippedTasks(skipped);
  }

  function findMatchingTask(htmlNames, tasksData) {
    if (!htmlNames?.taskName || !htmlNames?.courseName) return null;
    const cleanHtmlTaskName = normalizeText(htmlNames.taskName).toLowerCase();
    const cleanHtmlCourseName = normalizeText(htmlNames.courseName).toLowerCase();
    return tasksData.find((task) => {
      const cleanApiTaskName = normalizeText(task.exercise?.name).toLowerCase();
      const cleanApiCourseName = normalizeText(task.course?.name).toLowerCase();
      return cleanApiTaskName === cleanHtmlTaskName && cleanApiCourseName === cleanHtmlCourseName;
    });
  }

  async function fetchTasksData() {
    try {
      // Обновленная ссылка с фильтрацией по статусам
      const response = await fetch(
        'https://my.centraluniversity.ru/api/micro-lms/tasks/student?state=inProgress&state=backlog&state=submitted&state=review&state=reworking'
      );
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      window.cuLmsLog('Task Status Updater: Failed to fetch tasks:', error);
      return [];
    }
  }

  function extractTaskAndCourseNamesFromElement(element) {
    const taskRow = element.closest('tr[class*="task-table__task"]');
    if (!taskRow) return null;
    const taskName = taskRow.querySelector('.task-table__task-name')?.textContent.trim();
    const courseName = taskRow.querySelector('.task-table__course-name')?.textContent.trim();
    return { taskName, courseName };
  }

  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const observer = new MutationObserver(() => {
        const foundEl = document.querySelector(selector);
        if (foundEl) {
          observer.disconnect();
          resolve(foundEl);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout for ${selector}`));
      }, timeout);
    });
  }

  // --- ЛОГИКА ФИЛЬТРОВ (С СОХРАНЕНИЕМ ПАРАМЕТРОВ) ---
  const HARDCODED_STATUSES = [
    'В работе',
    'Задано',
    'Решение прикреплено',
    'На проверке',
    'Можно доработать',
    'Аудиторная',
    SKIPPED_STATUS_TEXT,
  ];
  const masterCourseList = new Set();
  let selectedStatuses = new Set(HARDCODED_STATUSES);
  let selectedCourses = new Set();
  let knownCourses = new Set();

  function loadFilterSettings() {
    try {
      const savedFilters = localStorage.getItem(FILTER_STORAGE_KEY);
      if (savedFilters) {
        const { statuses, courses, knownCourses: savedKnown } = JSON.parse(savedFilters);
        if (statuses && Array.isArray(statuses)) selectedStatuses = new Set(statuses);
        if (courses && Array.isArray(courses)) selectedCourses = new Set(courses);
        if (savedKnown && Array.isArray(savedKnown)) knownCourses = new Set(savedKnown);
        window.cuLmsLog('Task Status Updater: Filter settings loaded from storage');
      }
    } catch (error) {
      window.cuLmsLog('Task Status Updater: Failed to load filter settings:', error);
      selectedStatuses = new Set(HARDCODED_STATUSES);
    }
  }

  function saveFilterSettings() {
    try {
      const filterData = {
        statuses: Array.from(selectedStatuses),
        courses: Array.from(selectedCourses),
        knownCourses: Array.from(masterCourseList),
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filterData));
    } catch (error) {
      window.cuLmsLog('Task Status Updater: Failed to save filter settings:', error);
    }
  }

  function initializeFilters() {
    loadFilterSettings();
    if (masterCourseList.size === 0) {
      document
        .querySelectorAll('tr[class*="task-table__task"] .task-table__course-name')
        .forEach((el) => {
          const courseName = el.textContent.trim();
          if (courseName) masterCourseList.add(courseName);
        });

      if (knownCourses.size === 0) {
        // Нет сохранённых данных — выбираем все курсы
        masterCourseList.forEach((course) => selectedCourses.add(course));
      } else {
        // Убираем устаревшие курсы (которых нет в DOM)
        selectedCourses.forEach((course) => {
          if (!masterCourseList.has(course)) selectedCourses.delete(course);
        });
        // Добавляем новые курсы (которых не было раньше) как выбранные
        masterCourseList.forEach((course) => {
          if (!knownCourses.has(course)) selectedCourses.add(course);
        });
      }

      window.cuLmsLog('Task Status Updater: Master course list created with saved selections.');
      saveFilterSettings();
    }
    applyCombinedFilter();
  }

  function applyCombinedFilter() {
    document.querySelectorAll('tr[class*="task-table__task"]').forEach((row) => {
      // Ищем по новому тегу
      const statusBadge = row.querySelector('cu-task-state-badge');
      const courseEl = row.querySelector('.task-table__course-name');
      if (statusBadge && courseEl) {
        const isStatusVisible = selectedStatuses.has(statusBadge.textContent.trim());
        const isCourseVisible = selectedCourses.has(courseEl.textContent.trim());
        row.style.display = isStatusVisible && isCourseVisible ? '' : 'none';
      }
    });
  }

  function handleStatusFilterClick(event) {
    const optionButton = event.target.closest('button[tuioption]');
    if (!optionButton) return;
    updateSelection(selectedStatuses, optionButton.textContent.trim(), optionButton);
    applyCombinedFilter();
    saveFilterSettings();
  }

  function handleCourseFilterClick(event) {
    const optionButton = event.target.closest('button[tuioption]');
    if (!optionButton) return;
    // Для курсов ищем текст внутри span, так как структура сложнее
    const textSpan = optionButton.querySelector('tui-multi-select-option span');
    const courseName = textSpan ? textSpan.textContent.trim() : optionButton.textContent.trim();

    updateSelection(selectedCourses, courseName, optionButton);
    applyCombinedFilter();
    saveFilterSettings();
  }

  function updateSelection(selectionSet, text, button) {
    if (selectionSet.has(text)) selectionSet.delete(text);
    else selectionSet.add(text);
    const isSelected = selectionSet.has(text);

    // Для старых кнопок статусов (прямая смена класса)
    button.classList.toggle('t-option_selected', isSelected);
    button.setAttribute('aria-selected', isSelected.toString());

    // Для новых и старых чекбоксов
    const checkbox = button.querySelector('input[tuicheckbox]');
    if (checkbox) checkbox.checked = isSelected;
  }

  function setupDropdownInterceptor() {
    if (dropdownObserver) return;

    dropdownObserver = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        for (const node of mutation.addedNodes) {
          if (isArchivedPage() || node.nodeType !== 1) continue;

          // 1. Старый перехватчик для статусов (tui-data-list-wrapper)
          if (node.matches('tui-dropdown')) {
            const dataListWrapper = node.querySelector(
              'tui-data-list-wrapper.multiselect__dropdown'
            );
            const statusFilterContainer = document.querySelector(
              'cu-multiselect-filter[controlname="state"]'
            );

            if (
              dataListWrapper &&
              !dataListWrapper.dataset.culmsRebuilt &&
              statusFilterContainer?.contains(document.activeElement)
            ) {
              buildStatusDropdown(dataListWrapper);
            }
          }

          // 2. Новый перехватчик для курсов (cu-multiselect-searchable-list)
          if (
            node.tagName &&
            (node.tagName.toLowerCase() === 'tui-dropdown' ||
              node.querySelector('cu-multiselect-searchable-list'))
          ) {
            const searchableList =
              node.tagName.toLowerCase() === 'cu-multiselect-searchable-list'
                ? node
                : node.querySelector('cu-multiselect-searchable-list');

            if (searchableList && !searchableList.dataset.culmsRebuilt) {
              // Убедимся, что это фильтр курсов (можно по controlname="course" у родителя, но тут searchableList уже специфичен)
              const courseFilterContainer = document.querySelector(
                'cu-multiselect-filter[controlname="course"]'
              );
              // Проверяем, что dropdown открылся именно от фильтра курсов (активный элемент или структура)
              if (courseFilterContainer) {
                buildSearchableCourseDropdown(searchableList);
              }
            }
          }
        }
      }
    });
    dropdownObserver.observe(document.body, { childList: true, subtree: true });
    window.cuLmsLog('Task Status Updater: Dropdown observer initialized.');
  }

  function buildStatusDropdown(dataListWrapper) {
    dataListWrapper.dataset.culmsRebuilt = 'true';
    const dataList = dataListWrapper.querySelector('tui-data-list');
    if (!dataList) return;
    dataList.innerHTML = '';

    HARDCODED_STATUSES.forEach((text) => {
      const isSelected = selectedStatuses.has(text);
      dataList.appendChild(createStatusOption(text, isSelected));
    });
    dataListWrapper.addEventListener('click', handleStatusFilterClick);
  }

  function buildSearchableCourseDropdown(searchableListElement) {
    searchableListElement.dataset.culmsRebuilt = 'true';

    // Находим контейнер списка
    const dataList = searchableListElement.querySelector('tui-data-list');
    if (!dataList) return;

    // 1. Отрубаем бэкенд-поиск: клонируем инпут, чтобы убить Angular-биндинги
    const searchWrapper = searchableListElement.querySelector('tui-textfield');
    const oldInput = searchWrapper?.querySelector('input');
    if (oldInput) {
      const newInput = oldInput.cloneNode(true);
      oldInput.replaceWith(newInput);

      // Локальный поиск
      newInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        const buttons = dataList.querySelectorAll('button[tuioption]');
        buttons.forEach((btn) => {
          const span = btn.querySelector('span');
          const text = span ? span.textContent.toLowerCase() : '';
          const wrapperDiv = btn.closest('div');
          if (wrapperDiv) {
            wrapperDiv.style.display = text.includes(val) ? '' : 'none';
          }
        });
      });

      // Обработка кнопки очистки (крестик)
      const clearBtn = searchWrapper.querySelector('.t-clear');
      if (clearBtn) {
        // Клонируем кнопку, чтобы убить старые обработчики
        const newClearBtn = clearBtn.cloneNode(true);
        clearBtn.replaceWith(newClearBtn);
        newClearBtn.addEventListener('click', () => {
          newInput.value = '';
          newInput.dispatchEvent(new Event('input'));
        });
      }
    }

    // 2. Очищаем список от того, что прислал сервер
    dataList.innerHTML = '';

    // 3. Генерируем полный список курсов из masterCourseList
    const sortedCourses = [...masterCourseList].sort();
    sortedCourses.forEach((text) => {
      const isSelected = selectedCourses.has(text);
      dataList.appendChild(createCourseOption(text, isSelected));
    });

    // 4. Вешаем обработчик клика на весь список
    searchableListElement.addEventListener('click', handleCourseFilterClick);
  }

  function createStatusOption(text, isSelected) {
    const button = document.createElement('button');
    button.className = 'ng-star-inserted';
    if (isSelected) button.classList.add('t-option_selected');
    button.setAttribute('tuiicons', '');
    button.setAttribute('type', 'button');
    button.setAttribute('role', 'option');
    button.setAttribute('automation-id', 'tui-data-list-wrapper__option');
    button.setAttribute('tuielement', '');
    button.setAttribute('tuioption', '');
    button.setAttribute('aria-selected', isSelected.toString());
    const finalStyle = `pointer-events: none; --t-checked-icon: url(assets/cu/icons/cuIconCheck.svg); --t-indeterminate-icon: url(assets/cu/icons/cuIconMinus.svg);`;
    button.innerHTML = `<tui-multi-select-option><input tuiappearance tuicheckbox type="checkbox" class="_readonly" data-appearance="primary" data-size="s" style="${finalStyle}"><span class="t-content ng-star-inserted"> ${text} </span></tui-multi-select-option>`;
    const checkbox = button.querySelector('input[tuicheckbox]');
    if (checkbox) checkbox.checked = isSelected;
    return button;
  }

  function createCourseOption(text, isSelected) {
    // Оборачиваем в div, как в новом интерфейсе
    const wrapper = document.createElement('div');

    const button = document.createElement('button');
    button.setAttribute('tuiicons', '');
    button.setAttribute('type', 'button');
    button.setAttribute('role', 'option');
    button.setAttribute('tuioption', '');

    // Стили чекбокса для курсов (outline-grayscale)
    const finalStyle = `pointer-events: none; --t-checked-icon: url(assets/cu/icons/cuIconCheck.svg); --t-indeterminate-icon: url(assets/cu/icons/cuIconMinus.svg);`;

    button.innerHTML = `
        <tui-multi-select-option>
            <input tuiappearance tuicheckbox type="checkbox" 
                   data-appearance="outline-grayscale" disabled data-size="s" class="_readonly" 
                   style="${finalStyle}">
            <span>${text}</span>
        </tui-multi-select-option>`;

    const checkbox = button.querySelector('input[tuicheckbox]');
    if (checkbox) checkbox.checked = isSelected;

    wrapper.appendChild(button);
    return wrapper;
  }

  browser.storage.onChanged.addListener((changes) => {
    if (changes.themeEnabled) {
      setTimeout(() => {
        window.cuLmsLog('Task Status Updater: Theme changed, refreshing styles and icons...');
        refreshDynamicStyles();
        Object.keys(svgIconCache).forEach((key) => delete svgIconCache[key]);
        document.querySelectorAll('.culms-action-button').forEach((button) => {
          const isSkipped = button.dataset.isSkipped === 'true';
          updateButtonIcon(button, isSkipped);
        });
      }, 100);
    }
  });

  initializeObserver();
  throttledCheckAndRun();
}

// --- ВСТАВИТЬ В tasks_fix.js ---

function loadApricotModule() {
  if (window.__apricotTasksFixInitialized) return;

  // ВАЖНО: Пути должны в точности совпадать с путями в папке проекта и manifest.ts
  const scripts = ['plugins/_shared/apricot_api.js', 'plugins/courses/apricot_tasks_fix.js'];

  scripts.forEach((path) => {
    const script = document.createElement('script');

    // browser.runtime.getURL построит правильный путь типа chrome-extension://ID/path...
    script.src = browser.runtime.getURL(path);

    script.onload = () => {
      console.log(`[CU LMS] Script loaded: ${path}`);
      // Можно удалять тег после загрузки, чтобы не засорять DOM
      script.remove();
    };

    script.onerror = () => {
      console.error(
        `[CU LMS] Failed to load script: ${path}. Проверь путь и web_accessible_resources в манифесте.`
      );
    };

    (document.head || document.documentElement).appendChild(script);
  });
}

// Запускаем
loadApricotModule();
