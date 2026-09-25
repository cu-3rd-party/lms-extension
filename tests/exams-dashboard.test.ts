/**
 * Дэшборд ближайших контрольных на странице «Мои курсы» — на подставной LMS.
 *
 * Логин не нужен: страницу и ответы API отдаёт `context.route`, а расширение
 * настоящее, из dist/chrome. Сервер расписания тоже не нужен — расписание
 * кладётся в кэш расширения (`futureExamsScheduleCache`), который живёт 30
 * минут. Даты в нём считаются от сегодняшнего дня: номер недели у
 * расширения — от начала семестра, а подменить часы контент-скрипту
 * Playwright не может.
 *
 * Здесь же проверяется аккордеон страницы курса: он берёт расписание из того
 * же общего модуля (future_exams_api.js).
 *
 * Запуск:
 *   bun run build:chrome
 *   bun run test exams-dashboard
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { LMS_URL, launchExtensionContext, resolveExtensionId } from './helpers/extension.js';

test.describe.configure({ mode: 'serial', timeout: 90_000 });

const LIST_URL = `${LMS_URL}/learn/courses/view/actual/all`;

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

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const mondayOf = (date: Date) => addDays(date, -((date.getDay() + 6) % 7));
const ddmm = (date: Date) =>
  `${String(date.getDate()).padStart(2, '0')} ${String(date.getMonth() + 1).padStart(2, '0')}`;
function weekDates(first: Date, months = MONTHS) {
  const last = addDays(first, 6);
  return first.getMonth() === last.getMonth()
    ? `${first.getDate()}–${last.getDate()} ${months[first.getMonth()]}`
    : `${first.getDate()} ${months[first.getMonth()]} – ${last.getDate()} ${months[last.getMonth()]}`;
}

// Семестр начался три недели назад: текущая неделя — четвёртая.
const thisMonday = mondayOf(new Date());
const CONFIG = { semesterStart: ddmm(addDays(thisMonday, -21)) };
const SCHEDULE = {
  'Теория вероятностей. Основной уровень': [
    { name: 'Контрольная работа', date: ddmm(thisMonday) },
    { name: 'Тест', date: ddmm(addDays(thisMonday, 7)) },
    // Среда той же недели — склеивается с понедельничным тестом.
    { name: 'Тест', date: ddmm(addDays(thisMonday, 9)) },
  ],
  'Алгоритмы и структуры данных 1': [
    { name: 'Коллоквиум', date: ddmm(addDays(thisMonday, 7)) },
    // Седьмая неделя — за пределами дэшборда.
    { name: 'Экзамен', date: ddmm(addDays(thisMonday, 21)) },
  ],
  // Курс убран в свой архив — в дэшборде его нет, пока его не вернут.
  'Английский язык 204S3': [{ name: 'Зачёт по английскому', date: ddmm(thisMonday) }],
  'Курс, которого у студента нет': [{ name: 'Чужой тест', date: ddmm(thisMonday) }],
};

const COURSES = [
  { id: 1418, name: '🔴 Теория вероятностей. Основной уровень', category: 'mathematics' },
  { id: 1128, name: '🔴 Алгоритмы и структуры данных 1', category: 'development' },
  // Содержит ключ «Алгоритмы и структуры данных 1», но ключ достаётся самому курсу.
  { id: 1594, name: 'Отборочная работа на курс Алгоритмы и структуры данных 1', category: 'x' },
  { id: 1370, name: 'Английский язык 204S3', category: 'general' },
  { id: 1596, name: 'Физическая культура. 2 курс', category: 'general' },
].map((course) => ({ ...course, state: 'published' }));

// Список на странице — как вкладка фильтра: видны не все курсы. По видимым
// дэшборд переходит кликом по родной карточке, по остальным — ссылкой.
const LIST_COURSES = [COURSES[0], COURSES[3], COURSES[4]];

// Геометрия — как у LMS на десктопе (замерено на живой странице): шапка 72px,
// меню 80px свёрнутое и 320px развёрнутое, листается `main.main`, контейнер
// «Мои курсы» — колонка шириной 66rem по центру, у группы курсов такой же
// min-width. Уже 75em LMS переходит на узкую раскладку.
const LIST_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<style>
  body { margin: 0; font-family: sans-serif; }
  header { display: block; height: 72px; margin: 0; padding: 0; background: #fff; }
  .layout { display: flex; height: calc(100vh - 72px); }
  cu-sidebar { display: block; flex: none; width: var(--sidebar-width, 80px); background: #fff; }
  main.main { flex: 1; min-width: 0; overflow-y: auto; background: rgb(244, 244, 245); }
  cu-course-learning-layout, cu-courses-group { display: block; }
  .content-container { display: flex; flex-direction: column; gap: 1.5rem; width: fit-content;
    margin: 1.5rem auto 3rem; max-width: 66rem; }
  .header-island { background: #fff; border-radius: 24px; padding: 24px 32px 32px; }
  cu-courses-group { min-width: 66rem; }
  ul.course-list { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 0; padding: 0; list-style: none; }
  cu-course-card { display: block; height: 120px; box-sizing: border-box; padding: 16px; background: #fff;
    border-radius: 16px; cursor: pointer; }
  @media (max-width: 74.999em) {
    cu-sidebar { display: none; }
    .content-container { width: 100%; gap: 0; margin: 0; max-width: none; }
    cu-courses-group { min-width: 0; margin: 1.5rem; }
  }
</style></head>
<body><header><ul class="user-actions"></ul></header>
<div class="layout"><cu-sidebar></cu-sidebar>
<main class="main"><cu-course-learning-layout><div class="content-container">
  <section class="header-island"><h1 class="title">Мои курсы</h1></section>
  <router-outlet></router-outlet>
  <cu-courses-group><tui-loader><fieldset class="t-content"><ul class="course-list">
    ${LIST_COURSES.map(
      (course) =>
        `<li class="course-list__item"><cu-course-card data-id="${course.id}">` +
        `<span class="course-name">${course.name}</span></cu-course-card></li>`
    ).join('')}
  </ul></fieldset></tui-loader></cu-courses-group>
</div></cu-course-learning-layout></main></div>
<script>
  // Вместо роутера Angular: клик по карточке только запоминается.
  document.querySelectorAll('cu-course-card').forEach((card) =>
    card.addEventListener('click', () => { window.__openedCard = card.dataset.id; })
  );
</script>
</body></html>`;

// Страница курса: шаблон аккордеона, который клонирует future_exams_view.js.
const COURSE_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head>
<body><main class="main"><cu-course-overview>
  <h1 class="page-title">🔴 Теория вероятностей. Основной уровень</h1>
  <div class="themes-container">
    <tui-accordion class="cu-accordion themes-accordion">
      <tui-accordion-item data-theme-id="1" class="_has-arrow"><div class="t-wrapper">
        <button type="button" class="t-header t-header_hoverable"><span class="t-title">
          <div class="theme-details"><div class="icon-container"><tui-icon></tui-icon></div>
          <h3>Неделя 1. Введение</h3></div>
        </span><tui-icon tuichevron></tui-icon></button>
        <tui-expand><div class="t-wrapper">материалы</div></tui-expand>
      </div></tui-accordion-item>
    </tui-accordion>
  </div>
</cu-course-overview></main></body></html>`;

/** 1×1 PNG — картинка своего фона. */
const TEST_BACKGROUND =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let context: BrowserContext;
let cleanup: () => Promise<void>;
let extensionId: string;
let page: Page;

