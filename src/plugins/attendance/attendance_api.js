// attendance_api.js — посещаемость своих семинаров за семестр.
//
// LMS отдаёт посещаемость только по одному дню: список пар курса за дату
// (`calendar-events/learn/courses/{id}/events/{дата}`, у своей пары
// `isParticipant: true`) и id пар, на которых студент отмечен
// (`v0/attendance/learn/courses/{id}/events/{дата}`). Чтобы собрать семестр,
// нужно знать даты своих семинаров. Их даёт расписание
// (`students/me/timetables`): у каждого семинара день недели, интервал (раз в
// одну или две недели) и границы. `eventId` в посещаемости — это id всей
// серии занятий из расписания, а не одного дня, поэтому отметка ищется по
// дате + id.
//
// Лекции LMS в посещаемость не отдаёт вовсе — считаются только семинары.
//
// Наружу — `window.cuLmsAttendance`; им пользуются attendance_summary.js и
// attendance_course.js. Оба могут попросить данные одновременно — загрузка
// одна на всех и живёт минуту.

(function () {
  'use strict';

  if (window.cuLmsAttendance) return;

  const API = '/api/micro-lms';
  const DAY_MS = 24 * 60 * 60 * 1000;
  // Ответы по прошедшим дням кладём в localStorage: у прошлой пары список и
  // отметка уже не меняются, и повторный заход в раздел обходится без сотни
  // запросов. Отметку LMS ставит не сразу — на самой странице написано «если
  // посещение не отобразилось спустя неделю после пары — свяжись с
  // поддержкой». Поэтому окончательным считается ответ, полученный позже, чем
  // через FINAL_AFTER_DAYS после пары; более свежие запрашиваются заново.
  const CACHE_KEY = 'culms.attendance.cache.v1';
  const FINAL_AFTER_DAYS = 8;
  // Пару моложе недели LMS может ещё отметить — она не «пропуск», а «ждём».
  const MARK_GRACE_DAYS = 7;
  // Записи старше полугода из кеша выкидываем — это прошлые семестры.
  const CACHE_MAX_AGE_DAYS = 200;
  // Запросов к LMS одновременно не больше этого: страница посещаемости сама
  // делает два запроса на дату, а сводная — до сотни.
  const CONCURRENCY = 6;
  const DATA_TTL_MS = 60 * 1000;
  // Норма посещения семинаров в ЦУ — 75%. Студент может поменять её во
  // вкладке «Сводная» (culms.attendance.prefs).
  const DEFAULT_NORM = 75;
  // Посещаемость в ЦУ отмечают не с первой недели семестра: осенью 2026 — с
  // 21 сентября (сказал пользователь; с ним сходится и «За весь семестр» в
  // LMS — 13 суббот из 15, две сентябрьские не в счёт). Пары раньше этой даты
  // не запрашиваются, не показываются и не считаются. В следующих семестрах
  // дата не мешает: берётся поздняя из неё и начала семестра. Новую дату
  // отсчёта — дописать сюда.
  const TRACKING_STARTS = ['2026-09-21'];

  const WEEKDAY_INDEX = {
    monday: 0,
    tuesday: 1,
    wednesday: 2,
    thursday: 3,
    friday: 4,
    saturday: 5,
    sunday: 6,
  };

  const log = (...args) =>
    typeof window.cuLmsLog === 'function' ? window.cuLmsLog('[Attendance]', ...args) : undefined;

  // --- ДАТЫ ---
  // Дни — номера «календарных» UTC-полуночей от локальной даты, как в
  // сводной ведомостей: разница между днями всегда кратна суткам.

  function dayNumber(date) {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
  }

  function parseYmd(text) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text || ''));
    return match ? Date.UTC(+match[1], +match[2] - 1, +match[3]) / DAY_MS : null;
  }

  function ymd(day) {
    return new Date(day * DAY_MS).toISOString().slice(0, 10);
  }

  function dateOf(day) {
    const d = new Date(day * DAY_MS);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  /** Понедельник недели; 1970-01-01 — четверг, отсюда +3. */
  function mondayOf(day) {
    return day - ((day + 3) % 7);
  }

  /** 0 — понедельник, 6 — воскресенье. */
  function weekdayOf(day) {
    return (day + 3) % 7;
  }

  function minutesOf(time) {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(time || ''));
    return match ? +match[1] * 60 + +match[2] : null;
  }

  // --- ЗАПРОСЫ ---

  let running = 0;
  const waiting = [];

  async function limited(task) {
    if (running >= CONCURRENCY) await new Promise((resolve) => waiting.push(resolve));
    running++;
    try {
      return await task();
    } finally {
      running--;
      waiting.shift()?.();
    }
  }

  class HttpError extends Error {
    constructor(status, url) {
      super(`LMS API вернул ${status} для ${url}`);
      this.status = status;
    }
  }

  function fetchJson(path) {
    return limited(async () => {
      const response = await fetch(API + path, {
        credentials: 'include',
        headers: { accept: 'application/json, text/plain, */*' },
      });
      if (!response.ok) throw new HttpError(response.status, path);
      return response.json();
    });
  }

  // --- КЕШ ---

  function readCache() {
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  }

  function writeCache(cache, today) {
    for (const key of Object.keys(cache)) {
      const day = parseYmd(key.split(':')[1]);
      if (day == null || today - day > CACHE_MAX_AGE_DAYS) delete cache[key];
    }
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      // приватный режим или переполнение — в следующий раз спросим заново
    }
  }

  function isFinal(entry, day) {
    return entry && typeof entry.at === 'number' && entry.at - day >= FINAL_AFTER_DAYS;
  }

  // --- РАСПИСАНИЕ ---

  /** Семинары студента по курсам: Map<courseId, серия[]>. */
  function seminarsByCourse(timetables) {
    const byCourse = new Map();
    for (const course of Array.isArray(timetables) ? timetables : []) {
      for (const row of course?.eventRows || []) {
        const event = row?.calendarEvent;
        const schedule = event?.schedule;
        if (row.eventType !== 'seminar' || !event?.calendarEventId || !schedule) continue;
        const weekday = WEEKDAY_INDEX[String(schedule.dayOfWeek || '').toLowerCase()];
        const start = parseYmd(schedule.startDate);
        const end = parseYmd(schedule.endDate);
        if (weekday == null || start == null || end == null) continue;
        if (!byCourse.has(course.courseId)) byCourse.set(course.courseId, []);
        byCourse.get(course.courseId).push({
          eventId: event.calendarEventId,
          row: row.eventRowNumber ?? null,
          weekday,
          interval: Math.max(1, Number(schedule.interval) || 1),
          start,
          end,
          startTime: schedule.startTime || '',
          endTime: schedule.endTime || '',
          place: event.location?.title || '',
          hosts: (event.hosts || []).map((h) => String(h?.name || '').trim()).filter(Boolean),
        });
      }
    }
    return byCourse;
  }

  /** Дни занятий серии: от первого подходящего дня недели с шагом в интервал. */
  function seriesDays(series) {
    const days = [];
    let day = series.start + ((series.weekday - weekdayOf(series.start) + 7) % 7);
    for (; day <= series.end; day += 7 * series.interval) days.push(day);
    return days;
  }

  /** Границы семестра — по самым ранним и поздним датам расписания. */
  function semesterBounds(byCourse, today) {
    let start = null;
    let end = null;
    for (const list of byCourse.values()) {
      for (const s of list) {
        if (start == null || s.start < start) start = s.start;
        if (end == null || s.end > end) end = s.end;
      }
    }
    if (start == null) {
      // Расписания нет — берём начало учебного полугодия: 1 сентября или
      // 1 февраля, что ближе в прошлом.
      const d = dateOf(today);
      const year = d.getFullYear();
      const autumn = dayNumber(new Date(year, 8, 1));
      const spring = dayNumber(new Date(year, 1, 1));
      start =
        today >= autumn ? autumn : today >= spring ? spring : dayNumber(new Date(year - 1, 8, 1));
      end = today;
    }
    return { start, end: Math.max(end, today) };
  }

  /**
   * С какого дня считать посещаемость: самая поздняя из известных дат начала
   * отслеживания, не позже сегодня, но не раньше начала семестра.
   */
  function trackingStart(semester, today) {
    let from = semester.start;
    for (const text of TRACKING_STARTS) {
      const day = parseYmd(text);
      if (day != null && day <= today && day > from && day <= semester.end) from = day;
    }
    return from;
  }

  // --- ПОСЕЩАЕМОСТЬ ---

  /**
   * Что пришло за день по курсу: свои пары и отметки. Через кеш.
   * `sparse` — при обходе всех дней подряд: тогда отметки спрашиваем, только
   * если в этот день есть своя пара, — так пустые дни стоят один запрос.
   */
  async function dayInfo(courseId, day, ctx, sparse) {
    const key = `${courseId}:${ymd(day)}`;
    const cached = ctx.cache[key];
    if (!ctx.force && isFinal(cached, day)) return cached;

    const date = ymd(day);
    const eventsUrl = `/calendar-events/learn/courses/${courseId}/events/${date}`;
    const visitedUrl = `/v0/attendance/learn/courses/${courseId}/events/${date}`;
    let events;
    let visited;
    if (sparse) {
      events = await fetchJson(eventsUrl);
      const hasMine = Array.isArray(events) && events.some((e) => e && e.isParticipant);
      visited = hasMine ? await fetchJson(visitedUrl) : [];
    } else {
      [events, visited] = await Promise.all([fetchJson(eventsUrl), fetchJson(visitedUrl)]);
    }
    const entry = {
      at: ctx.today,
      mine: (Array.isArray(events) ? events : [])
        .filter((e) => e && e.isParticipant)
        .map((e) => ({
          eventId: e.eventId,
          startTime: e.startTime || '',
          endTime: e.endTime || '',
          row: e.rowNumber ?? null,
          format: e.format || '',
          place: e.locationTitle || '',
          hosts: (e.hosts || []).map((h) => String(h?.name || '').trim()).filter(Boolean),
        })),
      visited: Array.isArray(visited) ? visited.map(String) : [],
    };
    ctx.cache[key] = entry;
    return entry;
  }

  function statusOf(day, endTime, attended, ctx) {
    if (attended) return 'attended';
    if (day > ctx.today) return 'upcoming';
    if (day === ctx.today) {
      const end = minutesOf(endTime);
      if (end != null && ctx.nowMinutes < end) return 'upcoming';
    }
    return ctx.today - day < MARK_GRACE_DAYS ? 'pending' : 'missed';
  }

  /**
   * Занятия курса за семестр. Прошедшие — из LMS, будущие — по расписанию.
   * Если в расписании серия есть, а в LMS в этот день своей пары нет —
   * значит, её не было (праздник, перенос): такой день помечается `none` и в
   * счёт не идёт.
   */
  async function courseSessions(course, series, ctx, onDay) {
    const planned = new Map();
    for (const s of series) {
      for (const day of seriesDays(s)) {
        if (day < ctx.trackFrom) continue;
        if (!planned.has(day)) planned.set(day, []);
        planned.get(day).push(s);
      }
    }

    // Расписания по курсу нет (поменяли группу, курс не из сетки) — проходим
    // все дни с начала отслеживания до сегодня. Будущих пар тогда не знаем.
    const scan = !series.length;
    const days = scan
      ? Array.from(
          { length: Math.max(0, ctx.today - ctx.trackFrom + 1) },
          (_, i) => ctx.trackFrom + i
        )
      : [...planned.keys()].sort((a, b) => a - b);

    const sessions = [];
    await Promise.all(
      days.map(async (day) => {
        const plans = planned.get(day) || [];
        if (day > ctx.today) {
          for (const s of plans) sessions.push(sessionFrom(s, day, 'upcoming', 'timetable'));
          return;
        }
        const info = await dayInfo(course.courseId, day, ctx, scan);
        onDay();
        if (info.mine.length) {
          for (const e of info.mine) {
            const attended = info.visited.includes(String(e.eventId));
            sessions.push({
              ...e,
              day,
              status: statusOf(day, e.endTime, attended, ctx),
              source: 'lms',
            });
          }
        } else {
          for (const s of plans) sessions.push(sessionFrom(s, day, 'none', 'timetable'));
        }
      })
    );
    sessions.sort((a, b) => a.day - b.day || a.startTime.localeCompare(b.startTime));
    return { sessions, scanned: scan };
  }

  function sessionFrom(series, day, status, source) {
    return {
      eventId: series.eventId,
      startTime: series.startTime,
      endTime: series.endTime,
      row: series.row,
      format: '',
      place: series.place,
      hosts: series.hosts,
      day,
      status,
      source,
    };
  }

  /**
   * Счёт по курсу.
   *   settled  — прошедшие пары, по которым отметка уже окончательная
   *              (был или пропуск); от них считается процент;
   *   pending  — прошли меньше недели назад и без отметки: LMS ещё может её
   *              поставить, в процент не входят ни туда, ни сюда;
   *   semester — сколько семинаров за семестр: число LMS («За весь семестр»),
   *              а если его нет — по расписанию;
   *   max      — сколько выйдет к концу, если ходить на все оставшиеся и
   *              ждущие отметки засчитают.
   * Число LMS меньше, чем пар в расписании за весь семестр: оно считается с
   * начала отслеживания (TRACKING_STARTS), как и всё здесь.
   */
  function countsOf(sessions, lmsStats) {
    const by = (status) => sessions.filter((s) => s.status === status).length;
    const attended = by('attended');
    const missed = by('missed');
    const pending = by('pending');
    const upcoming = by('upcoming');
    const settled = attended + missed;
    const lmsTotal = Number(lmsStats?.enrolledCount);
    const semester =
      Number.isFinite(lmsTotal) && lmsTotal > 0 ? lmsTotal : settled + pending + upcoming;
    return {
      attended,
      missed,
      pending,
      upcoming,
      settled,
      semester,
      left: Math.max(0, semester - settled - pending),
      max: Math.max(attended, semester - missed),
      rate: settled ? attended / settled : null,
      lmsAttended: Number.isFinite(Number(lmsStats?.attendedCount))
        ? Number(lmsStats.attendedCount)
        : null,
    };
  }

  // --- ЗАГРУЗКА ---

  let current = null;

  /**
   * Все курсы посещаемости с семинарами за семестр.
   * `onProgress({ done, total })` — для полосы загрузки; `force` — мимо кеша.
   */
  function load({ force = false, onProgress } = {}) {
    if (!force && current && (current.pending || Date.now() - current.at < DATA_TTL_MS)) {
      if (onProgress) current.listeners.add(onProgress);
      return current.promise;
    }
    const entry = { at: Date.now(), pending: true, listeners: new Set() };
    if (onProgress) entry.listeners.add(onProgress);
    entry.promise = loadAll(force, (progress) =>
      entry.listeners.forEach((fn) => {
        try {
          fn(progress);
        } catch (error) {
          log('ошибка в обработчике прогресса', error);
        }
      })
    ).finally(() => {
      entry.pending = false;
      entry.at = Date.now();
    });
    entry.promise.catch(() => {
      if (current === entry) current = null;
    });
    current = entry;
    return entry.promise;
  }

  async function loadAll(force, report) {
    const now = new Date();
    const today = dayNumber(now);
    const [courses, timetables] = await Promise.all([
      fetchJson('/v0/attendance/learn/courses?isArchived=false'),
      fetchJson('/students/me/timetables').catch((error) => {
        log('расписание не загрузилось', error);
        return [];
      }),
    ]);
    const byCourse = seminarsByCourse(timetables);
    const ctx = {
      today,
      nowMinutes: now.getHours() * 60 + now.getMinutes(),
      force,
      cache: readCache(),
      semester: semesterBounds(byCourse, today),
    };
    ctx.trackFrom = trackingStart(ctx.semester, today);

    const list = (Array.isArray(courses) ? courses : []).filter((c) => c && c.courseId != null);
    const open = list.filter((c) => c.isVisibleForStudents);
    // Число запросов заранее: по дню на прошедшее занятие (или на каждый день
    // семестра, если расписания по курсу нет).
    const progress = { done: 0, total: 0 };
    for (const c of open) {
      const series = byCourse.get(c.courseId) || [];
      progress.total += series.length
        ? new Set(series.flatMap(seriesDays).filter((d) => d >= ctx.trackFrom && d <= today)).size
        : Math.max(0, today - ctx.trackFrom + 1);
    }
    report({ ...progress });

    const result = await Promise.all(
      list.map(async (c) => {
        const series = byCourse.get(c.courseId) || [];
        const base = {
          id: c.courseId,
          name: c.courseName || '',
          studentStatus: c.studentStatus || '',
          visible: !!c.isVisibleForStudents,
          lms: c.stats || null,
          hasSeminars: series.length > 0,
          sessions: [],
          counts: null,
          scanned: false,
          error: null,
        };
        if (!base.visible) return base;
        try {
          const { sessions, scanned } = await courseSessions(c, series, ctx, () => {
            progress.done++;
            report({ ...progress });
          });
          return { ...base, sessions, scanned, counts: countsOf(sessions, c.stats) };
        } catch (error) {
          log('курс не загрузился', c.courseId, error);
          return { ...base, error: String(error?.message || error) };
        }
      })
    );

    writeCache(ctx.cache, today);
    return {
      courses: result,
      today,
      semester: ctx.semester,
      trackFrom: ctx.trackFrom,
      loadedAt: Date.now(),
    };
  }

  /** Сбросить загруженное — следующий `load()` спросит LMS заново. */
  function invalidate() {
    current = null;
  }

  window.cuLmsAttendance = {
    load,
    invalidate,
    dayNumber,
    parseYmd,
    ymd,
    dateOf,
    mondayOf,
    weekdayOf,
    seriesDays,
    seminarsByCourse,
    countsOf,
    MARK_GRACE_DAYS,
    DEFAULT_NORM,
    CACHE_KEY,
  };
})();
