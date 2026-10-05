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
    /** Состояние без даты сдачи — как у теста на проверке. */
    state?: string;
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
  const id = nextId++;
  return {
    id,
    // Тема и лонгрид — из них складывается ссылка на страницу задания.
    theme: { id: 300 + id, name: 'Неделя' },
    longread: { id: 700 + id, name: 'Домашнее задание' },
    state: options.state ?? (options.done ? 'evaluated' : 'inProgress'),
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
  // Через три дня — пять дедлайнов, два уже сданы: ДЗ с решением и тест на
  // проверке (у тестов нет `submitAt`); в списке — по времени.
  task(3, 'Тетрадь рефлексии', { hour: 23 }),
  task(3, 'ДЗ 3. Условная вероятность', { hour: 10, done: true }),
  task(3, 'ДЗ 3. Линейная регрессия', { hour: 20 }),
  task(3, 'Контроль теоретических знаний 1', { hour: 20, minute: 30, state: 'review' }),
  task(3, 'HW. Week 3', {
    hour: 21,
    course: { id: 1418, name: '🔴 Теория вероятностей. Основной уровень' },
  }),
  // Через шесть — семь, через девять — тринадцать.
  ...Array.from({ length: 7 }, (_, index) => task(6, `ДЗ ${index + 10}`)),
  ...Array.from({ length: 13 }, (_, index) => task(9, `ДЗ ${index + 20}`, { minute: index })),
  // Через одиннадцать — два, и оба уже сданы: день закрыт.
  task(11, 'ДЗ 40', { done: true }),
  task(11, 'ДЗ 41', { done: true }),
  // Через двенадцать — четыре, три сданы: остался один, день зелёный.
  ...Array.from({ length: 4 }, (_, index) => task(12, `ДЗ ${index + 50}`, { done: index > 0 })),
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
    // Обе части включаются своими галочками; по умолчанию дедлайны выключены.
    sync: { futureExamsDashboardToggle: true, futureExamsDashboardDeadlines: true },
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

test('14 дней с сегодняшнего: сдано/всего и цвет по количеству', async () => {
  await expect(days()).toHaveCount(14, { timeout: 30_000 });
  await expect(dashboard().locator('.culms-deadlines__title')).toHaveText('Дедлайны на две недели');
  // Дни идут подряд с сегодняшнего; вчера и через две недели в окно не попали.
  expect(
    await days().evaluateAll((cells) => cells.map((cell) => (cell as HTMLElement).dataset.culmsDay))
  ).toEqual(Array.from({ length: 14 }, (_, offset) => dayKey(addDays(today, offset))));
  await expect(days().first()).toHaveClass(/culms-deadlines__day--today/);
  // «ср 30» — день недели и число одной строкой, у сегодняшнего тоже.
  await expect(days().first().locator('.culms-deadlines__when')).toHaveText(
    `${['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][today.getDay()]}${today.getDate()}`
  );
  const rows = await days()
    .first()
    .evaluate((cell) =>
      ['.culms-deadlines__weekday', '.culms-deadlines__date'].map(
        (selector) => cell.querySelector(selector)!.getBoundingClientRect().bottom
      )
    );
  expect(Math.abs(rows[0] - rows[1])).toBeLessThan(3);

  const read = await days().evaluateAll((cells) =>
    cells.map((cell) => ({
      count: cell.querySelector('.culms-deadlines__count')?.textContent,
      level: (cell.className.match(/culms-deadlines--l(\d)/) || [])[1],
    }))
  );
  // Завтра шум (семинар, ознакомление, перезачёт, дорешивание, бонус, тест на
  // паре, архивные курсы) не считается — только «ДЗ 1».
  // Сдано из всех: у «Условной вероятности» через три дня — галочка.
  expect(read.map((day) => day.count)).toEqual([
    '0/1',
    '0/1',
    '0/1',
    '2/5',
    '',
    '',
    '0/7',
    '',
    '',
    '0/13',
    '',
    '2/2',
    '3/4',
    '',
  ]);
  // Цвет — по числу несданных: через двенадцать дней из четырёх остался один
  // — зелёный, закрытый день — без цвета.
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
    '1',
    '0',
  ]);
  // Всё сдано — день приглушён; остальные нет.
  await expect(dayCell(11)).toHaveClass(/culms-deadlines__day--closed/);
  await expect(dayCell(3)).not.toHaveClass(/culms-deadlines__day--closed/);
  await expect(dayCell(3)).toHaveAttribute(
    'aria-label',
    `${dayTitle(addDays(today, 3))}: 5 дедлайнов, сдано 2`
  );
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
    '5 дедлайнов, сдано 2'
  );
  // По времени дедлайна.
  await expect(popover().locator('.culms-deadlines-popover__name')).toHaveText([
    'ДЗ 3. Условная вероятность',
    'ДЗ 3. Линейная регрессия',
    'Контроль теоретических знаний 1',
    'HW. Week 3',
    'Тетрадь рефлексии',
  ]);
  await expect(popover().locator('.culms-deadlines-popover__time')).toHaveText([
    '10:00',
    '20:00',
    '20:30',
    '21:00',
    '23:00',
  ]);
  // Сданы ДЗ с решением и тест на проверке, хотя даты сдачи у теста нет.
  const items = popover().locator('.culms-deadlines-popover__item');
  await expect(items.nth(0)).toHaveClass(/--done/);
  await expect(items.nth(1)).not.toHaveClass(/--done/);
  await expect(items.nth(2)).toHaveClass(/--done/);
  await expect(popover().locator('.culms-deadlines-popover__course').nth(3)).toHaveText(
    '🔴 Теория вероятностей. Основной уровень'
  );
  // Сверху не влезает — под днём.
  let cellBox = (await dayCell(3).boundingBox())!;
  let popBox = (await popover().boundingBox())!;
  expect(popBox.y).toBeGreaterThan(cellBox.y + cellBox.height - 1);
  await page.mouse.move(5, 5);
  await expect(popover()).toHaveCount(0);

  // Место есть — над днём: снизу она закрывала бы контрольные недель.
  const shift = (margin: string) =>
    page.evaluate((value) => {
      (document.querySelector('.content-container') as HTMLElement).style.marginTop = value;
    }, margin);
  await shift('400px');
  await dayCell(3).hover();
  cellBox = (await dayCell(3).boundingBox())!;
  popBox = (await popover().boundingBox())!;
  expect(popBox.y + popBox.height).toBeLessThan(cellBox.y + 1);
  await page.mouse.move(5, 5);
  await expect(popover()).toHaveCount(0);
  await shift('');
});

