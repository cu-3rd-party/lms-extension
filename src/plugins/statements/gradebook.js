// gradebook.js — вкладка «Сводная таблица» в актуальных ведомостях.
//
// Идея из канала расширения: открыть ведомость и сразу видеть все курсы и все
// оценки, как в школьном электронном дневнике, а не заходить в каждый курс.
// Строки — курсы, столбцы — даты дедлайнов, объединённые в недели семестра,
// справа — накопленный балл и разбивка по активностям.
//
// Вкладка своя, а не роут Angular: LMS о ней ничего не знает. Поэтому
//   * ссылка — неглубокая копия нативной вкладки (ради стилей Taiga), клик по
//     ней мы перехватываем сами, а подчёркивание рисуем своё: Taiga считает
//     его позицию только по своим вкладкам (см. gradebook.css);
//   * нативное содержимое не удаляется, а прячется классом — вернуться на
//     «Курсы по семестрам» можно без перерисовки;
//   * ведомости всегда открываются на родных «Курсах по семестрам», как без
//     расширения; выбранная сводная держится, только пока пользователь внутри
//     ведомостей (переход к курсу и обратно, актуальные ↔ архив). Адрес при
//     переключении не трогаем — на каждый replaceState фон расширения заново
//     внедряет все скрипты страницы. `#gradebook` в ссылке вкладки нужен
//     только для открытия в новой вкладке и закладок.

