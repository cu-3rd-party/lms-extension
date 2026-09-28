/**
 * Дедлайны на две недели в дэшборде контрольных — на подставной LMS.
 *
 * Как и в exams-dashboard.test.ts, логин не нужен: страницу и API отдаёт
 * `context.route`, расписание контрольных лежит в кэше расширения, а даты
 * заданий считаются от сегодняшнего дня (часы контент-скрипту не подменить).
 *
 * Запуск:
 *   bun run build:chrome
 *   bun run test deadline-load
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { LMS_URL, launchExtensionContext, resolveExtensionId } from './helpers/extension.js';

test.describe.configure({ mode: 'serial', timeout: 90_000 });

const LIST_URL = `${LMS_URL}/learn/courses/view/actual/all`;

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const mondayOf = (date: Date) => addDays(date, -((date.getDay() + 6) % 7));
const pad = (n: number) => String(n).padStart(2, '0');
const ddmm = (date: Date) => `${pad(date.getDate())} ${pad(date.getMonth() + 1)}`;
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const WEEKDAYS_FULL = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
];
const MONTHS = [
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
const dayTitle = (date: Date) =>
  `${WEEKDAYS_FULL[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;

const today = addDays(new Date(), 0);
const thisMonday = mondayOf(today);
const CONFIG = { semesterStart: ddmm(addDays(thisMonday, -21)) };
const SCHEDULE = {
  'Теория вероятностей. Основной уровень': [{ name: 'Контрольная работа', date: ddmm(thisMonday) }],
};

const COURSES = [
  { id: 1418, name: '🔴 Теория вероятностей. Основной уровень' },
  { id: 1245, name: 'Машинное обучение' },
  { id: 1370, name: 'Английский язык 204S3' },
].map((course) => ({ ...course, state: 'published' }));

let nextId = 1;
/** Задание с дедлайном через `offset` дней от сегодня, в `hour`:`minute`. */
function task(
  offset: number,
  name: string,
  options: {
    course?: { id: number; name: string; isArchived?: boolean };
    done?: boolean;
    hour?: number;
    minute?: number;
    openHours?: number;
    /** Корзина оценки — по ней видно ознакомления, бонусы и работу на паре. */
    activity?: string;
  } = {}
) {
  const deadline = addDays(today, offset);
  deadline.setHours(options.hour ?? 22, options.minute ?? 0, 0, 0);
  const start = new Date(deadline.getTime() - (options.openHours ?? 24 * 7) * 3600_000);
  const course = options.course ?? { id: 1245, name: 'Машинное обучение', isArchived: false };
  return {
    id: nextId++,
    state: options.done ? 'evaluated' : 'inProgress',
    submitAt: options.done ? new Date(deadline.getTime() - 3600_000).toISOString() : null,
    deadline: deadline.toISOString(),
    lateDays: null,
    exercise: {
      id: 1000 + nextId,
      name,
      maxScore: 10,
      activity: { id: 1, name: options.activity ?? 'Домашние задания', weight: 0.3 },
      startDate: start.toISOString(),
      deadline: deadline.toISOString(),
    },
    course: { isArchived: false, ...course },
  };
}

const TASKS = [
  // Вчера и через две недели — за краями окна.
  task(-1, 'Вчерашнее ДЗ'),
  task(14, 'ДЗ через две недели'),
  // Сегодня — один, почти в полночь.
  task(0, 'ДЗ на сегодня', { hour: 23, minute: 59 }),
  // Завтра — один настоящий дедлайн и весь шум, который считать не надо.
  task(1, 'ДЗ 1'),
  task(1, 'Seminar 1. Week 4', { activity: 'Аудиторная активность' }),
  task(1, 'Ознакомление с Кодексом этики', {
    course: { id: 1577, name: 'Ознакомление с локально-нормативными актами' },
    activity: 'Ознакомление',
  }),
  task(1, 'Перезачет', { activity: 'Активность без веса' }),
  task(1, 'ДЗ_2. Дорешивание', { activity: 'Активность без веса' }),
  task(1, 'Бонусная активность. Неделя 4', { activity: 'Бонусная активность' }),
  task(1, 'Тест (пятница)', { openHours: 2 }),
  task(1, 'Задание из архивного курса', {
    course: { id: 900, name: 'Старый курс', isArchived: true },
  }),
  // Курс в своём архиве студента.
  task(1, 'HW. Week 4', { course: { id: 1370, name: 'Английский язык 204S3' } }),
  // Домашка в семинарской корзине остаётся домашкой.
  task(2, 'ДЗ 3_1. Градиентный спуск', { activity: 'Активность без веса' }),
  // Через три дня — четыре дедлайна, один уже сдан; в списке — по времени.
  task(3, 'Тетрадь рефлексии', { hour: 23 }),
  task(3, 'ДЗ 3. Условная вероятность', { hour: 10, done: true }),
  task(3, 'ДЗ 3. Линейная регрессия', { hour: 20 }),
  task(3, 'HW. Week 3', {
    hour: 21,
    course: { id: 1418, name: '🔴 Теория вероятностей. Основной уровень' },
  }),
  // Через шесть — семь, через девять — тринадцать.
  ...Array.from({ length: 7 }, (_, index) => task(6, `ДЗ ${index + 10}`)),
  ...Array.from({ length: 13 }, (_, index) => task(9, `ДЗ ${index + 20}`, { minute: index })),
];