/** Пишет в хранилище расширения со страницы попапа — другого стабильного пути нет. */
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
    if (url.pathname.startsWith('/api/')) {
      return route.fulfill({ status: 404, json: {} });
    }
    const isCoursePage = /\/view\/actual\/\d+$/.test(url.pathname);
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: isCoursePage ? COURSE_HTML : LIST_HTML,
    });
  });

  const now = Date.now();
  await writeStorage({
    // Первые сценарии — про дэшборд под курсами; места сбоку проверяются ниже.
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

/** Неделя глазами пользователя: заголовок, метка, даты и «курс: плашки». */
async function readWeeks() {
  return weeks().evaluateAll((cards) =>
    cards.map((card) => ({
      title: card.querySelector('.culms-exams-week__title')?.textContent,
      badge: card.querySelector('.culms-exams-week__badge')?.textContent,
      dates: card.querySelector('.culms-exams-week__dates')?.textContent,
      courses: Array.from(card.querySelectorAll('.culms-exams-week__course')).map(
        (course) =>
          course.querySelector('.culms-exams-dashboard__course-name')?.textContent +
          ': ' +
          Array.from(course.querySelectorAll('.culms-exams-week__event'))
            .map((chip) => chip.textContent)
            .join(', ')
      ),
      empty: card.querySelector('.culms-exams-week__empty')?.textContent ?? null,
    }))
  );
}

test('под списком курсов — текущая неделя и две следующие', async () => {
  await expect(weeks()).toHaveCount(3, { timeout: 30_000 });

  // Дэшборд — последний ребёнок группы курсов: так он повторяет её ширину.
  expect(await dashboard().evaluate((node) => node.parentElement?.tagName.toLowerCase())).toBe(
    'cu-courses-group'
  );
  await expect(dashboard().locator('h2')).toHaveText('Ближайшие контрольные');

  expect(await readWeeks()).toEqual([
    {
      title: 'Неделя 4',
      badge: 'текущая',
      dates: weekDates(thisMonday),
      // Английский — в своём архиве, «чужой» курс — не у студента.
      courses: ['🔴 Теория вероятностей. Основной уровень: Контрольная работа'],
      empty: null,
    },
    {
      title: 'Неделя 5',
      badge: 'следующая',
      dates: weekDates(addDays(thisMonday, 7)),
      // Порядок курсов — как в списке; «Отборочная работа» ключ не получила.
      courses: [
        '🔴 Теория вероятностей. Основной уровень: Тест ×2',
        '🔴 Алгоритмы и структуры данных 1: Коллоквиум',
      ],
      empty: null,
    },
    {
      title: 'Неделя 6',
      badge: 'через одну',
      dates: weekDates(addDays(thisMonday, 14)),
      courses: [],
      empty: 'Контрольных нет',
    },
  ]);

  await expect(weeks().first()).toHaveClass(/culms-exams-week--current/);
  await expect(dashboard()).not.toContainText('Экзамен');
});

// --- Листание недель ---

const navButton = (kind: 'prev' | 'today' | 'next') =>
  dashboard().locator(`[data-culms-nav="${kind}"]`);

/** Показанные недели: номер и метка. */
const shownWeeks = () =>
  weeks().evaluateAll((cards) =>
    cards.map(
      (card) =>
        `${card.querySelector('.culms-exams-week__title')?.textContent} · ` +
        (card.querySelector('.culms-exams-week__badge')?.textContent ?? '')
    )
  );

test('недели листаются кнопками: вперёд до последней контрольной, назад до начала семестра', async () => {
  // Семестр начался три недели назад, последняя контрольная — «Экзамен» на
  // седьмой неделе.
  await expect(navButton('prev')).toBeEnabled();
  await expect(navButton('today')).toBeDisabled();
  await expect(navButton('next')).toBeEnabled();

  await navButton('next').click();
  expect(await shownWeeks()).toEqual([
    'Неделя 5 · следующая',
    'Неделя 6 · через одну',
    'Неделя 7 · через 3 недели',
  ]);
  await expect(weeks().nth(2)).toContainText('Экзамен');
  // После щелчка мышью фокус на пересобранной кнопке не держим — иначе
  // Chrome обводит её рамкой фокуса.
  expect(
    await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.dataset?.culmsNav ?? null
    )
  ).toBeNull();
  // Неделя с последней контрольной уже в последней колонке — дальше некуда.
  await expect(navButton('next')).toBeDisabled();
  await expect(navButton('today')).toBeEnabled();
  // Текущей недели в окне нет — и подсвечивать нечего.
  await expect(dashboard().locator('.culms-exams-week--current')).toHaveCount(0);

  await navButton('today').click();
  expect(await shownWeeks()).toEqual([
    'Неделя 4 · текущая',
    'Неделя 5 · следующая',
    'Неделя 6 · через одну',
  ]);
  await expect(navButton('today')).toBeDisabled();

  for (let step = 0; step < 3; step++) await navButton('prev').click();
  expect(await shownWeeks()).toEqual([
    'Неделя 1 · 3 недели назад',
    'Неделя 2 · 2 недели назад',
    'Неделя 3 · прошлая',
  ]);
  await expect(navButton('prev')).toBeDisabled();

  // С клавиатуры: дэшборд после нажатия собран заново, а фокус — на той же
  // кнопке, так что листать можно, просто нажимая Enter.
  await navButton('next').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  expect(await shownWeeks()).toEqual([
    'Неделя 3 · прошлая',
    'Неделя 4 · текущая',
    'Неделя 5 · следующая',
  ]);
  expect(
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.culmsNav)
  ).toBe('next');

  await navButton('today').click();
  await expect(navButton('today')).toBeDisabled();
});

