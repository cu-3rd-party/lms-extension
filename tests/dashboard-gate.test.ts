/**
 * Дэшборд на «Мои курсы» появляется вместе со списком курсов, а не позже.
 *
 * Логин не нужен: страницу и API отдаёт `context.route`, задания отвечают с
 * задержкой. Из основного мира страницы (addInitScript) следим за атрибутом
 * `data-culms-dashboard-pending` на <html>: пока он стоит, список невидим, а в
 * момент, когда его снимают, полоска с днями уже должна быть на месте.
 *
 * Запуск:
 *   bun run build:chrome
 *   bun run test dashboard-gate
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { LMS_URL, launchExtensionContext, resolveExtensionId } from './helpers/extension.js';

test.describe.configure({ mode: 'serial', timeout: 90_000 });

const LIST_URL = `${LMS_URL}/learn/courses/view/actual/all`;
const TASKS_URL = `${LMS_URL}/learn/tasks/actual-student-tasks`;
const ATTR = 'data-culms-dashboard-pending';
const HOLD_MS = 4000;

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const pad = (n: number) => String(n).padStart(2, '0');
const ddmm = (date: Date) => `${pad(date.getDate())} ${pad(date.getMonth() + 1)}`;

const today = new Date();
const CONFIG = { semesterStart: ddmm(addDays(today, -21)) };
const SCHEDULE = {
  'Машинное обучение': [{ name: 'Контрольная работа', date: ddmm(addDays(today, 2)) }],
};
const COURSES = [{ id: 1245, name: 'Машинное обучение', state: 'published' }];

/** Одно ДЗ с дедлайном послезавтра. */
function tasks() {
  const deadline = addDays(today, 2);
  deadline.setHours(22, 0, 0, 0);
  const start = new Date(deadline.getTime() - 7 * 24 * 3600_000);
  return [
    {
      id: 1,
      theme: { id: 301, name: 'Неделя' },
      longread: { id: 701, name: 'Домашнее задание' },
      state: 'inProgress',
      submitAt: null,
      deadline: deadline.toISOString(),
      lateDays: null,
      exercise: {
        id: 1001,
        name: 'ДЗ 1',
        maxScore: 10,
        activity: { id: 1, name: 'Домашние задания', weight: 0.3 },
        startDate: start.toISOString(),
        deadline: deadline.toISOString(),
      },
      course: { id: 1245, name: 'Машинное обучение', isArchived: false },
    },
  ];
}

const LIST_BODY = `<main class="main"><div class="content-container">
  <section class="header-island"><h1 class="title">Мои курсы</h1></section>
  <cu-courses-group><ul class="course-list">
    <li class="course-list__item"><cu-course-card data-id="1245">
      <span class="course-name">Машинное обучение</span></cu-course-card></li>
  </ul></cu-courses-group>
</div></main>`;
const HEAD = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<style>cu-courses-group { display: block; }</style></head>`;
const LIST_HTML = `${HEAD}<body>${LIST_BODY}</body></html>`;
const OTHER_HTML = `${HEAD}<body><main class="main"><h1>Задания</h1></main></body></html>`;

let context: BrowserContext;
let cleanup: () => Promise<void>;
let extensionId: string;
let tasksDelay = 0;
let tasksRequests = 0;

async function writeStorage(sync: Record<string, unknown>, local: Record<string, unknown> = {}) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.evaluate(
    async ({ sync, local }) => {
      await chrome.storage.sync.set(sync);
      await chrome.storage.local.set(local);
    },
    { sync, local }
  );
  await popup.close();
}

test.beforeAll(async () => {
  ({ context, cleanup } = await launchExtensionContext({ headless: true }));
  extensionId = await resolveExtensionId(context);

  await context.route(`${LMS_URL}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/micro-lms/courses/student')) {
      return route.fulfill({ json: { items: COURSES, paging: { total: COURSES.length } } });
    }
    if (url.pathname === '/api/micro-lms/tasks/student') {
      tasksRequests++;
      if (tasksDelay) await new Promise((resolve) => setTimeout(resolve, tasksDelay));
      return route.fulfill({ json: tasks() }).catch(() => {});
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: {} });
    const body = url.pathname.startsWith('/learn/courses/view') ? LIST_HTML : OTHER_HTML;
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body });
  });

  // Журнал атрибута — из основного мира страницы, по мутациям: в момент
  // снятия видно, была ли уже полоска и сколько в ней дней.
  await context.addInitScript((attr) => {
    const log: Array<{ type: string; t: number; dashboard: boolean; days: number }> = [];
    (window as unknown as { __gateLog: typeof log }).__gateLog = log;
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName !== attr) continue;
        log.push({
          type: document.documentElement.hasAttribute(attr) ? 'set' : 'removed',
          t: performance.now(),
          dashboard: !!document.querySelector('.culms-exams-dashboard'),
          days: document.querySelectorAll('.culms-deadlines__day').length,
        });
      }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: [attr] });
  }, ATTR);

  const now = Date.now();
  await writeStorage(
    { futureExamsDashboardToggle: false, futureExamsDashboardDeadlines: true },
    {
      futureExamsScheduleCache: SCHEDULE,
      futureExamsScheduleCacheTimestamp: now,
      futureExamsConfigCache: CONFIG,
      futureExamsConfigCacheTimestamp: now,
    }
  );
});

test.afterAll(async () => {
  await cleanup?.();
});