// Минимальная страница «Мои курсы»: контейнер и группа курсов, куда
// встаёт дэшборд под курсами.
const LIST_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<style>
  body { margin: 0; font-family: sans-serif; }
  main.main { display: block; background: rgb(244, 244, 245); }
  cu-course-learning-layout, cu-courses-group { display: block; }
  .content-container { display: flex; flex-direction: column; gap: 1.5rem; margin: 1.5rem auto; max-width: 66rem; }
</style></head>
<body><main class="main"><cu-course-learning-layout><div class="content-container">
  <section class="header-island"><h1 class="title">Мои курсы</h1></section>
  <cu-courses-group><ul class="course-list">
    ${COURSES.map(
      (course) =>
        `<li class="course-list__item"><cu-course-card data-id="${course.id}">` +
        `<span class="course-name">${course.name}</span></cu-course-card></li>`
    ).join('')}
  </ul></cu-courses-group>
</div></cu-course-learning-layout></main></body></html>`;

let context: BrowserContext;
let cleanup: () => Promise<void>;
let extensionId: string;
let page: Page;
let tasksRequests = 0;

async function writeStorage(values: {
  sync?: Record<string, unknown>;
  local?: Record<string, unknown>;
}) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.evaluate(async ({ sync, local }) => {
    if (sync) await chrome.storage.sync.set(sync);
    if (local) await chrome.storage.local.set(local);
  }, values);
  await popup.close();
}

test.beforeAll(async () => {
  ({ context, cleanup } = await launchExtensionContext({ headless: true }));
  extensionId = await resolveExtensionId(context);

  await context.route(`${LMS_URL}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/micro-lms/courses/student')) {
      return route.fulfill({ json: { items: COURSES, paging: { total: COURSES.length } } });
    }
    if (url.pathname === '/api/micro-lms/tasks/student') {
      tasksRequests++;
      // Дэшборду нужны задания во всех состояниях — и проверенные тоже.
      const states = url.searchParams.getAll('state');
      if (!states.includes('evaluated') || !states.includes('failed')) {
        return route.fulfill({ status: 400, json: {} });
      }
      return route.fulfill({ json: TASKS });
    }
    if (url.pathname.startsWith('/api/')) {
      return route.fulfill({ status: 404, json: {} });
    }
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: LIST_HTML });
  });

  const now = Date.now();
  await writeStorage({
    sync: { futureExamsDashboardToggle: true, futureExamsDashboardPlacement: 'below' },
    local: {
      futureExamsScheduleCache: SCHEDULE,
      futureExamsScheduleCacheTimestamp: now,
      futureExamsConfigCache: CONFIG,
      futureExamsConfigCacheTimestamp: now,
      archivedCourseIds: ['1370'],
    },
  });

  page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(LIST_URL);
});

test.afterAll(async () => {
  await cleanup?.();
});

const dashboard = () => page.locator('.culms-exams-dashboard');
const days = () => dashboard().locator('.culms-deadlines__day');
const dayCell = (offset: number) =>
  dashboard().locator(`[data-culms-day="${dayKey(addDays(today, offset))}"]`);
const popover = () => page.locator('#culms-deadlines-popover');

test('14 дней с сегодняшнего: число дедлайнов и цвет по количеству', async () => {
  await expect(days()).toHaveCount(14, { timeout: 30_000 });
  await expect(dashboard().locator('.culms-deadlines__title')).toHaveText('Дедлайны на две недели');
  // Дни идут подряд с сегодняшнего; вчера и через две недели в окно не попали.
  expect(
    await days().evaluateAll((cells) => cells.map((cell) => (cell as HTMLElement).dataset.culmsDay))
  ).toEqual(Array.from({ length: 14 }, (_, offset) => dayKey(addDays(today, offset))));
  await expect(days().first()).toHaveClass(/culms-deadlines__day--today/);
  await expect(days().first().locator('.culms-deadlines__weekday')).toHaveText('сегодня');

  const read = await days().evaluateAll((cells) =>
    cells.map((cell) => ({
      count: cell.querySelector('.culms-deadlines__count')?.textContent,
      level: (cell.className.match(/culms-deadlines--l(\d)/) || [])[1],
    }))
  );
  // Завтра шум (семинар, ознакомление, перезачёт, дорешивание, бонус, тест на
  // паре, архивные курсы) не считается — только «ДЗ 1».
  expect(read.map((day) => day.count)).toEqual([
    '1',
    '1',
    '1',
    '4',
    '',
    '',
    '7',
    '',
    '',
    '13',
    '',
    '',
    '',
    '',
  ]);
  expect(read.map((day) => day.level)).toEqual([
    '1',
    '1',
    '1',
    '2',
    '0',
    '0',
    '3',
    '0',
    '0',
    '4',
    '0',
    '0',
    '0',
    '0',
  ]);
  await expect(dashboard().locator('.culms-deadlines__legend-item')).toHaveText([
    '1–2',
    '3–5',
    '6–9',
    '10+',
  ]);
});

