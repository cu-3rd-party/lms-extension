// exams_dashboard_gate.js — чтобы дэшборд на «Мои курсы» появлялся вместе со
// списком курсов, а не секундой позже.
//
// Плагины внедряет фон по `webNavigation.onCompleted`, то есть после полной
// загрузки страницы: к этому времени Angular уже нарисовал список, дэшборд
// только начинал качать задания и расписание и въезжал под список позже.
// Этот скрипт стоит в content_scripts с `document_start`:
//
// - пока включена хотя бы одна часть дэшборда и открыт список курсов, ставит
//   на <html> атрибут `data-culms-dashboard-pending` — под ним список курсов
//   невидим (visibility, а не display: место под ним остаётся, ничего не
//   прыгает). Снимает атрибут exams_dashboard.js, когда данные есть и
//   дэшборд нарисован, а если что-то повисло — таймер через HOLD_MS;
// - сразу же запускает запросы заданий и курсов, а расписание контрольных
//   просит у future_exams_api.js (он стоит в этой же записи content_scripts
//   раньше). exams_dashboard.js забирает готовые ответы из
//   `window.__culmsDashboardPrefetch`, а не качает заново.
//
// Content-скрипты и файлы из scripting.executeScript живут в одном
// изолированном мире расширения, поэтому `window` у них общий.
//
// Выключены обе части — скрипт ничего не прячет и ничего не качает.

(() => {
  'use strict';

  if (window.__culmsDashboardGate) return;

  const api = globalThis.browser || globalThis.chrome;
  if (!api || !api.storage) return;

  // Эти же ключи, адреса и срок — в exams_dashboard.js.
  const KEYS = ['futureExamsDashboardToggle', 'futureExamsDashboardDeadlines'];
  const ATTR = 'data-culms-dashboard-pending';
  const HOLD_MS = 4000;
  const TASKS_API =
    '/api/micro-lms/tasks/student?state=backlog&state=inProgress&state=submitted' +
    '&state=review&state=reworking&state=evaluated&state=failed';
  const COURSES_API = '/api/micro-lms/courses/student?limit=200&offset=0&state=published';

  let showExams = false;
  let showDeadlines = false;
  let currentUrl = location.href;
  let observer = null;

  // Тот же признак списка актуальных курсов, что в exams_dashboard.js.
  const isActualListPage = () =>
    /^\/learn\/courses\/view\/actual(\/(?!\d+$)[^/]+)?\/?$/.test(location.pathname);

  // Правило прячет список до того, как приедут стили плагина. Оно же есть в
  // exams_dashboard.css — на случай, если шлюза на странице нет.
  const style = document.createElement('style');
  style.textContent = `html[${ATTR}] cu-courses-group { visibility: hidden !important; }`;
  (document.head || document.documentElement).appendChild(style);

  /** Прячет список; в значении атрибута — когда начали ждать. */
  function hold() {
    const root = document.documentElement;
    if (root.hasAttribute(ATTR)) return;
    root.setAttribute(ATTR, String(Date.now()));
    clearTimeout(window.__culmsDashboardHoldTimer);
    window.__culmsDashboardHoldTimer = setTimeout(release, HOLD_MS);
  }

  function release() {
    clearTimeout(window.__culmsDashboardHoldTimer);
    document.documentElement.removeAttribute(ATTR);
  }

  function getJson(url) {
    return fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } }).then(
      (response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }
    );
  }

  function prefetch() {
    const data = { at: Date.now(), tasks: null, courses: null };
    // Отказ промиса разберёт дэшборд; здесь — только чтобы не было
    // «Uncaught (in promise)», если он так и не заберёт ответ.
    if (showDeadlines) {
      data.tasks = getJson(TASKS_API);
      data.tasks.catch(() => {});
    }
    if (showExams) {
      data.courses = getJson(COURSES_API);
      data.courses.catch(() => {});
      // Кэш расписания держит сам модуль: дэшборд потом получит его оттуда.
      const futureExams = window.cuLmsFutureExams;
      if (futureExams) futureExams.load().catch(() => {});
    }
    window.__culmsDashboardPrefetch = data;
  }

  /** Пришли на список курсов: прячем и качаем, если дэшборду это нужно. */
  function check() {
    if (!(showExams || showDeadlines) || !isActualListPage()) return;
    // Дэшборд уже на странице — дальше он сам решает, когда показывать.
    if (window.__culmsExamsDashboardInitialized) return;
    hold();
    prefetch();
  }

  // Переходы внутри LMS без перезагрузки: до них дэшборд ещё не внедрён,
  // и Angular успел бы нарисовать список раньше.
  function startObserver() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(() => {
      if (location.href === currentUrl) return;
      currentUrl = location.href;
      check();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  }

  function apply(values) {
    showExams = !!values[KEYS[0]];
    showDeadlines = !!values[KEYS[1]];
    if (showExams || showDeadlines) {
      startObserver();
      check();
    } else {
      stopObserver();
      release();
    }
  }

  window.__culmsDashboardGate = { hold, release, ATTR, HOLD_MS };

  api.storage.sync
    .get(KEYS)
    .then(apply)
    .catch(() => {});

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !KEYS.some((key) => key in changes)) return;
    const values = { [KEYS[0]]: showExams, [KEYS[1]]: showDeadlines };
    KEYS.forEach((key) => {
      if (key in changes) values[key] = changes[key].newValue;
    });
    apply(values);
  });
})();
