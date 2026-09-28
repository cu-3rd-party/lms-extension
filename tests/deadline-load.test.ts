/**
 * Нагрузка в дэшборде контрольных: дедлайны заданий по неделям, тяжёлые
 * недели и полоса нагрузки на семестр — на подставной LMS.
 *
 * Как и в exams-dashboard.test.ts, логин не нужен: страницу и API отдаёт
 * `context.route`, расписание контрольных лежит в кэше расширения, а даты
 * считаются от сегодняшнего дня (часы контент-скрипту не подменить).
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
const ddmm = (date: Date) =>
  `${String(date.getDate()).padStart(2, '0')} ${String(date.getMonth() + 1).padStart(2, '0')}`;

// Семестр начался три недели назад: текущая неделя — четвёртая.
const thisMonday = mondayOf(new Date());
const weekMonday = (week: number) => addDays(thisMonday, (week - 4) * 7);
const CONFIG = { semesterStart: ddmm(weekMonday(1)) };
const SCHEDULE = {
  'Теория вероятностей. Основной уровень': [
    { name: 'Контрольная работа', date: ddmm(weekMonday(4)) },
    { name: 'Тест', date: ddmm(weekMonday(5)) },
    { name: 'Тест', date: ddmm(addDays(weekMonday(5), 2)) },
  ],
};

const COURSES = [
  { id: 1418, name: '🔴 Теория вероятностей. Основной уровень' },
  { id: 1245, name: 'Машинное обучение' },
  { id: 1370, name: 'Английский язык 204S3' },
].map((course) => ({ ...course, state: 'published' }));

let nextId = 1;
/** Задание с дедлайном в `day`-й день (0 — понедельник) недели `week`, в 22:00. */
function task(
  week: number,
  day: number,
  name: string,
  options: {
    course?: { id: number; name: string; isArchived?: boolean };
    done?: boolean;
    openHours?: number;
    /** Корзина оценки — по ней видно ознакомления, бонусы и работу на паре. */
    activity?: string;
  } = {}
) {
  const deadline = addDays(weekMonday(week), day);
  deadline.setHours(22, 0, 0, 0);
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
  task(3, 2, 'ДЗ 2', { done: true }),
  task(3, 4, 'ДЗ 2_2', { done: true }),
  // Работа на паре, которую сдавали сами, — тоже работа.
  task(3, 4, 'Аудиторная активность. Неделя 3', { done: true, activity: 'Активность на занятии' }),
  // Сдавать нечего: ставит преподаватель на паре, ознакомление, перезачёт, бонус.
  task(4, 2, 'Seminar 1. Week 4', { activity: 'Аудиторная активность' }),
  task(4, 2, 'Ознакомление с Кодексом этики', {
    course: { id: 1577, name: 'Ознакомление с локально-нормативными актами' },
    activity: 'Ознакомление',
  }),
  task(4, 3, 'Перезачет', { activity: 'Активность без веса' }),
  task(4, 3, 'Бонусная активность. Неделя 4', { activity: 'Бонусная активность' }),
  // Четвёртая неделя: три дедлайна, один уже сдан.
  task(4, 3, 'ДЗ 3. Линейная регрессия'),
  task(4, 1, 'ДЗ 3. Условная вероятность', { done: true }),
  task(4, 6, 'Тетрадь рефлексии'),
  // Тест на паре — открыт два часа, в нагрузку не идёт.
  task(4, 4, 'Тест (пятница)', { openHours: 2 }),
  // Курс, который LMS уже убрала в архив, и курс в своём архиве студента.
  task(4, 2, 'Задание из архивного курса', {
    course: { id: 900, name: 'Старый курс', isArchived: true },
  }),
  task(4, 2, 'HW. Week 4', { course: { id: 1370, name: 'Английский язык 204S3' } }),
  // Прошлогоднее задание в неархивном курсе — вне семестра.
  task(-48, 2, 'Ознакомление с приказами'),
  // Пятая неделя: восемь дедлайнов и две контрольные — тяжёлая.
  ...Array.from({ length: 8 }, (_, index) => task(5, index % 7, `ДЗ ${index + 4}`)),
  // Восьмая неделя — дальше последней контрольной: до неё листается благодаря дедлайну.
  task(8, 3, 'Проект'),
  // Домашка в семинарской корзине остаётся домашкой.
  task(8, 4, 'ДЗ 3_1. Градиентный спуск', { activity: 'Активность без веса' }),
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
const weeks = () => dashboard().locator('.culms-exams-week');
const bars = () => dashboard().locator('.culms-exams-load__bar');

/** Нагрузка недель глазами пользователя. */
const readLoad = () =>
  weeks().evaluateAll((cards) =>
    cards.map((card) => ({
      title: card.querySelector('.culms-exams-week__title')?.textContent,
      load: card.querySelector('.culms-exams-week__load-count, .culms-exams-week__load--empty')
        ?.textContent,
      left: card.querySelector('.culms-exams-week__load-left')?.textContent ?? null,
      heavy: card.classList.contains('culms-exams-week--heavy'),
      chip: card.querySelector('.culms-exams-week__heavy')?.textContent ?? null,
    }))
  );

test('у недели — число дедлайнов, тяжёлая неделя помечена', async () => {
  await expect(weeks()).toHaveCount(3, { timeout: 30_000 });
  await expect(dashboard().locator('.culms-exams-week__load')).toHaveCount(3);

  expect(await readLoad()).toEqual([
    // Тест на паре, архивный курс и курс в своём архиве не считаются.
    { title: 'Неделя 4', load: '3 дедлайна', left: 'осталось 2', heavy: false, chip: null },
    // 8 дедлайнов и две контрольные против обычных двух-пяти.
    { title: 'Неделя 5', load: '8 дедлайнов', left: null, heavy: true, chip: 'Тяжёлая неделя' },
    { title: 'Неделя 6', load: 'Дедлайнов нет', left: null, heavy: false, chip: null },
  ]);
  await expect(weeks().nth(1).locator('.culms-exams-week__heavy')).toHaveAttribute(
    'title',
    '8 дедлайнов и 2 контрольные — в полтора раза больше обычной недели семестра'
  );
});

test('по щелчку раскрывается список дедлайнов недели, сданные отмечены', async () => {
  const current = weeks().first();
  const list = current.locator('.culms-exams-week__deadline');
  await expect(list.first()).toBeHidden();

  await current.locator('summary').click();
  await expect(list).toHaveCount(3);
  // По времени дедлайна: вторник, четверг, воскресенье.
  await expect(current.locator('.culms-exams-week__deadline-name')).toHaveText([
    'ДЗ 3. Условная вероятность',
    'ДЗ 3. Линейная регрессия',
    'Тетрадь рефлексии',
  ]);
  await expect(list.first()).toHaveClass(/culms-exams-week__deadline--done/);
  await expect(list.nth(1)).not.toHaveClass(/--done/);
  await expect(list.first().locator('.culms-exams-week__deadline-time')).toHaveText(
    /^вт \d\d\.\d\d, 22:00$/
  );
  await expect(list.first().locator('.culms-exams-week__deadline-course')).toHaveText(
    'Машинное обучение'
  );
});

test('полоса нагрузки — весь семестр, щелчок листает к неделе', async () => {
  // С первой недели до восьмой, где последний дедлайн.
  await expect(bars()).toHaveCount(8);
  const classes = await bars().evaluateAll((nodes) =>
    nodes.map((node) =>
      ['shown', 'current', 'heavy'].filter((kind) =>
        node.classList.contains(`culms-exams-load__bar--${kind}`)
      )
    )
  );
  expect(classes).toEqual([
    [],
    [],
    [],
    ['shown', 'current'],
    ['shown', 'heavy'],
    ['shown'],
    [],
    [],
  ]);
  await expect(bars().nth(4)).toHaveAttribute(
    'title',
    'Неделя 5: 8 дедлайнов и 2 контрольные — тяжёлая неделя'
  );
  // Пустая неделя — без столбика, самая тяжёлая — во всю высоту.
  expect(
    await bars()
      .nth(5)
      .locator('.culms-exams-load__fill')
      .evaluate((n) => n.style.height)
  ).toBe('0%');
  expect(
    await bars()
      .nth(4)
      .locator('.culms-exams-load__fill')
      .evaluate((n) => n.style.height)
  ).toBe('100%');

  // Контрольные кончаются на пятой неделе, но листать можно до восьмой — там дедлайн.
  await expect(dashboard().locator('[data-culms-nav="next"]')).toBeEnabled();
  await bars().nth(7).click();
  await expect(weeks().locator('.culms-exams-week__title')).toHaveText([
    'Неделя 6',
    'Неделя 7',
    'Неделя 8',
  ]);
  await expect(dashboard().locator('[data-culms-nav="next"]')).toBeDisabled();
  await expect(weeks().nth(2).locator('.culms-exams-week__load-count')).toHaveText('2 дедлайна');

  // К первой неделе — она встаёт в первую колонку: раньше листать некуда.
  await bars().first().click();
  await expect(weeks().locator('.culms-exams-week__title')).toHaveText([
    'Неделя 1',
    'Неделя 2',
    'Неделя 3',
  ]);
  await expect(weeks().nth(2).locator('.culms-exams-week__load-left')).toHaveText('всё сдано');

  await dashboard().locator('[data-culms-nav="today"]').click();
  await expect(weeks().first().locator('.culms-exams-week__title')).toHaveText('Неделя 4');
});

test('полоской нагрузка тоже видна', async () => {
  await writeStorage({ sync: { futureExamsDashboardPlacement: 'compact' } });
  await expect(dashboard()).toHaveClass(/culms-exams-dashboard--compact/);
  await expect(bars()).toHaveCount(8);
  await expect(dashboard().locator('.culms-exams-week__load')).toHaveCount(3);
  await expect(weeks().nth(1)).toHaveClass(/culms-exams-week--heavy/);
  await writeStorage({ sync: { futureExamsDashboardPlacement: 'below' } });
  await expect(dashboard()).not.toHaveClass(/culms-exams-dashboard--compact/);
});

test('выключенная нагрузка убирается на лету, дэшборд — как раньше', async () => {
  const requestsBefore = tasksRequests;
  await writeStorage({ sync: { futureExamsDashboardDeadlines: false } });

  await expect(dashboard().locator('.culms-exams-week__load')).toHaveCount(0);
  await expect(bars()).toHaveCount(0);
  await expect(dashboard().locator('.culms-exams-week--heavy')).toHaveCount(0);
  // Без дедлайнов листать вперёд можно только до последней контрольной.
  await expect(dashboard().locator('[data-culms-nav="next"]')).toBeDisabled();
  await expect(weeks().first()).toContainText('Контрольная работа');

  await writeStorage({ sync: { futureExamsDashboardDeadlines: true } });
  await expect(dashboard().locator('.culms-exams-week__load')).toHaveCount(3);
  // Задания ещё свежие — повторно не запрашиваются.
  expect(tasksRequests).toBe(requestsBefore);
});
