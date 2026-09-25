import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Расписание контрольных: даты без года, номера недель, поиск курса в
// расписании и сборка недель для дэшборда на странице «Мои курсы».
const source = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/course-view/future_exams_api.js'),
  'utf8'
);

type Course = { id: number; name: string };
type Week = {
  offset: number;
  number: number;
  first: Date;
  last: Date;
  courses: { id: number; name: string; events: { name: string; count: number }[] }[];
};
type FutureExams = {
  load: () => Promise<{
    schedule: Record<string, unknown>;
    config: Record<string, unknown>;
  } | null>;
  parseDayMonth: (text: unknown) => { day: number; month: number } | null;
  dayOf: (date: Date) => number;
  dateOf: (day: number) => Date;
  semesterStartDay: (config: unknown, today?: Date) => number;
  resolveDay: (text: string, semesterStart: number) => number | null;
  weekNumber: (day: number, semesterStart: number) => number;
  formatDayRange: (first: Date, last: Date, options?: { short?: boolean }) => string;
  findScheduleKey: (title: string, schedule: unknown) => string | null;
  matchCourses: (courses: Course[], schedule: unknown) => { course: Course; key: string }[];
  upcomingWeeks: (options: {
    schedule: unknown;
    config: unknown;
    courses: Course[];
    today?: Date;
    count?: number;
  }) => { weeks: Week[]; currentWeek: number; matchedCourses: number };
};

function load(browser: unknown = {}): FutureExams {
  const window: Record<string, any> = {};
  new Function('window', 'browser', 'chrome', source)(window, browser, browser);
  return window.cuLmsFutureExams;
}

const exams = load();
const date = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const day = (y: number, m: number, d: number) => exams.dayOf(date(y, m, d));
/** Дата дня в виде «ГГГГ-ММ-ДД» — чтобы сравнивать с ожиданием глазами. */
const iso = (dayNumber: number | null) => {
  if (dayNumber === null) return null;
  const d = exams.dateOf(dayNumber);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-');
};

// Осенний семестр 2026: первая неделя начинается в понедельник 7 сентября.
const FALL = { semesterStart: '07 09' };
const fallStart = exams.semesterStartDay(FALL, date(2026, 9, 25));

test('«ДД ММ» разбирается, мусор — нет', () => {
  expect(exams.parseDayMonth('14 09')).toEqual({ day: 14, month: 8 });
  expect(exams.parseDayMonth(' 7 9 ')).toEqual({ day: 7, month: 8 });
  expect(exams.parseDayMonth('14.09')).toBeNull();
  expect(exams.parseDayMonth('32 01')).toBeNull();
  expect(exams.parseDayMonth('10 13')).toBeNull();
  expect(exams.parseDayMonth(undefined)).toBeNull();
});

test('начало семестра — ближайшее к сегодня вхождение даты', () => {
  expect(iso(fallStart)).toBe('2026-09-07');
  // Январь — сессия осеннего семестра: это прошлый сентябрь, а не будущий.
  // Раньше год всегда был текущим, и номера недель уходили в минус.
  expect(iso(exams.semesterStartDay(FALL, date(2027, 1, 15)))).toBe('2026-09-07');
  // Весенний семестр, выставленный заранее, — ближайший февраль. 9 февраля
  // 2027 — вторник, неделя считается с понедельника.
  expect(iso(exams.semesterStartDay({ semesterStart: '09 02' }, date(2027, 1, 25)))).toBe(
    '2027-02-08'
  );
});

test('без конфига неделя считается от 1 сентября, с понедельника', () => {
  // 1 сентября 2026 — вторник: первая неделя — с 31 августа.
  expect(iso(exams.semesterStartDay({}, date(2026, 9, 25)))).toBe('2026-08-31');
  expect(iso(exams.semesterStartDay(null, date(2026, 9, 25)))).toBe('2026-08-31');
});

test('дата пункта расписания подбирается к семестру', () => {
  expect(iso(exams.resolveDay('14 09', fallStart))).toBe('2026-09-14');
  // Январские пункты осеннего семестра — следующий год, а не прошлый январь.
  expect(iso(exams.resolveDay('11 01', fallStart))).toBe('2027-01-11');
  // За месяц до начала семестра — ещё этот семестр.
  expect(iso(exams.resolveDay('20 08', fallStart))).toBe('2026-08-20');
  // Несуществующая дата не превращается в соседнюю.
  expect(exams.resolveDay('31 04', fallStart)).toBeNull();
  expect(exams.resolveDay('завтра', fallStart)).toBeNull();
});

test('номер учебной недели — по календарной неделе с понедельника', () => {
  expect(exams.weekNumber(day(2026, 9, 7), fallStart)).toBe(1);
  expect(exams.weekNumber(day(2026, 9, 20), fallStart)).toBe(2); // воскресенье
  expect(exams.weekNumber(day(2026, 9, 21), fallStart)).toBe(3); // понедельник
  expect(exams.weekNumber(day(2026, 9, 25), fallStart)).toBe(3);
  expect(exams.weekNumber(day(2026, 9, 6), fallStart)).toBe(0);
});