test('на широком экране недели стоят в три колонки, на узком — одна под другой', async () => {
  const columns = () =>
    dashboard()
      .locator('.culms-exams-dashboard__weeks')
      .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length);

  expect(await columns()).toBe(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(columns).toBe(1);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(columns).toBe(3);
});

test('курс, вернувшийся из своего архива, появляется без перезагрузки', async () => {
  await page.evaluate(() => ((window as any).__reloadMarker = true));
  await writeStorage({ local: { archivedCourseIds: [] } });

  await expect(weeks().first()).toContainText('Английский язык 204S3');
  await expect(weeks().first().locator('.culms-exams-week__event')).toHaveText([
    'Контрольная работа',
    'Зачёт по английскому',
  ]);
  expect(await page.evaluate(() => (window as any).__reloadMarker)).toBe(true);

  await writeStorage({ local: { archivedCourseIds: ['1370'] } });
  await expect(weeks().first()).not.toContainText('Английский язык 204S3');
});

test('свои названия курсов подставляются и в дэшборд', async () => {
  await writeStorage({
    sync: { customCourseNamesToggle: true },
    local: { courseNames: { '1418': 'Казино. Доделный уровень' } },
  });

  const name = weeks().nth(1).locator('.culms-exams-dashboard__course-name').first();
  await expect(name).toHaveText('Казино. Доделный уровень');
  await expect(name).toHaveAttribute(
    'data-culms-orig-name',
    '🔴 Теория вероятностей. Основной уровень'
  );

  await writeStorage({ sync: { customCourseNamesToggle: false } });
  await expect(name).toHaveText('🔴 Теория вероятностей. Основной уровень');
});

