// course_possible_score.js — «Можно было набрать» в виджете «Прогресс по курсу».
//
// На странице курса `/learn/courses/view/actual/{id}` родной виджет пишет
// «Накоплено» и «Еще можно набрать» (10 минус накопленное). Под ними добавляется
// строка: сколько можно было набрать на данный момент, если бы за все уже
// проверенные работы стояли максимумы. Работы на проверке и несданные не
// считаются — ни как нули, ни как максимумы; формула та же, что у накопа в
// ведомости (вес × сумма баллов / плановое число работ, лучшие N, потолок 10).
// Данные — `/api/micro-lms/courses/{id}/student-performance`.

(function () {
  'use strict';

  if (window.__culmsCoursePossibleLoaded) return;
  window.__culmsCoursePossibleLoaded = true;

  const ROW_ID = 'culms-course-possible';
  const MARK_ID = 'culms-course-possible-mark';
  const PATH_RE = /^\/learn\/courses\/view\/actual\/(\d+)(?:\/|$)/;

  const TOGGLE = 'coursePossibleScoreToggle';

  const state = { courseId: null, value: null, loading: false, failed: false, enabled: false };

  const fmt = (n) => String(Math.round(n * 100) / 100);

  function possibleFrom(tasks) {
    const activities = new Map();
    for (const task of tasks) {
      const activity = task?.activity;
      if (!activity || activity.id == null) continue;
      if (!activities.has(activity.id)) {
        activities.set(activity.id, {
          weight: Number(activity.weight) || 0,
          best: Number(activity.bestScoresCount) || 0,
          planned: Number(activity.maxExercisesCount) || 0,
          total: 0,
          graded: [],
        });
      }
      const entry = activities.get(activity.id);
      entry.total++;
      if (task.score != null) {
        entry.graded.push({ score: Number(task.score), max: Number(task.maxScore) || 10 });
      }
    }
    let sum = 0;
    let weighted = false;
    for (const a of activities.values()) {
      if (a.weight > 0) weighted = true;
      const denominator = a.best || a.planned || a.total;
      if (!(denominator > 0)) continue;
      const counted = a.best
        ? [...a.graded].sort((x, y) => y.score - x.score).slice(0, a.best)
        : a.graded;
      sum += (a.weight * counted.reduce((s, t) => s + t.max, 0)) / denominator;
    }
    return weighted ? Math.min(sum, 10) : null;
  }

  function load() {
    if (state.loading) return;
    const courseId = state.courseId;
    state.loading = true;
    fetch(`/api/micro-lms/courses/${courseId}/student-performance`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((data) => {
        if (state.courseId !== courseId) return;
        state.value = possibleFrom(Array.isArray(data?.tasks) ? data.tasks : []);
      })
      .catch(() => {
        if (state.courseId === courseId) state.failed = true;
      })
      .finally(() => {
        state.loading = false;
        render();
      });
  }

  function render() {
    const details = document.querySelector('cu-course-progress-widget .progress-details');
    let row = document.getElementById(ROW_ID);
    if (!state.enabled || !details || state.courseId == null || state.value == null) {
      row?.remove();
      document.getElementById(MARK_ID)?.remove();
      return;
    }
    renderMark(details);
    const native = findLeftRow(details);
    if (!row || (native ? row.previousElementSibling !== native : row.parentElement !== details)) {
      row?.remove();
      row = native ? cloneRow(native) : plainRow();
      row.id = ROW_ID;
      row.title =
        'Сколько можно было набрать к сегодняшнему дню: проверенные работы на максимум. ' +
        'Работы на проверке и несданные не учитываются.';
      // Сразу под родной строкой «Еще можно набрать», в одной легенде с ней.
      if (native) native.after(row);
      else details.append(row);
    }
    setTexts(row);
  }

  const NAME = 'Можно было набрать';

  /** Свой вид строки — когда родную не нашли. */
  function plainRow() {
    const row = document.createElement('div');
    row.className = 'culms-course-possible text-secondary';
    row.innerHTML =
      `<span class="culms-course-possible__name"></span>` +
      `<span class="culms-course-possible__value"></span>`;
    return row;
  }

  /**
   * Копия родной строки: шрифт, размер и цвет те же без подбора. Тексты
   * подменяются при каждой отрисовке (см. `setTexts`), точка — красная.
   */
  function cloneRow(native) {
    const row = native.cloneNode(true);
    row.classList.add('culms-course-possible-clone');
    for (const el of [row, ...row.querySelectorAll('*')]) {
      el.removeAttribute('id');
      const box = getComputedStyle(el);
      if (!el.children.length || el === row) continue;
      if (parseFloat(box.width) <= 10 && parseFloat(box.height) <= 10) {
        el.style.setProperty('background', '#f4521e', 'important');
      }
    }
    return row;
  }

  function textNodes(row) {
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeValue.trim()) nodes.push(node);
    }
    return nodes;
  }

  function setTexts(row) {
    const value = fmt(state.value);
    if (!row.classList.contains('culms-course-possible-clone')) {
      const [name, num] = row.children;
      if (name.textContent !== NAME) name.textContent = NAME;
      if (num.textContent !== value) num.textContent = value;
      return;
    }
    const nodes = textNodes(row);
    if (nodes.length < 2) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (first.nodeValue !== NAME) first.nodeValue = NAME;
    if (last.nodeValue !== value) last.nodeValue = value;
  }

  /** Родная строка легенды «Еще можно набрать»: самый внутренний блок, где есть и подпись, и число. */
  function findLeftRow(details) {
    const label = [...details.querySelectorAll('*')].find(
      (el) => !el.children.length && /^Ещ[её] можно набрать$/.test(el.textContent.trim())
    );
    let row = label;
    while (row && row !== details && !/\d/.test(row.textContent)) row = row.parentElement;
    return row && row !== details && row !== label ? row : null;
  }

  /** Красная черта на родной полосе оценок — там, докуда можно было дойти. */
  function renderMark(details) {
    const bar = details.querySelector('.progress-bar');
    let mark = document.getElementById(MARK_ID);
    if (!bar) {
      mark?.remove();
      return;
    }
    if (!mark || mark.parentElement !== bar) {
      mark?.remove();
      mark = document.createElement('div');
      mark.id = MARK_ID;
      mark.className = 'culms-course-possible-mark';
      mark.title = 'Можно было набрать к сегодняшнему дню';
      bar.append(mark);
    }
    const left = `${Math.min(Math.max(state.value / 10, 0), 1) * 100}%`;
    if (mark.style.left !== left) mark.style.left = left;
  }

  function sync() {
    if (!state.enabled) {
      document.getElementById(ROW_ID)?.remove();
      document.getElementById(MARK_ID)?.remove();
      return;
    }
    const match = PATH_RE.exec(location.pathname);
    const id = match ? Number(match[1]) : null;
    if (id !== state.courseId) {
      document.getElementById(ROW_ID)?.remove();
      document.getElementById(MARK_ID)?.remove();
      state.courseId = id;
      state.value = null;
      state.failed = false;
    }
    if (id == null) return;
    if (state.value == null && !state.failed) load();
    render();
  }

  let queued = false;
  function queueSync() {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      sync();
    }, 30);
  }

  new MutationObserver(queueSync).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', queueSync);

  // Выключено по умолчанию; включается в попапе («Курсы»), смена галочки
  // действует сразу. Без API хранилища (поддельная страница в тесте) включено.
  const ext = typeof browser !== 'undefined' ? browser : window.chrome;
  if (ext?.storage?.sync) {
    ext.storage.sync
      .get(TOGGLE)
      .then((settings) => {
        state.enabled = settings?.[TOGGLE] === true;
        queueSync();
      })
      .catch(() => queueSync());
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