test('наведение на день показывает его задания, сданные — с галочкой', async () => {
  await dayCell(3).hover();
  await expect(popover()).toBeVisible();
  await expect(popover().locator('.culms-deadlines-popover__title')).toHaveText(
    dayTitle(addDays(today, 3))
  );
  await expect(popover().locator('.culms-deadlines-popover__summary')).toHaveText(
    '4 дедлайна, осталось 3'
  );
  // По времени дедлайна.
  await expect(popover().locator('.culms-deadlines-popover__name')).toHaveText([
    'ДЗ 3. Условная вероятность',
    'ДЗ 3. Линейная регрессия',
    'HW. Week 3',
    'Тетрадь рефлексии',
  ]);
  await expect(popover().locator('.culms-deadlines-popover__time')).toHaveText([
    '10:00',
    '20:00',
    '21:00',
    '23:00',
  ]);
  await expect(popover().locator('.culms-deadlines-popover__item').first()).toHaveClass(/--done/);
  await expect(popover().locator('.culms-deadlines-popover__course').nth(2)).toHaveText(
    '🔴 Теория вероятностей. Основной уровень'
  );
  // Под днём и в пределах окна.
  const cellBox = (await dayCell(3).boundingBox())!;
  const popBox = (await popover().boundingBox())!;
  expect(popBox.y).toBeGreaterThan(cellBox.y + cellBox.height - 1);

  await page.mouse.move(5, 5);
  await expect(popover()).toHaveCount(0);
});

test('длинный день обрезается, пустой — «Дедлайнов нет»', async () => {
  await dayCell(9).hover();
  await expect(popover().locator('.culms-deadlines-popover__item')).toHaveCount(12);
  await expect(popover().locator('.culms-deadlines-popover__more')).toHaveText('и ещё 1');
  await dayCell(4).hover();
  await expect(popover().locator('.culms-deadlines-popover__empty')).toHaveText('Дедлайнов нет');
  await page.mouse.move(5, 5);
  await expect(popover()).toHaveCount(0);
});

test('с клавиатуры: фокус на дне показывает задания, уход фокуса прячет', async () => {
  await dayCell(0).focus();
  await expect(popover().locator('.culms-deadlines-popover__name')).toHaveText(['ДЗ на сегодня']);
  await expect(popover().locator('.culms-deadlines-popover__time')).toHaveText(['23:59']);
  await expect(dayCell(0)).toHaveAttribute('aria-describedby', 'culms-deadlines-popover');
  await page.keyboard.press('Tab');
  await expect(popover().locator('.culms-deadlines-popover__name')).toHaveText(['ДЗ 1']);
  await dayCell(1).evaluate((node) => (node as HTMLElement).blur());
  await expect(popover()).toHaveCount(0);
});

test('полоской и в узкой колонке: 14 дней, узко — две строки по семь', async () => {
  const columns = () =>
    dashboard()
      .locator('.culms-deadlines__days')
      .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length);

  expect(await columns()).toBe(14);
  await writeStorage({ sync: { futureExamsDashboardPlacement: 'compact' } });
  await expect(dashboard()).toHaveClass(/culms-exams-dashboard--compact/);
  await expect(days()).toHaveCount(14);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(columns).toBe(7);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(columns).toBe(14);
  await writeStorage({ sync: { futureExamsDashboardPlacement: 'below' } });
  await expect(dashboard()).not.toHaveClass(/culms-exams-dashboard--compact/);
});

test('тёмная тема красит и всплывашку', async () => {
  await writeStorage({ sync: { themeEnabled: true } });
  await expect(dashboard()).toHaveClass(/culms-exams-dashboard--dark/);
  await dayCell(3).hover();
  await expect(popover()).toHaveClass(/culms-deadlines-popover--dark/);
  await page.mouse.move(5, 5);
  await writeStorage({ sync: { themeEnabled: false } });
});

test('выключенные дедлайны убираются на лету, дэшборд — как раньше', async () => {
  const requestsBefore = tasksRequests;
  await writeStorage({ sync: { futureExamsDashboardDeadlines: false } });
  await expect(dashboard().locator('.culms-deadlines')).toHaveCount(0);
  await expect(dashboard().locator('.culms-exams-week').first()).toContainText(
    'Контрольная работа'
  );

  await writeStorage({ sync: { futureExamsDashboardDeadlines: true } });
  await expect(days()).toHaveCount(14);
  // Задания ещё свежие — повторно не запрашиваются.
  expect(tasksRequests).toBe(requestsBefore);
});