test('длинный день обрезается, пустой — «Дедлайнов нет»', async () => {
  await dayCell(9).hover();
  await expect(popover().locator('.culms-deadlines-popover__item')).toHaveCount(12);
  await expect(popover().locator('.culms-deadlines-popover__more')).toHaveText('и ещё 1');
  await dayCell(4).hover();
  await expect(popover().locator('.culms-deadlines-popover__empty')).toHaveText('Дедлайнов нет');
  await dayCell(11).hover();
  await expect(popover().locator('.culms-deadlines-popover__summary')).toHaveText(
    '2 дедлайна, всё сдано'
  );
  await page.mouse.move(5, 5);
  await expect(popover()).toHaveCount(0);
});

test('с клавиатуры: фокус на дне показывает задания, уход фокуса прячет', async () => {
  await dayCell(0).focus();
  await expect(popover().locator('.culms-deadlines-popover__name')).toHaveText(['ДЗ на сегодня']);
  await expect(popover().locator('.culms-deadlines-popover__time')).toHaveText(['23:59']);
  await expect(dayCell(0)).toHaveAttribute('aria-expanded', 'true');
  await expect(dayCell(0)).toHaveAttribute('aria-controls', 'culms-deadlines-popover');
  await page.keyboard.press('Tab');
  await expect(popover().locator('.culms-deadlines-popover__name')).toHaveText(['ДЗ 1']);
  await expect(dayCell(0)).not.toHaveAttribute('aria-expanded', 'true');
  await dayCell(1).evaluate((node) => (node as HTMLElement).blur());
  await expect(popover()).toHaveCount(0);
});