test('на смене вкладки фильтра дэшборд переезжает в новую группу курсов', async () => {
  // Angular пересоздаёт cu-courses-group на каждой вкладке — повторяем это.
  await page.evaluate(() => {
    const old = document.querySelector('cu-courses-group')!;
    const fresh = document.createElement('cu-courses-group');
    fresh.innerHTML =
      '<tui-loader><fieldset class="t-content"><ul class="course-list"></ul></fieldset></tui-loader>';
    old.replaceWith(fresh);
    history.pushState({}, '', '/learn/courses/view/actual/listener');
  });

  await expect(page.locator('cu-courses-group > .culms-exams-dashboard')).toHaveCount(1);
  await expect(weeks()).toHaveCount(3);
  expect(
    await page.evaluate(() => document.querySelectorAll('.culms-exams-dashboard').length)
  ).toBe(1);
});

test('тумблер выключает и включает дэшборд на лету', async () => {
  await writeStorage({ sync: { futureExamsDashboardToggle: false } });
  await expect(dashboard()).toHaveCount(0);

  await writeStorage({ sync: { futureExamsDashboardToggle: true } });
  await expect(weeks()).toHaveCount(3);
});

test('тёмная тема перекрашивает дэшборд теми же переменными, что и шапку', async () => {
  const background = () => dashboard().evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(await background()).toBe('rgb(255, 255, 255)');

  await writeStorage({ sync: { themeEnabled: true } });
  await expect(dashboard()).toHaveClass(/culms-exams-dashboard--dark/);
  // --culms-dark-bg-primary из dark-theme.css — тот же цвет, что у шапки.
  await expect.poll(background).toBe('rgb(32, 33, 36)');

  await writeStorage({ sync: { themeEnabled: false } });
  await expect(dashboard()).not.toHaveClass(/culms-exams-dashboard--dark/);
});

