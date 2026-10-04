// attendance_course.js — посещаемость одного курса: все свои семинары сразу.
//
// Родная страница `/learn/attendance/courses/{id}` показывает пары одного дня
// (по умолчанию — сегодняшнего, а это чаще всего «Нет событий») и все группы
// курса подряд. Свой семинар там только помечен иконкой. Здесь над таблицей —
// полоса своих семинаров за семестр с отметками и счёт, а галочка «Только
// мой семинар» прячет в родной таблице строки чужих групп.
//
// Данные — из attendance_api.js (`window.cuLmsAttendance`).

(function () {
  'use strict';

  if (window.__culmsAttendanceCourseLoaded) return;
  window.__culmsAttendanceCourseLoaded = true;

  const PANEL_ID = 'culms-att-course';
  const PREFS_KEY = 'culms.attendance.course.prefs';
  const PATH_RE = /^\/learn\/attendance\/courses\/(\d+)\/?$/;

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
  const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const fmtDayMonth = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });
  const fmtLong = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

  const state = {
    courseId: null,
    data: null,
    loading: null,
    error: null,
    prefs: loadPrefs(),
  };

  const log = (...args) =>
    typeof window.cuLmsLog === 'function' ? window.cuLmsLog('[Attendance]', ...args) : undefined;

  const api = () => window.cuLmsAttendance;

  function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      return { onlyMine: typeof saved.onlyMine === 'boolean' ? saved.onlyMine : true };
    } catch {
      return { onlyMine: true };
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
    } catch {
      // приватный режим — галочка просто не запомнится
    }
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function svgIcon(body) {
    return body
      ? `<svg class="culms-att-icon" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`
      : '';
  }

  function pct(fraction) {
    return fraction == null ? '—' : Math.round(fraction * 100) + '%';
  }

  /** Норма — та же, что задана в сводной. */
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

  function load() {
    if (state.loading) return;
    state.error = null;
    const promise = api()
      .load()
      .then((data) => {
        if (state.loading !== promise) return;
        state.data = data;
        state.loading = null;
        render();
      })
      .catch((error) => {
        if (state.loading !== promise) return;
        log('посещаемость курса не загрузилась', error);
        state.error = String(error?.message || error);
        state.loading = null;
        render();
      });
    state.loading = promise;
    render();
  }

  function sessionTitle(s) {
    const a = api();
    return [
      `${WEEKDAYS[a.weekdayOf(s.day)]}, ${fmtLong.format(a.dateOf(s.day))}${s.startTime ? `, ${s.startTime}–${s.endTime}` : ''}`,
      `Семинар${s.row ? ' ' + s.row : ''}${s.hosts?.length ? ' · ' + s.hosts.join(', ') : ''}${s.place ? ' · ' + s.place : ''}`,
      STATUS[s.status]?.label || '',
      s.status === 'pending' ? 'LMS ставит отметку в течение недели после пары' : '',
      s.status === 'none' ? 'В этот день своей пары в LMS нет — перенос или праздник' : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  function panelHtml() {
    const toggle =
      `<label class="culms-att-check"><input type="checkbox" data-pref="onlyMine"` +
      `${state.prefs.onlyMine ? ' checked' : ''}> Только мой семинар в таблице ниже</label>`;
    if (state.error) {
      return `<div class="culms-att-course__head"><span class="culms-att-muted">Свои семинары не загрузились: ${esc(state.error)}</span>${toggle}</div>`;
    }
    if (!state.data) {
      return `<div class="culms-att-course__head"><span class="culms-att-muted">Собираем свои семинары за семестр…</span>${toggle}</div>`;
    }
    const course = state.data.courses.find((c) => c.id === state.courseId);
    if (!course || !course.visible) {
      return `<div class="culms-att-course__head">${toggle}</div>${hiddenNoteHtml()}`;
    }
    if (course.error) {
      return `<div class="culms-att-course__head"><span class="culms-att-muted">Свои семинары не загрузились: ${esc(course.error)}</span>${toggle}</div>`;
    }
    const c = course.counts;
    const a = api();
    const today = state.data.today;
    const summary = c
      ? `<span class="culms-att-course__title">Мои семинары</span>` +
        `<span class="culms-att-rate is-${levelOf(c.rate)}">был на ${c.attended} из ${c.settled} (${pct(c.rate)})</span>` +
        (c.pending ? `<span class="culms-att-muted">ещё ${c.pending} ждёт отметки</span>` : '') +
        `<span class="culms-att-muted">впереди ${c.upcoming} · макс. ${c.max} из ${c.semester}</span>`
      : '';
    const chips = course.sessions
      .map((s) => {
        const now = s.day === today ? ' is-today' : '';
        return (
          `<span class="culms-att-chip is-${s.status}${now}" title="${esc(sessionTitle(s))}">` +
          `${svgIcon(STATUS[s.status]?.icon)}${fmtDayMonth.format(a.dateOf(s.day))} ${WEEKDAYS[a.weekdayOf(s.day)]}</span>`
        );
      })
      .join('');
    const note = course.scanned
      ? `<div class="culms-att-muted">Курса нет в вашем расписании — показаны пары, найденные в LMS по дням; будущих не видно.</div>`
      : '';
    return (
      `<div class="culms-att-course__head">${summary}${toggle}</div>` +
      (chips ? `<div class="culms-att-course__strip">${chips}</div>` : '') +
      note +
      hiddenNoteHtml()
    );
  }

  /**
   * Галочка спрятала все строки дня — иначе пустая таблица выглядит как
   * «LMS ничего не отдала».
   */
  function hiddenNoteHtml() {
    if (!state.prefs.onlyMine) return '';
    const rows = [...document.querySelectorAll('cu-course-attendance-events tbody tr')].filter(
      (row) => row.querySelector('.icon-container')
    );
    const mine = rows.filter((row) => row.querySelector('.icon-container._participant'));
    if (!rows.length || mine.length) return '';
    return (
      `<div class="culms-att-muted">В выбранный день своего семинара нет — ` +
      `скрыто пар других групп: ${rows.length}.</div>`
    );
  }

  function render() {
    const host = document.querySelector('cu-course-attendance-events');
    const topBar = host?.querySelector(':scope > .top-bar');
    if (!host || !topBar) return;
    host.classList.toggle('culms-att-only-mine', state.prefs.onlyMine);
    let panel = document.getElementById(PANEL_ID);
    if (!panel || panel.previousElementSibling !== topBar) {
      panel?.remove();
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.className = 'culms-att culms-att-course';
      topBar.after(panel);
      panel.addEventListener('change', (event) => {
        const input = event.target.closest('input[data-pref="onlyMine"]');
        if (!input) return;
        state.prefs.onlyMine = input.checked;
        savePrefs();
        render();
      });
    }
    const html = panelHtml();
    if (panel.dataset.html !== html) {
      panel.innerHTML = html;
      panel.dataset.html = html;
    }
  }

  function sync() {
    const id = courseIdFromPath();
    if (id == null || !api()) {
      if (state.courseId != null) {
        document.getElementById(PANEL_ID)?.remove();
        state.courseId = null;
      }
      return;
    }
    if (id !== state.courseId) {
      state.courseId = id;
      state.data = null;
      load();
    }
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
  queueSync();
})();
