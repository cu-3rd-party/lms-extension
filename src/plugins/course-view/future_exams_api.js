// future_exams_api.js — расписание контрольных с lms-future-exams-backend:
// загрузка с кэшем, разбор дат, номера недель и сопоставление с курсами.
//
// Расписание нужно в двух местах: в аккордеоне страницы курса
// (future_exams_view.js) и в дэшборде на странице «Мои курсы» (exams_dashboard.js).
// Раньше загрузка и разбор жили прямо в future_exams_view.js; вынесены сюда,
// чтобы оба места показывали одни и те же номера недель и одинаково находили
// курс в расписании.
//
// Наружу отдаётся `window.cuLmsFutureExams`. Файл подключается раньше обоих
// потребителей (см. index.manifest.ts).

// Polyfill to handle browser namespace differences (Chrome uses 'chrome', Firefox uses 'browser')
if (typeof browser === 'undefined') {
  var browser = chrome;
}

if (typeof window.cuLmsFutureExams === 'undefined') {
  ('use strict');

  // https://github.com/cu-3rd-party/lms-future-exams-backend
  const BACKEND_URL = 'https://lms.exams.cu3rd.ru';
  // Расписание и дата первой недели правятся вручную через админку сервера,
  // а не каждую минуту — получасовой TTL достаточен и не дёргает сервер на
  // каждое открытие страницы.
  const CACHE_TTL_MS = 30 * 60 * 1000;
  const SCHEDULE_CACHE_KEY = 'futureExamsScheduleCache';
  const CONFIG_CACHE_KEY = 'futureExamsConfigCache';
  // Так было захардкожено до появления поля в конфиге сервера.
  const DEFAULT_SEMESTER_START = '01 09';
  // Пункт расписания относится к семестру, если он не раньше чем за месяц до
  // его начала: так «ДД ММ» без года однозначно превращается в дату, в том
  // числе январские пункты осеннего семестра.
  const ITEM_LEAD_DAYS = 31;
  const DAY_MS = 24 * 60 * 60 * 1000;

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
  // Сокращения — как у Intl.DateTimeFormat('ru', { month: 'short' }).
  const MONTHS_SHORT = [
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

  let inflight = null;

  // --- ЗАГРУЗКА ---

  /**
   * Тянет JSON с сервера с кэшем в browser.storage.local. При недоступности
   * сервера отдаёт последний закэшированный ответ, а если кэша ещё нет —
   * null: плагин никогда не должен ронять страницу из-за сетевой ошибки.
   *
   * Запрос идёт через background (сообщение FETCH_JSON), а не напрямую
   * fetch() отсюда: в Firefox content-скрипты не получают CORS-обход из
   * host_permissions (в отличие от Chrome), и прямой кросс-доменный fetch
   * падает с "CORS request did not succeed" даже когда сервер шлёт
   * Access-Control-Allow-Origin. У background-скрипта такого ограничения нет.
   */
  async function fetchWithCache(url, cacheKey) {
    const timestampKey = `${cacheKey}Timestamp`;
    const stored = await browser.storage.local.get([cacheKey, timestampKey]);
    const cached = stored[cacheKey];
    const cachedAt = stored[timestampKey] || 0;

    if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
      return cached;
    }

    try {
      const response = await browser.runtime.sendMessage({ action: 'FETCH_JSON', url });
      if (!response || !response.success) {
        throw new Error((response && response.error) || 'no response from background');
      }
      const data = response.data;
      await browser.storage.local.set({ [cacheKey]: data, [timestampKey]: Date.now() });
      return data;
    } catch (e) {
      console.log(`[FutureExams] Failed to fetch ${url}, falling back to cache:`, e);
      return cached || null;
    }
  }

  const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

  /**
   * `{ schedule, config }` или null, если сервер недоступен и кэша нет.
   * Одновременные вызовы делят один запрос.
   */
  function load() {
    if (!inflight) {
      inflight = (async () => {
        const [schedule, config] = await Promise.all([
          fetchWithCache(`${BACKEND_URL}/api/schedule`, SCHEDULE_CACHE_KEY),
          fetchWithCache(`${BACKEND_URL}/api/config`, CONFIG_CACHE_KEY),
        ]);
        if (!isPlainObject(schedule)) return null;
        return { schedule, config: isPlainObject(config) ? config : {} };
      })().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  }

  // --- ДАТЫ ---
  //
  // Даты считаются номерами дней (дни от 1970-01-01 для календарной даты), а
  // не миллисекундами местного времени: разница между двумя датами тогда
  // всегда целое число дней, и переход на летнее время её не сдвигает.

  const dayNumber = (year, monthIndex, day) => Math.round(Date.UTC(year, monthIndex, day) / DAY_MS);

  /** Номер дня для местной календарной даты `date`. */
  const dayOf = (date) => dayNumber(date.getFullYear(), date.getMonth(), date.getDate());

  /** Местная полночь дня с номером `day`. */
  function dateOf(day) {
    const utc = new Date(day * DAY_MS);
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  }

  /** Понедельник недели, в которую попадает день `day`. */
  function mondayOf(day) {
    const weekday = (new Date(day * DAY_MS).getUTCDay() + 6) % 7; // 0 — понедельник
    return day - weekday;
  }

  /** «ДД ММ» → { day, month } (месяц с нуля) или null. */
  function parseDayMonth(text) {
    if (typeof text !== 'string') return null;
    const match = text.trim().match(/^(\d{1,2})\s+(\d{1,2})$/);
    if (!match) return null;
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    return { day, month };
  }

  /** Номер дня для «ДД ММ» в году `year`; null, если такой даты нет (31 апреля). */
  function dayInYear(parsed, year) {
    const probe = new Date(Date.UTC(year, parsed.month, parsed.day));
    if (probe.getUTCMonth() !== parsed.month) return null;
    return dayNumber(year, parsed.month, parsed.day);
  }

  /**
   * Понедельник первой недели семестра.
   *
   * Год в конфиге не указан, поэтому берём вхождение даты, ближайшее к
   * сегодня: в январе «07 09» — это прошлый сентябрь (сессия осеннего
   * семестра), а выставленное заранее «09 02» — ближайший февраль. Раньше год
   * всегда был текущим, и в январе номера недель уходили в минус.
   *
   * Неделя — календарная, с понедельника: если в конфиге окажется не
   * понедельник, первой неделей считается та, в которую он попадает.
   */
  function semesterStartDay(config, today = new Date()) {
    const parsed =
      parseDayMonth(config && config.semesterStart) || parseDayMonth(DEFAULT_SEMESTER_START);
    const todayDay = dayOf(today);
    const year = today.getFullYear();

    let best = null;
    [year - 1, year, year + 1].forEach((candidateYear) => {
      const candidate = dayInYear(parsed, candidateYear);
      if (candidate === null) return;
      if (best === null || Math.abs(candidate - todayDay) < Math.abs(best - todayDay)) {
        best = candidate;
      }
    });
    return mondayOf(best);
  }

  /**
   * Номер дня для «ДД ММ» из расписания: первое вхождение не раньше чем за
   * месяц до начала семестра. Январские пункты осеннего семестра так попадают
   * в следующий год, а не в прошлый январь. null — дата не разобралась.
   */
  function resolveDay(text, semesterStart) {
    const parsed = parseDayMonth(text);
    if (!parsed) return null;

    const earliest = semesterStart - ITEM_LEAD_DAYS;
    const startYear = dateOf(semesterStart).getFullYear();
    for (const year of [startYear - 1, startYear, startYear + 1]) {
      const day = dayInYear(parsed, year);
      if (day !== null && day >= earliest) return day;
    }
    return null;
  }

  /** Номер учебной недели дня `day`; первая неделя — та, где начало семестра. */
  const weekNumber = (day, semesterStart) => Math.floor((day - semesterStart) / 7) + 1;

  /**
   * «21–27 сентября», «28 сентября – 4 октября»; с `{ short: true }` —
   * «21–27 сент.», «28 сент. – 4 окт.».
   */
  function formatDayRange(first, last, { short = false } = {}) {
    const months = short ? MONTHS_SHORT : MONTHS_GENITIVE;
    if (first.getMonth() === last.getMonth()) {
      return `${first.getDate()}–${last.getDate()} ${months[first.getMonth()]}`;
    }
    return (
      `${first.getDate()} ${months[first.getMonth()]} – ` +
      `${last.getDate()} ${months[last.getMonth()]}`
    );
  }

  // --- СОПОСТАВЛЕНИЕ С КУРСАМИ ---

  const normalizeTitle = (text) =>
    (text || '').replace(/ё/gi, 'е').replace(/\s+/g, ' ').trim().toLowerCase();

  /**
   * Ключ расписания для курса. Ключ — название курса или его часть, и курс
   * ищется по вхождению ключа в своё название (так договорено с админкой
   * сервера, см. README сервера).
   *
   * Если подходят несколько ключей, побеждает самый длинный. Раньше брался
   * первый по порядку в JSON, и «Микроэкономика. Продвинутый уровень»
   * получала расписание обычной «Микроэкономики», потому что та стоит в
   * файле выше.
   */
  function findScheduleKey(courseTitle, schedule) {
    const title = normalizeTitle(courseTitle);
    if (!title || !isPlainObject(schedule)) return null;

    let best = null;
    Object.keys(schedule).forEach((key) => {
      const needle = normalizeTitle(key);
      if (!needle || !title.includes(needle)) return;
      if (!Array.isArray(schedule[key])) return;
      if (best === null || needle.length > normalizeTitle(best).length) best = key;
    });
    return best;
  }

  /**
   * Курсы, у которых есть расписание, — в порядке списка, с их ключом.
   *
   * Один ключ достаётся одному курсу. Иначе «Отборочная работа на курс
   * Алгоритмы и структуры данных 1» тоже содержит ключ «Алгоритмы и
   * структуры данных 1» и дублировала бы его контрольные. Побеждает курс с
   * самым коротким названием: ключ описывает именно его, а длинное название
   * лишь упоминает.
   */
  function matchCourses(courses, schedule) {
    const matches = [];
    const winnerByKey = new Map();

    (courses || []).forEach((course) => {
      if (!course || typeof course.name !== 'string') return;
      const key = findScheduleKey(course.name, schedule);
      if (!key) return;
      matches.push({ course, key });

      const current = winnerByKey.get(key);
      if (!current || course.name.trim().length < current.name.trim().length) {
        winnerByKey.set(key, course);
      }
    });

    return matches.filter(({ course, key }) => winnerByKey.get(key) === course);
  }

  /**
   * Контрольные по неделям: `count` недель подряд, начиная со сдвига `start`
   * от текущей (0 — с текущей, 1 — со следующей, -1 — с прошлой). У недели
   * `offset` — её сдвиг от текущей, по нему дэшборд подписывает недели.
   *
   * `courses` — курсы студента в порядке списка: `[{ id, name }]`. Пункты
   * одного курса за неделю сохраняют порядок расписания, одинаковые
   * склеиваются со счётчиком («Тест ×2»).
   *
   * Неделю считаем целиком, а не «с сегодняшнего дня»: в расписании у пункта
   * стоит понедельник его недели, и контрольная текущей недели иначе пропала
   * бы уже во вторник.
   *
   * `firstEventWeek`/`lastEventWeek` — первая и последняя неделя, где у этих
   * курсов вообще есть контрольные (null — нигде): до них дэшборд и листает.
   */
  function upcomingWeeks({ schedule, config, courses, today = new Date(), count = 3, start = 0 }) {
    const semesterStart = semesterStartDay(config, today);
    const currentWeek = weekNumber(dayOf(today), semesterStart);
    const firstShown = currentWeek + start;

    const weeks = [];
    for (let index = 0; index < count; index++) {
      const number = firstShown + index;
      const firstDay = semesterStart + (number - 1) * 7;
      weeks.push({
        offset: number - currentWeek,
        number,
        first: dateOf(firstDay),
        last: dateOf(firstDay + 6),
        courses: [],
      });
    }

    let firstEventWeek = null;
    let lastEventWeek = null;

    const matched = matchCourses(courses, schedule);
    matched.forEach(({ course, key }) => {
      /** номер недели → Map(название → сколько раз) */
      const eventsByWeek = new Map();

      schedule[key].forEach((item) => {
        if (!item || typeof item.name !== 'string' || !item.name.trim()) return;
        const day = resolveDay(item.date, semesterStart);
        if (day === null) return;

        const number = weekNumber(day, semesterStart);
        if (firstEventWeek === null || number < firstEventWeek) firstEventWeek = number;
        if (lastEventWeek === null || number > lastEventWeek) lastEventWeek = number;
        if (number < firstShown || number >= firstShown + count) return;

        if (!eventsByWeek.has(number)) eventsByWeek.set(number, new Map());
        const events = eventsByWeek.get(number);
        const name = item.name.trim();
        events.set(name, (events.get(name) || 0) + 1);
      });

      weeks.forEach((week) => {
        const events = eventsByWeek.get(week.number);
        if (!events) return;
        week.courses.push({
          id: course.id,
          name: course.name,
          events: Array.from(events, ([name, times]) => ({ name, count: times })),
        });
      });
    });

    return {
      weeks,
      currentWeek,
      matchedCourses: matched.length,
      firstEventWeek,
      lastEventWeek,
    };
  }

  window.cuLmsFutureExams = {
    BACKEND_URL,
    load,
    parseDayMonth,
    dayOf,
    dateOf,
    semesterStartDay,
    resolveDay,
    weekNumber,
    formatDayRange,
    findScheduleKey,
    matchCourses,
    upcomingWeeks,
  };
}
