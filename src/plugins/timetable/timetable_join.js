// timetable_join.js — «Мои пары»: ссылка на трансляцию у каждой пары, плашка
// «Сейчас / Дальше» и трансляции других групп в drawer LMS.
//
// Ссылку на пару в Контур.Толке студенты ищут в Яндекс Календаре или просят
// в чате («скиньте толк на семинар сейчас» — сотни сообщений за семестр). Сама
// LMS её не показывает, но она выводится из расписания: комната пары —
// `centraluniversity.ktalk.ru/{calendarEventId без дефисов}`, где
// calendarEventId — id серии занятий. Название комнаты в Толке при этом старое
// (аудиторию не обновляют) — аудиторию берём из LMS.
//
// Что дописывается:
//   * столбец «Трансляция» — когда ближайшее занятие («сегодня, 11:30–14:20»,
//     «пт, 9 окт., 16:00») и ссылка; у пар раз в две недели это снимает
//     вопрос «на этой неделе есть или нет». Там же «Все группы» — открывает
//     drawer LMS «Выбрать время»;
//   * в drawer у каждого варианта (другие преподаватели семинара, другие
//     потоки лекции) — ближайшее занятие и ссылка на его трансляцию. Пока
//     запись закрыта, drawer показывает slot_view_main.js, и кнопки «Выбрать
//     время» (пересадка, POST) в нём нет — только посмотреть;
//   * над таблицей — плашка «Сейчас» (идёт или начнётся в ближайшие 15 минут)
//     и «Дальше» с кнопкой «Подключиться».
//
// Даты считаются по расписанию (день недели, интервал, границы семестра) в
// московском времени. Сегодняшние семинары сверяются с
// `calendar-events/learn/courses/{id}/events/{дата}` — там фактические
// занятия дня: перенесённый семинар плашка не покажет. Лекций в этом списке
// LMS не отдаёт никогда, поэтому лекциям верим по расписанию.
//
// Включено всегда. Только чтение, наружу ничего не уходит.

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = typeof chrome !== 'undefined' ? chrome : undefined;
}

