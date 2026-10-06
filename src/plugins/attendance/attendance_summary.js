// attendance_summary.js — «Посещаемость курсов»: сводная по семинарам.
//
// Родная страница показывает по курсу только «N из M за весь семестр», а
// внутри курса — пары одного дня, и чтобы проверить себя, надо помнить даты
// занятий и перебирать их в календаре. Здесь:
//
//   * в колонке «За весь семестр» под числом LMS — сколько из уже прошедших
//     семинаров посещено, и сколько можно набрать к концу семестра (как
//     «Накоплено … из …» в ведомости);
//   * вкладка «Сводная» рядом с «Актуальные / Архивные» в двух видах:
//       — «Таблица»: курсы × недели семестра, в клетке — свои семинары
//         недели: был / не был / ждёт отметки / впереди;
//       — «По неделям»: одна неделя списком по дням, листается стрелками.
//     Если в меню включено «Видеть предстоящие контрольные», недели с
//     контрольной помечены флажком — на таких семинар лучше не пропускать.
//
// Лекции LMS в посещаемость не отдаёт — считаются только семинары. Данные
// собирает attendance_api.js (`window.cuLmsAttendance`).
//
// Вкладка своя, а не роут Angular, как «Сводная таблица» в ведомостях: клон
// родной вкладки, клик по нему перехватываем, родное содержимое прячем
// классом. `#summary` в адресе — только для «открыть в новой вкладке».