test('своя картинка фона не ложится на дэшборд, даже когда он выше порога полотна', async () => {
  // Невысокое окно: по площади дэшборд проходит как полотно страницы.
  await page.setViewportSize({ width: 1280, height: 480 });
  await writeStorage({
    sync: { customBackgroundToggle: true },
    local: { customBackground: TEST_BACKGROUND },
  });

  // Проверка не пустая: настоящее полотно картинку получило.
  await expect(page.locator('main.main')).toHaveClass(/culms-bg-canvas/);
  await expect(dashboard()).not.toHaveClass(/culms-bg-canvas/);
  await expect(page.locator('.culms-exams-dashboard .culms-bg-canvas')).toHaveCount(0);

  await writeStorage({ sync: { customBackgroundToggle: false } });
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('клик по курсу из списка — через его карточку, по остальным — ссылкой', async () => {
  // Вернуть список с карточками: прошлый тест оставил пустую вкладку.
  await page.goto(LIST_URL);
  await expect(weeks()).toHaveCount(3, { timeout: 30_000 });

  const probability = weeks()
    .nth(1)
    .getByRole('link', { name: /Теория вероятностей/ });
  await expect(probability).toHaveAttribute('href', '/learn/courses/view/actual/1418');
  await probability.click();
  expect(await page.evaluate(() => (window as any).__openedCard)).toBe('1418');
  expect(page.url()).toBe(LIST_URL);

  // Алгоритмов нет в списке на странице — обычный переход по ссылке.
  await weeks()
    .nth(1)
    .getByRole('link', { name: /Алгоритмы/ })
    .click();
  await expect(page).toHaveURL(`${LMS_URL}/learn/courses/view/actual/1128`);
  // Это страница курса, а не список — дэшборда на ней нет.
  await expect(page.locator('cu-course-overview')).toBeVisible();
  await expect(dashboard()).toHaveCount(0);
});

// --- Место на странице ---

const container = () => page.locator('cu-course-learning-layout .content-container');

/** Где дэшборд относительно шапки «Мои курсы» и группы курсов. */
function geometry() {
  return page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const board = rect('.culms-exams-dashboard');
    const island = rect('.header-island');
    const group = rect('cu-courses-group');
    return {
      boardLeft: board.left,
      boardRight: board.right,
      boardTop: board.top,
      boardBottom: board.bottom,
      boardWidth: board.width,
      boardHeight: board.height,
      islandLeft: island.left,
      islandRight: island.right,
      islandTop: island.top,
      groupWidth: group.width,
      viewportHeight: innerHeight,
    };
  });
}

const weekColumns = () =>
  dashboard()
    .locator('.culms-exams-dashboard__weeks')
    .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length);

test('справа: колонка рядом со списком, вровень с шапкой и без прокрутки', async () => {
  // Экран 1536 × 737 при масштабе 125 % и свёрнутом меню LMS — на нём
  // дэшборд под курсами уходил за нижний край.
  await page.setViewportSize({ width: 1536, height: 737 });
  await writeStorage({ sync: { futureExamsDashboardPlacement: 'right' } });
  await page.goto(LIST_URL);

  await expect(container()).toHaveClass(/culms-exams-host--right/, { timeout: 30_000 });
  await expect(page.locator('.content-container > .culms-exams-dashboard')).toHaveCount(1);
  await expect(dashboard()).toHaveClass(/culms-exams-dashboard--side/);
  await expect(weeks()).toHaveCount(3);

  const box = await geometry();
  // Список курсов не сжимается, колонка — справа от него через отступ. Шапка
  // той же ширины, что список: сжимается колонка дэшборда, а не колонка списка.
  expect(box.groupWidth).toBe(1056);
  expect(box.islandRight - box.islandLeft).toBe(1056);
  expect(box.boardLeft).toBeGreaterThanOrEqual(box.islandRight + 23);
  expect(box.boardWidth).toBeGreaterThanOrEqual(240);
  expect(box.boardWidth).toBeLessThanOrEqual(340);
  // Начинается вровень с шапкой «Мои курсы» и помещается в окно целиком.
  expect(Math.abs(box.boardTop - box.islandTop)).toBeLessThan(1);
  expect(box.boardBottom).toBeLessThanOrEqual(box.viewportHeight);
  // Недели в узкой колонке — одна под другой.
  expect(await weekColumns()).toBe(1);
});

test('слева: та же колонка перед списком', async () => {
  await writeStorage({ sync: { futureExamsDashboardPlacement: 'left' } });

  await expect(container()).toHaveClass(/culms-exams-host--left/);
  await expect(container()).not.toHaveClass(/culms-exams-host--right/);
  const box = await geometry();
  expect(box.boardRight).toBeLessThanOrEqual(box.islandLeft - 23);
  expect(Math.abs(box.boardTop - box.islandTop)).toBeLessThan(1);
  expect(box.groupWidth).toBe(1056);
  expect(box.islandRight - box.islandLeft).toBe(1056);
});

