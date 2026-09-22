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
      // Скрытие по дате работает и на архивной странице, поэтому уборка
      // остального его не отменяет.
      row.style.display = row.hasAttribute(HIDDEN_BY_DATE_ATTR) ? 'none' : '';
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
  const SEMINAR_STATUS_TEXT = 'Аудиторная';

  // Аудиторную работу LMS никак не помечает, поэтому вычисляем её сами по
  // названию активности. Активность (`exercise.activity`) — это не тип
  // задания, а корзина в формуле оценки: «Аудиторная работа на семинарах»,
  // «Активность», у каждой свой вес. Домашка вполне может лежать в
  // семинарской корзине — так у метоптов «ДЗ 3_1» светилось «Аудиторной».
  // Поэтому сначала смотрим на название самого задания: если это ДЗ, никакая
  // корзина его в аудиторную работу не превратит.
  const SEMINAR_ACTIVITY_KEYWORDS = ['Аудиторная', 'Семинар', 'Активность'];
  // Перебиваем только «ничего не сдано»: у сданного статус важнее типа.
  const SEMINAR_LOW_PRIORITY_STATUSES = ['В работе', 'Задано'];
  const HOMEWORK_MARKERS = ['дз', 'д/з', 'домашн', 'homework', 'hw'];

  /**
   * «ДЗ 3_1. Матрично-векторное дифференцирование» → да.
   *
   * Сравниваем по началу слова, а не по вхождению: иначе «дз» нашлось бы
   * в середине случайного слова. `\b` тут не годится — для кириллицы в JS
   * он не работает, поэтому режем строку на слова руками.
   */
  function looksLikeHomework(name) {
    const words = String(name || '')
      .toLowerCase()
      .split(/[^0-9a-zа-яё/]+/);
    return words.some((word) => HOMEWORK_MARKERS.some((marker) => word.startsWith(marker)));
  }

  /** Аудиторная ли это работа: решает название задания, а не корзина оценки. */
  function isSeminarTask(task, originalStatus, row) {
    if (!SEMINAR_LOW_PRIORITY_STATUSES.includes(originalStatus)) return false;

    const activityName = task?.exercise?.activity?.name || '';
    if (!SEMINAR_ACTIVITY_KEYWORDS.some((keyword) => activityName.includes(keyword))) return false;

    // Название берём и из API, и из самой строки: сопоставление строк с
    // задачами идёт по тексту и может промахнуться, а видимый заголовок —
    // это ровно то, на что смотрит человек.
    const visibleName = row?.querySelector('.task-table__task-name')?.textContent || '';
    return !looksLikeHomework(task?.exercise?.name) && !looksLikeHomework(visibleName);
  }

  // --- СКРЫТИЕ СТАРЫХ ЗАДАНИЙ ---
  //
  // Настройка в попапе: «скрывать задачи раньше даты N». Прячем по дедлайну —
  // другой даты в таблице нет, — и одинаково на активной и на архивной
  // странице. `null` означает «фильтр выключен».
  const HIDE_BEFORE_ENABLED_KEY = 'hideTasksBeforeEnabled';
  const HIDE_BEFORE_DATE_KEY = 'hideTasksBeforeDate';
  const HIDDEN_BY_DATE_ATTR = 'data-culms-hidden-before-date';

  // Те же адреса, что запрашивает сама LMS на каждой из двух страниц.
  const ACTIVE_TASKS_PATH =
    '/api/micro-lms/tasks/student?state=inProgress&state=backlog&state=submitted&state=review&state=reworking';
  const ARCHIVED_TASKS_PATH = '/api/micro-lms/tasks/student?state=evaluated&state=failed';

  let hideBeforeTime = null;
  let hideBeforePromise = null;
  let filtersInitialized = false;
  let archivedTasks = null;
  let archivedTasksPromise = null;
  // Сколько строк было в момент последнего сопоставления: архив Angular
  // досыпает частями, а пересопоставлять всё на каждую мутацию незачем.
  let archivedStampedRows = -1;

  // Порядок важен: «мар» проверяется раньше «ма», иначе «марта» стало бы маем.
  const MONTH_PREFIXES = [
    ['янв', 0],
    ['фев', 1],
    ['мар', 2],
    ['апр', 3],
    ['ма', 4],
    ['июн', 5],
    ['июл', 6],
    ['авг', 7],
    ['сен', 8],
    ['окт', 9],
    ['ноя', 10],
    ['дек', 11],
  ];

  // «Пт, 25 сент. 22:00» и «25 сентября 2025». Год необязателен — LMS его не
  // пишет; четыре цифры подряд отличают его от времени («22:00» не подойдёт).
  const TEXT_DATE_RE = /(\d{1,2})\s+([а-яё]+)\.?(?:\s+(\d{4}))?/i;
  const NUMERIC_DATE_RE = /(\d{1,2})[./](\d{1,2})[./](\d{2,4})/;
  const TIME_RE = /\d{1,2}:\d{2}/;

  /** «2026-09-25» → полночь этого дня по местному времени. Иначе null. */
  function parseSettingDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    // Именно местная полночь, а не `new Date('2026-09-25')`: тот разбирается
    // как UTC и в плюсовых поясах сдвигает границу на день назад.
    const time = new Date(+match[1], +match[2] - 1, +match[3]).getTime();
    return Number.isNaN(time) ? null : time;
  }

  function monthFromWord(word) {
    const lower = String(word || '').toLowerCase();
    const found = MONTH_PREFIXES.find(([prefix]) => lower.startsWith(prefix));
    return found ? found[1] : null;
  }

  /**
   * Год в таблице LMS не пишет, поэтому его приходится угадывать: берём тот из
   * соседних, при котором дата ближе всего к сегодня.
   *
   * Годится только для заданий рядом с сегодняшним днём. На архиве так делать
   * нельзя — он лежит за несколько лет, и на живой странице 302 строки из 694
   * угадывались не тем годом. Поэтому дедлайны архива берутся из API
   * (`ensureArchivedTasks()`), а этот путь остался запасным — на случай, если
   * задание с API не сопоставилось.
   */
  function pickYear(month, day, now) {
    const base = now.getFullYear();
    let best = null;
    let bestDistance = Infinity;
    [base - 1, base, base + 1].forEach((year) => {
      const candidate = new Date(year, month, day);
      if (candidate.getMonth() !== month) return; // 29 февраля невисокосного
      const distance = Math.abs(candidate.getTime() - now.getTime());
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    });
    return best;
  }

  /**
   * Дата из видимого текста строки — запасной путь, когда задание не нашлось
   * в API. Время намеренно игнорируем: настройка задаёт день, и сравнение идёт
   * по началу дня.
   */
  function parseVisibleDate(text, now = new Date()) {
    const value = String(text || '');

    const numeric = NUMERIC_DATE_RE.exec(value);
    if (numeric) {
      const year = +numeric[3];
      const date = new Date(year < 100 ? 2000 + year : year, +numeric[2] - 1, +numeric[1]);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const textual = TEXT_DATE_RE.exec(value);
    if (!textual) return null;
    const month = monthFromWord(textual[2]);
    if (month === null) return null;
    const day = +textual[1];
    if (day < 1 || day > 31) return null;

    if (textual[3]) {
      const date = new Date(+textual[3], month, day);
      return date.getMonth() === month ? date : null;
    }
    return pickYear(month, day, now);
  }

  /** Текст ячейки с дедлайном. */
  function deadlineCellText(row) {
    const cell = row.querySelector('[class*="task-table__deadline"]');
    if (cell) return cell.textContent || '';

    // Разметка архивной страницы может отличаться. Ищем ячейку, где дата стоит
    // рядом со временем: по названию задания («ДЗ 3 мая») так не промахнёшься.
    const cells = row.querySelectorAll('td');
    for (const candidate of cells) {
      const text = candidate.textContent || '';
      if (TIME_RE.test(text) && (TEXT_DATE_RE.test(text) || NUMERIC_DATE_RE.test(text))) {
        return text;
      }
    }
    return '';
  }

  /**
   * Момент дедлайна строки. Точное значение из API кладётся в data-атрибут
   * при разборе таблицы; если задание с API не сопоставилось, читаем текст.
   */
  function rowDeadlineTime(row) {
    const iso = row.dataset.culmsDeadline;
    if (iso) {
      const exact = new Date(iso);
      if (!Number.isNaN(exact.getTime())) return exact.getTime();
    }
    const parsed = parseVisibleDate(deadlineCellText(row));
    return parsed ? parsed.getTime() : null;
  }

  /** Задание без дедлайна не прячем: судить о нём не по чему. */
  function isHiddenByDate(row) {
    if (hideBeforeTime === null) return false;
    const time = rowDeadlineTime(row);
    return time !== null && time < hideBeforeTime;
  }

  function applyHideBeforeSetting(data) {
    hideBeforeTime =
      data && data[HIDE_BEFORE_ENABLED_KEY] ? parseSettingDate(data[HIDE_BEFORE_DATE_KEY]) : null;
  }

  /** Настройку читаем один раз за жизнь скрипта; дальше — через onChanged. */
  function ensureHideBeforeSetting() {
    if (!hideBeforePromise) {
      hideBeforePromise = browser.storage.sync
        .get([HIDE_BEFORE_ENABLED_KEY, HIDE_BEFORE_DATE_KEY])
        .then(applyHideBeforeSetting)
        .catch(() => {
          hideBeforeTime = null;
        });
    }
    return hideBeforePromise;
  }

  /**
   * Архивные задания тоже берём из API — иначе фильтр по дате врёт.
   *
   * В архиве LMS печатает дедлайн без года («Вс, 31 авг. 22:00»), а лежат там
   * несколько лет сразу: на живой странице из 694 строк 302 (43%) оказались не
   * того года, который получается угадать по близости к сегодня. Точный
   * `deadline` есть в том же списке задач, который запрашивает сама страница.
   */
  function ensureArchivedTasks() {
    if (!archivedTasksPromise) {
      archivedTasksPromise = fetchTasksData(ARCHIVED_TASKS_PATH)
        .then((tasks) => {
          archivedTasks = Array.isArray(tasks) ? tasks : [];
        })
        .catch(() => {
          archivedTasks = [];
        });
    }
    return archivedTasksPromise;
  }

  /**
   * Переносит точные дедлайны архивных заданий на строки.
   *
   * Сопоставление взаимно-однозначное и «расходует» задачи, поэтому строится
   * заново по всем строкам сразу — по частям его не собрать. Отсюда и защита
   * от лишней работы: пока число строк не изменилось, пересчитывать нечего.
   */
  function stampArchivedDeadlines() {
    if (!archivedTasks || !archivedTasks.length) return;

    const rows = Array.from(document.querySelectorAll('tr[class*="task-table__task"]'));
    if (!rows.length || rows.length === archivedStampedRows) return;
    archivedStampedRows = rows.length;

    const rowTasks = matchRowsToTasks(rows, archivedTasks);
    rows.forEach((row) => {
      const deadline = rowTasks.get(row)?.deadline;
      if (deadline) row.dataset.culmsDeadline = deadline;
    });
  }

  /**
   * Прячет строки только по дате. Нужен на архивной странице: наших фильтров
   * статуса и курса там нет, и применять их было бы нечем — `selectedCourses`
   * собирается из активной таблицы.
   */
  function applyDateFilterOnly() {
    document.querySelectorAll('tr[class*="task-table__task"]').forEach((row) => {
      const hidden = isHiddenByDate(row);
      const wasHidden = row.hasAttribute(HIDDEN_BY_DATE_ATTR);
      row.toggleAttribute(HIDDEN_BY_DATE_ATTR, hidden);
      if (hidden) row.style.display = 'none';
      else if (wasHidden) row.style.display = '';
    });
  }

  /** Перерисовка видимости после смены настройки. */
  function refreshRowVisibility() {
    if (!isArchivedPage() && filtersInitialized) applyCombinedFilter();
    else applyDateFilterOnly();
  }

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
      // Строки архива Angular досыпает постепенно, поэтому проходим по ним на
      // каждой мутации, а не один раз вместе с уборкой.
      void Promise.all([ensureHideBeforeSetting(), ensureArchivedTasks()]).then(() => {
        stampArchivedDeadlines();
        applyDateFilterOnly();
      });
      stampArchivedDeadlines();
      applyDateFilterOnly();
      return;
    }

    isCleanedUp = false;
    // Ушли с архива: его строки пересоздадутся, и штампы дедлайнов исчезнут.
    archivedStampedRows = -1;

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
      // Иконки кнопок лежат в самом расширении — прогреваем кеш параллельно,
      // чтобы первая отрисовка кнопок их не ждала.
      void Promise.all([getIconSVG('skip'), getIconSVG('cancelskip')]).catch(() => {});

      // Настройки и данные запрашиваем сразу, параллельно с ожиданием строк.
      // Раньше оба шага начинались уже ПОСЛЕ их появления, и таблица успевала
      // постоять без процентов, дедлайнов и кнопок — всё «доезжало» на глазах.
      // Angular рисует таблицу дольше, чем идёт наш запрос, поэтому к моменту
      // появления строк данные обычно уже готовы.
      const settingsPromise = browser.storage.sync.get('emojiHeartsEnabled');
      const hideBeforePending = ensureHideBeforeSetting();
      const tasksPromise = fetchTasksData();

      await waitForElement('tr[class*="task-table__task"]');
      window.cuLmsLog('Task Status Updater: Task rows found. Starting DOM modification.');

      // Дату скрытия ждём здесь же: примени её позже — строки успели бы
      // мелькнуть на экране и тут же пропасть.
      const [settings, tasksData] = await Promise.all([
        settingsPromise,
        tasksPromise,
        hideBeforePending,
      ]);
      const isEmojiSwapEnabled = !!settings.emojiHeartsEnabled;

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
    const rows = Array.from(document.querySelectorAll('tr[class*="task-table__task"]'));
    // Считаем соответствие строк и задач заранее и в порядке DOM: обработка
    // строк идёт параллельно, а «расходование» кандидатов требует порядка.
    const rowTasks = matchRowsToTasks(rows, tasksData);

    const processingPromises = rows.map(async (row) => {
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
      const task = rowTasks.get(row);
      const isSkipped = isTaskSkipped(skippedTasks, task, htmlNames);

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

          if (isSeminarTask(task, originalText, row)) {
            setStatusText(statusBadge, SEMINAR_STATUS_TEXT);
            statusBadge.setAttribute('data-culms-status', 'seminar');
            row.setAttribute('data-culms-row-type', 'seminar');
            statusBadge.classList.remove(
              'task-state_custom_in-progress',
              'task-state_custom_assigned'
            );
          }
        }

        const weight = task.exercise?.activity?.weight;
        weightCell.textContent =
          weight !== undefined && weight !== null ? `${Math.round(weight * 100)}%` : '';

        // Точный дедлайн держим на строке: в видимом тексте нет года, а
        // фильтру «раньше даты N» его приходится угадывать.
        if (task.deadline) row.dataset.culmsDeadline = task.deadline;
        else delete row.dataset.culmsDeadline;
      } else {
        weightCell.textContent = '';
        delete row.dataset.culmsDeadline;
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
    const isCurrentlySkipped = isTaskSkipped(getSkippedTasks(), task, {
      taskName: task.exercise?.name,
      courseName: task.course?.name,
    });

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
          addSkippedTask(task);
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
    removeSkippedTask(task);

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

    if (isSeminarTask(task, originalText, row)) {
      setStatusText(statusBadge, SEMINAR_STATUS_TEXT);
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

  /**
   * Ключ скипа. Привязываемся к id задачи: названия внутри курса не уникальны
   * («Семинар», «ДЗ», «Перезачет» повторяются), и ключ `курс::задание` помечал
   * скипнутыми сразу все одноимённые задания.
   */
  function getTaskStorageKey(task) {
    return task && task.id != null ? `id:${task.id}` : null;
  }

  /** Скипнута ли задача: сперва по id, затем по старым ключам-названиям. */
  function isTaskSkipped(skippedTasks, task, htmlNames) {
    const idKey = getTaskStorageKey(task);
    if (idKey && skippedTasks.has(idKey)) return true;

    const nameKey = getTaskIdentifier(htmlNames?.taskName, htmlNames?.courseName);
    const legacyKey = getLegacyTaskIdentifier(htmlNames?.taskName, htmlNames?.courseName);
    return Boolean(
      (nameKey && skippedTasks.has(nameKey)) || (legacyKey && skippedTasks.has(legacyKey))
    );
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

  function addSkippedTask(task) {
    const skipped = getSkippedTasks();
    const idKey = getTaskStorageKey(task);
    // Без id (задача не нашлась в API) деваться некуда — пишем по названиям.
    skipped.add(idKey || getTaskIdentifier(task?.exercise?.name, task?.course?.name));
    saveSkippedTasks(skipped);
  }

  function removeSkippedTask(task) {
    const skipped = getSkippedTasks();
    const idKey = getTaskStorageKey(task);
    if (idKey) skipped.delete(idKey);
    // Подчищаем и записи, сделанные до перехода на id.
    skipped.delete(getTaskIdentifier(task?.exercise?.name, task?.course?.name));
    skipped.delete(getLegacyTaskIdentifier(task?.exercise?.name, task?.course?.name));
    saveSkippedTasks(skipped);
  }

  /** Насколько задача из API похожа на то, что реально видно в строке. */
  function scoreRowMatch(row, task) {
    let score = 0;

    const scoreText = normalizeText(row.querySelector('.task-table__score')?.textContent || '');
    if (scoreText && task.exercise?.maxScore != null) {
      if (scoreText === `${task.score ?? ''}/${task.exercise.maxScore}`) score += 2;
    }

    const deadlineText = row.querySelector('[class*="task-table__deadline"]')?.textContent || '';
    if (task.deadline) {
      const date = new Date(task.deadline);
      if (!Number.isNaN(date.getTime())) {
        const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        if (deadlineText.includes(String(date.getDate())) && deadlineText.includes(time))
          score += 2;
      }
    }
    return score;
  }

  /**
   * Сопоставляет строки таблицы с задачами из API взаимно-однозначно.
   *
   * В строке нет ни id, ни ссылки — только текст, поэтому совпадение всё равно
   * по названиям. Но раньше тут был `.find()`: если в одном курсе есть несколько
   * заданий с одинаковым названием, все их строки получали один и тот же объект
   * задачи. Отсюда чужие веса и дедлайны в колонках и «скип», который
   * проставлялся сразу на все одноимённые задания. Теперь кандидатов с
   * одинаковым названием разводим по видимым колонкам (баллы, дедлайн), а
   * выбранную задачу «расходуем» — две строки не могут указывать на одну.
   */
  function matchRowsToTasks(rows, tasksData) {
    const candidatesByName = new Map();
    tasksData.forEach((task) => {
      const key = getTaskIdentifier(task.exercise?.name, task.course?.name);
      if (!key) return;
      if (!candidatesByName.has(key)) candidatesByName.set(key, []);
      candidatesByName.get(key).push(task);
    });

    const matches = new Map();
    rows.forEach((row) => {
      const names = extractTaskAndCourseNamesFromElement(row);
      const key = getTaskIdentifier(names?.taskName, names?.courseName);
      const candidates = key ? candidatesByName.get(key) : null;
      if (!candidates || !candidates.length) return;

      let index = 0;
      if (candidates.length > 1) {
        let best = -1;
        candidates.forEach((task, i) => {
          const score = scoreRowMatch(row, task);
          if (score > best) {
            best = score;
            index = i;
          }
        });
      }
      matches.set(row, candidates.splice(index, 1)[0]);
    });

    return matches;
  }

  async function fetchTasksData(path = ACTIVE_TASKS_PATH) {
    try {
      const response = await fetch(path);
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
    const courseCell = taskRow.querySelector('.task-table__course-name');
    // Пользователь мог переименовать курс — сопоставлять с API надо по
    // оригинальному названию, иначе отваливаются веса, дедлайны и метод скипа.
    const courseName = window.cuLmsCourseNames
      ? window.cuLmsCourseNames.originalFor(courseCell, courseCell?.textContent?.trim())
      : courseCell?.textContent.trim();
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

  /**
   * Настоящее название курса: в DOM оно может быть подменено
   * `_shared/course_names.js`. Фильтр курсов хранится в localStorage, поэтому
   * внутри работаем только с оригиналами — иначе переименование курса
   * рассогласовало бы сохранённый выбор с тем, что в списке.
   */
  function originalCourseName(element, fallback) {
    const text = fallback ?? element?.textContent?.trim();
    return window.cuLmsCourseNames ? window.cuLmsCourseNames.originalFor(element, text) : text;
  }

  /** Что показать пользователю вместо настоящего названия. */
  function displayCourseName(original) {
    return window.cuLmsCourseNames ? window.cuLmsCourseNames.toDisplay(original) : original;
  }

  function initializeFilters() {
    loadFilterSettings();
    if (masterCourseList.size === 0) {
      document
        .querySelectorAll('tr[class*="task-table__task"] .task-table__course-name')
        .forEach((el) => {
          const courseName = originalCourseName(el);
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
    filtersInitialized = true;
    applyCombinedFilter();
  }

  function applyCombinedFilter() {
    document.querySelectorAll('tr[class*="task-table__task"]').forEach((row) => {
      const hiddenByDate = isHiddenByDate(row);
      const wasHiddenByDate = row.hasAttribute(HIDDEN_BY_DATE_ATTR);
      row.toggleAttribute(HIDDEN_BY_DATE_ATTR, hiddenByDate);

      // Ищем по новому тегу
      const statusBadge = row.querySelector('cu-task-state-badge');
      const courseEl = row.querySelector('.task-table__course-name');
      if (statusBadge && courseEl) {
        const isStatusVisible = selectedStatuses.has(statusBadge.textContent.trim());
        const isCourseVisible = selectedCourses.has(originalCourseName(courseEl));
        row.style.display = !hiddenByDate && isStatusVisible && isCourseVisible ? '' : 'none';
      } else if (hiddenByDate) {
        row.style.display = 'none';
      } else if (wasHiddenByDate) {
        // Дату сдвинули назад — строку, спрятанную прошлым проходом, возвращаем.
        row.style.display = '';
      }
    });
  }

  function handleStatusFilterClick(event) {
    const optionButton = event.target.closest('button[tuioption]');
    if (!optionButton) return;
    updateSelection(selectedStatuses, optionButton.textContent.trim(), optionButton);
    updateStatusChip();
    applyCombinedFilter();
    saveFilterSettings();
  }

  function handleCourseFilterClick(event) {
    const optionButton = event.target.closest('button[tuioption]');
    if (!optionButton) return;
    // Оригинал кладём в data-атрибут при генерации опции: на экране может быть
    // переименованный курс, а в фильтре должно лежать настоящее название.
    const textSpan = optionButton.querySelector('tui-multi-select-option span');
    const shown = textSpan ? textSpan.textContent.trim() : optionButton.textContent.trim();
    const courseName = optionButton.dataset.culmsCourse || originalCourseName(textSpan, shown);

    updateSelection(selectedCourses, courseName, optionButton);
    updateCourseChip();
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

          // 2. Перехватчик для курсов.
          //
          // Раньше он искал `cu-multiselect-searchable-list` — такого элемента
          // в LMS больше нет, поэтому список курсов не подменялся вовсе.
          // Оба фильтра рисуют одинаковый `tui-data-list-wrapper`, и отличить
          // их можно только по тому, какой фильтр открыт: у каждого свой
          // `tui-dropdown`, и он создаётся в момент первого открытия.
          if (node.matches('tui-dropdown')) {
            const dataListWrapper = node.querySelector(
              'tui-data-list-wrapper.multiselect__dropdown'
            );
            const courseFilterContainer = document.querySelector(
              'cu-multiselect-filter[controlname="course"]'
            );

            if (
              dataListWrapper &&
              !dataListWrapper.dataset.culmsRebuilt &&
              courseFilterContainer?.contains(document.activeElement)
            ) {
              buildCourseDropdown(dataListWrapper);
            }
          }
        }
      }
    });
    dropdownObserver.observe(document.body, { childList: true, subtree: true });
    window.cuLmsLog('Task Status Updater: Dropdown observer initialized.');
  }

  /**
   * Приводит чип фильтра статусов в соответствие с нашим состоянием.
   *
   * Список опций мы подменяем своим — в нём есть «Аудиторная» и «Метод скипа»,
   * которых у LMS нет. Клики по нашим кнопкам до модели LMS не доходят, поэтому
   * чип продолжал показывать её исходный выбор: счётчик застывал («+ 4») и
   * расходился с галочками в списке. Рисуем чип сами.
   */
  /**
   * Пишет в свёрнутый чип фильтра наш выбор.
   *
   * Списки опций мы подменяем своими, и клики по ним до модели LMS не доходят —
   * её чип застывал на исходном выборе и расходился с галочками в списке.
   *
   * В чипе два текстовых узла: подпись («Статус:», «Курс:») и само значение, —
   * поэтому пишем именно во второй, а не в `textContent`, иначе подпись
   * затрётся.
   */
  function writeFilterChip(host, values) {
    const valueBox = host?.querySelector('.cu-filter-value');
    const first = valueBox?.querySelector('.cu-filter-value__first');
    if (!first) return;

    const textNodes = Array.from(first.childNodes).filter(
      (node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()
    );
    // Узел со значением LMS создаёт, только когда у неё что-то выбрано. Если у
    // нас выбор есть, а у неё нет, писать название было бы некуда — добавляем
    // свой текстовый узел сразу после подписи.
    let valueNode = textNodes[1];
    if (!valueNode && values.length) {
      valueNode = document.createTextNode(' ');
      first.insertBefore(valueNode, textNodes[0] ? textNodes[0].nextSibling : null);
    }
    if (valueNode) valueNode.nodeValue = values.length ? ` ${values[0]} ` : ' ';

    const rest = Math.max(0, values.length - 1);
    let after = valueBox.querySelector('.cu-filter-value__after');
    if (!after && rest) {
      // LMS рисует счётчик, только когда выбрано больше одного. Если сейчас у
      // неё выбран один курс, а у нас несколько, писать «+ N» было бы некуда.
      // Клонируем подпись без детей — так сохраняются `_ngcontent-*`, без
      // которых Angular не применит к счётчику свои стили.
      after = first.cloneNode(false);
      after.className = 'cu-filter-value__after font-text-xs-bold';
      after.setAttribute('cutext', 'xs-bold');
      valueBox.appendChild(after);
    }
    if (after) {
      after.textContent = rest ? ` + ${rest} ` : '';
      after.style.display = rest ? '' : 'none';
    }
  }

  function updateStatusChip() {
    const host = document.querySelector('cu-multiselect-filter[controlname="state"]');
    writeFilterChip(
      host,
      HARDCODED_STATUSES.filter((status) => selectedStatuses.has(status))
    );
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
    updateStatusChip();
  }

  /**
   * Чип фильтра курсов — по тем же причинам, что и у статусов: список мы
   * подменяем своим, клики до модели LMS не доходят, и её счётчик застывает.
   */
  function updateCourseChip() {
    const host = document.querySelector('cu-multiselect-filter[controlname="course"]');
    const selected = [...masterCourseList].filter((course) => selectedCourses.has(course)).sort();
    // В чипе показываем то же название, что пользователь видит в списке.
    writeFilterChip(host, selected.map(displayCourseName));
  }

  function buildCourseDropdown(dataListWrapper) {
    dataListWrapper.dataset.culmsRebuilt = 'true';
    const dataList = dataListWrapper.querySelector('tui-data-list');
    if (!dataList) return;

    dataList.innerHTML = '';

    // Список берём из таблицы, а не от сервера: там только те курсы, по которым
    // реально есть задания, и в том же виде, в каком мы их фильтруем.
    [...masterCourseList].sort().forEach((text) => {
      dataList.appendChild(createCourseOption(text, selectedCourses.has(text)));
    });

    dataListWrapper.addEventListener('click', handleCourseFilterClick);
    updateCourseChip();
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
            <span></span>
        </tui-multi-select-option>`;

    // `text` — настоящее название; показываем вместо него переименованное,
    // а оригинал храним в data-атрибуте. Подпись ставим через textContent:
    // имя задаёт пользователь, и подставлять его в innerHTML не стоит.
    button.dataset.culmsCourse = text;
    const label = button.querySelector('tui-multi-select-option span');
    if (label) label.textContent = displayCourseName(text);

    const checkbox = button.querySelector('input[tuicheckbox]');
    if (checkbox) checkbox.checked = isSelected;

    wrapper.appendChild(button);
    return wrapper;
  }

  browser.storage.onChanged.addListener((changes) => {
    if (changes[HIDE_BEFORE_ENABLED_KEY] || changes[HIDE_BEFORE_DATE_KEY]) {
      // Настройка живая: меню можно не закрывать, таблица перестроится сразу.
      browser.storage.sync
        .get([HIDE_BEFORE_ENABLED_KEY, HIDE_BEFORE_DATE_KEY])
        .then((data) => {
          applyHideBeforeSetting(data);
          refreshRowVisibility();
        })
        .catch(() => {});
    }

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

browser.storage.sync.get(['akhIntegrationEnabled', 'akhCourseFilter']).then((data) => {
  if (!data.akhIntegrationEnabled) return;

  // Пустой список означает «курсы не выбраны» — тогда модуль даже не грузим,
  // чтобы он не ходил в akhcheck.ru впустую
  const courses = Array.isArray(data.akhCourseFilter) ? data.akhCourseFilter : [];
  if (courses.length === 0) return;

  // apricot_tasks_fix.js работает в page-context и до storage не дотянется,
  // поэтому список имён курсов передаём через общий для обоих миров DOM
  document.documentElement.dataset.culmsAkhCourses = JSON.stringify(
    courses.map((c) => c?.name).filter(Boolean)
  );
  loadApricotModule();
});
