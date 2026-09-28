// exams_dashboard.js — дэшборд ближайших контрольных на странице «Мои курсы».
//
// На главной странице обучения (/learn/courses/view/actual/<вкладка>) рядом
// со списком курсов показывает три недели — текущую, следующую и через одну:
// номер учебной недели, её даты и контрольные мероприятия каждого курса.
// Расписание то же, что в аккордеоне страницы курса (future_exams_api.js), так
// что номера недель в обоих местах совпадают.
//
// Включается тумблером в меню (`futureExamsDashboardToggle`) и применяется на
// лету, без перезагрузки страницы. Место выбирается там же
// (`futureExamsDashboardPlacement`): колонкой справа или слева от списка —
// так дэшборд виден без прокрутки, — полоской над курсами или под ними или
// карточками под курсами.
//
// Над неделями — дедлайны заданий на две недели вперёд
// (`futureExamsDashboardDeadlines`, по умолчанию включено): 14 дней с
// сегодняшнего, у каждого число дедлайнов и цвет по их количеству, а при
// наведении — сами задания этого дня.

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

if (typeof window.__culmsExamsDashboardInitialized === 'undefined') {
  window.__culmsExamsDashboardInitialized = true;

  ('use strict');

  const SETTING_KEY = 'futureExamsDashboardToggle';
  // Тёмный вариант включаем по настройке, а не по наличию переменных
  // `--culms-dark-*`: своя палитра (custom_theme.js) может задать их и при
  // светлой теме.
  const THEME_KEY = 'themeEnabled';
  // Свой архив курсов из course_cards.js: спрятанный из списка курс прячем и
  // из дэшборда — он показывает то, что под ним в списке.
  const ARCHIVE_KEY = 'archivedCourseIds';
  // Список курсов с прошлого захода (его обновляют course_cards.js и
  // _shared/course_names.js) — чтобы не ждать сеть при первой отрисовке.
  const META_CACHE_KEY = 'courseMetaCache';
  const COURSES_API = '/api/micro-lms/courses/student?limit=200&offset=0&state=published';
  const COURSE_URL_PREFIX = '/learn/courses/view/actual/';

  // --- Дедлайны на две недели ---
  const DEADLINES_KEY = 'futureExamsDashboardDeadlines';
  // Все состояния: сданное тоже показываем — с галочкой, чтобы было видно,
  // сколько ещё впереди.
  const TASKS_API =
    '/api/micro-lms/tasks/student?state=backlog&state=inProgress&state=submitted' +
    '&state=review&state=reworking&state=evaluated&state=failed';
  // Задания меняются за день не раз, но не поминутно: список перезапрашиваем
  // при возвращении на вкладку, если он старше десяти минут.
  const TASKS_TTL_MS = 10 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DAYS_AHEAD = 14;
  // Задание, открытое меньше суток, — тест или работа прямо на паре: это не
  // дедлайн, к которому готовятся, а курс с тестом на каждой паре иначе
  // раскрашивал бы красным каждый день пар.
  const SHORT_TASK_MS = DAY_MS;
  // Задания, которые сдавать не нужно, хотя дедлайн у них есть: ознакомление
  // с приказами (оценивается само), «Перезачёт» в каждом курсе, дорешивания,
  // бонусы и работа на паре, которую ставит преподаватель. На живой LMS в
  // одной неделе их было 27 из 34. Сданное считается всегда: раз сдавали —
  // значит, это была работа.
  const NOT_WORK_ACTIVITY = /ознакомлен|бонус/i;
  const NOT_WORK_NAME = /перезач[её]т|пересдач|апелляц|дорешив/i;
  // Корзины аудиторной работы и признаки ДЗ — как в courses/tasks_fix.js
  // (isSeminarTask): домашка в семинарской корзине остаётся домашкой.
  const SEMINAR_ACTIVITY = /аудиторн|семинар|активност/i;
  const HOMEWORK_MARKERS = ['дз', 'д/з', 'домашн', 'homework', 'hw'];
  // Цвет дня — по числу дедлайнов: 1–2, 3–5, 6–9 и 10+. Пороги абсолютные,
  // а не от «обычного дня»: десять дедлайнов в воскресенье — это много, даже
  // если так каждую неделю.
  const LEVELS = [
    { min: 10, level: 4 },
    { min: 6, level: 3 },
    { min: 3, level: 2 },
    { min: 1, level: 1 },
  ];
  const LEGEND = ['1–2', '3–5', '6–9', '10+'];
  const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const WEEKDAYS_FULL = [
    'Воскресенье',
    'Понедельник',
    'Вторник',
    'Среда',
    'Четверг',
    'Пятница',
    'Суббота',
  ];
  const MONTHS_GENITIVE = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ];
  // Во всплывашке — не больше стольких заданий, остальное — «и ещё N».
  const POPOVER_LIMIT = 12;
  const POPOVER_ID = 'culms-deadlines-popover';

  // Сколько недель видно разом. Листается окно по одной неделе.
  const WEEKS_SHOWN = 3;
  const NAV_LABELS = {
    prev: 'Предыдущая неделя',
    today: 'К текущей неделе',
    next: 'Следующая неделя',
  };
  const SVG_NS = 'http://www.w3.org/2000/svg';
  // Стрелки и «текущая неделя» — точка в круге. Кнопка текущей стоит между
  // стрелками всегда, а не появляется при листании: иначе стрелка «вперёд»
  // уезжала бы из-под курсора после первого же нажатия.
  const NAV_ICONS = {
    prev: [['path', { d: 'M10 3.5 5.5 8l4.5 4.5' }]],
    today: [
      ['circle', { cx: '8', cy: '8', r: '5' }],
      ['circle', { cx: '8', cy: '8', r: '1.6', fill: 'currentColor', stroke: 'none' }],
    ],
    next: [['path', { d: 'M6 3.5 10.5 8 6 12.5' }]],
  };

  const PLACEMENT_KEY = 'futureExamsDashboardPlacement';
  // right/left — колонка рядом со списком; above и compact — полоска в пару
  // строк над курсами и под ними; below — карточки под курсами.
  const PLACEMENTS = ['right', 'left', 'above', 'compact', 'below'];
  const DEFAULT_PLACEMENT = 'compact';
  // Список курсов на десктопной раскладке LMS — 66rem, и он не сжимается: у
  // `cu-courses-group` такой min-width. Колонке остаётся свободное поле рядом,
  // и уже этого она не нужна — названия курсов не прочитать.
  const LIST_WIDTH_REM = 66;
  const SIDE_MIN_WIDTH = 260;
  const SIDE_GAP = 24;
  const SIDE_MARGIN = 24;
  // Уже стоящая сбоку колонка уходит вниз только когда станет уже на столько
  // же: иначе на самой границе полоса прокрутки (~15 px), появляясь и пропадая
  // от перестановки, перекидывала бы дэшборд туда-обратно без конца.
  // Нижняя граница колонки в CSS — SIDE_MIN_WIDTH минус этот запас.
  const SIDE_HYSTERESIS = 20;

  const ROOT_CLASS = 'culms-exams-dashboard';
  const DARK_CLASS = 'culms-exams-dashboard--dark';
  const SIDE_CLASS = 'culms-exams-dashboard--side';
  const ABOVE_CLASS = 'culms-exams-dashboard--above';
  const COMPACT_CLASS = 'culms-exams-dashboard--compact';
  // Классы на `.content-container` страницы: с ними список и дэшборд встают
  // двумя колонками (см. exams_dashboard.css).
  const HOST_CLASS = 'culms-exams-host';
  const HOST_SIDE_CLASSES = { right: 'culms-exams-host--right', left: 'culms-exams-host--left' };
  // Этот класс знает _shared/course_names.js: он подставляет в дэшборд свои
  // названия курсов так же, как в список.
  const COURSE_NAME_CLASS = 'culms-exams-dashboard__course-name';

  // --- СОСТОЯНИЕ ---
  let enabled = false;
  let isDark = false;
  let placement = DEFAULT_PLACEMENT;
  /** Где дэшборд стоит сейчас: выбранное место или запасное, если сбоку тесно. */
  let mode = null;
  /**
   * На сколько недель пролистано от текущей. Живёт, пока открыта страница:
   * на смене вкладки фильтра сохраняется, при новом заходе — снова текущая.
   */
  let weekShift = 0;
  let layoutObserver = null;
  let observedLayout = null;
  let archivedKeys = new Set();
  /** { schedule, config } — последнее загруженное расписание. */
  let scheduleData = null;
  let scheduleFailed = false;
  let scheduleLoading = null;
  /** [{ id, name }] в порядке списка курсов. */
  let courses = null;
  let coursesFetched = false;
  let coursesFailed = false;
  let coursesLoading = null;
  let showDeadlines = true;
  /** [{ id, name, courseId, courseName, deadline: Date, done }] — задания с дедлайном. */
  let tasks = null;
  let tasksFetchedAt = 0;
  let tasksFailed = false;
  let tasksLoading = null;
  /** Собранный дэшборд; между вкладками фильтра переносится, а не строится заново. */
  let root = null;
  let signature = '';
  let observer = null;
  let currentUrl = location.href;

  const log = (...args) =>
    typeof window.cuLmsLog === 'function' ? window.cuLmsLog(...args) : undefined;

  // --- УТИЛИТЫ ---

  // Тот же признак списка актуальных курсов, что в course_cards.js: вкладка
  // фильтра — отдельный сегмент (/actual/all, /actual/required, ...), а у
  // страницы отдельного курса этот сегмент — числовой id (/actual/1245).
  function isActualListPage() {
    return /^\/learn\/courses\/view\/actual(\/(?!\d+$)[^/]+)?\/?$/.test(location.pathname);
  }

  function normalizeName(name) {
    return (name || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function normalizePlacement(value) {
    return PLACEMENTS.includes(value) ? value : DEFAULT_PLACEMENT;
  }

  /** Ключи архива — как в course_cards.js: id курса или `name:<название>`. */
  function isArchived(course) {
    return (
      archivedKeys.has(String(course.id)) || archivedKeys.has(`name:${normalizeName(course.name)}`)
    );
  }

  function toCourses(items) {
    return (Array.isArray(items) ? items : [])
      .filter((item) => item && item.id != null && typeof item.name === 'string')
      .map((item) => ({ id: item.id, name: item.name }));
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // --- ДАННЫЕ ---

  function loadSchedule() {
    if (scheduleLoading) return scheduleLoading;

    const futureExams = window.cuLmsFutureExams;
    if (!futureExams) {
      scheduleFailed = !scheduleData;
      update();
      return Promise.resolve();
    }

    // Кэш на 30 минут держит сам модуль, так что звать load() на каждый
    // возврат к списку дёшево — зато долго открытая вкладка подтянет правки.
    scheduleLoading = futureExams
      .load()
      .then((data) => {
        if (data) scheduleData = data;
      })
      .catch((error) => log('[exams-dashboard] Не удалось загрузить расписание:', error))
      .finally(() => {
        scheduleFailed = !scheduleData;
        scheduleLoading = null;
        update();
      });
    return scheduleLoading;
  }

  function loadCourses() {
    // Курсы за время жизни страницы не меняются — тянем один раз.
    if (coursesFetched || coursesLoading) return coursesLoading;

    coursesLoading = fetch(COURSES_API, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    })
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then((payload) => {
        courses = toCourses(Array.isArray(payload) ? payload : payload && payload.items);
        coursesFetched = true;
        coursesFailed = false;
      })
      .catch((error) => {
        log('[exams-dashboard] Не удалось получить список курсов:', error);
        coursesFailed = !courses;
      })
      .finally(() => {
        coursesLoading = null;
        update();
      });
    return coursesLoading;
  }

  /** «ДЗ 3_1. …», «HW. Week 3» — по началу слова: `\b` для кириллицы не работает. */
  function looksLikeHomework(name) {
    const words = String(name || '')
      .toLowerCase()
      .split(/[^0-9a-zа-яё/]+/);
    return words.some((word) => HOMEWORK_MARKERS.some((marker) => word.startsWith(marker)));
  }

  /** Нужно ли студенту что-то сдавать к этому дедлайну (см. NOT_WORK_*). */
  function isWork(task, exercise) {
    if (task.submitAt) return true;
    const activity = (exercise.activity && exercise.activity.name) || '';
    const name = exercise.name || '';
    if (NOT_WORK_ACTIVITY.test(activity) || NOT_WORK_NAME.test(name)) return false;
    return !SEMINAR_ACTIVITY.test(activity) || looksLikeHomework(name);
  }

  /**
   * Задания с дедлайном из курсов, которые LMS ещё не убрала в архив. Тесты
   * на паре и то, что сдавать не нужно (isWork), отбрасываются сразу.
   */
  function toTasks(payload) {
    const items = Array.isArray(payload) ? payload : (payload && payload.items) || [];
    return items.flatMap((task) => {
      if (!task) return [];
      const exercise = task.exercise || {};
      const course = task.course || {};
      if (course.isArchived || !isWork(task, exercise)) return [];

      // Личный дедлайн: с Latedays и продлениями он позже общего.
      const raw = task.deadline || exercise.deadline;
      const deadline = raw ? new Date(raw) : null;
      if (!deadline || Number.isNaN(deadline.getTime())) return [];
      const start = exercise.startDate ? new Date(exercise.startDate) : null;
      if (start && deadline - start < SHORT_TASK_MS) return [];

      return [
        {
          id: task.id,
          name: (exercise.name || '').trim() || 'Задание',
          courseId: course.id,
          courseName: course.name || '',
          deadline,
          // Сдано или проверено: у тестов и работ, сданных вне LMS, даты сдачи нет.
          done: !!task.submitAt || task.state === 'evaluated',
        },
      ];
    });
  }

  function loadTasks() {
    if (!showDeadlines) return Promise.resolve();
    if (tasksLoading) return tasksLoading;
    if (tasks && Date.now() - tasksFetchedAt < TASKS_TTL_MS) return Promise.resolve();

    tasksLoading = fetch(TASKS_API, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    })
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then((payload) => {
        tasks = toTasks(payload);
        tasksFetchedAt = Date.now();
        tasksFailed = false;
      })
      .catch((error) => {
        log('[exams-dashboard] Не удалось получить задания:', error);
        tasksFailed = !tasks;
      })
      .finally(() => {
        tasksLoading = null;
        update();
      });
    return tasksLoading;
  }

  // --- ДЕДЛАЙНЫ ПО ДНЯМ ---

  /** Форма слова к числу n: plural(5, ['дедлайн', 'дедлайна', 'дедлайнов']). */
  function plural(n, forms) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
  }

  const deadlinesText = (n) => `${n} ${plural(n, ['дедлайн', 'дедлайна', 'дедлайнов'])}`;
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  function levelOf(count) {
    const found = LEVELS.find((entry) => count >= entry.min);
    return found ? found.level : 0;
  }

  /**
   * 14 дней с сегодняшнего и дедлайны каждого — по местной дате личного
   * дедлайна. null — дедлайны выключены или ещё не загрузились.
   */
  function buildDays(today = new Date()) {
    if (!showDeadlines || !tasks) return null;

    const days = [];
    for (let offset = 0; offset < DAYS_AHEAD; offset++) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
      days.push({ key: dayKey(date), date, offset, tasks: [] });
    }
    const byKey = new Map(days.map((day) => [day.key, day]));
    tasks.forEach((task) => {
      // Курс в своём архиве студента — его и в списке курсов не видно.
      if (isArchived({ id: task.courseId, name: task.courseName })) return;
      const day = byKey.get(dayKey(task.deadline));
      if (day) day.tasks.push(task);
    });
    days.forEach((day) => {
      day.tasks.sort((a, b) => a.deadline - b.deadline || a.name.localeCompare(b.name, 'ru'));
      day.level = levelOf(day.tasks.length);
    });
    return days;
  }

  /** «Среда, 30 сентября» */
  const dayTitle = (date) =>
    `${WEEKDAYS_FULL[date.getDay()]}, ${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`;

  function dayLabel(day) {
    const left = day.tasks.filter((task) => !task.done).length;
    if (!day.tasks.length) return `${dayTitle(day.date)}: дедлайнов нет`;
    const tail = left < day.tasks.length ? `, осталось ${left}` : '';
    return `${dayTitle(day.date)}: ${deadlinesText(day.tasks.length)}${tail}`;
  }

  function renderDays(days) {
    const block = element('div', 'culms-deadlines');
    const head = element('div', 'culms-deadlines__head');
    head.appendChild(element('span', 'culms-deadlines__title', 'Дедлайны на две недели'));
    const legend = element('span', 'culms-deadlines__legend');
    legend.setAttribute('aria-hidden', 'true');
    LEGEND.forEach((text, index) => {
      const item = element('span', `culms-deadlines__legend-item culms-deadlines--l${index + 1}`);
      item.appendChild(element('span', 'culms-deadlines__swatch'));
      item.appendChild(document.createTextNode(text));
      legend.appendChild(item);
    });
    head.appendChild(legend);
    block.appendChild(head);

    const grid = element('div', 'culms-deadlines__days');
    days.forEach((day) => {
      const cell = element('button', `culms-deadlines__day culms-deadlines--l${day.level}`);
      cell.type = 'button';
      cell.dataset.culmsDay = day.key;
      cell.classList.toggle('culms-deadlines__day--today', day.offset === 0);
      const weekday = day.date.getDay();
      cell.classList.toggle('culms-deadlines__day--weekend', weekday === 0 || weekday === 6);
      cell.setAttribute('aria-label', dayLabel(day));
      cell.appendChild(
        element(
          'span',
          'culms-deadlines__weekday',
          day.offset === 0 ? 'сегодня' : WEEKDAYS_SHORT[weekday]
        )
      );
      cell.appendChild(element('span', 'culms-deadlines__date', String(day.date.getDate())));
      cell.appendChild(
        element('span', 'culms-deadlines__count', day.tasks.length ? String(day.tasks.length) : '')
      );

      // Наведение и фокус показывают задания дня. Касание на телефоне ставит
      // фокус — там всплывашка тоже открывается. Отдельного click нет: он
      // приходит после focus и закрыл бы только что открытое.
      cell.addEventListener('mouseenter', () => showPopover(cell, day));
      cell.addEventListener('mouseleave', () => {
        if (document.activeElement !== cell) hidePopover();
      });
      cell.addEventListener('focus', () => showPopover(cell, day));
      cell.addEventListener('blur', hidePopover);
      grid.appendChild(cell);
    });
    block.appendChild(grid);
    return block;
  }

  function formatTime(date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  /**
   * Всплывашка с заданиями дня. Живёт в `body` с `position: fixed`: колонка
   * дэшборда сбоку прокручивается внутри себя и обрезала бы её по краю.
   */
  function showPopover(cell, day) {
    hidePopover();

    const popover = element('div', 'culms-deadlines-popover');
    popover.id = POPOVER_ID;
    popover.classList.toggle('culms-deadlines-popover--dark', isDark);
    popover.setAttribute('role', 'tooltip');
    popover.appendChild(element('div', 'culms-deadlines-popover__title', dayTitle(day.date)));

    if (!day.tasks.length) {
      popover.appendChild(element('div', 'culms-deadlines-popover__empty', 'Дедлайнов нет'));
    } else {
      const left = day.tasks.filter((task) => !task.done).length;
      popover.appendChild(
        element(
          'div',
          'culms-deadlines-popover__summary',
          left < day.tasks.length
            ? `${deadlinesText(day.tasks.length)}, осталось ${left}`
            : deadlinesText(day.tasks.length)
        )
      );
      const list = element('ul', 'culms-deadlines-popover__list');
      day.tasks.slice(0, POPOVER_LIMIT).forEach((task) => {
        const item = element('li', 'culms-deadlines-popover__item');
        item.classList.toggle('culms-deadlines-popover__item--done', task.done);
        item.appendChild(
          element('span', 'culms-deadlines-popover__time', formatTime(task.deadline))
        );
        item.appendChild(element('span', 'culms-deadlines-popover__name', task.name));
        // Своё название курса подставит course_names.js — этот класс он знает.
        item.appendChild(element('span', 'culms-deadlines-popover__course', task.courseName));
        list.appendChild(item);
      });
      popover.appendChild(list);
      if (day.tasks.length > POPOVER_LIMIT) {
        popover.appendChild(
          element(
            'div',
            'culms-deadlines-popover__more',
            `и ещё ${day.tasks.length - POPOVER_LIMIT}`
          )
        );
      }
    }

    document.body.appendChild(popover);
    cell.setAttribute('aria-describedby', POPOVER_ID);
    // Позиция посчитана один раз — при прокрутке она бы отстала от дня.
    document.addEventListener('scroll', hidePopover, { capture: true, once: true });

    // Под днём, по центру; не влезает снизу — над ним; по бокам — не за край окна.
    const rect = cell.getBoundingClientRect();
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const margin = 8;
    const left = Math.min(
      Math.max(margin, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - margin
    );
    const below = rect.bottom + margin;
    const top =
      below + height > window.innerHeight - margin && rect.top - height - margin > margin
        ? rect.top - height - margin
        : below;
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }

  function hidePopover() {
    const popover = document.getElementById(POPOVER_ID);
    if (popover) popover.remove();
    document
      .querySelectorAll('[aria-describedby="' + POPOVER_ID + '"]')
      .forEach((node) => node.removeAttribute('aria-describedby'));
  }

  // --- ПРЕДСТАВЛЕНИЕ ---

  /** Что показать сейчас; null — данных ещё нет, рисовать нечего. */
  function buildView() {
    if (scheduleFailed) {
      return { error: 'Не удалось загрузить расписание контрольных.' };
    }
    if (coursesFailed) {
      return { error: 'Не удалось получить список ваших курсов.' };
    }
    if (!scheduleData || !courses) return null;

    const api = window.cuLmsFutureExams;
    const options = {
      schedule: scheduleData.schedule,
      config: scheduleData.config,
      courses: courses.filter((course) => !isArchived(course)),
      count: WEEKS_SHOWN,
    };
    let model = api.upcomingWeeks({ ...options, start: weekShift });

    // Границы могли сдвинуться: началась новая неделя, курс ушёл в архив.
    const limits = shiftLimits(model);
    const clamped = Math.min(limits.max, Math.max(limits.min, weekShift));
    if (clamped !== weekShift) {
      weekShift = clamped;
      model = api.upcomingWeeks({ ...options, start: weekShift });
    }
    // Не загрузились задания — контрольные показываем как обычно и пишем об этом.
    const daysNote = showDeadlines && tasksFailed ? 'Не удалось загрузить дедлайны заданий.' : null;
    return { model, shift: weekShift, limits, days: buildDays(), daysNote };
  }

  /**
   * Докуда листать. Назад — до первой недели семестра (или до первой
   * контрольной, если она ещё раньше); вперёд — пока последней колонкой не
   * станет последняя неделя с контрольными: дальше смотреть не на что.
   * Текущее положение всегда в пределах, даже если семестр ещё не начался
   * или контрольные уже кончились.
   */
  function shiftLimits({ currentWeek, firstEventWeek, lastEventWeek }) {
    const firstWeek = Math.min(1, firstEventWeek === null ? 1 : firstEventWeek);
    const lastStart = lastEventWeek === null ? currentWeek : lastEventWeek - (WEEKS_SHOWN - 1);
    return {
      min: Math.min(0, firstWeek - currentWeek),
      max: Math.max(0, lastStart - currentWeek),
    };
  }

  function weekTitle(week) {
    // До первой недели семестра номер вышел бы нулевым или отрицательным.
    return week.number >= 1 ? `Неделя ${week.number}` : 'До начала семестра';
  }

  /** «неделю», «недели», «недель» — к числу n. */
  function weeksWord(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'неделю';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'недели';
    return 'недель';
  }

  /** Метка недели по её сдвигу от текущей: при листании видно, как далеко ушли. */
  function weekLabel(offset) {
    if (offset === 0) return 'текущая';
    if (offset === 1) return 'следующая';
    if (offset === 2) return 'через одну';
    if (offset === -1) return 'прошлая';
    return offset > 0
      ? `через ${offset} ${weeksWord(offset)}`
      : `${-offset} ${weeksWord(-offset)} назад`;
  }

  function navIcon(kind) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    NAV_ICONS[kind].forEach(([tag, attrs]) => {
      const shape = document.createElementNS(SVG_NS, tag);
      Object.entries(attrs).forEach(([name, value]) => shape.setAttribute(name, value));
      svg.appendChild(shape);
    });
    return svg;
  }

  /** Кнопки листания: ‹ предыдущая, ◎ к текущей, › следующая. */
  function renderNav(view) {
    const nav = element('div', 'culms-exams-dashboard__nav');
    nav.setAttribute('role', 'group');
    nav.setAttribute('aria-label', 'Листать недели');

    const disabled = {
      prev: view.shift <= view.limits.min,
      today: view.shift === 0,
      next: view.shift >= view.limits.max,
    };
    ['prev', 'today', 'next'].forEach((kind) => {
      const button = element('button', 'culms-exams-dashboard__nav-btn');
      button.type = 'button';
      button.dataset.culmsNav = kind;
      button.title = NAV_LABELS[kind];
      button.setAttribute('aria-label', NAV_LABELS[kind]);
      button.disabled = disabled[kind];
      button.appendChild(navIcon(kind));
      // Нажатие с клавиатуры (Enter, пробел) даёт click без счётчика щелчков.
      button.addEventListener('click', (event) => shiftWeeks(kind, event.detail === 0));
      nav.appendChild(button);
    });
    return nav;
  }

  /**
   * Листает на неделю или возвращает к текущей. Дэшборд после этого
   * собирается заново, и при нажатии с клавиатуры фокус возвращается на ту же
   * кнопку: иначе после каждого нажатия пришлось бы искать её заново. Если
   * она погасла (дошли до края), фокус переходит на соседнюю. После щелчка
   * мышью фокус не трогаем: Chrome обвёл бы кнопку рамкой фокуса.
   */
  function shiftWeeks(kind, fromKeyboard) {
    if (kind === 'today') weekShift = 0;
    else weekShift += kind === 'next' ? 1 : -1;
    update();

    if (!fromKeyboard || !root) return;
    const target =
      root.querySelector(`[data-culms-nav="${kind}"]:not(:disabled)`) ||
      root.querySelector('[data-culms-nav]:not(:disabled)');
    if (target) target.focus({ preventScroll: true });
  }

  /**
   * Клик по курсу ведёт на его страницу. Если курс виден в списке выше —
   * кликаем по его родной карточке: тогда переход идёт внутри SPA и страница
   * не перезагружается. Иначе (курс на другой вкладке фильтра) работает
   * обычная ссылка.
   */
  function openCourse(event, course) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const names = window.cuLmsCourseNames;
    const target = normalizeName(course.name);
    const card = Array.from(document.querySelectorAll('li.course-list__item')).find((item) => {
      const nameNode = item.querySelector('cu-course-card .course-name');
      if (!nameNode) return false;
      const shown = nameNode.textContent.trim();
      const original = names ? names.originalFor(nameNode, shown) : shown;
      return normalizeName(original) === target;
    });

    const nativeCard = card && card.querySelector('cu-course-card');
    if (!nativeCard) return;
    event.preventDefault();
    nativeCard.click();
  }

  function renderCourse(course, compact) {
    const item = element('li', 'culms-exams-week__course');

    // Показываем настоящее название: своё подставит course_names.js, как и в
    // списке курсов.
    const link = element('a', COURSE_NAME_CLASS, course.name);
    link.href = COURSE_URL_PREFIX + course.id;
    link.addEventListener('click', (event) => openCourse(event, course));

    const labels = course.events.map((entry) =>
      entry.count > 1 ? `${entry.name} ×${entry.count}` : entry.name
    );

    if (compact) {
      // Полоской мероприятия и курс идут одной строкой, мероприятия — первыми:
      // что не влезло, режется многоточием, и лучше обрезать длинное название
      // курса, чем «Контрольна…». Полный текст — в подсказке (revealTruncated).
      item.appendChild(element('span', 'culms-exams-week__summary', labels.join(', ')));
      item.appendChild(link);
      return item;
    }

    item.appendChild(link);

    // Плашки — `span`, а не `li`: тёмная тема гасит фон у любого `li:hover`,
    // и плашка пропадала бы под курсором.
    const events = element('div', 'culms-exams-week__events');
    labels.forEach((text) => events.appendChild(element('span', 'culms-exams-week__event', text)));
    item.appendChild(events);

    return item;
  }

  /**
   * Подсказка с полным текстом для обрезанного многоточием названия.
   * Ставится при наведении, а не при отрисовке: своё название курса
   * подставляет course_names.js уже после нас, и подсказка должна показать его.
   */
  function revealTruncated(event) {
    const node = event.target.closest(`.${COURSE_NAME_CLASS}, .culms-exams-week__summary`);
    if (!node) return;
    if (node.scrollWidth > node.clientWidth) node.title = node.textContent.trim();
    else node.removeAttribute('title');
  }

  function renderWeek(week, compact) {
    const card = element('article', 'culms-exams-week');
    card.classList.toggle('culms-exams-week--current', week.offset === 0);
    card.dataset.culmsWeek = String(week.number);

    const api = window.cuLmsFutureExams;
    const dates = element(
      'span',
      'culms-exams-week__dates',
      api.formatDayRange(week.first, week.last, { short: compact })
    );

    const head = element('div', 'culms-exams-week__head');
    head.appendChild(element('h3', 'culms-exams-week__title', weekTitle(week)));
    // Полоской даты стоят в строке заголовка, иначе — отдельной строкой под ним.
    // Метку там оставляем только текущей неделе: место в строке нужнее датам.
    if (compact) head.appendChild(dates);
    if (!compact || week.offset === 0) {
      head.appendChild(element('span', 'culms-exams-week__badge', weekLabel(week.offset)));
    }
    card.appendChild(head);
    if (!compact) card.appendChild(dates);

    if (week.courses.length) {
      const list = element('ul', 'culms-exams-week__courses');
      week.courses.forEach((course) => list.appendChild(renderCourse(course, compact)));
      card.appendChild(list);
    } else {
      card.appendChild(element('p', 'culms-exams-week__empty', 'Контрольных нет'));
    }

    return card;
  }

  function renderView(view, compact) {
    const section = element('section', ROOT_CLASS);
    section.classList.toggle(DARK_CLASS, isDark);
    section.classList.toggle(COMPACT_CLASS, compact);
    if (compact) section.addEventListener('mouseover', revealTruncated);
    // Островок: custom_background.js не должен принять его за полотно страницы
    // и положить на него картинку фона, когда дэшборд вырастает в высоту.
    section.setAttribute('data-culms-island', '');
    section.setAttribute('aria-labelledby', 'culms-exams-dashboard-title');

    const inner = element('div', 'culms-exams-dashboard__inner');
    const head = element('div', 'culms-exams-dashboard__head');
    const title = element('h2', 'culms-exams-dashboard__title', 'Ближайшие контрольные');
    title.id = 'culms-exams-dashboard-title';
    head.appendChild(title);
    if (!view.error) head.appendChild(renderNav(view));
    inner.appendChild(head);

    if (view.error) {
      inner.appendChild(element('p', 'culms-exams-dashboard__note', view.error));
      section.appendChild(inner);
      return section;
    }

    if (!view.model.matchedCourses) {
      inner.appendChild(
        element('p', 'culms-exams-dashboard__note', 'Ваших курсов нет в расписании контрольных.')
      );
    }

    if (view.daysNote) {
      inner.appendChild(element('p', 'culms-exams-dashboard__note', view.daysNote));
    }
    if (view.days) inner.appendChild(renderDays(view.days));

    const weeks = element('div', 'culms-exams-dashboard__weeks');
    view.model.weeks.forEach((week) => weeks.appendChild(renderWeek(week, compact)));
    inner.appendChild(weeks);

    section.appendChild(inner);
    return section;
  }

  function signatureOf(view, compact) {
    const kind = compact ? 'compact' : 'full';
    if (view.error) return `${kind}:error:${view.error}`;
    const { weeks, matchedCourses } = view.model;
    return JSON.stringify([
      kind,
      matchedCourses,
      // Сдвиг и границы решают, какие кнопки листания погашены.
      [view.shift, view.limits.min, view.limits.max],
      weeks.map((week) => [week.number, week.first.getTime(), week.courses]),
      view.daysNote,
      view.days
        ? view.days.map((day) => [
            day.key,
            day.tasks.map((task) => [task.id, task.name, task.deadline.getTime(), task.done]),
          ])
        : null,
    ]);
  }

  // --- РАЗМЕЩЕНИЕ ---

  /** Контейнер страницы «Мои курсы»: шапка с вкладками и группа курсов. */
  function listContainer() {
    return document.querySelector('cu-course-learning-layout .content-container');
  }

  const isSide = (value) => value === 'right' || value === 'left';

  /**
   * Помещается ли колонка рядом со списком. На экране 1536 px при
   * развёрнутом меню LMS свободного поля нет (около 145 px), при свёрнутом —
   * около 385 px.
   */
  function sideFits() {
    const container = listContainer();
    const layout = container && container.parentElement;
    if (!layout) return false;

    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const needed = LIST_WIDTH_REM * rem + SIDE_GAP + SIDE_MIN_WIDTH + 2 * SIDE_MARGIN;
    const slack = isSide(mode) ? SIDE_HYSTERESIS : 0;
    return layout.clientWidth >= needed - slack;
  }

  /**
   * Сбоку тесно — полоска над курсами. Не под ними: на экране 1536 × 737 две
   * строки обложек занимают всё окно, и полоска снизу уходила бы за край, а
   * колонку сбоку выбирают как раз чтобы видеть дэшборд без прокрутки.
   */
  function effectivePlacement() {
    if (isSide(placement)) return sideFits() ? placement : 'above';
    return placement;
  }

  /**
   * Место сбоку появляется и пропадает без перезагрузки — меню LMS
   * сворачивают, окно тянут. Следим за шириной раскладки и переставляем
   * дэшборд, когда меняется ответ «помещается ли колонка».
   */
  function watchLayout() {
    const container = listContainer();
    const layout = container ? container.parentElement : null;
    if (layout === observedLayout) return;

    unwatchLayout();
    if (!layout || typeof ResizeObserver === 'undefined') return;
    observedLayout = layout;
    layoutObserver = new ResizeObserver(() => {
      if (effectivePlacement() !== mode) update();
    });
    layoutObserver.observe(layout);
  }

  function unwatchLayout() {
    if (layoutObserver) layoutObserver.disconnect();
    layoutObserver = null;
    observedLayout = null;
  }

  /**
   * Классы раскладки на контейнере страницы. Снимаются со всех остальных:
   * контейнер переживает смену вкладок, но не уход со списка курсов.
   */
  function setHostSide(container, side) {
    const sideClasses = Object.values(HOST_SIDE_CLASSES);
    document.querySelectorAll('.' + HOST_CLASS).forEach((node) => {
      if (node !== container || !side) node.classList.remove(HOST_CLASS, ...sideClasses);
    });
    if (!container || !side) return;

    const wanted = HOST_SIDE_CLASSES[side];
    // Классы ставим только если их нет: лишняя запись атрибута — лишняя
    // мутация для всех наблюдателей страницы.
    sideClasses.forEach((cls) => {
      if (cls !== wanted && container.classList.contains(cls)) container.classList.remove(cls);
    });
    [HOST_CLASS, wanted].forEach((cls) => {
      if (!container.classList.contains(cls)) container.classList.add(cls);
    });
  }

  /**
   * Под курсами дэшборд живёт последним ребёнком `cu-courses-group`: так он
   * повторяет ширину и отступы списка на любой раскладке LMS. Angular
   * пересоздаёт этот элемент на каждой смене вкладки фильтра, поэтому
   * наблюдатель переносит собранный дэшборд в новый — синхронно, до отрисовки
   * кадра.
   *
   * Сбоку он — ребёнок `.content-container`, который на смене вкладок не
   * пересоздаётся: контейнер становится сеткой из двух колонок.
   */
  function place() {
    if (!root) return;
    if (!enabled || !isActualListPage()) {
      detach();
      return;
    }

    if (isSide(placement)) watchLayout();
    else unwatchLayout();

    const side = isSide(mode);
    const above = mode === 'above';
    const container = listContainer();
    setHostSide(container, side ? mode : null);
    if (root.classList.contains(SIDE_CLASS) !== side) root.classList.toggle(SIDE_CLASS, side);
    if (root.classList.contains(ABOVE_CLASS) !== above) root.classList.toggle(ABOVE_CLASS, above);

    if (side) {
      if (container && root.parentNode !== container) container.appendChild(root);
      return;
    }

    // Над курсами — первым ребёнком группы, под ними — последним. Позицию
    // сверяем, а не только родителя: при смене места на лету дэшборд уже
    // лежит в группе, но не с того края.
    const group = document.querySelector('cu-courses-group');
    if (!group) return;
    if (above && group.firstElementChild !== root) group.prepend(root);
    if (!above && group.lastElementChild !== root) group.appendChild(root);
  }

  function detach() {
    hidePopover();
    if (root && root.parentNode) root.remove();
    setHostSide(null, null);
  }

  function update() {
    if (!enabled || !isActualListPage()) {
      detach();
      return;
    }

    mode = effectivePlacement();
    const compact = mode === 'compact' || mode === 'above';
    const view = buildView();
    if (view) {
      const next = signatureOf(view, compact);
      // Пересобираем только когда поменялось содержимое: иначе каждый проход
      // наблюдателя сбрасывал бы подставленные course_names.js названия.
      if (next !== signature) {
        // Всплывашка держится за день старого дэшборда.
        hidePopover();
        const fresh = renderView(view, compact);
        if (root && root.parentNode) root.replaceWith(fresh);
        root = fresh;
        signature = next;
      }
    }
    place();
  }

  /** Сверяет дэшборд с текущей страницей и подтягивает свежие данные. */
  function refresh() {
    if (!enabled || !isActualListPage()) {
      detach();
      return;
    }

    // Сначала — с тем, что уже есть: на смене вкладки дэшборд не должен
    // пропадать до ответа хранилища. Заодно пересчитывается текущая неделя.
    update();
    void loadSchedule();
    void loadCourses();
    void loadTasks();
  }

  // --- НАБЛЮДЕНИЕ ЗА СТРАНИЦЕЙ ---

  function stopObserver() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      // Расширение могло быть перезагружено — тогда браузер убивает контекст.
      try {
        if (typeof browser !== 'undefined' && !(browser.runtime && browser.runtime.id)) {
          stopObserver();
          return;
        }
      } catch (_e) {
        stopObserver();
        return;
      }

      if (location.href !== currentUrl) {
        currentUrl = location.href;
        refresh();
        return;
      }

      place();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function setEnabled(value) {
    enabled = value;
    if (enabled) {
      startObserver();
      refresh();
    } else {
      stopObserver();
      unwatchLayout();
      detach();
    }
  }

  async function init() {
    const [syncData, localData] = await Promise.all([
      browser.storage.sync.get([SETTING_KEY, THEME_KEY, PLACEMENT_KEY, DEADLINES_KEY]),
      browser.storage.local.get([ARCHIVE_KEY, META_CACHE_KEY]),
    ]);

    isDark = !!syncData[THEME_KEY];
    placement = normalizePlacement(syncData[PLACEMENT_KEY]);
    // Дедлайны показываются, пока их явно не выключили.
    showDeadlines = syncData[DEADLINES_KEY] !== false;
    archivedKeys = new Set(localData[ARCHIVE_KEY] || []);
    const cached = toCourses(localData[META_CACHE_KEY]);
    if (cached.length) courses = cached;

    setEnabled(!!syncData[SETTING_KEY]);
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && THEME_KEY in changes) {
      isDark = !!changes[THEME_KEY].newValue;
      if (root) root.classList.toggle(DARK_CLASS, isDark);
      hidePopover();
    }
    if (area === 'sync' && DEADLINES_KEY in changes) {
      showDeadlines = changes[DEADLINES_KEY].newValue !== false;
      void loadTasks();
      update();
    }
    if (area === 'sync' && PLACEMENT_KEY in changes) {
      placement = normalizePlacement(changes[PLACEMENT_KEY].newValue);
      update();
    }
    if (area === 'sync' && SETTING_KEY in changes) {
      setEnabled(!!changes[SETTING_KEY].newValue);
    }
    if (area === 'local' && ARCHIVE_KEY in changes) {
      archivedKeys = new Set(changes[ARCHIVE_KEY].newValue || []);
      update();
    }
  });

  // Вкладка могла провисеть открытой до следующей недели: при возвращении к
  // ней пересчитываем недели и заглядываем в расписание.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void init());
  } else {
    void init();
  }
}