test('развернули меню LMS — сбоку тесно, дэшборд полоской над курсами; свернули — снова сбоку', async () => {
  await writeStorage({ sync: { futureExamsDashboardPlacement: 'right' } });
  await expect(container()).toHaveClass(/culms-exams-host--right/);

  // Развёрнутое меню — 320px: рядом со списком остаётся около 145px. Полоска
  // встаёт над курсами, а не под ними — снизу её не видно без прокрутки.
  await page.evaluate(() => document.documentElement.style.setProperty('--sidebar-width', '320px'));
  await expect(page.locator('cu-courses-group > .culms-exams-dashboard:first-child')).toHaveCount(
    1
  );
  await expect(dashboard()).toHaveClass(/culms-exams-dashboard--compact/);
  await expect(dashboard()).toHaveClass(/culms-exams-dashboard--above/);
  await expect(container()).not.toHaveClass(/culms-exams-host/);

  await page.evaluate(() => document.documentElement.style.setProperty('--sidebar-width', '80px'));
  await expect(page.locator('.content-container > .culms-exams-dashboard')).toHaveCount(1);
  await expect(dashboard()).not.toHaveClass(/culms-exams-dashboard--compact/);
  await expect(container()).toHaveClass(/culms-exams-host--right/);
});

test('над курсами: та же полоска первым ребёнком группы, выше списка', async () => {
  await writeStorage({ sync: { futureExamsDashboardPlacement: 'above' } });

  await expect(page.locator('cu-courses-group > .culms-exams-dashboard:first-child')).toHaveCount(
    1
  );
  await expect(dashboard()).toHaveClass(/culms-exams-dashboard--above/);
  await expect(dashboard()).toHaveClass(/culms-exams-dashboard--compact/);
  const listTop = await page
    .locator('ul.course-list')
    .evaluate((node) => node.getBoundingClientRect().top);
  const box = await geometry();
  expect(box.boardBottom + 23).toBeLessThanOrEqual(listTop);
  expect(box.boardBottom).toBeLessThanOrEqual(box.viewportHeight);
});