(function () {
  'use strict';

  if (window.__culmsAttendanceSummaryLoaded) return;
  window.__culmsAttendanceSummaryLoaded = true;

  const LIST_PATH = '/learn/attendance/courses';
  const HASH = '#summary';
  const TAB_ID = 'culms-att-tab';
  const VIEW_ID = 'culms-attendance';
  const NATIVE_CLASS = 'culms-att-native';
  const PREFS_KEY = 'culms.attendance.prefs';
  const EXAMS_TOGGLE = 'futureExamsViewToggle';

  const VIEWS = [
    { id: 'table', label: 'Таблица' },
    { id: 'week', label: 'По неделям' },
  ];

  const STATUS = {
    attended: { label: 'Был', icon: '<path d="M3.5 8.5l3 3 6-7"/>' },
    missed: { label: 'Не был', icon: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>' },
    pending: {
      label: 'Ждёт отметки',
      icon: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/>',
    },
    upcoming: { label: 'Впереди', icon: '' },
    none: { label: 'Пары не было', icon: '<path d="M5 8h6"/>' },
  };
  // Флажок контрольной — как в сводной ведомостей.
  const EXAM_ICON = '<path d="M4 14V2.5"/><path d="M4 3h8l-2 3 2 3H4"/>';

  const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const fmtDayMonth = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });
  const fmtLong = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
  const fmtShort = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

  const state = {
    open: false,
    active: false,
    data: null,
    loading: null,
    error: null,
    progress: null,
    prefs: loadPrefs(),
    // Неделя в виде «По неделям» — понедельник; null — текущая.
    week: null,
    exams: null,
    examsToken: 0,
    // Был ли уже заход на список в этот раз: уход в курс и назад — новый заход.
    entered: false,
  };

  const log = (...args) =>
    typeof window.cuLmsLog === 'function' ? window.cuLmsLog('[Attendance]', ...args) : undefined;

  const api = () => window.cuLmsAttendance;

  // --- НАСТРОЙКИ ВИДА ---
  // Вид — удобство страницы, поэтому localStorage, как у сводной ведомостей.

  function loadPrefs() {
    const defaults = { view: 'table', norm: window.cuLmsAttendance?.DEFAULT_NORM ?? 75 };
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      const norm = Number(saved.norm);
      return {
        view: VIEWS.some((v) => v.id === saved.view) ? saved.view : defaults.view,
        norm: Number.isFinite(norm) && norm >= 0 && norm <= 100 ? norm : defaults.norm,
      };
    } catch {
      return defaults;
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
    } catch {
      // приватный режим — вид просто не запомнится
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

  function svgIcon(body, cls = 'culms-att-icon') {
    return body ? `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>` : '';
  }

  function pct(fraction) {
    return fraction == null ? '—' : Math.round(fraction * 100) + '%';
  }

  /** Цвет доли посещений относительно нормы: ok / warn (в 15 п.п. ниже) / bad. */
  function levelOf(rate) {
    if (rate == null) return 'none';
    const norm = state.prefs.norm / 100;
    if (rate >= norm) return 'ok';
    if (rate >= norm - 0.15) return 'warn';
    return 'bad';
  }

  function displayCourseName(name) {
    const names = window.cuLmsCourseNames;
    return names && typeof names.toDisplay === 'function' ? names.toDisplay(name) : name;
  }

  /**
   * Ключ для сравнения названий: только буквы и цифры. «Сердечки» меняют 🔴
   * на ❤️ прямо в тексте страницы, а в API эмодзи прежний.
   */
  function nameKey(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  /**
   * Ключи названия в строке родной таблицы. Свои названия курсов
   * (_shared/course_names.js) подменяют текст ячейки, а оригинал держат в
   * `data-culms-orig-name` — спрашиваем его через `cuLmsCourseNames`.
   */
  function rowNameKeys(row) {
    const cell = row.querySelector('.name-cell');
    const text = cell?.textContent?.trim() || '';
    const names = window.cuLmsCourseNames;
    const keys = new Set([nameKey(text)]);
    if (cell && names) {
      const target = cell.querySelector('[data-culms-orig-name]') || cell;
      if (typeof names.originalFor === 'function')
        keys.add(nameKey(names.originalFor(target, text)));
      if (typeof names.toOriginal === 'function') keys.add(nameKey(names.toOriginal(text)));
    }
    keys.delete('');
    return keys;
  }

  /** Курс строки родной таблицы: у строк нет id, только название. */
  function courseOfRow(row, byKey) {
    for (const key of rowNameKeys(row)) {
      const course = byKey.get(key);
      if (course) return course;
    }
    return null;
  }

  function coursesByKey() {
    const byKey = new Map();
    for (const c of state.data?.courses || []) {
      byKey.set(nameKey(c.name), c);
      // Своё название тоже ключ — на случай, если оригинал в разметке потерялся.
      const shown = nameKey(displayCourseName(c.name));
      if (shown && !byKey.has(shown)) byKey.set(shown, c);
    }
    return byKey;
  }

  function sessionTitle(course, s) {
    const a = api();
    const date = a.dateOf(s.day);
    const parts = [
      `${displayCourseName(course.name)}`,
      `${WEEKDAYS[a.weekdayOf(s.day)]}, ${fmtLong.format(date)}${s.startTime ? `, ${s.startTime}–${s.endTime}` : ''}`,
      `Семинар${s.row ? ' ' + s.row : ''}${s.hosts?.length ? ' · ' + s.hosts.join(', ') : ''}${s.place ? ' · ' + s.place : ''}`,
      STATUS[s.status]?.label || '',
    ];
    if (s.status === 'pending') parts.push('LMS ставит отметку в течение недели после пары');
    if (s.status === 'none') parts.push('В этот день своей пары в LMS нет — перенос или праздник');
    return parts.filter(Boolean).join('\n');
  }

  function markHtml(course, s) {
    return (
      `<span class="culms-att-mark is-${s.status}" title="${esc(sessionTitle(course, s))}">` +
      svgIcon(STATUS[s.status]?.icon) +
      `</span>`
    );
  }

  function extApi() {
    if (typeof browser !== 'undefined' && browser?.storage) return browser;
    if (typeof chrome !== 'undefined' && chrome?.storage) return chrome;
    return null;
  }

  // --- КОНТРОЛЬНЫЕ ---
  // То же расписание, что в сводной ведомостей и на странице курса
  // (course-view/future_exams_api.js), и только когда в меню включено
  // «Видеть предстоящие контрольные».

  async function loadExamSchedule() {
    const ext = extApi();
    const exams = window.cuLmsFutureExams;
    if (!ext || !exams) return null;
    try {
      const settings = await ext.storage.sync.get(EXAMS_TOGGLE);
      if (!settings?.[EXAMS_TOGGLE]) return null;
      return await exams.load();
    } catch (error) {
      log('расписание контрольных недоступно', error);
      return null;
    }
  }

  function refreshExams() {
    const token = ++state.examsToken;
    loadExamSchedule().then((exams) => {
      if (token !== state.examsToken) return;
      state.exams = exams?.schedule ? exams : null;
      if (state.active) renderView();
    });
  }

  /** Map<courseId, [{ monday, name }]> — контрольные курсов по неделям. */
  function examsByCourse(courses) {
    const out = new Map();
    const examsApi = window.cuLmsFutureExams;
    if (!state.exams || !examsApi) return out;
    const { schedule, config } = state.exams;
    const matched = examsApi.matchCourses(
      courses.map((c) => ({ id: c.id, name: c.name })),
      schedule
    );
    const start = examsApi.semesterStartDay(config);
    for (const { course, key } of matched) {
      const list = (schedule[key] || [])
        .map((item) => {
          const name = typeof item?.name === 'string' ? item.name.trim() : '';
          const day = name ? examsApi.resolveDay(item.date, start) : null;
          return day == null ? null : { monday: api().mondayOf(day), name };
        })
        .filter(Boolean);
      out.set(course.id, list);
    }
    return out;
  }

  // --- ДАННЫЕ ---

  function refresh(force) {
    if (!api()) return Promise.resolve();
    if (state.loading && !force) return state.loading;
    state.error = null;
    state.progress = { done: 0, total: 0 };
    if (force) api().invalidate();
    const promise = api()
      .load({
        force,
        onProgress: (progress) => {
          state.progress = progress;
          renderProgress();
        },
      })
      .then((data) => {
        if (state.loading !== promise) return;
        state.data = data;
        state.loading = null;
        renderAll();
      })
      .catch((error) => {
        if (state.loading !== promise) return;
        log('посещаемость не загрузилась', error);
        state.error = String(error?.message || error);
        state.loading = null;
        renderAll();
      });
    state.loading = promise;
    renderAll();
    return promise;
  }

  function renderAll() {
    decorateNative();
    if (state.active) renderView();
  }

  // --- РОДНАЯ ТАБЛИЦА: ДОПИСКА В «ЗА ВЕСЬ СЕМЕСТР» ---

  function isArchived() {
    return new URLSearchParams(location.search).get('isArchived') === 'true';
  }

  function decorateNative() {
    const host = document.querySelector('cu-courses-attendance');
    if (!host) return;
    const rows = host.querySelectorAll('tr.course-row');
    if (isArchived() || !state.data) {
      host
        .querySelectorAll(`.${NATIVE_CLASS}, .${NATIVE_TOTAL_CLASS}`)
        .forEach((el) => el.remove());
      return;
    }
    const byKey = coursesByKey();
    let shown = false;
    rows.forEach((row) => {
      const course = courseOfRow(row, byKey);
      const cell = row.lastElementChild;
      if (!cell) return;
      const html = course ? nativeNoteHtml(course) : '';
      let note = cell.querySelector(`.${NATIVE_CLASS}`);
      if (!html) {
        note?.remove();
        return;
      }
      if (!note) {
        note = document.createElement('div');
        note.className = NATIVE_CLASS;
        cell.appendChild(note);
      }
      if (note.dataset.html !== html) {
        note.innerHTML = html;
        note.dataset.html = html;
      }
      shown = true;
    });
    syncNativeLegend(host, shown);
    syncNativeTotal(host, shown);
  }

  const NATIVE_TOTAL_CLASS = 'culms-att-native-total';

  /**
   * Строка «Всего» под родной таблицей: по всем курсам с посещаемостью сразу,
   * в том же виде «был / мог быть / всего» и с процентом. Процент — сумма
   * посещённых к сумме прошедших с отметкой (как карточка в «Сводной»), а не
   * среднее процентов курсов. Строка живёт в `<tfoot>`, а не в `<tbody>`:
   * Angular перерисовывает строки курсов и мог бы её унести. Ячейки берут
   * разметку у строки курса (клон без содержимого) — стили родной таблицы
   * привязаны к атрибутам Angular, у чужих элементов их нет.
   */
  function syncNativeTotal(host, shown) {
    const table = host.querySelector('table.cu-table');
    let foot = table?.querySelector(`:scope > tfoot.${NATIVE_TOTAL_CLASS}`);
    const counted = shown ? state.data.courses.filter((c) => c.counts) : [];
    const sum = (key) => counted.reduce((total, c) => total + c.counts[key], 0);
    const could = sum('settled') + sum('pending');
    if (!table || !counted.length || !could) {
      foot?.remove();
      return;
    }
    const attended = sum('attended');
    const settled = sum('settled');
    const semester = sum('semester');
    const rate = settled ? attended / settled : null;
    const cells = table.querySelectorAll('thead th').length || 4;
    const title =
      `Был на ${attended} из ${could} прошедших семинаров по ${counted.length} курсам, всего за семестр ${semester}
` + `${pct(rate)} — посещено из прошедших с отметкой (все курсы вместе)`;
    const html =
      `<span class="culms-att-kda" title="${esc(title)}">` +
      `<b class="culms-att-native__rate is-${levelOf(rate)}">${attended}</b><i>/</i>` +
      `<span>${could}</span><i>/</i><span class="culms-att-native__muted">${semester}</span></span>` +
      `<div class="culms-att-native__muted">${pct(rate)} посещено</div>`;
    if (!foot) {
      foot = document.createElement('tfoot');
      foot.className = NATIVE_TOTAL_CLASS;
      const sample = table.querySelector('tbody tr.course-row');
      const row = sample ? sample.cloneNode(false) : document.createElement('tr');
      row.className = '';
      for (const name of ['data-id', 'tabindex', 'role']) row.removeAttribute(name);
      const sampleCells = sample ? [...sample.children] : [];
      for (let i = 0; i < cells; i++) {
        const cell = sampleCells[i]
          ? sampleCells[i].cloneNode(false)
          : document.createElement('td');
        cell.className = '';
        row.append(cell);
      }
      row.firstElementChild.textContent = 'Всего';
      foot.append(row);
    }
    if (foot.previousElementSibling?.tagName !== 'TBODY') table.append(foot);
    const last = foot.firstElementChild.lastElementChild;
    if (last.dataset.html !== html) {
      last.innerHTML = html;
      last.dataset.html = html;
    }
  }

  /**
   * Одна строка, как K/D/A: «был / мог быть / всего». «Мог быть» — все свои
   * семинары, которые уже прошли (и те, что ещё ждут отметки), «всего» — за
   * семестр по LMS. Цвет «был» — доля посещённых относительно нормы. Что
   * значат числа — в подписи под таблицей (nativeLegendHtml) и в подсказке.
   */
  function nativeNoteHtml(course) {
    const c = course.counts;
    const could = c ? c.settled + c.pending : 0;
    if (!could) return '';
    const title =
      `Был на ${c.attended} из ${could} прошедших семинаров, всего за семестр ${c.semester}\n` +
      `${pct(c.rate)} — посещено из прошедших с отметкой` +
      (c.pending ? `\nЕщё ${c.pending} — меньше недели назад, LMS может поставить отметку` : '') +
      `\nЕсли ходить на все оставшиеся — ${c.max} из ${c.semester}`;
    return (
      `<span class="culms-att-kda" title="${esc(title)}">` +
      `<b class="culms-att-native__rate is-${levelOf(c.rate)}">${c.attended}</b><i>/</i>` +
      `<span>${could}</span><i>/</i>` +
      `<span class="culms-att-native__muted">${c.semester}</span></span>`
    );
  }

  const NATIVE_LEGEND_ID = 'culms-att-native-legend';

  function nativeLegendHtml() {
    return (
      `<span class="culms-att-kda"><b>был</b><i>/</i><span>мог быть</span><i>/</i>` +
      `<span class="culms-att-native__muted">всего</span></span>` +
      ` — свои семинары: посещено / уже прошло / за семестр. ` +
      `Цвет «был» — относительно нормы ${state.prefs.norm}%: зелёный — не ниже, жёлтый — до 15 п.п. ниже, ` +
      `красный — ещё ниже (норма меняется во вкладке «Сводная»). ` +
      `Пару меньше недели назад LMS может ещё не отметить. Лекции LMS не отмечает. ` +
      esc(state.data ? trackingNote() : '')
    );
  }

  /** Подпись под родной таблицей — одна на страницу, только когда есть дописки. */
  function syncNativeLegend(host, shown) {
    let legend = document.getElementById(NATIVE_LEGEND_ID);
    const table = host.querySelector('table.cu-table');
    if (!shown || !table) {
      legend?.remove();
      return;
    }
    if (!legend || legend.previousElementSibling !== table) {
      legend?.remove();
      legend = document.createElement('div');
      legend.id = NATIVE_LEGEND_ID;
      legend.className = 'culms-att-native culms-att-native-legend';
      table.after(legend);
    }
    // Норму могли поменять во вкладке «Сводная».
    const html = nativeLegendHtml();
    if (legend.dataset.html !== html) {
      legend.innerHTML = html;
      legend.dataset.html = html;
    }
  }

  // --- ВКЛАДКА ---

  function isListPage() {
    return location.pathname.replace(/\/+$/, '') === LIST_PATH;
  }

  function findTabs() {
    return document.querySelector('cu-courses-attendance cu-tabs .tabs-container');
  }

  function nativeTabs(container) {
    return [...container.querySelectorAll('a.tab')].filter((a) => a.id !== TAB_ID);
  }

  function ensureTab(container) {
    let tab = document.getElementById(TAB_ID);
    if (tab && container.contains(tab)) return tab;
    tab?.remove();
    const native = nativeTabs(container);
    const template = native[native.length - 1];
    if (!template) return null;
    // Глубокая копия: внутри span с типографикой Taiga. Слушатели routerLink
    // не копируются.
    tab = template.cloneNode(true);
    tab.id = TAB_ID;
    tab.classList.remove('active');
    tab.removeAttribute('routerlinkactive');
    tab.setAttribute('href', LIST_PATH + HASH);
    const label = tab.querySelector('span') || tab;
    label.textContent = 'Сводная';
    tab.addEventListener('click', onTabClick);
    template.after(tab);
    return tab;
  }

  function onTabClick(event) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    state.open = true;
    activate();
  }

  // Клик по родной вкладке — уходим со своей раньше, чем Angular перерисует.
  document.addEventListener(
    'click',
    (event) => {
      const link = event.target.closest?.('cu-courses-attendance cu-tabs a.tab');
      if (!link || link.id === TAB_ID) return;
      state.open = false;
      if (state.active) deactivate();
    },
    true
  );

  /**
   * Подсветка вкладок. Родная «Актуальные» держит класс `active` от
   * routerLinkActive; пока открыта наша, снимаем его и помечаем, чтобы потом
   * вернуть ровно туда, куда указывает адрес.
   */
  function syncTabHighlight(container, tab) {
    const here = location.pathname + location.search;
    for (const a of nativeTabs(container)) {
      if (state.active) {
        if (a.classList.contains('active')) {
          a.classList.remove('active');
          a.dataset.culmsAttStripped = '1';
        }
      } else if (a.dataset.culmsAttStripped) {
        delete a.dataset.culmsAttStripped;
        a.classList.toggle('active', a.getAttribute('href') === here);
      }
    }
    tab.classList.toggle('active', state.active);
  }

  function contentRoot() {
    return document.querySelector('cu-courses-attendance .top-bar')?.parentElement || null;
  }

  function activate() {
    const container = findTabs();
    const root = contentRoot();
    if (!container || !root) return;
    const tab = ensureTab(container);
    if (!tab) return;
    const wasActive = state.active;
    state.active = true;
    syncTabHighlight(container, tab);
    root.classList.add('culms-att-on');
    let view = document.getElementById(VIEW_ID);
    if (!view || view.parentElement !== root) {
      view?.remove();
      view = document.createElement('div');
      view.id = VIEW_ID;
      view.className = 'culms-att';
      root.appendChild(view);
      bindView(view);
    }
    if (!wasActive) {
      window.cuLmsTrack?.('attendance_summary_open');
      refreshExams();
    }
    if (!state.data && !state.loading) refresh(false);
    else renderView();
  }

  function deactivate() {
    state.active = false;
    document.querySelectorAll('.culms-att-on').forEach((el) => el.classList.remove('culms-att-on'));
    document.getElementById(VIEW_ID)?.remove();
    const container = findTabs();
    const tab = document.getElementById(TAB_ID);
    if (container && tab) syncTabHighlight(container, tab);
    if (location.hash === HASH) {
      history.replaceState(history.state, '', location.pathname + location.search);
    }
  }

  // --- ОТРИСОВКА ---

  function renderProgress() {
    const bar = document.querySelector(`#${VIEW_ID} .culms-att-progress`);
    if (!bar || !state.progress) return;
    const { done, total } = state.progress;
    bar.textContent = total ? `Собираем посещаемость… ${done} из ${total} дней` : 'Загружаем…';
  }

  function renderView() {
    const view = document.getElementById(VIEW_ID);
    if (!view) return;
    view.innerHTML = viewHtml();
    renderProgress();
  }

  function viewHtml() {
    const toolbar = toolbarHtml();
    if (state.error && !state.data) {
      return (
        toolbar +
        `<div class="culms-att-empty">Не удалось загрузить посещаемость: ${esc(state.error)}` +
        ` <button type="button" class="culms-att-button" data-action="refresh">Повторить</button></div>`
      );
    }
    if (!state.data) return toolbar + `<div class="culms-att-progress culms-att-empty"></div>`;

    const courses = state.data.courses;
    const open = courses.filter((c) => c.visible);
    const closed = courses.filter((c) => !c.visible && c.hasSeminars);
    const loadingLine = state.loading
      ? `<div class="culms-att-progress culms-att-muted"></div>`
      : '';
    if (!open.length) {
      return (
        toolbar +
        loadingLine +
        `<div class="culms-att-empty">Ни по одному курсу LMS пока не открыла посещаемость.` +
        (closed.length
          ? ` Закрыта: ${closed.map((c) => esc(displayCourseName(c.name))).join(', ')}.`
          : '') +
        `</div>`
      );
    }
    const exams = examsByCourse(open);
    const body = state.prefs.view === 'week' ? weekHtml(open, exams) : tableHtml(open, exams);
    return toolbar + loadingLine + statsHtml(open) + body + closedHtml(closed) + legendHtml();
  }

  function toolbarHtml() {
    const seg =
      `<div class="culms-att-seg" role="group">` +
      VIEWS.map(
        (v) =>
          `<button type="button" class="culms-att-seg__btn${v.id === state.prefs.view ? ' is-on' : ''}"` +
          ` data-view="${v.id}" aria-pressed="${v.id === state.prefs.view}">${esc(v.label)}</button>`
      ).join('') +
      `</div>`;
    return (
      `<div class="culms-att-toolbar">${seg}` +
      `<label class="culms-att-norm" title="Ниже нормы процент красится жёлтым (в пределах 15 п.п.) и красным">` +
      `Норма <input type="number" min="0" max="100" step="5" value="${state.prefs.norm}" data-pref="norm">%</label>` +
      `<div class="culms-att-toolbar__actions">` +
      `<button type="button" class="culms-att-button" data-action="refresh"${state.loading ? ' disabled' : ''}>Обновить</button>` +
      `</div></div>`
    );
  }

  function statsHtml(courses) {
    const sum = { attended: 0, missed: 0, pending: 0, upcoming: 0, settled: 0 };
    for (const c of courses) {
      if (!c.counts) continue;
      for (const key of Object.keys(sum)) sum[key] += c.counts[key];
    }
    const rate = sum.settled ? sum.attended / sum.settled : null;
    const card = (value, label, cls = '') =>
      `<div class="culms-att-stat ${cls}"><span class="culms-att-stat__value">${value}</span>` +
      `<span class="culms-att-stat__label">${esc(label)}</span></div>`;
    return (
      `<div class="culms-att-stats">` +
      card(
        `${sum.attended}<small> / ${sum.settled}</small>`,
        `был на семинарах · ${pct(rate)}`,
        `is-${levelOf(rate)}`
      ) +
      card(sum.missed, 'пропущено') +
      card(sum.pending, 'ждут отметки') +
      card(sum.upcoming, 'впереди по расписанию') +
      `</div>`
    );
  }

  /** Недели семестра: понедельники от начала до конца. */
  function semesterWeeks() {
    const a = api();
    const { start, end } = state.data.semester;
    const weeks = [];
    for (let m = a.mondayOf(start); m <= end; m += 7) weeks.push(m);
    return weeks;
  }

  /** Недели, где посещаемость уже отмечали: до даты отсчёта всё пусто. */
  function trackedWeeks(weeks) {
    const from = state.data.trackFrom ?? state.data.semester.start;
    return weeks.filter((m) => m + 6 >= from);
  }

  /** «Отмечают с 21 сентября…» — если отсчёт позже начала семестра. */
  function trackingNote() {
    const { trackFrom, semester } = state.data;
    if (trackFrom == null || trackFrom <= semester.start) return '';
    return (
      `Посещаемость отмечают с ${fmtLong.format(api().dateOf(trackFrom))} — ` +
      `пары раньше не показываются и не считаются.`
    );
  }

  function weekRange(monday) {
    const a = api();
    return `${fmtDayMonth.format(a.dateOf(monday))}–${fmtDayMonth.format(a.dateOf(monday + 6))}`;
  }

  function tableHtml(courses, exams) {
    const a = api();
    // Номер недели — от начала семестра, хотя первые недели не показываются.
    const all = semesterWeeks();
    const weeks = trackedWeeks(all);
    const thisWeek = a.mondayOf(state.data.today);
    const head =
      `<tr><th class="culms-att-course">Курс</th>` +
      weeks
        .map(
          (m) =>
            `<th class="culms-att-week${m === thisWeek ? ' is-now' : ''}" title="${weekRange(m)}">` +
            `${all.indexOf(m) + 1}<small>${fmtDayMonth.format(a.dateOf(m))}</small></th>`
        )
        .join('') +
      `<th class="culms-att-num" title="Был / прошедших с отметкой">Был</th>` +
      `<th class="culms-att-num" title="Сколько выйдет, если ходить на все оставшиеся">Макс.</th></tr>`;

    const rows = courses
      .map((course) => {
        const byWeek = new Map();
        for (const s of course.sessions) {
          const m = a.mondayOf(s.day);
          if (!byWeek.has(m)) byWeek.set(m, []);
          byWeek.get(m).push(s);
        }
        const courseExams = exams.get(course.id) || [];
        const cells = weeks
          .map((m) => {
            const exam = courseExams.filter((e) => e.monday === m);
            const examHtml = exam.length
              ? `<span class="culms-att-exam" title="${esc('Контрольная на этой неделе: ' + exam.map((e) => e.name).join(', '))}">${svgIcon(EXAM_ICON)}</span>`
              : '';
            const marks = (byWeek.get(m) || []).map((s) => markHtml(course, s)).join('');
            return (
              `<td class="culms-att-cell${m === thisWeek ? ' is-now' : ''}${exam.length ? ' has-exam' : ''}">` +
              `<div class="culms-att-cell__in">${marks}${examHtml}</div></td>`
            );
          })
          .join('');
        const c = course.counts;
        const rate = c
          ? `<span class="culms-att-rate is-${levelOf(c.rate)}">${c.attended}/${c.settled}</span>` +
            `<small>${pct(c.rate)}${c.pending ? ` · +${c.pending} ждёт` : ''}</small>`
          : course.error
            ? `<span class="culms-att-muted" title="${esc(course.error)}">ошибка</span>`
            : '—';
        const max = c
          ? `${c.max}/${c.semester}<small>${pct(c.semester ? c.max / c.semester : null)}</small>`
          : '—';
        const note = course.scanned
          ? `<small title="Курса нет в вашем расписании — пары найдены в LMS по дням, будущих не видно">нет в расписании</small>`
          : '';
        return (
          `<tr><th class="culms-att-course"><button type="button" class="culms-att-link" data-course="${course.id}">` +
          `${esc(displayCourseName(course.name))}</button>${note}</th>${cells}` +
          `<td class="culms-att-num">${rate}</td><td class="culms-att-num">${max}</td></tr>`
        );
      })
      .join('');

    return (
      `<div class="culms-att-scroll"><table class="culms-att-table">` +
      `<thead>${head}</thead><tbody>${rows}</tbody>${totalRowHtml(courses, weeks.length)}</table></div>`
    );
  }

  function plural(n, one, few, many) {
    const tail = n % 100;
    if (tail >= 11 && tail <= 14) return many;
    return n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many;
  }

  /**
   * «Всего»: среднее по курсам с открытой посещаемостью. Считается по всем
   * парам сразу (сумма «был» к сумме прошедших с отметкой), как карточка над
   * таблицей, а не как среднее процентов курсов — у курса с большим числом
   * пар вес больше.
   */
  function totalRowHtml(courses, weekCount) {
    const counted = courses.filter((c) => c.counts);
    if (!counted.length) return '';
    const sum = (key) => counted.reduce((total, c) => total + c.counts[key], 0);
    const attended = sum('attended');
    const settled = sum('settled');
    const pending = sum('pending');
    const max = sum('max');
    const semester = sum('semester');
    const rate = settled ? attended / settled : null;
    return (
      `<tfoot><tr class="culms-att-total"><th class="culms-att-course">Всего` +
      `<small>${counted.length} ${plural(counted.length, 'курс', 'курса', 'курсов')} с посещаемостью</small></th>` +
      `<td colspan="${weekCount}"></td>` +
      `<td class="culms-att-num"><span class="culms-att-rate is-${levelOf(rate)}">${attended}/${settled}</span>` +
      `<small>${pct(rate)}${pending ? ` · +${pending} ждёт` : ''}</small></td>` +
      `<td class="culms-att-num">${max}/${semester}<small>${pct(semester ? max / semester : null)}</small></td>` +
      `</tr></tfoot>`
    );
  }

  function weekHtml(courses, exams) {
    const a = api();
    const today = state.data.today;
    const thisWeek = a.mondayOf(today);
    const weeks = semesterWeeks();
    const monday = state.week ?? thisWeek;
    const index = weeks.indexOf(monday);
    const sunday = monday + 6;

    const items = [];
    for (const course of courses) {
      for (const s of course.sessions) {
        if (s.day >= monday && s.day <= sunday) items.push({ course, s });
      }
    }
    items.sort((x, y) => x.s.day - y.s.day || x.s.startTime.localeCompare(y.s.startTime));

    const weekExams = [];
    for (const course of courses) {
      for (const e of exams.get(course.id) || []) {
        if (e.monday === monday) weekExams.push({ course, e });
      }
    }

    const nav =
      `<div class="culms-att-weeknav">` +
      `<button type="button" class="culms-att-button" data-week="${monday - 7}" aria-label="Предыдущая неделя">‹</button>` +
      `<div class="culms-att-weeknav__title">${index >= 0 ? `Неделя ${index + 1}` : 'Вне семестра'}` +
      `<small>${fmtShort.format(a.dateOf(monday))} — ${fmtShort.format(a.dateOf(sunday))}</small></div>` +
      `<button type="button" class="culms-att-button" data-week="${monday + 7}" aria-label="Следующая неделя">›</button>` +
      (monday !== thisWeek
        ? `<button type="button" class="culms-att-button" data-week="${thisWeek}">Текущая неделя</button>`
        : '') +
      `</div>`;

    const examsBanner = weekExams.length
      ? `<div class="culms-att-banner">${svgIcon(EXAM_ICON)} На этой неделе контрольные: ` +
        weekExams
          .map(({ course, e }) => `${esc(e.name)} — ${esc(displayCourseName(course.name))}`)
          .join('; ') +
        `. Семинары в эти дни лучше не пропускать.</div>`
      : '';

    const from = state.data.trackFrom;
    if (!items.length && from != null && sunday < from) {
      return (
        nav +
        `<div class="culms-att-empty">До ${fmtLong.format(a.dateOf(from))} посещаемость не отмечали.</div>`
      );
    }
    if (!items.length) {
      return (
        nav + examsBanner + `<div class="culms-att-empty">На этой неделе своих семинаров нет.</div>`
      );
    }

    let lastDay = null;
    const rows = items
      .map(({ course, s }) => {
        const dayHead =
          s.day !== lastDay
            ? `<div class="culms-att-day${s.day === today ? ' is-today' : ''}">` +
              `${WEEKDAYS[a.weekdayOf(s.day)]}, ${fmtLong.format(a.dateOf(s.day))}${s.day === today ? ' · сегодня' : ''}</div>`
            : '';
        lastDay = s.day;
        return (
          dayHead +
          `<div class="culms-att-item" title="${esc(sessionTitle(course, s))}">` +
          `<span class="culms-att-item__time">${esc(s.startTime)}${s.endTime ? '–' + esc(s.endTime) : ''}</span>` +
          `<button type="button" class="culms-att-link culms-att-item__course" data-course="${course.id}">${esc(displayCourseName(course.name))}</button>` +
          `<span class="culms-att-item__who">Семинар${s.row ? ' ' + s.row : ''}${s.hosts?.length ? ' · ' + esc(s.hosts.join(', ')) : ''}${s.place ? ' · ' + esc(s.place) : ''}</span>` +
          `<span class="culms-att-chip is-${s.status}">${svgIcon(STATUS[s.status]?.icon)}${esc(STATUS[s.status]?.label)}</span>` +
          `</div>`
        );
      })
      .join('');
    return nav + examsBanner + `<div class="culms-att-list">${rows}</div>`;
  }

  function closedHtml(closed) {
    if (!closed.length) return '';
    return (
      `<div class="culms-att-closed culms-att-muted">Посещаемость в LMS закрыта: ` +
      closed.map((c) => esc(displayCourseName(c.name))).join(', ') +
      `</div>`
    );
  }

  function legendHtml() {
    const item = (status) =>
      `<span class="culms-att-legend__item"><span class="culms-att-mark is-${status}">${svgIcon(STATUS[status].icon)}</span>${esc(STATUS[status].label)}</span>`;
    return (
      `<div class="culms-att-legend">` +
      ['attended', 'missed', 'pending', 'upcoming', 'none'].map(item).join('') +
      (state.exams
        ? `<span class="culms-att-legend__item"><span class="culms-att-exam">${svgIcon(EXAM_ICON)}</span>Контрольная</span>`
        : '') +
      `<span class="culms-att-muted">Считаются только семинары — лекции LMS не отмечает. «Ждёт отметки» — пара была меньше недели назад. ${esc(trackingNote())}</span>` +
      `</div>`
    );
  }

  // --- СОБЫТИЯ ---

  function bindView(view) {
    view.addEventListener('click', (event) => {
      const target = event.target.closest('button');
      if (!target || !view.contains(target)) return;
      if (target.dataset.view) {
        state.prefs.view = target.dataset.view;
        savePrefs();
        renderView();
      } else if (target.dataset.week) {
        state.week = Number(target.dataset.week);
        renderView();
      } else if (target.dataset.action === 'refresh') {
        refresh(true);
      } else if (target.dataset.course) {
        openCourse(Number(target.dataset.course));
      }
    });
    view.addEventListener('change', (event) => {
      const input = event.target.closest('input[data-pref="norm"]');
      if (!input) return;
      const value = Math.min(100, Math.max(0, Math.round(Number(input.value))));
      if (!Number.isFinite(value)) return;
      state.prefs.norm = value;
      savePrefs();
      renderAll();
    });
  }

  /**
   * Страница курса. Родная строка таблицы спрятана, но жива — щелчок по ней
   * ведёт роутером Angular, без перезагрузки. Не нашлась — обычный переход.
   */
  function openCourse(id) {
    const byKey = coursesByKey();
    const row = [...document.querySelectorAll('cu-courses-attendance tr.course-row')].find(
      (r) => courseOfRow(r, byKey)?.id === id
    );
    state.open = false;
    deactivate();
    if (row) row.click();
    else location.href = `${LIST_PATH}/${id}`;
  }

  // --- СИНХРОНИЗАЦИЯ СО SPA ---

  function sync() {
    if (!isListPage()) {
      state.open = false;
      state.entered = false;
      if (state.active) deactivate();
      return;
    }
    const container = findTabs();
    if (!container) return;
    const tab = ensureTab(container);
    if (!tab) return;
    observeTabs(container);

    // Каждый заход в раздел — свежие данные (в пределах минуты общая загрузка
    // attendance_api.js отдаёт прежние).
    if (!state.entered && !isArchived()) {
      state.entered = true;
      if (!state.loading) refresh(false);
    }
    decorateNative();

    if (location.hash === HASH) state.open = true;
    if (state.open) {
      const root = contentRoot();
      if (
        !state.active ||
        !root?.classList.contains('culms-att-on') ||
        !document.getElementById(VIEW_ID) ||
        !tab.classList.contains('active')
      ) {
        activate();
      } else {
        syncTabHighlight(container, tab);
      }
    } else if (state.active) {
      deactivate();
    }
  }

  let syncQueued = false;
  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    // Таймер, а не rAF: в фоновой вкладке rAF стоит.
    setTimeout(() => {
      syncQueued = false;
      sync();
    }, 30);
  }

  // routerLinkActive может вернуть `active` родной вкладке, меняя только
  // класс, — за классами следим лишь в строке вкладок, она маленькая.
  let observedTabs = null;
  function observeTabs(container) {
    if (container === observedTabs) return;
    observedTabs = container;
    new MutationObserver(queueSync).observe(container, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });
  }

  // Наши же правки разметки (дописка в ячейку, вкладка) тоже будят
  // наблюдатель; sync при этом ничего не меняет, и цикл гаснет.
  new MutationObserver(queueSync).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', queueSync);

  const ext = extApi();
  ext?.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'sync' && EXAMS_TOGGLE in changes && state.active) refreshExams();
  });

  queueSync();
})();