(function () {
  'use strict';

  if (window.__culmsGradebookLoaded) return;
  window.__culmsGradebookLoaded = true;

  // Ведомостей два раздела — актуальные и архивные — с одинаковой разметкой.
  const BASE_PATH = '/learn/reports/student-performance';
  const HASH = '#gradebook';
  const TAB_ID = 'culms-gradebook-tab';
  const MORE_ID = 'culms-gradebook-more';
  const VIEW_ID = 'culms-gradebook';
  const TIP_ID = 'culms-gradebook-tip';
  const PREFS_KEY = 'culms.gradebook.prefs';
  // Скрытые курсы — id из API в storage.local, как скрытые задания архива:
  // это уже не вид страницы, а личный список, и он уходит в профиль «Всё».
  const HIDDEN_KEY = 'gradebookHiddenCourseIds';
  // Тот же ключ и формат, что у tasks_fix.js: скип хранится по id задачи.
  const SKIPPED_TASKS_KEY = 'cu.lms.skipped-tasks';
  // Данные не перезапрашиваются при каждом переключении вкладок туда-обратно.
  const DATA_TTL_MS = 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Пока оценки нет, в клетке — иконка статуса. Рисуем сами: символы шрифта
  // («…», «◷») в разных системах выглядят по-разному, а «…» к тому же
  // читается как обрезанный текст. Контуры 16×16, цвет — от текста клетки.
  const STATUS = {
    backlog: { label: 'Задано', icon: '<circle cx="8" cy="8" r="4.5"/>' },
    // Карандаш: над заданием работают.
    inProgress: {
      label: 'В работе',
      icon: '<path d="M10.8 3.2l2 2L6 12l-2.8.8.8-2.8z"/><path d="M9.6 4.4l2 2"/>',
    },
    // Стрелка в лоток: решение отправлено.
    submitted: {
      label: 'Решение прикреплено',
      icon: '<path d="M8 10.5V3M5 6l3-3 3 3"/><path d="M3 10v2.5h10V10"/>',
    },
    // Часы: ждём проверку.
    review: {
      label: 'На проверке',
      icon: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/>',
    },
    // Круговая стрелка: вернули на доработку.
    reworking: {
      label: 'Можно доработать',
      icon: '<path d="M12.5 8.5A4.5 4.5 0 1 1 11 4.6"/><path d="M11.5 1.8v3.3H8.2"/>',
    },
    failed: { label: 'Не сдано', icon: '<path d="M5 5l6 6M11 5l-6 6"/>' },
    evaluated: { label: 'Оценено', icon: '' },
    skipped: { label: 'Метод скипа', icon: '<path d="M3 4l4.5 4L3 12M8.5 4L13 8l-4.5 4"/>' },
  };

  // Флажок: контрольная по расписанию.
  const EXAM_ICON = '<path d="M4 14V2.5"/><path d="M4 3h8l-2 3 2 3H4"/>';
  // Шеврон вправо — свернуть колонку активностей к краю; у свёрнутой
  // разворачивается стилями и смотрит влево.
  const CHEVRON_ICON = '<path d="M6 3.5l4.5 4.5L6 12.5"/>';
  // Глаз — вернуть скрытый курс, перечёркнутый — скрыть.
  const EYE_ICON =
    '<path d="M1.5 8S3.9 3.5 8 3.5 14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"/>' +
    '<circle cx="8" cy="8" r="2"/>';
  const EYE_OFF_ICON = EYE_ICON + '<path d="M2.5 2.5l11 11"/>';

  function svgIcon(body) {
    return body
      ? `<svg class="culms-gb-icon" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`
      : '';
  }

  function iconHtml(status) {
    return svgIcon(STATUS[status]?.icon);
  }

  // Важные работы — экзамены, зачёты, контрольные, коллоквиумы, контесты: к
  // ним готовятся заранее, поэтому у них метка. Ищем по названию активности,
  // а если оно общее («Соревнование») — по названию задания. Работа без веса
  // важной не бывает: «Пересдача экзамена», «Дорешивание контеста» и
  // «Экзамен GRE» с нулевым весом на оценку не влияют.
  const IMPORTANT_KINDS = [
    { label: 'экзамен', pattern: /экзамен/i },
    // Слово целиком: не «Перезачёт» и не «о порядке зачета результатов».
    { label: 'зачёт', pattern: /(^|[^а-яё])зач[её]т(?![а-яё])/i },
    { label: 'контрольная', pattern: /контрольн/i },
    { label: 'коллоквиум', pattern: /коллоквиум/i },
    { label: 'контест', pattern: /контест/i },
  ];

  function importantKind(...names) {
    for (const name of names) {
      const kind = IMPORTANT_KINDS.find((k) => k.pattern.test(name || ''));
      if (kind) return kind.label;
    }
    return null;
  }

  // Предстоящие контрольные — то же расписание, что показывает «Видеть
  // предстоящие контрольные» на странице курса. Загрузку с кешем, разбор дат
  // и поиск курса делает общий course-view/future_exams_api.js
  // (`window.cuLmsFutureExams`), он подключается раньше этого файла:
  // аккордеон курса, дэшборд «Мои курсы» и сводная видят одно и то же.
  const EXAMS_TOGGLE = 'futureExamsViewToggle';

  const STATUS_ORDER = [
    'evaluated',
    'review',
    'submitted',
    'inProgress',
    'reworking',
    'backlog',
    'failed',
    'skipped',
  ];
  // Задания, по которым от студента ещё что-то ждут.
  const OPEN_STATES = new Set(['backlog', 'inProgress', 'reworking']);

  // Полосы оценок по округлению ЦУ: 3.5 → 4 — уже «удовлетворительно».
  const BANDS = [
    { id: 'fail', label: 'Неуд', range: '0–3', min: -Infinity },
    { id: 'sat', label: 'Удовл', range: '4–5', min: 3.5 },
    { id: 'good', label: 'Хор', range: '6–7', min: 5.5 },
    { id: 'exc', label: 'Отл', range: '8–10', min: 7.5 },
  ];

  const MODES = [
    { id: 'grade', label: 'Оценки' },
    { id: 'status', label: 'Статусы' },
    { id: 'weight', label: 'Вес' },
    { id: 'none', label: 'Без подсветки' },
  ];
  const COLUMN_MODES = [
    { id: 'dates', label: 'По датам' },
    { id: 'weeks', label: 'По неделям' },
  ];

  const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const fmtDayMonth = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });
  const fmtDeadline = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const state = {
    // Выбрана ли сводная. Не запоминается: ведомости открываются на родных
    // «Курсах по семестрам», а выбор живёт, пока пользователь в разделе, —
    // уход к курсу и назад его не сбрасывает, уход из ведомостей сбрасывает.
    open: false,
    active: false,
    // Раздел, который сейчас открыт, — 'actual' или 'archived'. Данные
    // помнят, для какого раздела собраны (`data.scope`).
    scope: null,
    // Семестр, выбранный переключателем; null — последний.
    semester: null,
    data: null,
    loadedAt: 0,
    loading: null,
    loadToken: 0,
    error: null,
    progress: null,
    prefs: loadPrefs(),
    spot: null,
    scrolledToNow: false,
    tasksByKey: new Map(),
    // Расписание контрольных `{ schedule, config }` от future_exams_api.js или
    // null, когда функция выключена. Контрольные курса считаются из него при
    // отрисовке; `examKeys` — какой ключ расписания достался какому курсу.
    exams: null,
    examKeys: null,
    examsToken: 0,
    examsByCourse: new Map(),
    // id скрытых курсов; вернуть их можно из строки под таблицей.
    hidden: new Set(),
    hiddenReady: null,
  };

  const log = (...args) =>
    typeof window.cuLmsLog === 'function' ? window.cuLmsLog('[Gradebook]', ...args) : undefined;

  // --- НАСТРОЙКИ ВИДА ---
  // Вид таблицы — удобство конкретной страницы, а не настройка расширения,
  // поэтому localStorage, а не storage.sync (и профиль настроек его не трогает).

  function loadPrefs() {
    const defaults = {
      mode: 'grade',
      cols: 'dates',
      offSemester: false,
      // Без веса — в основном служебные «Перезачёт» по нулю в каждом курсе:
      // на оценку не влияют, а красный 0 в каждой строке пугает.
      zeroWeight: false,
      // Карточки метрик над таблицей; их можно спрятать.
      stats: true,
      // Колонка «По активностям» развёрнута; свёрнутая отдаёт место датам.
      acts: true,
    };
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      const bool = (key) => (typeof saved[key] === 'boolean' ? saved[key] : defaults[key]);
      return {
        mode: MODES.some((m) => m.id === saved.mode) ? saved.mode : defaults.mode,
        cols: COLUMN_MODES.some((m) => m.id === saved.cols) ? saved.cols : defaults.cols,
        offSemester: bool('offSemester'),
        zeroWeight: bool('zeroWeight'),
        stats: bool('stats'),
        acts: bool('acts'),
      };
    } catch {
      return defaults;
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
    } catch {
      // приватный режим или переполнение — вид просто не запомнится
    }
  }

  function getSkippedTasks() {
    try {
      return new Set(JSON.parse(localStorage.getItem(SKIPPED_TASKS_KEY) || '[]'));
    } catch {
      return new Set();
    }
  }

  // --- УТИЛИТЫ ---

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtNum(value, digits = 2) {
    if (value == null || !Number.isFinite(value)) return '';
    return String(Number(value.toFixed(digits)));
  }

  // Средний балл и итог за активность LMS не округляет, а отсекает до сотых
  // (0.1666 → 0.16). Показываем так же, иначе цифры разойдутся с ведомостью.
  function fmtLms(value) {
    if (value == null || !Number.isFinite(value)) return '';
    return String(Math.floor(value * 100 + 1e-9) / 100);
  }

  function fmtPercent(fraction) {
    const pct = fraction * 100;
    if (pct > 0 && pct < 0.1) return '<0.1%';
    return (pct >= 10 || Number.isInteger(pct) ? Math.round(pct) : Number(pct.toFixed(1))) + '%';
  }

  // Родительный падеж после «из» и «до»: из 21 работы, из 25 работ; до 1 балла,
  // до 4 баллов, до 0.08 балла — у дробных всегда единственное число.
  function genitive(n, one, many) {
    if (!Number.isInteger(n)) return one;
    return n % 10 === 1 && n % 100 !== 11 ? one : many;
  }

  function bandOf(score10) {
    if (score10 == null) return 'none';
    let band = BANDS[0].id;
    for (const b of BANDS) if (score10 >= b.min) band = b.id;
    return band;
  }

  // Дни считаем в «календарных» UTC-полуночах от локальной даты: так разница
  // между днями всегда кратна суткам, даже если у пользователя есть переход
  // на летнее время.
  function dayNumber(date) {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
  }

  function mondayOf(dayNum) {
    // 1970-01-01 — четверг, отсюда +3.
    return dayNum - ((dayNum + 3) % 7);
  }

  function dateFromDayNumber(dayNum) {
    const d = new Date(dayNum * DAY_MS);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  // Сокращения частых активностей. Одни инициалы не годятся: «Домашнее
  // задание» и «Дифференцированный зачёт» оба стали бы «ДЗ».
  const ACTIVITY_SHORT = [
    [/^домашн/, 'ДЗ'],
    [/^дифференц/, 'Дифзачёт'],
    [/^зач[её]т/, 'Зачёт'],
    [/^контрольн/, 'КР'],
    [/^аудиторн/, 'Ауд.'],
    [/на занятии/, 'Занятия'],
    [/^коллоквиум/, 'Коллок.'],
    [/^экзамен/, 'Экзамен'],
    [/^лаборатор/, 'Лаб.'],
    [/проект/, 'Проект'],
    [/^бонус/, 'Бонус'],
    [/симулятор/, 'Симулятор'],
    [/^посещ/, 'Посещ.'],
    [/^семинар/, 'Семинары'],
    // Дальше — в основном названия контрольных из расписания.
    [/игра/, 'Игра'],
    [/опрос/, 'Опрос'],
    [/^срез/, 'Срез'],
    [/кейс/, 'Кейс'],
  ];

  function shortActivityName(name) {
    const lower = String(name || '')
      .trim()
      .toLowerCase();
    for (const [pattern, short] of ACTIVITY_SHORT) if (pattern.test(lower)) return short;

    const words = String(name || '')
      .replace(/[()]/g, ' ')
      .split(/[\s.,:;/-]+/)
      .filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].length > 7 ? words[0].slice(0, 6) + '.' : words[0];
    return words
      .slice(0, 4)
      .map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase()))
      .join('');
  }

  function displayCourseName(name) {
    const names = window.cuLmsCourseNames;
    return names && typeof names.toDisplay === 'function' ? names.toDisplay(name) : name;
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      credentials: 'include',
      headers: { accept: 'application/json, text/plain, */*' },
    });
    if (!response.ok) throw new Error(`LMS API вернул ${response.status} для ${url}`);
    return response.json();
  }

  // --- ДАННЫЕ ---

  async function loadData(scope) {
    state.progress = { done: 0, total: 0 };
    renderView();

    const archived = scope === 'archived';
    const [perf, allTasks, timetables] = await Promise.all([
      fetchJson(`/api/micro-lms/performance/student?isArchived=${archived}`),
      fetchJson('/api/micro-lms/tasks/student'),
      // Расписание нужно только ради даты начала семестра, и есть оно лишь у
      // текущего. Без него недели считаем по первым заданиям курсов.
      archived ? [] : fetchJson('/api/micro-lms/students/me/timetables').catch(() => []),
    ]);

    const courses = (Array.isArray(perf?.courses) ? perf.courses : perf?.items || []).filter(
      (c) => c && c.id != null
    );
    state.progress = { done: 0, total: courses.length };
    renderView();

    // Плановое число работ есть только у курса: в ведомости курса — для
    // активностей, где уже выданы задания, в списке активностей — для всех,
    // включая контрольные и экзамены, до которых ещё не дошли.
    const optional = (url, what, fallback) =>
      fetchJson(url).catch((error) => {
        log(`${what} не загрузилась`, url, error);
        return fallback;
      });
    const perCourse = await Promise.all(
      courses.map((course) =>
        Promise.all([
          optional(`/api/micro-lms/courses/${course.id}/student-performance`, 'ведомость', null),
          optional(`/api/micro-lms/courses/${course.id}/activities`, 'список активностей', []),
        ]).finally(() => {
          state.progress.done++;
          renderProgress();
        })
      )
    );

    return buildModel(
      scope,
      courses,
      perCourse.map(([performance]) => performance),
      perCourse.map(([, activities]) => (Array.isArray(activities) ? activities : [])),
      Array.isArray(allTasks) ? allTasks : [],
      timetables
    );
  }

  function buildModel(scope, courses, performances, activityLists, allTasks, timetables) {
    const now = Date.now();
    const skipped = getSkippedTasks();
    const tasksByCourse = new Map();
    for (const task of allTasks) {
      const courseId = task?.course?.id;
      if (courseId == null) continue;
      if (!tasksByCourse.has(courseId)) tasksByCourse.set(courseId, []);
      tasksByCourse.get(courseId).push(task);
    }

    const models = courses.map((course, index) => {
      const performance = performances[index];
      // Курс и его ведомость живут в том разделе, где лежит сам курс.
      const section = course.isArchived || scope === 'archived' ? 'archived' : 'actual';
      const perfTasks = Array.isArray(performance?.tasks) ? performance.tasks : [];
      const perfById = new Map(perfTasks.map((t) => [t.id, t]));

      // Активности — из списка курса и его ведомости: там полный объект с
      // плановым числом работ. В `/tasks/student` у активности есть только вес.
      const activities = new Map();
      const touchActivity = (activity) => {
        if (!activity || activity.id == null) return null;
        if (!activities.has(activity.id)) {
          activities.set(activity.id, {
            id: activity.id,
            name: activity.name || 'Активность',
            weight: Number(activity.weight) || 0,
            maxCount: Number(activity.maxExercisesCount) || 0,
            best: Number(activity.bestScoresCount) || 0,
            tasks: [],
          });
        }
        return activities.get(activity.id);
      };
      activityLists[index].forEach(touchActivity);
      perfTasks.forEach((t) => touchActivity(t.activity));

      const listTasks = tasksByCourse.get(course.id) || [];
      const seen = new Set();
      const tasks = [];

      const addTask = (listTask, perfTask) => {
        const id = listTask?.id ?? perfTask?.id;
        if (id == null || seen.has(id)) return;
        seen.add(id);

        const activity = touchActivity(
          perfTask?.activity || listTask?.exercise?.activity || listTask?.activity
        );
        const scoreRaw = perfTask?.score ?? listTask?.score ?? null;
        const extra = perfTask?.extraScore ?? listTask?.extraScore ?? null;
        const max = Number(perfTask?.maxScore ?? listTask?.exercise?.maxScore) || 10;
        const hasScore = scoreRaw != null;
        const total = hasScore ? Number(scoreRaw) + (Number(extra) || 0) : null;
        let status = perfTask?.state || listTask?.state || 'backlog';
        if (!hasScore && skipped.has(`id:${id}`)) status = 'skipped';

        const deadlineIso = listTask?.deadline || listTask?.exercise?.deadline || null;
        const deadline = deadlineIso ? new Date(deadlineIso) : null;
        const startIso = listTask?.exercise?.startDate || null;
        const start = startIso ? new Date(startIso) : null;
        const themeId = listTask?.theme?.id;
        const longreadId = listTask?.longread?.id;

        const task = {
          id,
          key: `${course.id}:${id}`,
          courseId: course.id,
          courseName: course.name,
          name: listTask?.exercise?.name || listTask?.name || 'Задание',
          themeName: listTask?.theme?.name || '',
          status,
          score: total,
          extra: Number(extra) || 0,
          max,
          score10: total != null ? (total / max) * 10 : null,
          deadline: deadline && !Number.isNaN(deadline.getTime()) ? deadline : null,
          activity,
          link:
            themeId != null && longreadId != null
              ? `/learn/courses/view/${section}/${course.id}/themes/${themeId}/longreads/${longreadId}`
              : `${BASE_PATH}/${section}/${course.id}/activity`,
        };
        task.day = task.deadline ? dayNumber(task.deadline) : null;
        task.startDay = start && !Number.isNaN(start.getTime()) ? dayNumber(start) : null;
        if (activity) activity.tasks.push(task);
        tasks.push(task);
      };

      listTasks.forEach((t) => addTask(t, perfById.get(t.id)));
      // Задание есть в ведомости, но не в общем списке — показываем без даты.
      perfTasks.forEach((t) => addTask(null, t));

      // Накоп — как считает LMS (сверено с итогами архивных курсов и страницей
      // «Активность» курса): Σ вес × средний балл активности, где средний балл
      // — сумма баллов как есть, без приведения к 10, делённая на плановое
      // число работ (а если плана нет — на число выданных). Если в активности
      // берутся лучшие N, делим на N. Итог курса выше 10 не поднимается.
      //
      // Рядом с накопом — сколько можно было набрать к сегодняшнему дню: все
      // уже оценённые работы и те, чей дедлайн прошёл, на максимум.
      //
      // Цвет же — только по оценённым: работа на проверке ещё не принесла
      // баллов, и строка краснела бы, пока преподаватель не проверит.
      let accumulated = 0;
      let possibleGraded = 0;
      let possibleNow = 0;
      let hasWeight = false;
      const topByMax = (list, n) =>
        n ? [...list].sort((a, b) => b.max - a.max).slice(0, n) : list;
      const sumOf = (list, key) => list.reduce((s, t) => s + t[key], 0);
      for (const activity of activities.values()) {
        // Делим на план, даже если заданий выдали больше: в «STEM» 16 лекций при
        // плане 15, и LMS считает средний балл как сумму / 15.
        const denominator = activity.best || activity.maxCount || activity.tasks.length;
        const graded = activity.tasks.filter((t) => t.score != null);
        let counted = graded;
        if (activity.best) {
          counted = [...graded].sort((a, b) => b.score - a.score).slice(0, activity.best);
        }
        const due = activity.tasks.filter(
          (t) => t.score != null || (t.deadline && t.deadline.getTime() <= now)
        );
        activity.denominator = denominator;
        activity.value = denominator > 0 ? sumOf(counted, 'score') / denominator : 0;
        activity.gradedCount = graded.length;
        activity.gradedAverage = counted.length ? sumOf(counted, 'score10') / counted.length : null;
        if (activity.weight > 0) hasWeight = true;
        accumulated += activity.weight * activity.value;
        if (denominator > 0) {
          possibleGraded += (activity.weight * sumOf(counted, 'max')) / denominator;
          possibleNow +=
            (activity.weight * sumOf(topByMax(due, activity.best), 'max')) / denominator;
        }
      }
      accumulated = Math.min(accumulated, 10);
      // Доля итоговой оценки (из 10), которую задание даёт при максимуме.
      tasks.forEach((t) => {
        const a = t.activity;
        t.weight = a && a.denominator > 0 ? (a.weight * t.max) / a.denominator / 10 : 0;
        t.important = t.weight > 0 ? importantKind(a?.name, t.name) : null;
      });
      for (const activity of activities.values()) {
        activity.important = activity.weight > 0 ? importantKind(activity.name) : null;
      }

      return {
        id: course.id,
        name: course.name || `Курс ${course.id}`,
        section,
        semesterNumber: course.semesterNumber ?? null,
        inSemester: course.semesterNumber != null,
        lmsTotal: course.total ?? performance?.total ?? null,
        blocker: Boolean(
          course.courseBlockerTriggered ||
          course.activitiesBlockerTriggered ||
          performance?.courseBlockerTriggered ||
          performance?.activitiesBlockerTriggered
        ),
        accumulated: hasWeight ? accumulated : null,
        possibleNow: hasWeight ? Math.min(possibleNow, 10) : null,
        rate: hasWeight && possibleGraded > 0 ? (accumulated / possibleGraded) * 10 : null,
        activities: [...activities.values()].sort((a, b) => b.weight - a.weight),
        tasks: tasks.sort(
          (a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity)
        ),
        // Неделя, с которой курс начался: по первому открытому заданию, а
        // если дат открытия нет — по первому дедлайну.
        firstDay: minOf(tasks.map((t) => t.startDay)) ?? minOf(tasks.map((t) => t.day)),
      };
    });

    // Первая неделя каждого семестра — та, с которой начинается большинство
    // его курсов (по первому открытому заданию). Не самая ранняя: курсы со
    // своим графиком стартуют раньше или позже и сдвинули бы нумерацию.
    const semesters = [...new Set(models.filter((c) => c.inSemester).map((c) => c.semesterNumber))];
    semesters.sort((a, b) => a - b);
    const semesterMondays = new Map();
    for (const number of semesters) {
      const monday = modeMonday(
        models.filter((c) => c.semesterNumber === number).map((c) => c.firstDay)
      );
      if (monday != null) semesterMondays.set(number, monday);
    }

    // У текущего семестра есть расписание — по нему точнее: неделя, с которой
    // начинается большинство строк расписания (пары раз в две недели и курсы
    // со своим графиком стартуют позже).
    const timetableMonday = modeMonday(
      (Array.isArray(timetables) ? timetables : []).flatMap((course) =>
        (course?.eventRows || []).map((row) => {
          const start = row?.calendarEvent?.schedule?.startDate;
          if (!start) return null;
          const [y, m, d] = start.split('-').map(Number);
          const day = Date.UTC(y, m - 1, d) / DAY_MS;
          return Number.isFinite(day) ? day : null;
        })
      )
    );
    if (timetableMonday != null && semesters.length) {
      semesterMondays.set(semesters[semesters.length - 1], timetableMonday);
    }

    return { scope, courses: models, semesters, semesterMondays };
  }

  function minOf(values) {
    const list = values.filter((v) => v != null);
    return list.length ? Math.min(...list) : null;
  }

  /** Самый частый понедельник среди дней; при равенстве — более ранний. */
  function modeMonday(days) {
    const votes = new Map();
    for (const day of days) {
      if (day == null) continue;
      const monday = mondayOf(day);
      votes.set(monday, (votes.get(monday) || 0) + 1);
    }
    let best = null;
    let bestVotes = 0;
    for (const [monday, count] of votes) {
      if (count > bestVotes || (count === bestVotes && monday < best)) {
        best = monday;
        bestVotes = count;
      }
    }
    return best;
  }

  // --- КОНТРОЛЬНЫЕ ПО РАСПИСАНИЮ ---

  /** API расширения. Полифил `browser` может приехать позже этого скрипта. */
  function extApi() {
    if (typeof browser !== 'undefined' && browser?.storage) return browser;
    if (typeof chrome !== 'undefined' && chrome?.storage) return chrome;
    return null;
  }

  /**
   * Расписание контрольных `{ schedule, config }`, если в меню включено
   * «Видеть предстоящие контрольные», иначе null. Без него таблица работает
   * как раньше, поэтому любая ошибка здесь означает просто «контрольных нет».
   * Кеш, запрос через фон и запасной ответ при недоступном сервере — в
   * `cuLmsFutureExams.load()`.
   */
  async function loadExamSchedule() {
    const api = extApi();
    const exams = window.cuLmsFutureExams;
    if (!api || !exams) return null;
    try {
      const settings = await api.storage.sync.get(EXAMS_TOGGLE);
      if (!settings?.[EXAMS_TOGGLE]) return null;
      return await exams.load();
    } catch (error) {
      log('расписание контрольных недоступно', error);
      return null;
    }
  }

  let examsListening = false;
  function refreshExams() {
    const token = ++state.examsToken;
    loadExamSchedule().then((exams) => {
      if (token !== state.examsToken) return;
      state.exams = exams?.schedule ? exams : null;
      state.examKeys = null;
      state.examsByCourse.clear();
      renderView();
    });

    // Переключатель в меню расширения действует сразу, без перезагрузки.
    const api = extApi();
    if (!examsListening && api?.storage?.onChanged) {
      examsListening = true;
      api.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && EXAMS_TOGGLE in changes && state.active) refreshExams();
      });
    }
  }

  /**
   * Предстоящие контрольные курса. Курс в расписании ищет общий
   * future_exams_api.js — так же, как аккордеон курса и дэшборд: из
   * подходящих ключей побеждает самый длинный («Микроэкономика» входит и в
   * «Микроэкономика. Продвинутый уровень»), и один ключ достаётся одному
   * курсу. Он же подбирает год к датам «ДД ММ» от начала семестра: в январе
   * декабрьские пункты — прошедшие, а не через год. Дата в расписании —
   * понедельник недели, день внутри неё не указан, поэтому контрольная
   * остаётся «предстоящей», пока неделя не кончилась.
   */
  function examsOf(course) {
    const api = window.cuLmsFutureExams;
    // Расписание — только на текущий семестр.
    if (!state.exams || !api || state.data?.scope !== 'actual') return [];
    if (state.examsByCourse.has(course.id)) return state.examsByCourse.get(course.id);

    const { schedule, config } = state.exams;
    // Ключи раздаются всем курсам раздела разом: «один ключ — одному курсу»
    // решается сравнением курсов между собой.
    if (state.examKeys?.data !== state.data) {
      const matched = api.matchCourses(
        state.data.courses.map((c) => ({ id: c.id, name: c.name })),
        schedule
      );
      state.examKeys = {
        data: state.data,
        byCourse: new Map(matched.map((m) => [m.course.id, m.key])),
      };
    }

    const key = state.examKeys.byCourse.get(course.id);
    const start = api.semesterStartDay(config);
    const today = dayNumber(new Date());
    const exams = (key ? schedule[key] : [])
      .map((item, index) => {
        const name = typeof item?.name === 'string' ? item.name.trim() : '';
        const day = name ? api.resolveDay(item.date, start) : null;
        if (day == null) return null;
        return {
          type: 'exam',
          key: `exam:${course.id}:${index}`,
          courseId: course.id,
          courseName: course.name,
          name,
          monday: mondayOf(day),
          link: `/learn/courses/view/actual/${course.id}`,
        };
      })
      .filter((exam) => exam && exam.monday + 6 >= today);
    state.examsByCourse.set(course.id, exams);
    return exams;
  }

  // --- СКРЫТЫЕ КУРСЫ ---

  function toIdSet(value) {
    return new Set(Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : []);
  }

  /**
   * Список скрытых курсов — один раз, при первом открытии сводной. Таблица
   * ждёт его вместе с данными: иначе скрытый курс мелькал бы, пока список
   * не приехал. Без API расширения скрывать можно, но до перезагрузки.
   */
  function loadHidden() {
    if (state.hiddenReady) return state.hiddenReady;
    const api = extApi();
    state.hiddenReady = (async () => {
      if (!api) return;
      try {
        const stored = await api.storage.local.get(HIDDEN_KEY);
        state.hidden = toIdSet(stored?.[HIDDEN_KEY]);
      } catch (error) {
        log('скрытые курсы не прочитались', error);
      }
      // Скрыли в другой вкладке или загрузили профиль — видно сразу.
      api.storage.onChanged?.addListener((changes, area) => {
        if (area !== 'local' || !(HIDDEN_KEY in changes)) return;
        const next = toIdSet(changes[HIDDEN_KEY].newValue);
        const same =
          next.size === state.hidden.size && [...next].every((id) => state.hidden.has(id));
        if (same) return;
        state.hidden = next;
        if (state.active) renderView();
      });
    })();
    return state.hiddenReady;
  }

  function saveHidden() {
    const api = extApi();
    if (!api) return;
    const ids = [...state.hidden];
    // Пустой список не храним: так же, как скрытые задания архива.
    Promise.resolve(
      ids.length
        ? api.storage.local.set({ [HIDDEN_KEY]: ids })
        : api.storage.local.remove(HIDDEN_KEY)
    ).catch((error) => log('скрытые курсы не сохранились', error));
  }

  // --- ПОСТРОЕНИЕ СЕТКИ ---

  /**
   * Семестр, который сейчас показан. В архиве их бывает несколько, и все
   * сразу — это таблица на год вперёд, поэтому по умолчанию последний.
   */
  function currentSemester() {
    const { semesters } = state.data;
    if (!semesters.length) return null;
    return semesters.includes(state.semester) ? state.semester : semesters[semesters.length - 1];
  }

  /** Курсы показанного семестра — вместе со скрытыми: их отбирает renderView. */
  function visibleCourses() {
    const semester = currentSemester();
    return state.data.courses.filter((c) =>
      c.inSemester ? c.semesterNumber === semester : state.prefs.offSemester
    );
  }

  function isTaskVisible(task) {
    return state.prefs.zeroWeight || task.weight > 0;
  }

  /** Понедельник первой недели показанного семестра. */
  function semesterMonday(courses) {
    const known = state.data.semesterMondays.get(currentSemester());
    if (known != null) return known;
    // Показаны только курсы вне семестра — считаем по ним же.
    return modeMonday(courses.map((c) => c.firstDay));
  }

  // Дальше полугода от начала — это уже не недели семестра: пересдачи,
  // проекты с дедлайном осенью.
  const MAX_WEEK = 26;

  function weekLabel(monday, start) {
    if (start == null) return 'Неделя';
    const number = Math.floor((monday - start) / 7) + 1;
    if (number < 1) return 'До семестра';
    return number > MAX_WEEK ? 'После семестра' : `Неделя ${number}`;
  }

  function weekRange(monday) {
    return `${fmtDayMonth.format(dateFromDayNumber(monday))}–${fmtDayMonth.format(
      dateFromDayNumber(monday + 6)
    )}`;
  }

  /**
   * Столбцы и их группы-недели для текущего набора курсов. У столбца два
   * фильтра: `match` — какие задания в нём, `examMatch` — какие контрольные.
   */
  function buildColumns(courses) {
    const days = new Set();
    const examWeeks = new Set();
    let hasUndated = false;
    for (const course of courses) {
      for (const task of course.tasks) {
        if (!isTaskVisible(task)) continue;
        if (task.day == null) hasUndated = true;
        else days.add(task.day);
      }
      for (const exam of examsOf(course)) examWeeks.add(exam.monday);
    }

    const today = dayNumber(new Date());
    const currentMonday = mondayOf(today);
    const start = semesterMonday(courses);
    const groups = [];
    const byWeeks = state.prefs.cols === 'weeks';
    const none = () => false;
    const sortedDays = [...days].sort((a, b) => a - b);
    // Неделя попадает в таблицу, если на неё есть дедлайн или контрольная.
    const mondays = [...new Set([...sortedDays.map(mondayOf), ...examWeeks])].sort((a, b) => a - b);

    for (const monday of mondays) {
      const current = monday === currentMonday;
      const group = {
        monday,
        label: weekLabel(monday, start),
        range: weekRange(monday),
        current,
        columns: [],
      };
      groups.push(group);

      if (byWeeks) {
        group.columns.push({
          key: `w${monday}`,
          match: (t) => t.day != null && mondayOf(t.day) === monday,
          examMatch: (e) => e.monday === monday,
          title: group.range,
          sub: '',
          current,
          today: current,
        });
        continue;
      }

      // Дня у контрольной нет — только неделя. Ставить её на понедельник
      // значило бы соврать, поэтому у такой недели свой столбец в начале.
      if (examWeeks.has(monday)) {
        group.columns.push({
          key: `x${monday}`,
          exam: true,
          match: none,
          examMatch: (e) => e.monday === monday,
          title: 'Контр.',
          sub: 'на неделе',
          current,
          past: monday + 6 < today,
        });
      }
      for (const day of sortedDays.filter((d) => mondayOf(d) === monday)) {
        const date = dateFromDayNumber(day);
        group.columns.push({
          key: `d${day}`,
          match: (t) => t.day === day,
          examMatch: none,
          title: fmtDayMonth.format(date),
          sub: WEEKDAYS[date.getDay()],
          current,
          today: day === today,
          past: day < today,
        });
      }
    }

    if (hasUndated) {
      groups.push({
        monday: null,
        label: 'Без срока',
        range: '',
        current: false,
        columns: [
          {
            key: 'none',
            match: (t) => t.day == null,
            examMatch: none,
            title: '—',
            sub: '',
            current: false,
            today: false,
          },
        ],
      });
    }

    // Границы недель проводим жирнее и в теле таблицы — как в бумажном журнале.
    for (const group of groups) group.columns[group.columns.length - 1].weekEnd = true;
    return groups;
  }

  // --- ОТРИСОВКА ---

  function spotMatches(task) {
    const spot = state.spot;
    if (!spot) return true;
    const [kind, value] = spot.split(':');
    if (kind === 'status') return task.status === value;
    if (kind === 'band') return bandOf(task.score10) === value;
    if (kind === 'due') return isDueThisWeek(task);
    if (kind === 'graded') return task.score != null;
    // Выделены контрольные — задания приглушаются все.
    if (kind === 'exams') return false;
    if (kind === 'important') return !!task.important;
    return true;
  }

  function isDueThisWeek(task) {
    if (task.day == null || !OPEN_STATES.has(task.status)) return false;
    const today = dayNumber(new Date());
    return task.day >= today && mondayOf(task.day) === mondayOf(today);
  }

  function chipHtml(task, maxWeight) {
    state.tasksByKey.set(task.key, task);
    const band = bandOf(task.score10);
    // Бонусы бывают из 1 балла: голое «0.5» читалось бы как провал.
    const content =
      task.score != null
        ? esc(fmtNum(task.score)) + (task.max !== 10 ? `<small>/${fmtNum(task.max)}</small>` : '')
        : iconHtml(task.status) || '?';
    const classes = ['culms-gb-chip'];
    if (task.score == null) classes.push('is-pending');
    if (task.weight <= 0) classes.push('is-weightless');
    if (!spotMatches(task)) classes.push('is-dim');
    const w = maxWeight > 0 ? Math.max(0, Math.min(1, task.weight / maxWeight)) : 0;
    // На густом фоне режима «Вес» тёмный текст не читается.
    if (w > 0.55) classes.push('is-heavy');
    const status = STATUS[task.status]?.label || task.status;
    return (
      `<a class="${classes.join(' ')}" href="${esc(task.link)}" data-key="${esc(task.key)}"` +
      ` data-status="${esc(task.status)}" data-band="${band}" style="--w:${w.toFixed(3)}"` +
      (task.important ? ` data-important="${esc(task.important)}"` : '') +
      ` aria-label="${esc(`${task.name}: ${status}${task.important ? ', важная работа' : ''}`)}">${content}</a>`
    );
  }

  /** Контрольная по расписанию: не оценка и не задание — свой вид. */
  function examChipHtml(exam) {
    state.tasksByKey.set(exam.key, exam);
    const dim = state.spot && state.spot !== 'exams' ? ' is-dim' : '';
    return (
      `<a class="culms-gb-chip${dim}" data-exam href="${esc(exam.link)}" data-key="${esc(exam.key)}"` +
      ` aria-label="${esc(`${exam.name}: неделя ${weekRange(exam.monday)}`)}">` +
      `${svgIcon(EXAM_ICON)}${esc(shortActivityName(exam.name))}</a>`
    );
  }

  function segmentedHtml(name, options, current) {
    return (
      `<div class="culms-gb-seg" role="group">` +
      options
        .map(
          (o) =>
            `<button type="button" class="culms-gb-seg__btn${o.id === current ? ' is-on' : ''}"` +
            ` data-${name}="${o.id}" aria-pressed="${o.id === current}">${esc(o.label)}</button>`
        )
        .join('') +
      `</div>`
    );
  }

  function checkboxHtml(pref, label) {
    return (
      `<label class="culms-gb-check"><input type="checkbox" data-pref="${pref}"` +
      `${state.prefs[pref] ? ' checked' : ''}> ${esc(label)}</label>`
    );
  }

  /**
   * Скрытые курсы показанного семестра — строкой прямо под таблицей: откуда
   * строка ушла, там её и ищут. Каждый курс — кнопка с названием, нажатие
   * возвращает его в таблицу. Над таблицей строку не ставим: появляясь, она
   * сдвигала бы строки вниз, и следующий щелчок «скрыть» пришёлся бы на
   * чужой курс.
   */
  function hiddenBarHtml(hidden) {
    if (!hidden.length) return '';
    const courses = hidden
      .map((course) => {
        const name = displayCourseName(course.name);
        return (
          `<button type="button" class="culms-gb-hidden__course" data-show-course="${course.id}"` +
          ` title="${esc(`${name}\nВернуть в таблицу`)}" aria-label="${esc(`Вернуть курс «${name}» в таблицу`)}">` +
          `${svgIcon(EYE_ICON)}<span class="culms-gb-hidden__name">${esc(name)}</span></button>`
        );
      })
      .join('');
    return (
      `<div class="culms-gb-hidden" role="group" aria-label="Скрытые курсы">` +
      `<span class="culms-gb-hidden__label">Скрытые курсы:</span>${courses}` +
      (hidden.length > 1
        ? `<button type="button" class="culms-gb-button" data-show-course="all">Вернуть все</button>`
        : '') +
      `<span class="culms-gb-hidden__hint">Нажми на курс, чтобы вернуть его в таблицу</span>` +
      `</div>`
    );
  }

  function statsHtml(courses) {
    const tasks = courses.flatMap((c) => c.tasks).filter(isTaskVisible);
    const count = (predicate) => tasks.filter(predicate).length;
    const rated = courses.filter((c) => c.rate != null);
    const avgRate = rated.length ? rated.reduce((s, c) => s + c.rate, 0) / rated.length : null;

    const cards = [
      {
        value: avgRate != null ? fmtNum(avgRate, 1) : '—',
        label: 'средний балл по оценённым',
        band: avgRate != null ? bandOf(avgRate) : 'none',
        title: 'Среднее по курсам: сколько из 10 набрано на уже оценённых работах с учётом весов',
      },
      {
        value: `${count((t) => t.score != null)}<small>/${tasks.length}</small>`,
        label: 'заданий оценено',
        spot: 'graded',
      },
      { value: count((t) => t.status === 'review'), label: 'на проверке', spot: 'status:review' },
      // В архиве дедлайнов впереди нет — карточка всегда показывала бы ноль.
      state.data.scope === 'archived'
        ? null
        : { value: count(isDueThisWeek), label: 'дедлайнов на неделе', spot: 'due:week' },
      {
        value: count((t) => t.status === 'reworking'),
        label: 'можно доработать',
        spot: 'status:reworking',
      },
      { value: count((t) => t.status === 'failed'), label: 'не сдано', spot: 'status:failed' },
      // Только когда в меню включены предстоящие контрольные.
      state.exams && state.data.scope === 'actual'
        ? {
            value: courses.reduce((n, c) => n + examsOf(c).length, 0),
            label: 'контрольных впереди',
            spot: 'exams',
            title: 'По расписанию контрольных — того же, что на странице курса',
          }
        : null,
    ].filter(Boolean);

    return (
      `<div class="culms-gb-stats">` +
      cards
        .map((card) => {
          const tag = card.spot ? 'button' : 'div';
          const on = card.spot && state.spot === card.spot;
          const attrs = card.spot
            ? ` type="button" data-spot="${card.spot}" aria-pressed="${on}"`
            : '';
          return (
            `<${tag} class="culms-gb-stat${on ? ' is-on' : ''}"${attrs}` +
            `${card.band ? ` data-band="${card.band}"` : ''}` +
            `${card.title ? ` title="${esc(card.title)}"` : ''}>` +
            `<span class="culms-gb-stat__value">${card.value}</span>` +
            `<span class="culms-gb-stat__label">${esc(card.label)}</span></${tag}>`
          );
        })
        .join('') +
      `</div>`
    );
  }

  function legendHtml(courses) {
    const tasks = courses.flatMap((c) => c.tasks).filter(isTaskVisible);
    const item = (spot, swatchAttrs, label, count, icon = '') =>
      `<button type="button" class="culms-gb-legend__item${state.spot === spot ? ' is-on' : ''}"` +
      ` data-spot="${spot}" aria-pressed="${state.spot === spot}">` +
      `<span class="culms-gb-chip culms-gb-legend__swatch" ${swatchAttrs}>${icon}</span>${esc(label)}` +
      `${count != null ? ` <span class="culms-gb-legend__count">${count}</span>` : ''}</button>`;

    let items = '';
    if (state.prefs.mode === 'grade') {
      items = BANDS.map((b) =>
        item(
          `band:${b.id}`,
          `data-band="${b.id}"`,
          `${b.label} · ${b.range}`,
          tasks.filter((t) => bandOf(t.score10) === b.id).length
        )
      ).join('');
      items += item(
        'band:none',
        'data-band="none" data-status="backlog"',
        'Без оценки',
        tasks.filter((t) => t.score10 == null).length
      );
    } else if (state.prefs.mode === 'status') {
      // Статусы, которых сейчас нет ни у одного задания, только шумят.
      // Иконки те же, что в клетках, — по легенде их и запоминают.
      items = STATUS_ORDER.map((id) => {
        const n = tasks.filter((t) => t.status === id).length;
        return n
          ? item(`status:${id}`, `data-status="${id}"`, STATUS[id].label, n, iconHtml(id))
          : '';
      }).join('');
    } else if (state.prefs.mode === 'weight') {
      items =
        `<span class="culms-gb-legend__scale"><span>легче</span><i></i><span>тяжелее</span></span>` +
        `<span class="culms-gb-legend__note"><span class="culms-gb-chip culms-gb-legend__swatch is-weightless"></span>пунктир — не влияет на итог</span>`;
    }

    // Метка важных работ видна в любой подсветке — пункт для неё общий.
    const important = tasks.filter((t) => t.important).length;
    if (important) {
      items += item(
        'important',
        'data-important',
        'Важные: экзамены, зачёты, КР, коллоквиумы, контесты',
        important
      );
    }

    // Контрольные выглядят одинаково в любой подсветке — пункт для них общий.
    const exams = courses.reduce((n, c) => n + examsOf(c).length, 0);
    if (exams) {
      items += item('exams', 'data-exam', 'Контрольная по расписанию', exams, svgIcon(EXAM_ICON));
    }

    const clickable = state.prefs.mode === 'grade' || state.prefs.mode === 'status';
    let hint = '';
    if (state.spot) {
      hint = `<button type="button" class="culms-gb-legend__reset" data-spot="">Показать всё</button>`;
    } else if (clickable) {
      hint = `<span class="culms-gb-legend__hint">Нажми на пункт, чтобы выделить только его</span>`;
    }
    if (!items && !hint) return '';
    return `<div class="culms-gb-legend">${items}${hint}</div>`;
  }

  /**
   * Заголовок колонки активностей с кнопкой свернуть/развернуть. Свёрнутая
   * колонка — узкая полоса с подписью поперёк: её видно, её есть за что
   * развернуть обратно, а 250px уходят датам.
   */
  function actsHeadHtml() {
    const open = state.prefs.acts;
    const action = open ? 'Свернуть колонку активностей' : 'Развернуть колонку активностей';
    return (
      `<th class="culms-gb-acts culms-gb-sticky-r" rowspan="2" scope="col">` +
      `<div class="culms-gb-acts__head">` +
      `<span class="culms-gb-acts__title">${open ? 'По активностям' : 'Активности'}</span>` +
      `<button type="button" class="culms-gb-acts__toggle" data-toggle="acts" aria-expanded="${open}"` +
      ` title="${action}" aria-label="${action}">${svgIcon(CHEVRON_ICON)}</button>` +
      `</div></th>`
    );
  }

  function activitiesHtml(course) {
    const weighted = course.activities.filter((a) => a.weight > 0);
    if (!weighted.length) return '<span class="culms-gb-muted">—</span>';

    // Все активности с весом, по убыванию веса. Те, по которым ещё не выдано
    // ни одного задания (экзамен, контрольные в начале семестра), — пунктиром
    // и с прочерком: ноль там значил бы «провалил», а не «ещё не было».
    // Число — «Средний балл» из ведомости курса, цвет — средняя по оценённым:
    // иначе в начале семестра все активности были бы красными.
    const used = new Set();
    return weighted
      .map((a) => {
        // Два одинаковых сокращения в одном курсе не различить — второе
        // показываем полным названием.
        let short = shortActivityName(a.name);
        if (used.has(short)) short = a.name.length > 12 ? a.name.slice(0, 11) + '…' : a.name;
        used.add(short);

        const waiting = a.tasks.length === 0;
        const title = waiting
          ? `${a.name} — вес ${fmtPercent(a.weight)}\nЗаданий пока не было` +
            (a.maxCount ? ` (запланировано ${a.maxCount})` : '')
          : `${a.name} — вес ${fmtPercent(a.weight)}\n` +
            `Средний балл (как в ведомости): ${fmtLms(a.value)} — сумма оценок / ${a.denominator}\n` +
            `Итог за активность: ${fmtLms(a.value * a.weight)}\n` +
            `Оценено работ: ${a.gradedCount} из ${a.denominator}` +
            (a.gradedAverage != null
              ? `\nСредняя по оценённым: ${fmtNum(a.gradedAverage)} из 10`
              : '') +
            (a.best ? `\nВ зачёт идут ${a.best} лучших` : '');
        return (
          `<span class="culms-gb-act${waiting ? ' is-waiting' : ''}" data-band="${bandOf(a.gradedAverage)}"` +
          `${a.important ? ` data-important="${esc(a.important)}"` : ''} title="${esc(title)}">` +
          `<span class="culms-gb-act__name">${esc(short)}</span>` +
          `<span class="culms-gb-act__value">${waiting ? '—' : fmtLms(a.value)}</span>` +
          `<span class="culms-gb-act__weight">${esc(fmtPercent(a.weight))}</span></span>`
        );
      })
      .join('');
  }

  function tableHtml(courses, hiddenCount) {
    const groups = buildColumns(courses);
    const columns = groups.flatMap((g) => g.columns);
    if (!courses.length) {
      return hiddenCount
        ? `<div class="culms-gb-empty">Все курсы скрыты — верни нужные из списка ниже.</div>`
        : `<div class="culms-gb-empty">Курсов по семестрам нет. Включи «Курсы вне семестра», чтобы увидеть остальные.</div>`;
    }

    const maxWeight = Math.max(
      0,
      ...courses.flatMap((c) => c.tasks.filter(isTaskVisible).map((t) => t.weight))
    );
    const colClass = (col) =>
      [
        col.current ? 'is-cur-week' : '',
        col.today && state.prefs.cols === 'dates' ? 'is-today' : '',
        col.past ? 'is-past' : '',
        col.weekEnd ? 'is-week-end' : '',
        col.exam ? 'is-exam-col' : '',
      ]
        .filter(Boolean)
        .join(' ');

    // Клетки раскладываем заранее: по самой людной клетке столбца задаём его
    // ширину, иначе пять заданий в один день встают столбиком в пять строк.
    const cellsByCourse = courses.map((course) => {
      const visible = course.tasks.filter(isTaskVisible);
      const exams = examsOf(course);
      return columns.map((col) => ({
        exams: exams.filter(col.examMatch),
        tasks: visible.filter(col.match),
      }));
    });
    const CHIP_STEP = 29; // ширина клетки-оценки с зазором
    const EXAM_STEP = 2; // плашка контрольной — с подписью, шире оценки вдвое
    columns.forEach((col, i) => {
      const most = Math.max(
        0,
        ...cellsByCourse.map((cells) => cells[i].tasks.length + cells[i].exams.length * EXAM_STEP)
      );
      col.minWidth = Math.min(Math.max(most, col.exam ? EXAM_STEP : 1), 4) * CHIP_STEP + 10;
    });

    let head1 =
      `<th class="culms-gb-course culms-gb-sticky-l" rowspan="2" scope="col">Курс</th>` +
      groups
        .map(
          (g) =>
            `<th class="culms-gb-week${g.current ? ' is-cur-week' : ''}" colspan="${g.columns.length}" scope="colgroup"` +
            `${g.range ? ` title="${esc(g.range)}"` : ''}>${esc(g.label)}${
              state.prefs.cols === 'dates' && g.range
                ? `<span class="culms-gb-week__range">${esc(g.range)}</span>`
                : ''
            }</th>`
        )
        .join('') +
      `<th class="culms-gb-acc culms-gb-sticky-r2" rowspan="2" scope="col"` +
      ` title="${esc(
        'Набрано — накоп, как в ведомости курса: Σ вес активности × её средний балл, несданные работы идут как 0.\n' +
          'Можно — сколько дали бы к сегодняшнему дню все оценённые работы и работы с прошедшим дедлайном, если бы каждая была на максимум.'
      )}">Накоп<span class="culms-gb-acc__sub">набрано / можно</span></th>` +
      actsHeadHtml();

    const head2 = columns
      .map(
        (col) =>
          `<th class="culms-gb-day ${colClass(col)}" scope="col" style="min-width:${col.minWidth}px">${esc(col.title)}` +
          `${col.sub ? `<span class="culms-gb-day__sub">${esc(col.sub)}</span>` : ''}</th>`
      )
      .join('');

    const rows = courses
      .map((course, courseIndex) => {
        const cells = columns
          .map((col, i) => {
            const { exams, tasks } = cellsByCourse[courseIndex][i];
            const chips =
              exams.map(examChipHtml).join('') + tasks.map((t) => chipHtml(t, maxWeight)).join('');
            return `<td class="culms-gb-cell ${colClass(col)}">${chips ? `<div class="culms-gb-chips">${chips}</div>` : ''}</td>`;
          })
          .join('');

        const hasAcc = course.accumulated != null;
        const archived = state.data.scope === 'archived';
        const accTitle = hasAcc
          ? `Набрано: ${fmtLms(course.accumulated)} из 10 — столько курс даст, если больше ничего не сдать.\n` +
            `К сегодняшнему дню можно было набрать ${fmtLms(course.possibleNow)}: все оценённые работы и работы с прошедшим дедлайном на максимум.` +
            (course.rate != null
              ? `\nНа оценённых работах — в среднем ${fmtNum(course.rate, 1)} из 10 (по этому и цвет).`
              : '') +
            (course.lmsTotal > 0 || archived ? `\nИтог в LMS: ${course.lmsTotal ?? '—'}` : '')
          : 'У курса нет активностей с весом';
        const name = displayCourseName(course.name);
        // В архиве главное — итоговая оценка курса: её LMS уже выставила.
        const final =
          archived && course.lmsTotal != null
            ? `<span class="culms-gb-acc__final">итог ${esc(course.lmsTotal)}</span>`
            : '';

        return (
          `<tr>` +
          `<th class="culms-gb-course culms-gb-sticky-l" scope="row">` +
          `<div class="culms-gb-course__row">` +
          `<a class="culms-gb-course__link" href="${BASE_PATH}/${course.section}/${course.id}/activity" title="${esc(name)}">${esc(name)}</a>` +
          `<button type="button" class="culms-gb-course__hide" data-hide-course="${course.id}"` +
          ` title="Скрыть курс" aria-label="${esc(`Скрыть курс «${name}»`)}">` +
          `${svgIcon(EYE_OFF_ICON)}</button>` +
          `</div>` +
          `${course.blocker ? '<span class="culms-gb-badge" title="Сработал блокер курса или активности">блокер</span>' : ''}` +
          `${!course.inSemester ? '<span class="culms-gb-badge is-muted">вне семестра</span>' : ''}` +
          `</th>` +
          cells +
          `<td class="culms-gb-acc culms-gb-sticky-r2" title="${esc(accTitle)}">` +
          `<span class="culms-gb-acc__value" data-band="${bandOf(course.rate)}">${hasAcc ? fmtLms(course.accumulated) : '—'}</span>` +
          `${hasAcc ? `<span class="culms-gb-acc__of">/ ${fmtLms(course.possibleNow)}</span>` : ''}` +
          `${final}</td>` +
          `<td class="culms-gb-acts culms-gb-sticky-r">${
            state.prefs.acts
              ? `<div class="culms-gb-acts__list">${activitiesHtml(course)}</div>`
              : ''
          }</td>` +
          `</tr>`
        );
      })
      .join('');

    return (
      `<div class="culms-gb-scroll">` +
      `<table class="culms-gb-table"><thead><tr>${head1}</tr><tr>${head2}</tr></thead>` +
      `<tbody>${rows}</tbody></table></div>`
    );
  }

  function renderProgress() {
    const el = document.querySelector(`#${VIEW_ID} .culms-gb-loading__progress`);
    if (el && state.progress?.total) {
      el.textContent = `курсы: ${state.progress.done} из ${state.progress.total}`;
    }
  }

  function renderView() {
    const view = document.getElementById(VIEW_ID);
    if (!view) return;

    view.className =
      `culms-gb culms-gb--mode-${state.prefs.mode}` +
      (state.prefs.acts ? '' : ' is-acts-collapsed');
    // Данные другого раздела (ушли из актуальных в архив) не показываем.
    const fresh = state.data && state.data.scope === state.scope;
    if (state.error && !fresh) {
      view.innerHTML =
        `<div class="culms-gb-empty">Не удалось собрать таблицу: ${esc(state.error.message || state.error)}` +
        `<button type="button" class="culms-gb-retry">Попробовать ещё раз</button></div>`;
      return;
    }
    if (!fresh) {
      view.innerHTML =
        `<div class="culms-gb-loading"><span class="culms-gb-spinner"></span>Собираем оценки по всем курсам…` +
        `<span class="culms-gb-loading__progress"></span></div>`;
      renderProgress();
      return;
    }

    const prevScroll = view.querySelector('.culms-gb-scroll')?.scrollLeft;
    state.tasksByKey.clear();
    // Скрытые курсы не входят ни в таблицу, ни в сводку, ни в легенду: их
    // убрали, чтобы не мешали. Остаются только в строке под таблицей.
    const all = visibleCourses();
    const courses = all.filter((c) => !state.hidden.has(c.id));
    const hidden = all.filter((c) => state.hidden.has(c.id));
    const { semesters } = state.data;
    const semesterPicker =
      semesters.length > 1
        ? `<div class="culms-gb-toolbar__group"><span class="culms-gb-toolbar__label">Семестр</span>${segmentedHtml(
            'semester',
            semesters.map((n) => ({ id: String(n), label: String(n) })),
            String(currentSemester())
          )}</div>`
        : '';

    view.innerHTML =
      `<div class="culms-gb-toolbar">` +
      semesterPicker +
      `<div class="culms-gb-toolbar__group"><span class="culms-gb-toolbar__label">Подсветка</span>${segmentedHtml('mode', MODES, state.prefs.mode)}</div>` +
      `<div class="culms-gb-toolbar__group"><span class="culms-gb-toolbar__label">Столбцы</span>${segmentedHtml('cols', COLUMN_MODES, state.prefs.cols)}</div>` +
      `<div class="culms-gb-toolbar__group">${checkboxHtml('offSemester', 'Курсы вне семестра')}${checkboxHtml('zeroWeight', 'Задания без веса')}</div>` +
      `<div class="culms-gb-toolbar__actions">` +
      `<button type="button" class="culms-gb-button" data-toggle="stats" aria-expanded="${state.prefs.stats}">${
        state.prefs.stats ? 'Скрыть сводку' : 'Показать сводку'
      }</button>` +
      `<button type="button" class="culms-gb-button culms-gb-refresh" title="Загрузить оценки заново">Обновить</button>` +
      `</div>` +
      `</div>` +
      (state.prefs.stats ? statsHtml(courses) : '') +
      legendHtml(courses) +
      tableHtml(courses, hidden.length) +
      hiddenBarHtml(hidden);

    const scroller = view.querySelector('.culms-gb-scroll');
    if (!scroller) return;
    if (prevScroll != null && state.scrolledToNow) {
      scroller.scrollLeft = prevScroll;
    } else if (state.data.scope === 'archived') {
      // Архив читают с начала семестра, даже если у какого-то курса дедлайн
      // (проект, пересдача) пришёлся на эту неделю.
      state.scrolledToNow = true;
    } else {
      scrollToNow(scroller);
    }
  }

  /** Прокрутка к текущей неделе: прошлое остаётся слева, за липким столбцом. */
  function scrollToNow(scroller) {
    const target =
      scroller.querySelector('thead .culms-gb-day.is-cur-week') ||
      [...scroller.querySelectorAll('thead .culms-gb-day:not(.is-past)')][0];
    const sticky = scroller.querySelector('thead .culms-gb-course');
    if (target && sticky) {
      scroller.scrollLeft = Math.max(0, target.offsetLeft - sticky.offsetWidth - 48);
    }
    state.scrolledToNow = true;
  }

  // --- ВСПЛЫВАЮЩАЯ КАРТОЧКА ЗАДАНИЯ ---

  let tipHideTimer = null;

  function getTip() {
    let tip = document.getElementById(TIP_ID);
    if (!tip) {
      tip = document.createElement('div');
      tip.id = TIP_ID;
      tip.className = 'culms-gb-tip';
      tip.setAttribute('role', 'tooltip');
      tip.addEventListener('mouseenter', () => clearTimeout(tipHideTimer));
      tip.addEventListener('mouseleave', scheduleHideTip);
      document.body.appendChild(tip);
    }
    return tip;
  }

  /** Карточка контрольной: что, на какой неделе и что день не известен. */
  function examTipHtml(exam) {
    const today = dayNumber(new Date());
    const weeksAhead = Math.round((exam.monday - mondayOf(today)) / 7);
    let when = 'на этой неделе';
    if (weeksAhead === 1) when = 'на следующей неделе';
    else if (weeksAhead > 1) when = `через ${weeksAhead} ${weeksWord(weeksAhead)}`;
    const label = weekLabel(exam.monday, semesterMonday(visibleCourses()));
    return (
      `<div class="culms-gb-tip__course">${esc(displayCourseName(exam.courseName))}</div>` +
      `<div class="culms-gb-tip__title">${svgIcon(EXAM_ICON)} ${esc(exam.name)}</div>` +
      `<dl class="culms-gb-tip__rows">` +
      `<dt>Когда</dt><dd><b>${esc(weekRange(exam.monday))}</b> · ${esc(when)}</dd>` +
      (label.startsWith('Неделя')
        ? `<dt>Неделя</dt><dd>${esc(label.replace('Неделя ', ''))} семестра</dd>`
        : '') +
      `</dl>` +
      `<div class="culms-gb-tip__weights"><div class="culms-gb-tip__hint">` +
      'Из расписания контрольных, как на странице курса. День внутри недели в нём не указан.' +
      `</div></div>` +
      `<a class="culms-gb-tip__link" href="${esc(exam.link)}">Открыть курс →</a>`
    );
  }

  // «через 2 недели», «через 5 недель».
  function weeksWord(n) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'неделю';
    return m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'недели' : 'недель';
  }

  function tipHtml(task) {
    if (task.type === 'exam') return examTipHtml(task);
    const activity = task.activity;
    const status = STATUS[task.status]?.label || task.status;
    const rows = [];
    rows.push([
      'Оценка',
      task.score != null
        ? `<b>${fmtNum(task.score)}</b> из ${fmtNum(task.max)}` +
          (task.extra
            ? ` <span class="culms-gb-muted">(в т. ч. +${fmtNum(task.extra)} бонус)</span>`
            : '')
        : '<span class="culms-gb-muted">ещё нет</span>',
    ]);
    rows.push([
      'Статус',
      `<span class="culms-gb-tip__status" data-status="${esc(task.status)}">${iconHtml(task.status)}${esc(status)}</span>`,
    ]);
    rows.push([
      'Дедлайн',
      task.deadline
        ? esc(fmtDeadline.format(task.deadline))
        : '<span class="culms-gb-muted">нет</span>',
    ]);

    return (
      `<div class="culms-gb-tip__course">${esc(displayCourseName(task.courseName))}</div>` +
      `<div class="culms-gb-tip__title">${esc(task.name)}</div>` +
      (task.important
        ? `<div class="culms-gb-tip__kind">Важная работа — ${esc(task.important)}</div>`
        : '') +
      (task.themeName ? `<div class="culms-gb-tip__theme">${esc(task.themeName)}</div>` : '') +
      `<dl class="culms-gb-tip__rows">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` +
      (activity ? tipWeightsHtml(task, activity) : '') +
      `<a class="culms-gb-tip__link" href="${esc(task.link)}">Открыть задание →</a>`
    );
  }

  /**
   * Два разных процента — доля активности в курсе и доля одного задания в
   * итоговой — стояли рядом и путались. Поэтому отдельный блок, где каждый
   * подписан, и пояснение, откуда берётся второй: доля активности делится на
   * число её работ.
   */
  function tipWeightsHtml(task, activity) {
    const line = (label, value) =>
      `<div class="culms-gb-tip__weight"><span class="culms-gb-tip__label">${label}:</span> ${value}</div>`;
    const activityLine = line(
      `Вес активности <span class="culms-gb-tip__name">«${esc(activity.name)}»</span>`,
      `<b>${fmtPercent(activity.weight)}</b>`
    );
    if (!(task.weight > 0)) {
      return (
        `<div class="culms-gb-tip__weights">${activityLine}` +
        line(
          'Вес одной задачи',
          '<span class="culms-gb-muted">не влияет на итоговую оценку</span>'
        ) +
        `</div>`
      );
    }

    const works = activity.best
      ? `одна из ${activity.best} ${genitive(activity.best, 'лучшей работы', 'лучших работ')}, что идут в зачёт`
      : `одна из ${activity.denominator} ${genitive(activity.denominator, 'работы', 'работ')} активности`;
    // Бонус из 1 балла весит в десять раз меньше обычного задания той же
    // активности — без этой оговорки «15% на 15 работ» не сходится с 0.1%.
    const scale = task.max !== 10 ? `, оценка из ${fmtNum(task.max)} вместо 10` : '';
    const gain = Number((task.weight * 10).toFixed(2));
    const share = fmtPercent(task.weight);
    return (
      `<div class="culms-gb-tip__weights">${activityLine}` +
      line(
        'Вес одной задачи',
        `<b>${share.startsWith('<') ? esc(share) : '≈' + share}</b> итоговой`
      ) +
      `<div class="culms-gb-tip__hint">${works}${scale} · до +${fmtNum(gain)} ${genitive(gain, 'балла', 'баллов')}</div>` +
      `</div>`
    );
  }

  function showTip(chip) {
    const task = state.tasksByKey.get(chip.dataset.key);
    if (!task) return;
    clearTimeout(tipHideTimer);
    const tip = getTip();
    tip.innerHTML = tipHtml(task);
    tip.classList.add('is-visible');

    const rect = chip.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const gap = 6;
    let top = rect.bottom + gap;
    if (top + tipRect.height > window.innerHeight - 8 && rect.top - gap - tipRect.height > 8) {
      top = rect.top - gap - tipRect.height;
    }
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
  }

  function scheduleHideTip() {
    clearTimeout(tipHideTimer);
    tipHideTimer = setTimeout(hideTip, 180);
  }

  function hideTip() {
    const tip = document.getElementById(TIP_ID);
    if (tip) tip.classList.remove('is-visible');
  }

  // --- СОБЫТИЯ ВНУТРИ ВКЛАДКИ ---

  function bindView(view) {
    view.addEventListener('click', (event) => {
      const target = event.target.closest('button, input');
      if (!target || !view.contains(target)) return;

      // Скрыть курс кнопкой в строке или вернуть из строки под таблицей.
      if (target.dataset.hideCourse || target.dataset.showCourse) {
        const hiding = Boolean(target.dataset.hideCourse);
        const attr = hiding ? 'data-hide-course' : 'data-show-course';
        const value = target.getAttribute(attr);
        const ids =
          value === 'all'
            ? [...view.querySelectorAll('[data-show-course]')]
                .map((button) => button.dataset.showCourse)
                .filter((id) => id !== 'all')
                .map(Number)
            : [Number(value)];
        // С клавиатуры (Enter или пробел) фокус не должен пропадать вместе с
        // кнопкой: переходит на соседнюю в том же ряду, а когда ряд опустел —
        // туда, куда ушёл курс.
        const keyboard = event.detail === 0;
        const next = keyboard && value !== 'all' ? neighbourCourse(target, attr) : null;
        for (const id of ids) {
          if (hiding) state.hidden.add(id);
          else state.hidden.delete(id);
        }
        saveHidden();
        hideTip();
        renderView();
        if (keyboard) {
          const focus =
            (next && view.querySelector(`[${attr}="${next}"]`)) ||
            view.querySelector(hiding ? '[data-show-course]' : `[data-hide-course="${ids[0]}"]`);
          focus?.focus();
        }
        return;
      }

      if (target.dataset.mode) {
        state.prefs.mode = target.dataset.mode;
        state.spot = null;
      } else if (target.dataset.cols) {
        state.prefs.cols = target.dataset.cols;
        state.scrolledToNow = false;
      } else if (target.dataset.pref) {
        state.prefs[target.dataset.pref] = target.checked;
      } else if (target.dataset.semester) {
        state.semester = Number(target.dataset.semester);
        state.spot = null;
        state.scrolledToNow = false;
      } else if (target.dataset.toggle === 'stats') {
        state.prefs.stats = !state.prefs.stats;
      } else if (target.dataset.toggle === 'acts') {
        state.prefs.acts = !state.prefs.acts;
      } else if (target.dataset.spot !== undefined) {
        const spot = target.dataset.spot || null;
        state.spot = state.spot === spot ? null : spot;
        // Выделение по статусу без цветов статусов читается плохо.
        if (state.spot?.startsWith('status:') && state.prefs.mode !== 'status') {
          state.prefs.mode = 'status';
        } else if (state.spot?.startsWith('band:') && state.prefs.mode !== 'grade') {
          state.prefs.mode = 'grade';
        }
      } else if (target.classList.contains('culms-gb-refresh')) {
        refresh(true);
        return;
      } else if (target.classList.contains('culms-gb-retry')) {
        refresh(true);
        return;
      } else {
        return;
      }
      savePrefs();
      hideTip();
      renderView();
    });

    view.addEventListener('mouseover', (event) => {
      const chip = event.target.closest('.culms-gb-chip[data-key]');
      if (chip) showTip(chip);
    });
    view.addEventListener('mouseout', (event) => {
      const chip = event.target.closest('.culms-gb-chip[data-key]');
      if (chip && !chip.contains(event.relatedTarget)) scheduleHideTip();
    });
    view.addEventListener('focusin', (event) => {
      const chip = event.target.closest('.culms-gb-chip[data-key]');
      if (chip) showTip(chip);
    });
    view.addEventListener('focusout', scheduleHideTip);
    // Не пассивный: иначе страницу, которую колесо листает по умолчанию, не
    // остановить.
    view.addEventListener('wheel', onTableWheel, { passive: false });
  }

  /**
   * Курс соседней кнопки того же ряда — строк таблицы или скрытых курсов под
   * ней: следующей, а у последней — предыдущей.
   */
  function neighbourCourse(button, attr) {
    const row = button.parentElement.closest('tbody, .culms-gb-hidden');
    const buttons = [...row.querySelectorAll(`[${attr}]:not([${attr}="all"])`)];
    const index = buttons.indexOf(button);
    return (buttons[index + 1] || buttons[index - 1])?.getAttribute(attr) || null;
  }

  // Колесо мыши над таблицей листает недели, а не страницу: по вертикали в
  // самой таблице листать нечего. Каждый следующий щелчок считается от цели,
  // а не от текущего положения — иначе плавная прокрутка, не успев доехать,
  // съедала бы часть пути.
  const wheel = { scroller: null, target: null, timer: null };

  function onTableWheel(event) {
    const scroller = event.target.closest?.('.culms-gb-scroll');
    // Ctrl+колесо — масштаб, Shift+колесо браузер и так листает вбок, а
    // тачпад, который ведут вбок, листает таблицу сам.
    if (!scroller || event.ctrlKey || event.shiftKey) return;
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;

    // Firefox меряет колесо строками, изредка — страницами.
    const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? scroller.clientWidth : 1;
    const max = scroller.scrollWidth - scroller.clientWidth;
    if (wheel.scroller !== scroller) {
      // Таблицу перерисовали — старая цель к новой не относится.
      wheel.scroller = scroller;
      wheel.target = null;
    }
    const from = wheel.target ?? scroller.scrollLeft;
    const to = Math.max(0, Math.min(max, from + event.deltaY * unit));
    // Упёрлись в край — отдаём прокрутку странице, иначе из-под таблицы,
    // занимающей пол-экрана, было бы не выбраться.
    if (Math.abs(to - from) < 1) return;

    event.preventDefault();
    wheel.target = to;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({ left: to, behavior: calm ? 'auto' : 'smooth' });
    clearTimeout(wheel.timer);
    wheel.timer = setTimeout(() => {
      wheel.target = null;
    }, 250);
  }

  async function refresh(force) {
    const scope = state.scope;
    // Расписание контрольных грузится рядом и таблицу не задерживает: пока
    // его нет, она просто без контрольных. Переключатель в меню мог
    // поменяться, пока вкладка была закрыта, — поэтому каждый раз.
    if (scope === 'actual') refreshExams();
    if (state.loading && state.loading.scope === scope) {
      // Вкладку открыли заново, пока данные ещё едут, — показываем загрузку.
      renderView();
      return state.loading;
    }
    const fresh = state.data?.scope === scope && Date.now() - state.loadedAt < DATA_TTL_MS;
    if (!force && fresh) {
      renderView();
      return;
    }
    state.error = null;
    if (force) state.data = null;
    // Ушли в другой раздел, пока грузился прежний, — ответ прежнего уже не
    // нужен: по номеру загрузки отличаем свою от устаревшей.
    const token = ++state.loadToken;
    const loading = Promise.all([loadData(scope), loadHidden()])
      .then(([data]) => {
        if (token !== state.loadToken) return;
        state.data = data;
        state.loadedAt = Date.now();
      })
      .catch((error) => {
        if (token !== state.loadToken) return;
        console.error('[CU LMS] Сводная таблица:', error);
        state.error = error;
      })
      .finally(() => {
        if (token !== state.loadToken) return;
        state.loading = null;
        renderView();
      });
    loading.scope = scope;
    state.loading = loading;
    return loading;
  }

  // --- ВКЛАДКА ---

  /** Раздел ведомостей по адресу: 'actual', 'archived' или null — не список. */
  function scopeOf(pathname) {
    const match = pathname.match(
      /^\/learn\/reports\/student-performance\/(actual|archived)(?:\/|$)/
    );
    return match && !pathname.includes('/activity') ? match[1] : null;
  }

  function isStatementsPage() {
    return scopeOf(location.pathname) != null;
  }

  /** Родная вкладка ведомостей, а не шапки сайта или чего-то ещё. */
  function isStatementsLink(link) {
    return (link.getAttribute('href') || '').startsWith(`${BASE_PATH}/`);
  }

  /** Вкладки ведомостей: те, среди которых есть «Курсы вне семестра». */
  function findTabs() {
    const link = document.querySelector('tui-tabs a[href$="/without-semester"]');
    return link ? link.closest('tui-tabs') : null;
  }

  /**
   * Неглубокая копия родной вкладки: берём атрибуты Angular, по которым Taiga
   * красит вкладки, но не слушатели routerLink.
   */
  function cloneTab(template, id) {
    const link = template.cloneNode(false);
    link.id = id;
    link.classList.remove('active', '_active');
    link.removeAttribute('routerlinkactive');
    link.setAttribute('href', tabHref());
    link.setAttribute('tabindex', '-1');
    link.textContent = ' Сводная таблица ';
    link.addEventListener('click', onTabClick);
    return link;
  }

  function onTabClick(event) {
    // Ctrl/Cmd/Shift-клик — открыть в новой вкладке, как у обычной ссылки.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const fromMore = event.currentTarget.id === MORE_ID;
    state.open = true;
    activate();
    if (fromMore) closeMoreDropdown();
  }

  /** Адрес сводной для «открыть в новой вкладке» — в текущем разделе. */
  function tabHref() {
    return `${BASE_PATH}/${scopeOf(location.pathname) || 'actual'}/by-semester${HASH}`;
  }

  function ensureTab(tabs) {
    let tab = document.getElementById(TAB_ID);
    // Не `parentElement`: Taiga заворачивает вкладки в свои обёртки.
    if (tab && tabs.contains(tab)) {
      // Ряд вкладок один и тот же в актуальных и в архиве.
      if (tab.getAttribute('href') !== tabHref()) tab.setAttribute('href', tabHref());
      return tab;
    }
    if (tab) tab.remove();

    const native = [...tabs.querySelectorAll('a[tuitab]')].filter((a) => a.id !== TAB_ID);
    const template = native[native.length - 1];
    if (!template) return null;

    tab = cloneTab(template, TAB_ID);
    template.after(tab);
    return tab;
  }

  /**
   * Узкий экран. Taiga прячет не влезшие вкладки в «Ещё», но только свои:
   * нашу она учитывает в ширине строки (считает все `[tuiTab]`), а спрятать не
   * умеет — и та выталкивает «Ещё» за край. Поэтому повторяем первую проверку
   * Taiga — влезает ли строка целиком — и если нет, складываем нашу вкладку
   * сами и дописываем её пунктом в «Ещё».
   *
   * Складываем так же, как Taiga свои (см. gradebook.css): ширина в ноль, а
   * содержимое на месте. Её подсчёт идёт по `scrollWidth`, и он от этого не
   * меняется — значит, решение Taiga и наше не раскачивают друг друга.
   */
  function syncFold(tabs, tab) {
    const host = tabs.closest('tui-tabs-with-more');
    const more = host?.querySelector(':scope > button');
    if (!host || !more) return;

    const all = [...host.querySelectorAll('[tuitab]')];
    const margin = (host.dataset.size || tabs.dataset.size) === 'l' ? 24 : 16;
    const row =
      all.reduce((sum, el) => sum + el.scrollWidth, 0) +
      (all.length - 2) * margin -
      (all[all.length - 1]?.scrollWidth ?? 0);
    const folded = row > host.clientWidth;

    tab.classList.toggle('culms-gb-tab-folded', folded);
    // Родные влезли, и Taiga «Ещё» не показывает — показываем сами, иначе до
    // сводной не добраться.
    host.classList.toggle('culms-gb-force-more', folded && more.classList.contains('t-overflown'));
    more.classList.toggle('culms-gb-more-active', folded && state.active);
    if (folded) ensureMoreItem(host);
  }

  /** Список «Ещё» Taiga собирает из своих шаблонов — нашего пункта в нём нет. */
  function ensureMoreItem(host) {
    const list = [...document.querySelectorAll('tui-dropdown:not(.tui-leave) .t-dropdown')].find(
      (el) => {
        const links = [...el.querySelectorAll('a[tuitab]')].filter((a) => a.id !== MORE_ID);
        // Список ведомостей — по ссылкам на свои вкладки. Пустой бывает только
        // у «Ещё», который показали мы сами: родные тогда все в строке.
        return links.length
          ? links.some(isStatementsLink)
          : host.classList.contains('culms-gb-force-more');
      }
    );
    if (!list || list.querySelector(`#${MORE_ID}`)) return;

    const template = document.getElementById(TAB_ID);
    const sibling = list.querySelector('.t-dropdown-item');
    const wrapper = sibling ? sibling.cloneNode(false) : document.createElement('div');
    if (!sibling) {
      // Стили списка привязаны к атрибуту компонента — берём его у самого списка.
      for (const { name, value } of list.attributes) {
        if (name.startsWith('_ngcontent')) wrapper.setAttribute(name, value);
      }
      wrapper.className = 't-dropdown-item';
    }
    wrapper.appendChild(cloneTab(template, MORE_ID));
    list.appendChild(wrapper);
  }

  /**
   * Список «Ещё» Taiga закрывает, когда фокус уходит из него, а на щелчки,
   * сделанные скриптом, не реагирует. Поэтому уводим фокус на нашу таблицу.
   */
  function closeMoreDropdown() {
    const view = document.getElementById(VIEW_ID);
    if (!view) return;
    view.setAttribute('tabindex', '-1');
    view.focus({ preventScroll: true });
  }

  // Клик по родной вкладке ведомостей — и в строке, и в списке «Ещё», который
  // Taiga рисует вне вкладок, — уходим со своей раньше, чем Angular
  // перерисует содержимое: иначе на миг видны обе. Перехват на document
  // срабатывает раньше обработчиков самих ссылок.
  document.addEventListener(
    'click',
    (event) => {
      const link = event.target.closest?.('a[tuitab]');
      if (!link || link.id === TAB_ID || link.id === MORE_ID || !isStatementsPage()) return;
      if (!isStatementsLink(link)) return;
      state.open = false;
      if (state.active) deactivate();
    },
    true
  );

  function ensureView(section, tabsWrapper) {
    let view = document.getElementById(VIEW_ID);
    if (view && view.parentElement === section) return view;
    if (view) view.remove();
    view = document.createElement('div');
    view.id = VIEW_ID;
    view.className = 'culms-gb';
    tabsWrapper.after(view);
    bindView(view);
    return view;
  }

  function activate() {
    const tabs = findTabs();
    if (!tabs) return;
    const tab = ensureTab(tabs);
    const tabsWrapper = tabs.closest('tui-tabs-with-more') || tabs;
    const section = tabsWrapper.parentElement;
    if (!tab || !section) return;

    // Из актуальных в архив Angular переходит без перезагрузки, и вкладка
    // может остаться открытой — тогда это другой раздел со своими данными.
    const scope = scopeOf(location.pathname);
    const scopeChanged = state.scope !== scope;
    if (scopeChanged) {
      state.scope = scope;
      state.semester = null;
      state.spot = null;
    }

    const wasActive = state.active;
    state.active = true;
    if (!wasActive || scopeChanged) state.scrolledToNow = false;

    // Свой класс, а не `_active`: его Taiga расставляет сама и с копии снимает.
    tabs.classList.add('culms-gb-tab-on');
    tab.classList.add('culms-gb-tab-active');
    tab.setAttribute('tabindex', '0');
    section.classList.add('culms-gb-on');
    ensureView(section, tabsWrapper);

    if (!wasActive || scopeChanged) refresh(false);
    else if (!document.querySelector(`#${VIEW_ID} > *`)) renderView();
  }

  function deactivate() {
    state.active = false;
    hideTip();
    document
      .querySelectorAll('.culms-gb-tab-on')
      .forEach((el) => el.classList.remove('culms-gb-tab-on'));
    document.querySelectorAll('.culms-gb-on').forEach((el) => el.classList.remove('culms-gb-on'));
    document
      .querySelectorAll('.culms-gb-more-active')
      .forEach((el) => el.classList.remove('culms-gb-more-active'));
    const tab = document.getElementById(TAB_ID);
    if (tab) {
      tab.classList.remove('culms-gb-tab-active');
      tab.setAttribute('tabindex', '-1');
    }
    document.getElementById(VIEW_ID)?.remove();
    // Пришли по ссылке с `#gradebook` — уходя, убираем его, иначе следующая
    // проверка по адресу открыла бы сводную снова.
    if (location.hash === HASH) {
      history.replaceState(history.state, '', location.pathname + location.search);
    }
  }

  // --- СИНХРОНИЗАЦИЯ СО SPA ---

  function sync() {
    // Скрипт живёт, пока живёт SPA. Ушли из ведомостей в другой раздел —
    // следующий вход снова на «Курсах по семестрам». Страница курса
    // (`…/activity`) — ещё ведомости: вернувшись с неё, попадаем в сводную.
    if (!location.pathname.startsWith(BASE_PATH)) state.open = false;
    if (!isStatementsPage()) {
      if (state.active) deactivate();
      return;
    }
    const tabs = findTabs();
    if (!tabs) return;
    const tab = ensureTab(tabs);
    if (!tab) return;

    // Ссылка из закладки или «открыть в новой вкладке» — тоже выбор сводной.
    if (location.hash === HASH) state.open = true;

    if (state.open) {
      // Angular мог перерисовать раздел — возвращаем классы и содержимое.
      const section = (tabs.closest('tui-tabs-with-more') || tabs).parentElement;
      if (
        !state.active ||
        state.scope !== scopeOf(location.pathname) ||
        !section?.classList.contains('culms-gb-on') ||
        !document.getElementById(VIEW_ID) ||
        !tabs.classList.contains('culms-gb-tab-on') ||
        !tab.classList.contains('culms-gb-tab-active')
      ) {
        activate();
      }
    } else if (state.active) {
      deactivate();
    }

    syncFold(tabs, tab);
    observeTabsHost(tabs);
  }

  // Taiga прячет вкладки в «Ещё», переключая только классы, а общий
  // наблюдатель смотрит лишь на добавление узлов. За классами строки вкладок
  // следим отдельно — строка маленькая, это дёшево.
  let observedHost = null;
  function observeTabsHost(tabs) {
    const host = tabs.closest('tui-tabs-with-more');
    if (!host || host === observedHost) return;
    observedHost = host;
    new MutationObserver(queueSync).observe(host, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });
  }

  // Таймер, а не requestAnimationFrame: rAF в фоновой вкладке не срабатывает,
  // и открытая в фоне ведомость осталась бы без вкладки до первого показа.
  let syncQueued = false;
  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    setTimeout(() => {
      syncQueued = false;
      sync();
    }, 30);
  }

  new MutationObserver(queueSync).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', queueSync);
  // Карточка стоит в `position: fixed` и при прокрутке или смене размера
  // осталась бы висеть над чужой клеткой. Перехват на window ловит прокрутку
  // и страницы, и таблицы.
  window.addEventListener('scroll', hideTip, { capture: true, passive: true });
  window.addEventListener('resize', () => {
    hideTip();
    // Taiga прячет вкладки в «Ещё» по ширине, меняя только классы, — это
    // наблюдатель за списком узлов не видит.
    queueSync();
  });
  queueSync();
})();