test('компактно: полоска под курсами, мероприятия и курс одной строкой', async () => {
  await writeStorage({ sync: { futureExamsDashboardPlacement: 'compact' } });

  // Смена места на лету: дэшборд уже в группе, но теперь — последним.
  await expect(page.locator('cu-courses-group > .culms-exams-dashboard:last-child')).toHaveCount(1);
  await expect(dashboard()).toHaveClass(/culms-exams-dashboard--compact/);
  await expect(dashboard()).not.toHaveClass(/culms-exams-dashboard--above/);
  await expect(container()).not.toHaveClass(/culms-exams-host/);

  const rows = await weeks().evaluateAll((cards) =>
    cards.map((card) => ({
      head: card.querySelector('.culms-exams-week__head')?.textContent,
      courses: Array.from(card.querySelectorAll('.culms-exams-week__course')).map((course) =>
        // Порядок в строке: сначала мероприятия, потом курс.
        Array.from(course.children)
          .map((part) => part.textContent)
          .join(' | ')
      ),
    }))
  );
  expect(rows).toEqual([
    {
      // Метка в строке заголовка — только у текущей недели.
      head: `Неделя 4${weekDates(thisMonday, MONTHS_SHORT)}текущая`,
      courses: ['Контрольная работа | 🔴 Теория вероятностей. Основной уровень'],
    },
    {
      head: `Неделя 5${weekDates(addDays(thisMonday, 7), MONTHS_SHORT)}`,
      courses: [
        'Тест ×2 | 🔴 Теория вероятностей. Основной уровень',
        'Коллоквиум | 🔴 Алгоритмы и структуры данных 1',
      ],
    },
    {
      head: `Неделя 6${weekDates(addDays(thisMonday, 14), MONTHS_SHORT)}`,
      courses: [],
    },
  ]);

  // Три недели в строку, а высота — пара строк текста, а не карточки.
  expect(await weekColumns()).toBe(3);
  expect((await geometry()).boardHeight).toBeLessThan(130);

  // Каждый курс — одна строка: название не переносится.
  const lineHeights = await dashboard()
    .locator('.culms-exams-dashboard__course-name')
    .evaluateAll((links) => links.map((link) => link.getBoundingClientRect().height));
  expect(Math.max(...lineHeights)).toBeLessThanOrEqual(20);

  await writeStorage({ sync: { futureExamsDashboardPlacement: 'below' } });
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('полоской кнопки листания — под заголовком, и стрелка не уезжает из-под курсора', async () => {
  await page.setViewportSize({ width: 1536, height: 737 });
  await writeStorage({ sync: { futureExamsDashboardPlacement: 'compact' } });
  await expect(dashboard()).toHaveClass(/culms-exams-dashboard--compact/);

  // Кнопки — в узкой колонке заголовка, под ним, левее недель.
  const layout = await dashboard().evaluate((board) => {
    const rect = (selector: string) => board.querySelector(selector)!.getBoundingClientRect();
    const title = rect('.culms-exams-dashboard__title');
    const nav = rect('.culms-exams-dashboard__nav');
    const weeksBox = rect('.culms-exams-dashboard__weeks');
    return {
      titleBottom: title.bottom,
      navTop: nav.top,
      navRight: nav.right,
      weeksLeft: weeksBox.left,
    };
  });
  expect(layout.navTop).toBeGreaterThanOrEqual(layout.titleBottom);
  expect(layout.navRight).toBeLessThanOrEqual(layout.weeksLeft);

  // Кнопка «к текущей» стоит между стрелками всегда, поэтому после первого
  // листания стрелка «вперёд» на том же месте.
  const before = await navButton('next').boundingBox();
  await navButton('next').click();
  await expect(navButton('today')).toBeEnabled();
  expect(await navButton('next').boundingBox()).toEqual(before);

  await navButton('today').click();
  await writeStorage({ sync: { futureExamsDashboardPlacement: 'below' } });
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('аккордеон курса берёт недели из того же расписания', async () => {
  // courses_fix.js перезагружает страницы курсов при смене этих настроек —
  // пишем их, уйдя с LMS, чтобы перезагрузка не перебила переход.
  await page.goto('about:blank');
  await writeStorage({
    sync: { futureExamsViewToggle: true, futureExamsDisplayFormat: 'week' },
  });
  await page.goto(`${LMS_URL}/learn/courses/view/actual/1418`);

  // Контрольная этой недели уже в прошлом для страницы курса (она показывает
  // «с завтрашнего дня»), оба теста следующей недели — нет.
  const items = page.locator('.custom-future-exam-item h3');
  await expect(items).toHaveText(['Неделя 5. Тест', 'Неделя 5. Тест'], { timeout: 30_000 });
});

test('тумблер в меню плагина пишет настройку и показывает подсказку', async () => {
  await writeStorage({ sync: { futureExamsDashboardToggle: false } });

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.locator('h3', { hasText: 'Визуальные улучшения' }).click();

  const toggle = popup.locator('#future-exams-dashboard-toggle');
  await expect(toggle).not.toBeChecked();
  await expect(popup.locator('#future-exams-dashboard-container')).toBeHidden();

  await popup.locator('label.switch', { has: toggle }).click();
  await expect(toggle).toBeChecked();
  await expect(popup.locator('#future-exams-dashboard-container')).toBeVisible();
  await expect
    .poll(() =>
      popup.evaluate(
        async () =>
          (await chrome.storage.sync.get('futureExamsDashboardToggle'))[
            'futureExamsDashboardToggle'
          ]
      )
    )
    .toBe(true);

  // Место выбирается сразу под тумблером и сохраняется без закрытия меню.
  const placement = popup.locator('#future-exams-dashboard-placement');
  await expect(placement).toHaveValue('below');
  await placement.selectOption('left');
  await expect
    .poll(() =>
      popup.evaluate(
        async () =>
          (await chrome.storage.sync.get('futureExamsDashboardPlacement'))[
            'futureExamsDashboardPlacement'
          ]
      )
    )
    .toBe('left');

  await popup.close();
});

test('по умолчанию — полоской под курсами, и в меню выбран этот же вариант', async () => {
  // Свежая установка: места в хранилище нет вовсе.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.evaluate(() => chrome.storage.sync.remove('futureExamsDashboardPlacement'));
  await popup.reload();
  await popup.locator('h3', { hasText: 'Визуальные улучшения' }).click();
  await expect(popup.locator('#future-exams-dashboard-placement')).toHaveValue('compact');
  await popup.close();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(LIST_URL);
  await expect(page.locator('cu-courses-group > .culms-exams-dashboard:last-child')).toHaveCount(
    1,
    {
      timeout: 30_000,
    }
  );
  await expect(dashboard()).toHaveClass(/culms-exams-dashboard--compact/);
  await expect(dashboard()).not.toHaveClass(/culms-exams-dashboard--above/);
  await expect(container()).not.toHaveClass(/culms-exams-host/);
});