test('даты недели подписываются по-русски', () => {
  expect(exams.formatDayRange(date(2026, 9, 21), date(2026, 9, 27))).toBe('21–27 сентября');
  expect(exams.formatDayRange(date(2026, 9, 28), date(2026, 10, 4))).toBe(
    '28 сентября – 4 октября'
  );
  expect(exams.formatDayRange(date(2026, 12, 28), date(2027, 1, 3))).toBe('28 декабря – 3 января');
});

test('в компактном дэшборде месяцы сокращаются, как у Intl', () => {
  const short = { short: true };
  expect(exams.formatDayRange(date(2026, 9, 21), date(2026, 9, 27), short)).toBe('21–27 сент.');
  expect(exams.formatDayRange(date(2026, 9, 28), date(2026, 10, 4), short)).toBe(
    '28 сент. – 4 окт.'
  );
  // Сверяемся с самим Intl, чтобы сокращения не разошлись с тем, что видно в LMS.
  const intl = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' });
  for (let month = 0; month < 12; month++) {
    const first = new Date(2026, month, 1);
    const expected = intl.format(first).replace(/^1\s+/, '');
    expect(exams.formatDayRange(first, new Date(2026, month, 7), short)).toBe('1–7 ' + expected);
  }
});

test('из подходящих ключей расписания побеждает самый длинный', () => {
  const schedule = {
    Микроэкономика: [{ name: 'Квиз', date: '21 09' }],
    'Микроэкономика. Продвинутый уровень': [{ name: 'Квиз', date: '21 09' }],
    'Сломанный курс': 'не список',
  };
  // Раньше брался первый ключ по порядку в файле — продвинутый уровень
  // получал расписание обычного.
  expect(exams.findScheduleKey('🔴 Микроэкономика. Продвинутый уровень', schedule)).toBe(
    'Микроэкономика. Продвинутый уровень'
  );
  expect(exams.findScheduleKey('Микроэкономика', schedule)).toBe('Микроэкономика');
  expect(exams.findScheduleKey('Сломанный курс', schedule)).toBeNull();
  expect(exams.findScheduleKey('Физкультура', schedule)).toBeNull();
});

test('курс ищется без учёта регистра, лишних пробелов и «ё»', () => {
  const schedule = { 'Чёрные ящики и цифровые агенты': [] };
  expect(exams.findScheduleKey('ЧЕРНЫЕ  ящики и цифровые агенты: практика', schedule)).toBe(
    'Чёрные ящики и цифровые агенты'
  );
});

test('один ключ расписания — одному курсу, с самым коротким названием', () => {
  const schedule = { 'Алгоритмы и структуры данных 1': [] };
  const selection = { id: 1594, name: 'Отборочная работа на курс Алгоритмы и структуры данных 1' };
  const course = { id: 1128, name: '🔴 Алгоритмы и структуры данных 1' };

  expect(exams.matchCourses([selection, course], schedule).map((m) => m.course.id)).toEqual([1128]);
  // Самого курса у студента нет — тогда ключ достаётся единственному.
  expect(exams.matchCourses([selection], schedule).map((m) => m.course.id)).toEqual([1594]);
});

const SCHEDULE = {
  'Введение в профессию': [
    { name: 'Тест', date: '14 09' },
    { name: 'Защита проекта', date: '21 09' },
    { name: 'Срез знаний', date: '21 09' },
    { name: 'Срез знаний', date: '21 09' },
  ],
  'Теория вероятностей. Основной уровень': [
    { name: 'Контрольная работа', date: '28 09' },
    { name: 'Контест', date: '12 10' },
  ],
  'Алгоритмы и структуры данных 1': [
    { name: 'Коллоквиум', date: '05 10' },
    { name: 'Контрольная работа', date: '12 10' },
    { name: 'Без даты' },
    null,
  ],
  'Курс, которого у студента нет': [{ name: 'Тест', date: '28 09' }],
};

const COURSES: Course[] = [
  { id: 1, name: 'Введение в профессию' },
  { id: 2, name: '🔴 Теория вероятностей. Основной уровень' },
  { id: 3, name: '🔴 Алгоритмы и структуры данных 1' },
  { id: 4, name: 'Физическая культура' },
];

/** Неделя в виде, удобном для сравнения: номер, даты и «курс: события». */
const summary = (week: Week) => ({
  number: week.number,
  dates: exams.formatDayRange(week.first, week.last),
  courses: week.courses.map(
    (course) =>
      `${course.id}: ` +
      course.events.map((e) => (e.count > 1 ? `${e.name} ×${e.count}` : e.name)).join(', ')
  ),
});

test('дэшборд: текущая неделя и две следующие, с контрольными по курсам', () => {
  const result = exams.upcomingWeeks({
    schedule: SCHEDULE,
    config: FALL,
    courses: COURSES,
    today: date(2026, 9, 25), // пятница третьей недели
  });

  expect(result.currentWeek).toBe(3);
  expect(result.matchedCourses).toBe(3);
  expect(result.weeks.map(summary)).toEqual([
    {
      number: 3,
      dates: '21–27 сентября',
      // Пункт текущей недели виден до её конца, хотя его понедельник прошёл.
      courses: ['1: Защита проекта, Срез знаний ×2'],
    },
    { number: 4, dates: '28 сентября – 4 октября', courses: ['2: Контрольная работа'] },
    // 12 октября — уже шестая неделя, в дэшборд не попадает.
    { number: 5, dates: '5–11 октября', courses: ['3: Коллоквиум'] },
  ]);
  expect(result.weeks.map((week) => week.offset)).toEqual([0, 1, 2]);
});