/** Ссылка на страницу задания: курс, тема и лонгрид из ответа API. */
function taskHref(name: string) {
  const found = TASKS.find((item) => item.exercise.name === name)!;
  return (
    `/learn/courses/view/actual/${found.course.id}` +
    `/themes/${found.theme.id}/longreads/${found.longread.id}`
  );
}

test('во всплывашке — ссылки на задание и на курс, до них можно довести курсор', async () => {
  await dayCell(3).hover();
  const names = popover().locator('.culms-deadlines-popover__name');
  await expect(names).toHaveCount(5);
  await expect(names.nth(1)).toHaveAttribute('href', taskHref('ДЗ 3. Линейная регрессия'));
  await expect(popover().locator('.culms-deadlines-popover__course').nth(1)).toHaveAttribute(
    'href',
    '/learn/courses/view/actual/1245'
  );
  await expect(popover().locator('.culms-deadlines-popover__course').nth(3)).toHaveAttribute(
    'href',
    '/learn/courses/view/actual/1418'
  );

  // Курсор уходит с дня во всплывашку через зазор — она не пропадает.
  // Зазор — над днём или под ним, смотря куда встала всплывашка.
  const cellBox = (await dayCell(3).boundingBox())!;
  const popBox = (await popover().boundingBox())!;
  const gapY = popBox.y < cellBox.y ? cellBox.y - 4 : cellBox.y + cellBox.height + 4;
  await page.mouse.move(cellBox.x + cellBox.width / 2, gapY);
  await names.nth(1).hover();
  await page.waitForTimeout(500);
  await expect(popover()).toBeVisible();

  // Ушёл и со всплывашки — прячется.
  await page.mouse.move(5, 5);
  await expect(popover()).toHaveCount(0);
});

test('щелчок по заданию во всплывашке открывает его страницу', async () => {
  await dayCell(3).hover();
  await popover().locator('.culms-deadlines-popover__name').nth(1).click();
  await expect(page).toHaveURL(`${LMS_URL}${taskHref('ДЗ 3. Линейная регрессия')}`);

  await page.goto(LIST_URL);
  await expect(days()).toHaveCount(14, { timeout: 30_000 });
  await dayCell(3).hover();
  await popover().locator('.culms-deadlines-popover__course').nth(3).click();
  await expect(page).toHaveURL(`${LMS_URL}/learn/courses/view/actual/1418`);

  await page.goto(LIST_URL);
  await expect(days()).toHaveCount(14, { timeout: 30_000 });
});

test('с клавиатуры в список заданий: ↓ — к ссылкам, Esc — обратно к дню', async () => {
  await dayCell(3).focus();
  await page.keyboard.press('ArrowDown');
  const names = popover().locator('.culms-deadlines-popover__name');
  await expect(names.first()).toBeFocused();
  // Tab идёт по ссылкам всплывашки, а не в конец страницы.
  await page.keyboard.press('Tab');
  await expect(popover().locator('.culms-deadlines-popover__course').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dayCell(3)).toBeFocused();
  await expect(popover()).toBeVisible();

  // С последней ссылки Tab ведёт на следующий день.
  await page.keyboard.press('Enter');
  const last = popover().locator('a').last();
  await last.focus();
  await page.keyboard.press('Tab');
  await expect(dayCell(4)).toBeFocused();
  await expect(popover().locator('.culms-deadlines-popover__empty')).toHaveText('Дедлайнов нет');
  await dayCell(4).evaluate((node) => (node as HTMLElement).blur());
  await expect(popover()).toHaveCount(0);
});

