// course_attendance_bar.js — полоса посещаемости под «Прогрессом по курсу».
//
// На странице курса `/learn/courses/view/actual/{id}` справа стоит виджет
// «Прогресс по курсу» (оценки). Если по курсу открыта посещаемость, под его
// полосой добавляется вторая: сколько семинаров посещено, сколько уже прошло
// и сколько их за семестр, плюс процент. Данные — из
// attendance/attendance_api.js (`window.cuLmsAttendance`), он же кеширует их
// в localStorage; у курса без посещаемости (или без семинаров) полосы нет.

(function () {
  'use strict';

  if (window.__culmsCourseAttendanceBarLoaded) return;
  window.__culmsCourseAttendanceBarLoaded = true;

  const BLOCK_ID = 'culms-course-att';
  const TOGGLE = 'courseAttendanceBarToggle';
  const PATH_RE = /^\/learn\/courses\/view\/actual\/(\d+)(?:\/|$)/;

  // Последние числа курса — чтобы полоса рисовалась сразу, пока LMS отвечает.
  const SNAPSHOT_KEY = 'culms.attendance.bar.v1';

  const state = {
    courseId: null,
    data: null,
    loading: null,
    failed: false,
    enabled: false,
    snapshot: null,
  };

  const log = (...args) =>
    typeof window.cuLmsLog === 'function' ? window.cuLmsLog('[AttendanceBar]', ...args) : undefined;

  const api = () => window.cuLmsAttendance;

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Норма — та же, что задана в сводной посещаемости. */
  function levelOf(rate) {
    if (rate == null) return 'none';
    let norm = api()?.DEFAULT_NORM ?? 75;
    try {
      const saved = Number(JSON.parse(localStorage.getItem('culms.attendance.prefs') || '{}').norm);
      if (Number.isFinite(saved)) norm = saved;
    } catch {
      // по умолчанию
    }
    if (rate >= norm / 100) return 'ok';
    if (rate >= norm / 100 - 0.15) return 'warn';
    return 'bad';
  }

  function courseIdFromPath() {
    const match = PATH_RE.exec(location.pathname);
    return match ? Number(match[1]) : null;
  }

  function readSnapshots() {
    try {
      const saved = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  }

  function saveSnapshot(courseId, counts) {
    try {
      const all = readSnapshots();
      if (counts) all[courseId] = counts;
      else delete all[courseId];
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(all));
    } catch {
      // приватный режим — полоса просто появится после загрузки
    }
  }

  function load() {
    if (state.loading || !api()) return;
    const courseId = state.courseId;
    const promise = api()
      .load({ only: courseId })
      .then((data) => {
        if (state.loading !== promise) return;
        state.data = data;
        state.loading = null;
        const course = data.courses.find((c) => c.id === courseId);
        const counts = course?.visible && !course.error ? course.counts : null;
        // Курс без посещаемости — забываем старые числа; ошибка загрузки их оставляет.
        if (!course?.error) saveSnapshot(courseId, counts);
        render();
      })
      .catch((error) => {
        if (state.loading !== promise) return;
        log('посещаемость не загрузилась', error);
        state.loading = null;
        state.failed = true;
      });
    state.loading = promise;
  }

  function blockHtml() {
    const course = state.data?.courses.find((c) => c.id === state.courseId);
    const c = state.data
      ? course?.visible && !course.error
        ? course.counts
        : null
      : state.snapshot;
    if (!c || !c.semester) return '';
    const passed = c.settled + c.pending;
    const total = Math.max(c.semester, passed);
    const canStill = Math.max(0, c.max - c.attended);
    const share = (n) => `${((Math.max(0, n) / total) * 100).toFixed(3)}%`;
    const percent = c.rate == null ? '—' : `${Math.round(c.rate * 100)}%`;
    const tip =
      `Считаются только семинары.
` +
      `Уже прошло пар: ${passed}, посещено: ${c.attended}.
` +
      `Процент — от пар с окончательной отметкой: ${c.attended} из ${c.settled}.
` +
      (c.pending
        ? `Ещё ${c.pending} ждут отметки (LMS ставит её в течение недели).
`
        : '') +
      `Если ходить на все оставшиеся, выйдет ${c.max} из ${c.semester}.`;
    // Разметка и классы — как у родного виджета: `text-primary` и
    // `text-secondary` дают те же цвета и в светлой, и в тёмной теме.
    return (
      `<h3 class="culms-course-att__title text-primary" title="${esc(tip)}">Посещаемость семинаров</h3>` +
      `<div class="culms-course-att__details">` +
      `<span class="culms-course-att__score text-secondary"><span class="culms-course-att__big text-primary">${c.attended}</span> из ${c.semester}` +
      `<span class="culms-course-att__rate is-${levelOf(c.rate)}" title="${esc(tip)}">${percent}</span></span>` +
      `<div class="culms-course-att__bar">` +
      `<div class="culms-course-att__seg is-attended" style="width:${share(c.attended)}"></div>` +
      `<div class="culms-course-att__seg is-left" style="width:${share(canStill)}"></div>` +
      `<div class="culms-course-att__seg is-lost" style="width:${share(total - c.max)}"></div>` +
      `</div>` +
      `<div class="culms-course-att__legend text-secondary">` +
      `<div class="culms-course-att__row"><span class="culms-course-att__name is-attended">Посещено</span><span class="culms-course-att__value">${c.attended}</span></div>` +
      `<div class="culms-course-att__row"><span class="culms-course-att__name is-left">Еще можно посетить</span><span class="culms-course-att__value">${canStill}</span></div>` +
      `</div></div>`
    );
  }

  function render() {
    const widget = document.querySelector('cu-course-progress-widget');
    const details = widget?.querySelector('.progress-details');
    let block = document.getElementById(BLOCK_ID);
    const html = state.courseId != null && (state.data || state.snapshot) ? blockHtml() : '';
    if (!widget || !details || !html) {
      block?.remove();
      return;
    }
    if (!block || block.previousElementSibling !== details) {
      block?.remove();
      block = document.createElement('div');
      block.id = BLOCK_ID;
      block.className = 'culms-course-att';
      details.after(block);
    }
    if (block.dataset.html !== html) {
      block.innerHTML = html;
      block.dataset.html = html;
    }
  }

  function sync() {
    const id = courseIdFromPath();
    if (!state.enabled) {
      document.getElementById(BLOCK_ID)?.remove();
      return;
    }
    if (id == null) {
      if (state.courseId != null) {
        document.getElementById(BLOCK_ID)?.remove();
        state.courseId = null;
      }
      return;
    }
    if (id !== state.courseId) {
      state.courseId = id;
      state.data = null;
      state.loading = null;
      state.failed = false;
      state.snapshot = readSnapshots()[id] || null;
    }
    if (!state.data && !state.failed) load();
    render();
  }

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

  // Выключено по умолчанию; включается в попапе («Курсы» → «Посещаемость под
  // прогрессом курса»), смена галочки действует сразу, без перезагрузки.
  // Без API хранилища (поддельная страница в тесте) полоса включена.
  const ext = typeof browser !== 'undefined' ? browser : window.chrome;
  if (ext?.storage?.sync) {
    ext.storage.sync
      .get(TOGGLE)
      .then((settings) => {
        state.enabled = settings?.[TOGGLE] === true;
        queueSync();
      })
      .catch(() => {
        state.enabled = false;
        queueSync();
      });
    ext.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !(TOGGLE in changes)) return;
      state.enabled = changes[TOGGLE].newValue === true;
      queueSync();
    });
  } else {
    state.enabled = true;
    queueSync();
  }
})();