if (typeof window.__culmsTimetableJoinInit === 'undefined') {
  window.__culmsTimetableJoinInit = true;

  ('use strict');

  const TIMETABLES_API = '/api/micro-lms/students/me/timetables';
  const VARIANTS_API = (courseId, eventType, rowNumber) =>
    `${TIMETABLES_API}/${courseId}/${eventType}/${rowNumber}`;
  const DAY_EVENTS_API = (courseId, date) =>
    `/api/micro-lms/calendar-events/learn/courses/${courseId}/events/${date}`;
  const KTALK_ORIGIN = 'https://centraluniversity.ktalk.ru/';

  const DAY_MS = 24 * 60 * 60 * 1000;
  // Пара «сейчас» уже за столько минут до начала — успеть подключиться.
  const SOON_MINUTES = 15;
  // Расписание и варианты за сеанс почти не меняются; сегодняшние занятия —
  // перепроверяем чаще.
  const TIMETABLE_TTL_MS = 30 * 60 * 1000;
  const VARIANTS_TTL_MS = 30 * 60 * 1000;
  const TODAY_TTL_MS = 10 * 60 * 1000;
  // Плашка «Сейчас» живёт по часам — перерисовываем раз в минуту.
  const TICK_MS = 60 * 1000;

  const BANNER_ID = 'culms-tt-join-banner';
  const ROW_CLASS = 'culms-tt-join-row';
  const COLUMN_CLASS = 'culms-tt-join-column';
  const CELL_CLASS = 'culms-tt-join-cell';
  const DRAWER_LINK_CLASS = 'culms-tt-join-drawer-line';
  const DRAWER_NOTE_CLASS = 'culms-tt-join-drawer-note';
  // Ставит slot_view_main.js, когда показывает выбор пар при закрытой записи.
  const PEEK_ATTR = 'data-culms-slot-view';

  const WEEKDAYS = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  const WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const MONTH_SHORT = [
    'янв.',
    'февр.',
    'мар.',
    'апр.',
    'мая',
    'июн.',
    'июл.',
    'авг.',
    'сент.',
    'окт.',
    'нояб.',
    'дек.',
  ];
  const EVENT_TYPE_LABEL = { lecture: 'лекция', seminar: 'семинар' };

  let observer = null;
  let tickTimer = null;
  // Было ли у скрипта живое расширение: после его перезагрузки старый скрипт
  // в странице должен остановиться, а без расширения (тесты) — работать.
  const hadRuntime = (() => {
    try {
      return !!(browser && browser.runtime && browser.runtime.id);
    } catch (_e) {
      return false;
    }
  })();
  /** { courses, loadedAt } */
  let timetable = null;
  /** Map<courseId, { loadedAt, events | null }> — фактические пары сегодня. */
  const todayEvents = new Map();
  /** Map<ключ строки, { loadedAt, list | null, error, promise }> — варианты. */
  const variants = new Map();

  const log = (...args) =>
    typeof window.cuLmsLog === 'function' ? window.cuLmsLog('[TimetableJoin]', ...args) : undefined;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // --- ВРЕМЯ ---
  // День — номер UTC-полуночи календарной даты: разница дней всегда кратна
  // суткам, переходы на летнее время не мешают. Время — минуты от полуночи по
  // Москве: расписание LMS записано в московском.

  function dayNumberOf(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  }

  function weekdayOfDay(day) {
    return new Date(day * DAY_MS).getUTCDay();
  }

  function minutesOf(hhmm) {
    const [h, m] = String(hhmm || '')
      .split(':')
      .map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function moscowNow() {
    const parts = {};
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .forEach((p) => (parts[p.type] = p.value));
    const iso = `${parts.year}-${parts.month}-${parts.day}`;
    return { day: dayNumberOf(iso), iso, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
  }

  function dayLabel(day, today) {
    if (day === today) return 'сегодня';
    if (day === today + 1) return 'завтра';
    const date = new Date(day * DAY_MS);
    return `${WEEKDAY_SHORT[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTH_SHORT[date.getUTCMonth()]}`;
  }

  function hhmm(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function timeRange(next) {
    return `${hhmm(next.start)}–${hhmm(next.end)}`;
  }

  // --- НАЗВАНИЯ КУРСОВ ---

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

  /** Ключи названия курса в ячейке — с оригиналом от своих названий курсов. */
  function cellNameKeys(cell) {
    const text = cell.textContent.trim();
    const keys = new Set([nameKey(text)]);
    const names = window.cuLmsCourseNames;
    if (names) {
      const target = cell.querySelector('[data-culms-orig-name]') || cell;
      if (typeof names.originalFor === 'function')
        keys.add(nameKey(names.originalFor(target, text)));
      if (typeof names.toOriginal === 'function') keys.add(nameKey(names.toOriginal(text)));
    }
    keys.delete('');
    return keys;
  }

  // --- РАСПИСАНИЕ ---

  function joinUrl(calendarEventId) {
    return KTALK_ORIGIN + String(calendarEventId).replace(/-/g, '');
  }

  /**
   * Ближайшее занятие строки, не закончившееся к `now`: { day, start, end }
   * или null, если семестр по этой строке кончился.
   */
  function nextOccurrence(schedule, now) {
    if (!schedule) return null;
    const weekday = WEEKDAYS[String(schedule.dayOfWeek || '').toLowerCase()];
    if (weekday === undefined || !schedule.startDate || !schedule.endDate) return null;
    const interval = Math.max(1, Number(schedule.interval) || 1);
    const start = dayNumberOf(schedule.startDate);
    const end = dayNumberOf(schedule.endDate);
    const first = start + ((weekday - weekdayOfDay(start) + 7) % 7);
    const startMin = minutesOf(schedule.startTime);
    const endMin = minutesOf(schedule.endTime);

    let day = Math.max(first, now.day);
    // Подровнять к своему дню недели и своей неделе (раз в две недели).
    day += (weekday - weekdayOfDay(day) + 7) % 7;
    const weeksFromFirst = Math.round((day - first) / 7);
    day += ((interval - (weeksFromFirst % interval)) % interval) * 7;
    if (day === now.day && now.minutes >= endMin) day += 7 * interval;
    if (day > end) return null;
    return { day, start: startMin, end: endMin };
  }

  function locationOf(event) {
    return event.location
      ? [event.location.title, event.location.building].filter(Boolean).join(' · ')
      : '';
  }

  /** Строки расписания с ближайшими занятиями — плоский список. */
  function buildRows(courses, now) {
    const rows = [];
    courses.forEach((course) => {
      (course.eventRows || []).forEach((row, index) => {
        const event = row.calendarEvent;
        if (!event || !event.calendarEventId || !event.schedule) return;
        rows.push({
          key: `${course.courseId}/${row.eventType}/${row.eventRowNumber}`,
          courseId: course.courseId,
          courseName: course.courseName,
          nameKey: nameKey(course.courseName),
          index,
          eventType: row.eventType,
          rowNumber: row.eventRowNumber,
          calendarEventId: event.calendarEventId,
          location: locationOf(event),
          format: event.format,
          next: nextOccurrence(event.schedule, now),
        });
      });
    });
    return rows;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  }

  async function loadTimetable() {
    if (timetable && Date.now() - timetable.loadedAt < TIMETABLE_TTL_MS) return timetable.courses;
    const courses = await fetchJson(TIMETABLES_API);
    timetable = { courses: Array.isArray(courses) ? courses : [], loadedAt: Date.now() };
    return timetable.courses;
  }

  /**
   * Фактические пары курса сегодня или null, если LMS не ответила — тогда
   * верим расписанию.
   */
  async function loadToday(courseId, iso) {
    const cached = todayEvents.get(courseId);
    if (cached && cached.iso === iso && Date.now() - cached.loadedAt < TODAY_TTL_MS) {
      return cached.events;
    }
    let events = null;
    try {
      const list = await fetchJson(DAY_EVENTS_API(courseId, iso));
      events = Array.isArray(list) ? list : null;
    } catch (error) {
      log('Нет занятий дня', courseId, error);
    }
    todayEvents.set(courseId, { iso, loadedAt: Date.now(), events });
    return events;
  }

  /**
   * Сегодняшние семинары сверяем с LMS: перенесённый убираем из «сейчас», у
   * состоявшегося берём фактические время и аудиторию. Лекции не сверяем —
   * в занятиях дня LMS их не отдаёт, и каждая выглядела бы отменённой.
   */
  async function confirmToday(rows, now) {
    const todayRows = rows.filter(
      (row) => row.eventType === 'seminar' && row.next && row.next.day === now.day
    );
    const courseIds = [...new Set(todayRows.map((row) => row.courseId))];
    const lists = await Promise.all(courseIds.map((id) => loadToday(id, now.iso)));
    const byCourse = new Map(courseIds.map((id, i) => [id, lists[i]]));
    todayRows.forEach((row) => {
      const events = byCourse.get(row.courseId);
      if (!events) return;
      const actual = events.find((event) => event.eventId === row.calendarEventId);
      if (!actual) {
        row.cancelledToday = true;
        return;
      }
      row.next = {
        day: now.day,
        start: minutesOf(actual.startTime) || row.next.start,
        end: minutesOf(actual.endTime) || row.next.end,
      };
      if (actual.locationTitle) row.location = actual.locationTitle;
    });
  }

  // --- ВАРИАНТЫ СТРОКИ (для drawer LMS) ---

  /** Варианты строки расписания — тот же запрос, что делает drawer LMS. */
  function loadVariants(row) {
    const cached = variants.get(row.key);
    if (cached && (cached.promise || Date.now() - cached.loadedAt < VARIANTS_TTL_MS)) {
      return cached.promise || Promise.resolve(cached);
    }
    const entry = { loadedAt: 0, list: null, error: null, promise: null };
    entry.promise = fetchJson(VARIANTS_API(row.courseId, row.eventType, row.rowNumber))
      .then((list) => {
        entry.list = Array.isArray(list) ? list : [];
      })
      .catch((error) => {
        log('Варианты строки не загрузились', row.key, error);
        entry.error = error;
      })
      .then(() => {
        entry.loadedAt = Date.now();
        entry.promise = null;
        return entry;
      });
    variants.set(row.key, entry);
    return entry.promise;
  }

  function isLive(next, now) {
    return (
      next &&
      next.day === now.day &&
      next.start - SOON_MINUTES <= now.minutes &&
      now.minutes < next.end
    );
  }

  function whenText(next, now) {
    if (!next) return 'занятия закончились';
    if (isLive(next, now)) {
      return now.minutes < next.start ? `начнётся в ${hhmm(next.start)}` : 'идёт сейчас';
    }
    return `ближайшая: ${dayLabel(next.day, now.day)}, ${hhmm(next.start)}`;
  }

  // --- DRAWER LMS «ВЫБРАТЬ ВРЕМЯ» ---
  // Родной drawer со всеми вариантами строки. Варианты в нём идут в том же
  // порядке, что в ответе `timetables/{курс}/{тип}/{номер}` (LMS только
  // дописывает пересечения), поэтому ссылку к варианту ставим по номеру, а
  // для надёжности сверяем преподавателя. В режиме просмотра (запись
  // закрыта, slot_view_main.js) кнопки «Выбрать время» — она шлёт
  // пересадку — в drawer нет.

  /** Строка таблицы, у которой последней нажали действие. */
  let drawerRow = null;

  function isPeek() {
    return document.documentElement.getAttribute(PEEK_ATTR) === 'peek';
  }

  function findDrawerForms() {
    return [...document.querySelectorAll('form.form')].filter((form) =>
      form.querySelector('tui-data-list.events-list')
    );
  }

  function decorateDrawer(form, now) {
    if (isPeek()) {
      form.querySelectorAll('.footer button[type="submit"]').forEach((button) => button.remove());
      form.querySelectorAll('.footer').forEach((footer) => {
        if (!footer.querySelector(`.${DRAWER_NOTE_CLASS}`)) {
          footer.appendChild(
            element(
              'div',
              `${DRAWER_NOTE_CLASS} font-text-xs`,
              'Запись на пары закрыта — здесь только посмотреть группы и трансляции.'
            )
          );
        }
      });
      const title = form.querySelector('.header__title');
      if (title && title.textContent.trim() === 'Выбрать время') title.textContent = 'Все группы';
    }

    const row = drawerRow;
    const options = [...form.querySelectorAll('tui-data-list.events-list > [tuioption]')];
    if (!row || !options.length) return;
    const entry = variants.get(row.key);
    if (!entry || entry.promise) {
      loadVariants(row).then(() => scheduleDrawer());
      return;
    }
    if (!entry.list) return;
    options.forEach((option, index) => {
      if (option.querySelector(`.${DRAWER_LINK_CLASS}`)) return;
      const variant = matchVariant(option, entry.list, index);
      if (!variant) return;
      const next = nextOccurrence(variant.schedule, now);
      const line = element('div', `${DRAWER_LINK_CLASS} font-text-xs`);
      if (variant.calendarEventId === row.calendarEventId) {
        line.appendChild(element('span', 'culms-tt-join-drawer-mine', 'твоя группа'));
      }
      line.appendChild(
        element(
          'span',
          `culms-tt-join-drawer-when${isLive(next, now) ? ' culms-tt-join-drawer-when--live' : ''}`,
          whenText(next, now)
        )
      );
      // Ссылка внутри кнопки-варианта: щелчок по ней не должен выбирать
      // вариант, а в Firefox <a> внутри <button> сам не переходит.
      const link = joinLink(variant.calendarEventId, 'Трансляция ↗', 'culms-tt-join-link');
      link.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.open(link.href, '_blank', 'noopener');
      });
      line.appendChild(link);
      option.appendChild(line);
    });
  }

  /** Вариант к пункту drawer: по номеру, если сходится преподаватель. */
  function matchVariant(option, list, index) {
    const text = nameKey(option.textContent);
    const hostMatches = (v) => {
      const hosts = (v.hosts || []).map((h) => nameKey(h && h.name)).filter(Boolean);
      return !hosts.length || hosts.every((h) => text.includes(h));
    };
    const byIndex = list[index];
    if (byIndex && hostMatches(byIndex)) return byIndex;
    const candidates = list.filter(hostMatches);
    return candidates.length === 1 ? candidates[0] : null;
  }

  let drawerQueued = false;
  function scheduleDrawer() {
    if (drawerQueued) return;
    drawerQueued = true;
    setTimeout(() => {
      drawerQueued = false;
      const now = moscowNow();
      findDrawerForms().forEach((form) => decorateDrawer(form, now));
    }, 50);
  }

  /** Подпись «Запись на пары» LMS ставит, когда запись не закрыта. */
  function fixPeekLabels() {
    if (!isPeek()) return;
    const selectors = [
      'cu-student-timetable-events > h1',
      '.breadcrumbs__item',
      'tui-breadcrumbs a',
      'a[href*="/learn/timetable"]',
    ];
    document.querySelectorAll(selectors.join(',')).forEach((node) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode;
        if (text.nodeValue.trim() === 'Запись на пары') {
          text.nodeValue = text.nodeValue.replace('Запись на пары', 'Мои пары');
        }
      }
    });
  }

  // --- ОТРИСОВКА ---

  function joinLink(calendarEventId, text, className) {
    const link = element('a', className, text);
    link.href = joinUrl(calendarEventId);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'Комната пары в Контур.Толке';
    return link;
  }

  function sortByNext(a, b) {
    return a.next.day - b.next.day || a.next.start - b.next.start;
  }

  function renderBanner(rows, now) {
    const heading = document.querySelector('cu-student-timetable-events h1, h1');
    let banner = document.getElementById(BANNER_ID);
    const upcoming = rows.filter((row) => row.next && !row.cancelledToday).sort(sortByNext);
    const current = upcoming.filter((row) => isLive(row.next, now));
    const later = upcoming.filter((row) => !current.includes(row)).slice(0, 1);
    if (!heading || (!current.length && !later.length)) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = element('div', 'culms-tt-join-banner');
      banner.id = BANNER_ID;
      heading.insertAdjacentElement('afterend', banner);
    }
    banner.replaceChildren();

    const addItem = (label, row, live) => {
      const item = element('div', `culms-tt-join-item${live ? ' culms-tt-join-item--live' : ''}`);
      item.appendChild(element('span', 'culms-tt-join-label', label));
      const text = element('div', 'culms-tt-join-text');
      text.appendChild(element('span', 'culms-tt-join-course', row.courseName));
      const parts = [
        EVENT_TYPE_LABEL[row.eventType] || row.eventType,
        live && now.minutes < row.next.start
          ? `начнётся в ${hhmm(row.next.start)}`
          : `${dayLabel(row.next.day, now.day)}, ${timeRange(row.next)}`,
        row.location,
      ].filter(Boolean);
      text.appendChild(element('span', 'culms-tt-join-meta', parts.join(' · ')));
      item.appendChild(text);
      item.appendChild(joinLink(row.calendarEventId, 'Подключиться', 'culms-tt-join-button'));
      banner.appendChild(item);
    };

    current.forEach((row) => addItem('Сейчас', row, true));
    later.forEach((row) => addItem('Дальше', row, false));
  }

  /** Ячейка в стиле соседних: неглубокая копия ради атрибутов Angular. */
  function cellLike(template, tag, className) {
    const node = template ? template.cloneNode(false) : document.createElement(tag);
    node.className = className;
    node.removeAttribute('rowspan');
    node.removeAttribute('colspan');
    return node;
  }

  /** Столбец «Трансляция» — перед колонкой действий LMS, если она есть. */
  function ensureHeader(table) {
    const headRow = table.querySelector('thead tr');
    if (!headRow) return;
    let th = headRow.querySelector(`th.${COLUMN_CLASS}`);
    const actions = headRow.querySelector('th.actions-column');
    if (th && (actions ? th.nextElementSibling === actions : !th.nextElementSibling)) return;
    th?.remove();
    const template = headRow.querySelector('th.host-name-column') || headRow.querySelector('th');
    th = cellLike(template, 'th', COLUMN_CLASS);
    th.textContent = 'Трансляция';
    headRow.insertBefore(th, actions);
  }

  /** Строки таблицы ↔ строки расписания: как в timetable_status.js. */
  function renderRows(rows, now) {
    const table = document.querySelector('table.cu-table');
    const tbody = table && table.querySelector('tbody');
    if (!tbody) return;
    ensureHeader(table);
    tbody.querySelectorAll(`td.${CELL_CLASS}`).forEach((node) => node.remove());
    rowByTr = new WeakMap();

    let keys = null;
    let index = 0;
    tbody.querySelectorAll('tr').forEach((tr) => {
      const courseCell = tr.querySelector('td.course-column');
      if (courseCell) {
        keys = cellNameKeys(courseCell);
        index = 0;
      }
      const scheduleCell = tr.querySelector('td.schedule-column');
      // «Нет данных» — одна ячейка на всю ширину, её не трогаем.
      if (!scheduleCell) return;
      const row = keys ? rows.find((r) => keys.has(r.nameKey) && r.index === index) : null;
      index++;

      const cell = cellLike(
        tr.querySelector('td.host-name-column') || scheduleCell,
        'td',
        CELL_CLASS
      );
      tr.insertBefore(cell, tr.querySelector('td.actions-column'));
      if (!row) return;
      rowByTr.set(tr, row);

      const when = element('div', `${ROW_CLASS}`);
      if (row.cancelledToday) {
        when.textContent = 'Сегодня в LMS её нет — проверь в чате курса';
      } else if (row.next) {
        when.textContent =
          row.next.day === now.day
            ? `${dayLabel(row.next.day, now.day)}, ${timeRange(row.next)}`
            : `${dayLabel(row.next.day, now.day)}, ${hhmm(row.next.start)}`;
        if (isLive(row.next, now)) when.classList.add('culms-tt-join-when--live');
      } else {
        when.textContent = 'Занятия закончились';
      }
      cell.appendChild(when);

      const links = element('div', 'culms-tt-join-links font-text-xs');
      links.appendChild(joinLink(row.calendarEventId, 'Трансляция ↗', 'culms-tt-join-link'));
      const action = tr.querySelector('td.actions-column button');
      if (action) {
        // Родной drawer LMS со всеми вариантами строки.
        const button = element('button', 'culms-tt-join-others-toggle', 'Все группы');
        button.type = 'button';
        button.addEventListener('click', () => {
          drawerRow = row;
          loadVariants(row);
          action.click();
        });
        links.appendChild(button);
      }
      cell.appendChild(links);
    });
  }

  /** tr → строка расписания: чтобы знать, чей drawer открыли. */
  let rowByTr = new WeakMap();

  document.addEventListener(
    'click',
    (event) => {
      const cell = event.target.closest && event.target.closest('td.actions-column');
      const tr = cell && cell.closest('tr');
      const row = tr && rowByTr.get(tr);
      if (row) {
        drawerRow = row;
        loadVariants(row);
      }
    },
    true
  );

  let renderRunning = false;

  async function render() {
    if (renderRunning) return;
    if (!document.querySelector('table.cu-table tbody tr')) return;
    renderRunning = true;
    try {
      const now = moscowNow();
      const rows = buildRows(await loadTimetable(), now);
      await confirmToday(rows, now);
      renderRows(rows, now);
      renderBanner(rows, now);
    } catch (error) {
      log('Не удалось нарисовать ссылки на пары', error);
    } finally {
      renderRunning = false;
    }
  }

  // --- ЖИЗНЕННЫЙ ЦИКЛ ---

  let debounce = null;

  function scheduleRender() {
    clearTimeout(debounce);
    debounce = setTimeout(() => void render(), 300);
  }

  function runtimeGone() {
    if (!hadRuntime) return false;
    try {
      return !(browser.runtime && browser.runtime.id);
    } catch (_e) {
      return true;
    }
  }

  function stop() {
    if (observer) observer.disconnect();
    observer = null;
    clearInterval(tickTimer);
    tickTimer = null;
  }

  /** Angular перерисовал таблицу: у какой-то строки нет нашей ячейки. */
  function tableNeedsRender() {
    const table = document.querySelector('table.cu-table');
    if (!table || !table.querySelector('tbody tr')) return false;
    if (!table.querySelector(`thead th.${COLUMN_CLASS}`)) return true;
    return [...table.querySelectorAll('tbody tr')].some(
      (tr) => tr.querySelector('td.schedule-column') && !tr.querySelector(`td.${CELL_CLASS}`)
    );
  }

  // Angular перерисовывает таблицу при переходах и смене слота — дописываем
  // заново; drawer «Выбрать время» дорисовывается, когда его открывают.
  observer = new MutationObserver(() => {
    if (runtimeGone()) {
      stop();
      return;
    }
    if (tableNeedsRender()) scheduleRender();
    if (findDrawerForms().length) scheduleDrawer();
    fixPeekLabels();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  tickTimer = setInterval(() => {
    if (runtimeGone()) stop();
    else void render();
  }, TICK_MS);
  scheduleRender();
}