test('дэшборд: неделя начинается в понедельник и кончается в воскресенье', () => {
  const monday = exams.upcomingWeeks({
    schedule: SCHEDULE,
    config: FALL,
    courses: COURSES,
    today: date(2026, 9, 21),
  });
  const sunday = exams.upcomingWeeks({
    schedule: SCHEDULE,
    config: FALL,
    courses: COURSES,
    today: date(2026, 9, 27),
  });
  expect(monday.weeks.map((week) => week.number)).toEqual([3, 4, 5]);
  expect(sunday.weeks.map((week) => week.number)).toEqual([3, 4, 5]);

  const next = exams.upcomingWeeks({
    schedule: SCHEDULE,
    config: FALL,
    courses: COURSES,
    today: date(2026, 9, 28),
  });
  expect(next.weeks.map(summary)[2]).toEqual({
    number: 6,
    dates: '12–18 октября',
    courses: ['2: Контест', '3: Контрольная работа'],
  });
});

test('дэшборд: до начала семестра номера недель не положительные', () => {
  const result = exams.upcomingWeeks({
    schedule: { 'Введение в профессию': [{ name: 'Тест', date: '07 09' }] },
    config: FALL,
    courses: COURSES,
    today: date(2026, 8, 25),
  });
  expect(result.weeks.map((week) => week.number)).toEqual([-1, 0, 1]);
  expect(result.weeks[2].courses.map((course) => course.id)).toEqual([1]);
});

test('дэшборд: без курсов из расписания недели пустые', () => {
  const result = exams.upcomingWeeks({
    schedule: SCHEDULE,
    config: FALL,
    courses: [{ id: 4, name: 'Физическая культура' }],
    today: date(2026, 9, 25),
  });
  expect(result.matchedCourses).toBe(0);
  expect(result.weeks.every((week) => week.courses.length === 0)).toBe(true);
});

/** Хранилище и background-прокси вместо настоящего расширения. */
function fakeBrowser(initial: Record<string, unknown>, fetchJson: (url: string) => unknown) {
  const store: Record<string, unknown> = { ...initial };
  const requests: string[] = [];
  return {
    store,
    requests,
    browser: {
      storage: {
        local: {
          get: async (keys: string[]) =>
            Object.fromEntries(keys.filter((key) => key in store).map((key) => [key, store[key]])),
          set: async (values: Record<string, unknown>) => Object.assign(store, values),
        },
      },
      runtime: {
        sendMessage: async (message: { action: string; url: string }) => {
          requests.push(message.url);
          try {
            return { success: true, data: fetchJson(message.url) };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
      },
    },
  };
}

test('загрузка: свежий кэш не ходит на сервер', async () => {
  const now = Date.now();
  const fake = fakeBrowser(
    {
      futureExamsScheduleCache: { Курс: [] },
      futureExamsScheduleCacheTimestamp: now,
      futureExamsConfigCache: FALL,
      futureExamsConfigCacheTimestamp: now,
    },
    () => {
      throw new Error('сеть не нужна');
    }
  );

  expect(await load(fake.browser).load()).toEqual({ schedule: { Курс: [] }, config: FALL });
  expect(fake.requests).toEqual([]);
});

test('загрузка: сервер недоступен — старый кэш, а без кэша null', async () => {
  const offline = () => {
    throw new Error('offline');
  };
  const stale = fakeBrowser(
    {
      futureExamsScheduleCache: { Курс: [] },
      futureExamsScheduleCacheTimestamp: 1,
      futureExamsConfigCache: FALL,
      futureExamsConfigCacheTimestamp: 1,
    },
    offline
  );
  expect(await load(stale.browser).load()).toEqual({ schedule: { Курс: [] }, config: FALL });

  const empty = fakeBrowser({}, offline);
  expect(await load(empty.browser).load()).toBeNull();
});

test('загрузка: одновременные вызовы делят один запрос и кладут ответ в кэш', async () => {
  const fake = fakeBrowser({}, (url) =>
    url.endsWith('/api/schedule') ? { Курс: [{ name: 'Тест', date: '28 09' }] } : FALL
  );
  const api = load(fake.browser);

  const [first, second] = await Promise.all([api.load(), api.load()]);
  expect(first).toEqual(second);
  expect(fake.requests).toEqual([
    'https://lms.exams.cu3rd.ru/api/schedule',
    'https://lms.exams.cu3rd.ru/api/config',
  ]);
  expect(fake.store.futureExamsScheduleCache).toEqual({ Курс: [{ name: 'Тест', date: '28 09' }] });
  expect(typeof fake.store.futureExamsConfigCacheTimestamp).toBe('number');
});