type LogEntry = { type: string; t: number; dashboard: boolean; days: number };
const gateLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { __gateLog: LogEntry[] }).__gateLog);

async function newPage() {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  return page;
}

test('пока задания не пришли, списка не видно; появляется вместе с полоской', async () => {
  tasksDelay = 1500;
  tasksRequests = 0;
  const page = await newPage();
  await page.goto(LIST_URL);

  // Задания ещё в пути: список спрятан, полоски нет.
  const group = page.locator('cu-courses-group');
  await expect(page.locator(`html[${ATTR}]`)).toHaveCount(1);
  await expect(group).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('.culms-exams-dashboard')).toHaveCount(0);

  await expect(page.locator('.culms-deadlines__day')).toHaveCount(14, { timeout: 15_000 });
  await expect(page.locator(`html[${ATTR}]`)).toHaveCount(0);
  await expect(group).toHaveCSS('visibility', 'visible');

  const log = await gateLog(page);
  const removed = log.filter((entry) => entry.type === 'removed');
  expect(log[0].type).toBe('set');
  expect(removed).toHaveLength(1);
  // Сняли, когда полоска с днями уже стояла, а не по таймеру.
  expect(removed[0]).toMatchObject({ dashboard: true, days: 14 });
  expect(removed[0].t - log[0].t).toBeLessThan(HOLD_MS - 500);
  // Задания запросил шлюз, а дэшборд взял его ответ — второго запроса нет.
  expect(tasksRequests).toBe(1);
  await page.close();
});

test('выключены обе части — список не прячется вовсе', async () => {
  tasksDelay = 0;
  await writeStorage({ futureExamsDashboardToggle: false, futureExamsDashboardDeadlines: false });
  tasksRequests = 0;
  const page = await newPage();
  await page.goto(LIST_URL);
  await expect(page.locator('cu-courses-group')).toHaveCSS('visibility', 'visible');
  // Время дать расширению внедриться.
  await page.waitForTimeout(1500);
  expect(await gateLog(page)).toEqual([]);
  expect(tasksRequests).toBe(0);
  await page.close();
});

test('задания зависли — через 4 секунды список и контрольные показываются без них', async () => {
  await writeStorage({ futureExamsDashboardToggle: true, futureExamsDashboardDeadlines: true });
  tasksDelay = 12_000;
  const page = await newPage();
  await page.goto(LIST_URL);

  await expect(page.locator(`html[${ATTR}]`)).toHaveCount(1);
  await expect(page.locator(`html[${ATTR}]`)).toHaveCount(0, { timeout: HOLD_MS + 3000 });
  await expect(page.locator('cu-courses-group')).toHaveCSS('visibility', 'visible');
  // Контрольные пришли из кэша расписания — их и видно.
  await expect(page.locator('.culms-exams-week')).toHaveCount(3);
  await expect(page.locator('.culms-deadlines__day')).toHaveCount(0);

  const log = await gateLog(page);
  const removed = log.find((entry) => entry.type === 'removed')!;
  expect(removed.t - log[0].t).toBeGreaterThanOrEqual(HOLD_MS - 200);

  // Задания всё-таки пришли — дни дорисовываются.
  await expect(page.locator('.culms-deadlines__day')).toHaveCount(14, { timeout: 15_000 });
  await page.close();
});

test('переход на список внутри LMS: тоже ждёт данные, а не показывает список раньше', async () => {
  await writeStorage({ futureExamsDashboardToggle: false, futureExamsDashboardDeadlines: true });
  tasksDelay = 1500;
  tasksRequests = 0;
  const page = await newPage();
  // Начинаем не со списка: дэшборд на страницу ещё не внедрён.
  await page.goto(TASKS_URL);
  await page.waitForTimeout(1000);
  await page.evaluate((body) => {
    history.pushState({}, '', '/learn/courses/view/actual/all');
    document.body.innerHTML = body;
  }, LIST_BODY);

  await expect(page.locator(`html[${ATTR}]`)).toHaveCount(1);
  await expect(page.locator('cu-courses-group')).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('.culms-deadlines__day')).toHaveCount(14, { timeout: 15_000 });
  await expect(page.locator('cu-courses-group')).toHaveCSS('visibility', 'visible');

  const removed = (await gateLog(page)).filter((entry) => entry.type === 'removed');
  expect(removed).toHaveLength(1);
  expect(removed[0]).toMatchObject({ dashboard: true, days: 14 });
  expect(tasksRequests).toBe(1);
  await page.close();
});

test('возврат на список, когда данные уже есть, — без скрытия', async () => {
  tasksDelay = 0;
  const page = await newPage();
  await page.goto(LIST_URL);
  await expect(page.locator('.culms-deadlines__day')).toHaveCount(14, { timeout: 15_000 });

  await page.evaluate(() => {
    history.pushState({}, '', '/learn/tasks/actual-student-tasks');
    document.querySelector('cu-courses-group')!.remove();
  });
  await expect(page.locator('.culms-exams-dashboard')).toHaveCount(0);
  const before = (await gateLog(page)).length;

  await page.evaluate((body) => {
    history.pushState({}, '', '/learn/courses/view/actual/all');
    document.body.innerHTML = body;
  }, LIST_BODY);
  await expect(page.locator('.culms-deadlines__day')).toHaveCount(14);
  expect((await gateLog(page)).slice(before)).toEqual([]);
  await page.close();
});