test('свои пороги цвета меняют дни и легенду на лету', async () => {
  const levels = () =>
    days().evaluateAll((cells) =>
      cells.map((cell) => (cell.className.match(/culms-deadlines--l(\d)/) || [])[1])
    );
  // Несданных по дням: 1, 1, 1, 3, -, -, 7, -, -, 13, -, 0, 1, -.
  await writeStorage({
    sync: { deadlineLevelYellow: 2, deadlineLevelOrange: 4, deadlineLevelRed: 13 },
  });
  await expect(dashboard().locator('.culms-deadlines__legend-item')).toHaveText([
    '1',
    '2–3',
    '4–12',
    '13+',
  ]);
  await expect
    .poll(levels)
    .toEqual(['1', '1', '1', '2', '0', '0', '3', '0', '0', '4', '0', '0', '1', '0']);

  // Пороги не по порядку (из чужого профиля) — каждый не меньше предыдущего + 1.
  await writeStorage({
    sync: { deadlineLevelYellow: 5, deadlineLevelOrange: 3, deadlineLevelRed: 1 },
  });
  await expect(dashboard().locator('.culms-deadlines__legend-item')).toHaveText([
    '1–4',
    '5',
    '6',
    '7+',
  ]);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.evaluate(() =>
    chrome.storage.sync.remove(['deadlineLevelYellow', 'deadlineLevelOrange', 'deadlineLevelRed'])
  );
  await popup.close();
  await expect(dashboard().locator('.culms-deadlines__legend-item')).toHaveText([
    '1–2',
    '3–5',
    '6–9',
    '10+',
  ]);
});

test('в попапе пороги под галочкой дедлайнов, соседние сдвигаются за правленым', async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.getByRole('tab', { name: 'Сроки' }).click();
  const yellow = popup.locator('#deadline-level-yellow');
  const orange = popup.locator('#deadline-level-orange');
  const red = popup.locator('#deadline-level-red');
  await expect(yellow).toBeVisible();
  await expect(yellow).toHaveValue('3');
  await expect(orange).toHaveValue('6');
  await expect(red).toHaveValue('10');
  await expect(popup.locator('#deadline-level-green-range')).toHaveText('1–2');

  // Жёлтый 7 — оранжевый за ним становится 8, красный 10 остаётся.
  await yellow.fill('7');
  await yellow.press('Enter');
  await expect(orange).toHaveValue('8');
  await expect(red).toHaveValue('10');
  await expect(popup.locator('#deadline-level-green-range')).toHaveText('1–6');
  const stored = () =>
    popup.evaluate(() =>
      chrome.storage.sync.get(['deadlineLevelYellow', 'deadlineLevelOrange', 'deadlineLevelRed'])
    );
  await expect
    .poll(stored)
    .toEqual({ deadlineLevelYellow: 7, deadlineLevelOrange: 8, deadlineLevelRed: 10 });
  await expect(dashboard().locator('.culms-deadlines__legend-item')).toHaveText([
    '1–6',
    '7',
    '8–9',
    '10+',
  ]);

  // Красный 3 — правленое поле остаётся, младшие уступают вниз.
  await red.fill('3');
  await red.press('Enter');
  await expect(yellow).toHaveValue('2');
  await expect(orange).toHaveValue('3');
  await expect(red).toHaveValue('4');
  await expect(popup.locator('#deadline-level-green-range')).toHaveText('1');

  // Галочка дедлайнов выключена — порогов не видно.
  await popup
    .locator('label.switch', { has: popup.locator('#future-exams-dashboard-deadlines-toggle') })
    .click();
  await expect(yellow).toBeHidden();
  await popup
    .locator('label.switch', { has: popup.locator('#future-exams-dashboard-deadlines-toggle') })
    .click();
  await expect(yellow).toBeVisible();

  await popup.evaluate(() =>
    chrome.storage.sync.remove(['deadlineLevelYellow', 'deadlineLevelOrange', 'deadlineLevelRed'])
  );
  await popup.close();
});

test('легенда окрашена ровно как дни того же уровня', async () => {
  // Заливка и цвет текста пункта легенды — те же, что у дня с таким числом дедлайнов.
  const colors = (locator: ReturnType<typeof days>) =>
    locator.evaluate((node) => {
      const style = getComputedStyle(node);
      const count = node.querySelector('.culms-deadlines__count');
      return [style.backgroundColor, getComputedStyle(count ?? node).color];
    });
  const legend = dashboard().locator('.culms-deadlines__legend-item');
  // Уровни дней: через день — 1, через три — 2, через шесть — 3, через девять — 4.
  for (const [index, offset] of [
    [0, 1],
    [1, 3],
    [2, 6],
    [3, 9],
  ]) {
    expect(await colors(legend.nth(index))).toEqual(await colors(dayCell(offset)));
  }
  for (const theme of [true, false]) {
    await writeStorage({ sync: { themeEnabled: theme } });
    await expect(dashboard()).toHaveClass(theme ? /--dark/ : /^(?!.*--dark)/);
    expect(await colors(legend.nth(3))).toEqual(await colors(dayCell(9)));
  }
});

