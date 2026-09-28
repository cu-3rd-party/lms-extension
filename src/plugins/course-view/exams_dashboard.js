// exams_dashboard.js — дэшборд на странице «Мои курсы»: контрольные и дедлайны.
//
// На главной странице обучения (/learn/courses/view/actual/<вкладка>) под
// списком курсов — полоска из двух частей, каждая включается своей галочкой
// в меню и применяется на лету, без перезагрузки:
//
// - контрольные (`futureExamsDashboardToggle`) — три недели, текущая,
//   следующая и через одну: номер учебной недели, даты и контрольные
//   мероприятия каждого курса. Расписание то же, что в аккордеоне страницы
//   курса (future_exams_api.js), так что номера недель совпадают;
// - дедлайны на две недели (`futureExamsDashboardDeadlines`) — 14 дней с
//   сегодняшнего: у каждого «сдано/всего» и цвет по числу дедлайнов, а при
//   наведении — сами задания этого дня.
//
// Включена хотя бы одна часть — полоска есть. Место одно — под курсами:
// колонки сбоку, полоска над курсами и крупные карточки были, но их убрали,
// чтобы дэшборд не спорил со списком курсов за место.

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
  // Сколько всплывашка ждёт, прежде чем спрятаться: курсор едет от дня к ней.
  const POPOVER_HIDE_DELAY_MS = 250;

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

  const ROOT_CLASS = 'culms-exams-dashboard';
  const DARK_CLASS = 'culms-exams-dashboard--dark';
  // Полоска — единственный вид; класс остался от времён, когда видов было
  // несколько, и на нём держатся стили раскладки.
  const COMPACT_CLASS = 'culms-exams-dashboard--compact';
  // Этот класс знает _shared/course_names.js: он подставляет в дэшборд свои
  // названия курсов так же, как в список.
  const COURSE_NAME_CLASS = 'culms-exams-dashboard__course-name';

  // --- СОСТОЯНИЕ ---
  /** Показывать ли полоску вообще: включена хотя бы одна часть. */
  let enabled = false;
  let showExams = false;
  let showDeadlines = false;
  let isDark = false;
  /**
   * На сколько недель пролистано от текущей. Живёт, пока открыта страница:
   * на смене вкладки фильтра сохраняется, при новом заходе — снова текущая.
   */
  let weekShift = 0;
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

      // Страница задания — лонгрид в теме курса, как ссылки из «Моих заданий».
      // Нет темы или лонгрида — ведём хотя бы на курс.
      const courseUrl = COURSE_URL_PREFIX + course.id;
      const themeId = task.theme && task.theme.id;
      const longreadId = task.longread && task.longread.id;
      const url =
        themeId != null && longreadId != null
          ? `${courseUrl}/themes/${themeId}/longreads/${longreadId}`
          : courseUrl;

      return [
        {
          id: task.id,
          name: (exercise.name || '').trim() || 'Задание',
          courseId: course.id,
          courseName: course.name || '',
          url,
          courseUrl,
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
      day.done = day.tasks.filter((task) => task.done).length;
      day.level = levelOf(day.tasks.length);
    });
    return days;
  }

  /** «4 дедлайна, сдано 3», «4 дедлайна, всё сдано». */
  function daySummary(day) {
    if (day.done === day.tasks.length) return `${deadlinesText(day.tasks.length)}, всё сдано`;
    return `${deadlinesText(day.tasks.length)}, сдано ${day.done}`;
  }

  /** «Среда, 30 сентября» */
  const dayTitle = (date) =>
    `${WEEKDAYS_FULL[date.getDay()]}, ${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`;

  function dayLabel(day) {
    if (!day.tasks.length) return `${dayTitle(day.date)}: дедлайнов нет`;
    return `${dayTitle(day.date)}: ${daySummary(day)}`;
  }

  /**
   * «3/4» — сдано из всех дедлайнов дня. Сданная часть крупно, «/4» мельче:
   * в узкой колонке «13/13» иначе не влезало бы в ячейку.
   */
  function renderCount(day) {
    const count = element('span', 'culms-deadlines__count');
    if (!day.tasks.length) return count;
    count.appendChild(element('span', 'culms-deadlines__done', String(day.done)));
    count.appendChild(element('span', 'culms-deadlines__total', `/${day.tasks.length}`));
    return count;
  }

  /**
   * Дни с дедлайнами. Без контрольных «Дедлайны на две недели» — заголовок
   * всей полоски в её левой колонке, и здесь повторять его незачем.
   */
  function renderDays(days, withTitle) {
    const block = element('div', 'culms-deadlines');
    const head = element('div', 'culms-deadlines__head');
    if (withTitle) {
      head.appendChild(element('span', 'culms-deadlines__title', 'Дедлайны на две недели'));
    }
    const legend = element('span', 'culms-deadlines__legend');
    legend.setAttribute('aria-hidden', 'true');
    // Пункт легенды — маленькая копия дня: та же заливка и цвет числа. Раньше
    // там был квадратик цвета числа, а день красит заливка, — и цвета легенды
    // с днями не совпадали.
    LEGEND.forEach((text, index) => {
      legend.appendChild(
        element('span', `culms-deadlines__legend-item culms-deadlines--l${index + 1}`, text)
      );
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
      // Понедельник (кроме первого дня) — начало новой недели: перед ним черта.
      // Узко дни идут строками по семь с сегодняшнего, и если понедельник
      // открывает строку, черта у края ни к чему — это помечает `--row-start`.
      cell.classList.toggle('culms-deadlines__day--week-start', weekday === 1 && day.offset > 0);
      cell.classList.toggle('culms-deadlines__day--row-start', day.offset % 7 === 0);
      // Всё сдано — день приглушён: делать там уже нечего, даже если дедлайнов десять.
      cell.classList.toggle(
        'culms-deadlines__day--closed',
        day.tasks.length > 0 && day.done === day.tasks.length
      );
      cell.setAttribute('aria-label', dayLabel(day));
      // «ср 30» — одной строкой. У сегодняшнего дня тоже день недели, а не
      // «сегодня»: рядом с числом оно не влезало в узкую ячейку, а текущий
      // день и так обведён рамкой.
      const when = element('span', 'culms-deadlines__when');
      when.appendChild(element('span', 'culms-deadlines__weekday', WEEKDAYS_SHORT[weekday]));
      when.appendChild(element('span', 'culms-deadlines__date', String(day.date.getDate())));
      cell.appendChild(when);
      cell.appendChild(renderCount(day));

      // Наведение и фокус показывают задания дня. Касание на телефоне ставит
      // фокус — там всплывашка тоже открывается. Отдельного click нет: он
      // приходит после focus и закрыл бы только что открытое.
      cell.addEventListener('mouseenter', () => showPopover(cell, day));
      // Ушли с дня — прячем не сразу: курсор может ехать во всплывашку, к
      // ссылкам на задания.
      cell.addEventListener('mouseleave', () => {
        if (document.activeElement !== cell) scheduleHide();
      });
      cell.addEventListener('focus', () => showPopover(cell, day));
      cell.addEventListener('blur', (event) => {
        if (!isInPopover(event.relatedTarget)) hidePopover();
      });
      // С клавиатуры в список заданий — стрелкой вниз или Enter.
      cell.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'Enter') return;
        const first = popoverLinks()[0];
        if (!first) return;
        event.preventDefault();
        first.focus();
      });
      grid.appendChild(cell);
    });
    block.appendChild(grid);
    return block;
  }

  function formatTime(date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  /** День, чья всплывашка открыта, и таймер её отложенного скрытия. */
  let popoverCell = null;
  let hideTimer = null;

  const currentPopover = () => document.getElementById(POPOVER_ID);
  const isInPopover = (node) => {
    const popover = currentPopover();
    return !!(popover && node && popover.contains(node));
  };
  const popoverLinks = () => {
    const popover = currentPopover();
    return popover ? Array.from(popover.querySelectorAll('a')) : [];
  };

  function cancelHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
  }

  /**
   * Прячет с задержкой: между днём и всплывашкой зазор, и курсор, едущий к
   * ссылке, на мгновение не над тем и не над другим.
   */
  function scheduleHide() {
    cancelHide();
    hideTimer = setTimeout(hidePopover, POPOVER_HIDE_DELAY_MS);
  }

  function link(className, text, href) {
    const node = element('a', className, text);
    node.href = href;
    return node;
  }

  /**
   * Всплывашка с заданиями дня. Живёт в `body` с `position: fixed`: у
   * дэшборда `container-type`, а он для fixed-потомков — рамка, и всплывашку
   * обрезало бы по краю полоски.
   *
   * В ней ссылки: название ведёт на задание, курс — на курс. Поэтому
   * наведение на неё держит её открытой, а уход — прячет с той же задержкой.
   */
  function showPopover(cell, day) {
    cancelHide();
    // Тот же день — всплывашка уже на месте: вернулись к нему из неё.
    if (popoverCell === cell && currentPopover()) return;
    hidePopover();
    popoverCell = cell;

    const popover = element('div', 'culms-deadlines-popover');
    popover.id = POPOVER_ID;
    popover.classList.toggle('culms-deadlines-popover--dark', isDark);
    popover.setAttribute('role', 'group');
    popover.setAttribute('aria-label', dayLabel(day));
    popover.appendChild(element('div', 'culms-deadlines-popover__title', dayTitle(day.date)));

    if (!day.tasks.length) {
      popover.appendChild(element('div', 'culms-deadlines-popover__empty', 'Дедлайнов нет'));
    } else {
      popover.appendChild(element('div', 'culms-deadlines-popover__summary', daySummary(day)));
      const list = element('ul', 'culms-deadlines-popover__list');
      day.tasks.slice(0, POPOVER_LIMIT).forEach((task) => {
        const item = element('li', 'culms-deadlines-popover__item');
        item.classList.toggle('culms-deadlines-popover__item--done', task.done);
        item.appendChild(
          element('span', 'culms-deadlines-popover__time', formatTime(task.deadline))
        );
        item.appendChild(link('culms-deadlines-popover__name', task.name, task.url));
        // Своё название курса подставит course_names.js — этот класс он знает.
        item.appendChild(link('culms-deadlines-popover__course', task.courseName, task.courseUrl));
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

    popover.addEventListener('mouseenter', cancelHide);
    popover.addEventListener('mouseleave', () => {
      if (!isInPopover(document.activeElement)) scheduleHide();
    });
    popover.addEventListener('focusout', (event) => {
      if (!isInPopover(event.relatedTarget) && event.relatedTarget !== cell) hidePopover();
    });
    popover.addEventListener('keydown', (event) => onPopoverKeydown(event, cell));

    document.body.appendChild(popover);
    cell.setAttribute('aria-expanded', 'true');
    cell.setAttribute('aria-controls', POPOVER_ID);
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

  /**
   * Клавиатура внутри всплывашки. Сама она в конце `body`, так что обычный Tab
   * из неё ушёл бы в конец страницы: Esc и Shift+Tab с первой ссылки
   * возвращают на день, Tab с последней — на следующий день.
   */
  function onPopoverKeydown(event, cell) {
    const links = popoverLinks();
    const index = links.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      cell.focus();
    } else if (event.key === 'Tab' && event.shiftKey && index === 0) {
      event.preventDefault();
      cell.focus();
    } else if (event.key === 'Tab' && !event.shiftKey && index === links.length - 1) {
      const next = cell.nextElementSibling;
      if (!next) return;
      event.preventDefault();
      next.focus();
    }
  }

  function hidePopover() {
    cancelHide();
    const popover = currentPopover();
    if (popover) popover.remove();
    if (popoverCell) {
      popoverCell.removeAttribute('aria-expanded');
      popoverCell.removeAttribute('aria-controls');
    }
    popoverCell = null;
  }

  // --- ПРЕДСТАВЛЕНИЕ ---

  /** Почему контрольные не показать — или null, если причин нет. */
  function examsError() {
    if (scheduleFailed) {
      return 'Не удалось загрузить расписание контрольных.';
    }
    if (coursesFailed) {
      return 'Не удалось получить список ваших курсов.';
    }
    return null;
  }

  /**
   * Что показать сейчас; null — данных ещё нет, рисовать нечего. Части
   * независимы: дедлайны рисуются, даже если расписание контрольных ещё
   * грузится или не загрузилось.
   */
  function buildView() {
    const view = { exams: null, examsError: null, days: null, daysNote: null };
    if (showExams) {
      view.examsError = examsError();
      if (!view.examsError) view.exams = buildExams();
    }
    if (showDeadlines) {
      view.days = buildDays();
      // Не загрузились задания — контрольные показываем как обычно и пишем об этом.
      if (tasksFailed) view.daysNote = 'Не удалось загрузить дедлайны заданий.';
    }
    const ready = view.exams || view.examsError || view.days || view.daysNote;
    return ready ? view : null;
  }

  /** Недели с контрольными; null — расписание или курсы ещё не приехали. */
  function buildExams() {
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
    return { model, shift: weekShift, limits };
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

  function renderCourse(course) {
    const item = element('li', 'culms-exams-week__course');

    // Показываем настоящее название: своё подставит course_names.js, как и в
    // списке курсов.
    const link = element('a', COURSE_NAME_CLASS, course.name);
    link.href = COURSE_URL_PREFIX + course.id;
    link.addEventListener('click', (event) => openCourse(event, course));

    const labels = course.events.map((entry) =>
      entry.count > 1 ? `${entry.name} ×${entry.count}` : entry.name
    );

    // Мероприятия и курс идут одной строкой, мероприятия — первыми: что не
    // влезло, режется многоточием, и лучше обрезать длинное название курса,
    // чем «Контрольна…». Полный текст — в подсказке (revealTruncated).
    item.appendChild(element('span', 'culms-exams-week__summary', labels.join(', ')));
    item.appendChild(link);
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

  function renderWeek(week) {
    const card = element('article', 'culms-exams-week');
    card.classList.toggle('culms-exams-week--current', week.offset === 0);
    card.dataset.culmsWeek = String(week.number);

    const api = window.cuLmsFutureExams;
    const head = element('div', 'culms-exams-week__head');
    head.appendChild(element('h3', 'culms-exams-week__title', weekTitle(week)));
    // Даты — в строке заголовка, сокращённо. Метку оставляем только текущей
    // неделе: место в строке нужнее датам.
    head.appendChild(
      element(
        'span',
        'culms-exams-week__dates',
        api.formatDayRange(week.first, week.last, { short: true })
      )
    );
    if (week.offset === 0) {
      head.appendChild(element('span', 'culms-exams-week__badge', 'текущая'));
    }
    card.appendChild(head);

    if (week.courses.length) {
      const list = element('ul', 'culms-exams-week__courses');
      week.courses.forEach((course) => list.appendChild(renderCourse(course)));
      card.appendChild(list);
    } else {
      card.appendChild(element('p', 'culms-exams-week__empty', 'Контрольных нет'));
    }

    return card;
  }

  function renderView(view) {
    const section = element('section', ROOT_CLASS);
    section.classList.toggle(DARK_CLASS, isDark);
    section.classList.add(COMPACT_CLASS);
    section.addEventListener('mouseover', revealTruncated);
    // Островок: custom_background.js не должен принять его за полотно страницы
    // и положить на него картинку фона, когда дэшборд вырастает в высоту.
    section.setAttribute('data-culms-island', '');
    section.setAttribute('aria-labelledby', 'culms-exams-dashboard-title');

    // Заголовок полоски — в её левой колонке. Без контрольных полоска — это
    // одни дедлайны, и заголовок говорит о них.
    const inner = element('div', 'culms-exams-dashboard__inner');
    const head = element('div', 'culms-exams-dashboard__head');
    const title = element(
      'h2',
      'culms-exams-dashboard__title',
      showExams ? 'Ближайшие контрольные' : 'Дедлайны на две недели'
    );
    title.id = 'culms-exams-dashboard-title';
    head.appendChild(title);
    if (view.exams) head.appendChild(renderNav(view.exams));
    inner.appendChild(head);

    if (view.examsError) {
      inner.appendChild(element('p', 'culms-exams-dashboard__note', view.examsError));
    } else if (view.exams && !view.exams.model.matchedCourses) {
      inner.appendChild(
        element('p', 'culms-exams-dashboard__note', 'Ваших курсов нет в расписании контрольных.')
      );
    }

    if (view.daysNote) {
      inner.appendChild(element('p', 'culms-exams-dashboard__note', view.daysNote));
    }
    if (view.days) inner.appendChild(renderDays(view.days, showExams));

    if (view.exams) {
      const weeks = element('div', 'culms-exams-dashboard__weeks');
      view.exams.model.weeks.forEach((week) => weeks.appendChild(renderWeek(week)));
      inner.appendChild(weeks);
    }

    section.appendChild(inner);
    return section;
  }

  function signatureOf(view) {
    const exams = view.exams;
    return JSON.stringify([
      showExams,
      view.examsError,
      exams
        ? [
            exams.model.matchedCourses,
            // Сдвиг и границы решают, какие кнопки листания погашены.
            [exams.shift, exams.limits.min, exams.limits.max],
            exams.model.weeks.map((week) => [week.number, week.first.getTime(), week.courses]),
          ]
        : null,
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

  /**
   * Дэшборд живёт последним ребёнком `cu-courses-group`: так он повторяет
   * ширину и отступы списка на любой раскладке LMS. Angular пересоздаёт этот
   * элемент на каждой смене вкладки фильтра, поэтому наблюдатель переносит
   * собранный дэшборд в новый — синхронно, до отрисовки кадра.
   */
  function place() {
    if (!root) return;
    if (!enabled || !isActualListPage()) {
      detach();
      return;
    }

    removeForeign();
    const group = document.querySelector('cu-courses-group');
    if (group && group.lastElementChild !== root) group.appendChild(root);
  }

  /**
   * Полоски и всплывашки, которые нарисовал не этот экземпляр скрипта. Их
   * оставляет прошлая версия расширения: после обновления в
   * chrome://extensions без перезагрузки вкладки её скрипт теряет связь с
   * фоном, но его DOM остаётся на странице — и дэшбордов становилось два,
   * причём старый с «Не удалось загрузить расписание контрольных»: расписание
   * идёт через фон. Проверка — по всему документу, и она дешёвая: элементов
   * с этим классом один-два.
   */
  function removeForeign() {
    document.querySelectorAll('.' + ROOT_CLASS).forEach((node) => {
      if (node !== root) node.remove();
    });
    document.querySelectorAll('#' + POPOVER_ID).forEach((node) => {
      if (!popoverCell || !root || !root.contains(popoverCell)) node.remove();
    });
  }

  function detach() {
    hidePopover();
    if (root && root.parentNode) root.remove();
  }

  /** Жив ли контекст расширения: после его перезагрузки `runtime.id` пропадает. */
  function contextAlive() {
    try {
      return typeof browser === 'undefined' || !!(browser.runtime && browser.runtime.id);
    } catch (_e) {
      return false;
    }
  }

  /**
   * Расширение перезагрузили, а этот экземпляр остался на странице без связи
   * с ним: убираем за собой полоску и всплывашку. Новая версия нарисует свою.
   */
  function retire() {
    stopObserver();
    detach();
    enabled = false;
  }

  function update() {
    if (!contextAlive()) {
      retire();
      return;
    }

    if (!enabled || !isActualListPage()) {
      detach();
      return;
    }

    const view = buildView();
    if (view) {
      const next = signatureOf(view);
      // Пересобираем только когда поменялось содержимое: иначе каждый проход
      // наблюдателя сбрасывал бы подставленные course_names.js названия.
      if (next !== signature) {
        // Всплывашка держится за день старого дэшборда.
        hidePopover();
        const fresh = renderView(view);
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
    if (showExams) {
      void loadSchedule();
      void loadCourses();
    }
    if (showDeadlines) void loadTasks();
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
      if (!contextAlive()) {
        retire();
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

  /**
   * Включает и выключает части по галочкам. Полоска есть, пока включена хотя
   * бы одна; выключили обе — наблюдатель страницы тоже не нужен.
   */
  function applySettings() {
    enabled = showExams || showDeadlines;
    if (enabled) {
      startObserver();
      refresh();
    } else {
      stopObserver();
      detach();
    }
  }

  async function init() {
    const [syncData, localData] = await Promise.all([
      browser.storage.sync.get([SETTING_KEY, THEME_KEY, DEADLINES_KEY]),
      browser.storage.local.get([ARCHIVE_KEY, META_CACHE_KEY]),
    ]);

    isDark = !!syncData[THEME_KEY];
    showExams = !!syncData[SETTING_KEY];
    showDeadlines = !!syncData[DEADLINES_KEY];
    archivedKeys = new Set(localData[ARCHIVE_KEY] || []);
    const cached = toCourses(localData[META_CACHE_KEY]);
    if (cached.length) courses = cached;

    applySettings();
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && THEME_KEY in changes) {
      isDark = !!changes[THEME_KEY].newValue;
      if (root) root.classList.toggle(DARK_CLASS, isDark);
      hidePopover();
    }
    if (area === 'sync' && (SETTING_KEY in changes || DEADLINES_KEY in changes)) {
      if (SETTING_KEY in changes) showExams = !!changes[SETTING_KEY].newValue;
      if (DEADLINES_KEY in changes) showDeadlines = !!changes[DEADLINES_KEY].newValue;
      applySettings();
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