test('между воскресеньем и понедельником — черта, недели читаются блоками', async () => {
  const separators = () =>
    days().evaluateAll((cells) =>
      cells.map((cell) => getComputedStyle(cell, '::before').content !== 'none')
    );
  // Черта — перед каждым понедельником, кроме самого первого дня.
  const mondays = Array.from(
    { length: 14 },
    (_, offset) => offset > 0 && addDays(today, offset).getDay() === 1
  );
  expect(await separators()).toEqual(mondays);
  expect(mondays.filter(Boolean).length).toBeGreaterThanOrEqual(1);

  // Черта — в зазоре между днями, а не поверх воскресенья: зазор шире
  // обычного, и черта посередине.
  const gap = await page.evaluate(() => {
    const monday = document.querySelector('.culms-deadlines__day--week-start') as HTMLElement;
    const sunday = monday.previousElementSibling as HTMLElement;
    const box = monday.getBoundingClientRect();
    const line = getComputedStyle(monday, '::before');
    const from = box.left + monday.clientLeft + parseFloat(line.left);
    return {
      sundayRight: sunday.getBoundingClientRect().right,
      mondayLeft: box.left,
      from,
      to: from + parseFloat(line.width),
    };
  });
  expect(gap.mondayLeft - gap.sundayRight).toBeGreaterThanOrEqual(10);
  expect(gap.from).toBeGreaterThan(gap.sundayRight + 2);
  expect(gap.to).toBeLessThan(gap.mondayLeft - 2);

  // Узко, строками по семь: понедельник в начале строки черты не получает.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(separators)
    .toEqual(mondays.map((isMonday, offset) => isMonday && offset % 7 !== 0));
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(separators).toEqual(mondays);
});

test('полоской под курсами: 14 дней в строку, узко — две строки по семь', async () => {
  const columns = () =>
    dashboard()
      .locator('.culms-deadlines__days')
      .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length);

  await expect(page.locator('cu-courses-group > .culms-exams-dashboard:last-child')).toHaveCount(1);
  await expect(dashboard()).toHaveClass(/culms-exams-dashboard--compact/);
  expect(await columns()).toBe(14);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(columns).toBe(7);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(columns).toBe(14);
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

test('контрольные выключены — в полоске одни дедлайны', async () => {
  await writeStorage({ sync: { futureExamsDashboardToggle: false } });
  await expect(dashboard().locator('.culms-exams-week')).toHaveCount(0);
  await expect(dashboard().locator('.culms-exams-dashboard__nav')).toHaveCount(0);
  await expect(days()).toHaveCount(14);
  // Заголовок полоски теперь про дедлайны, и у самих дней он не повторяется.
  await expect(dashboard().locator('h2')).toHaveText('Дедлайны на две недели');
  await expect(dashboard().locator('.culms-deadlines__title')).toHaveCount(0);
  await expect(dashboard().locator('.culms-deadlines__legend-item')).toHaveCount(4);
});

test('выключены обе части — полоски нет', async () => {
  await writeStorage({ sync: { futureExamsDashboardDeadlines: false } });
  await expect(dashboard()).toHaveCount(0);

  // Включили одни дедлайны — полоска вернулась без перезагрузки.
  await page.evaluate(() => ((window as any).__reloadMarker = true));
  await writeStorage({ sync: { futureExamsDashboardDeadlines: true } });
  await expect(days()).toHaveCount(14);
  expect(await page.evaluate(() => (window as any).__reloadMarker)).toBe(true);
  await writeStorage({ sync: { futureExamsDashboardToggle: true } });
  await expect(dashboard().locator('.culms-exams-week')).toHaveCount(3);
});
