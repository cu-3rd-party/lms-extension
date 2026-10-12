/**
 * Офлайн-копия LMS (src/offline): выгрузка, страница «LMS офлайн» и zip.
 *
 * Логин не нужен: LMS подставная (`context.route`), расширение настоящее, из
 * dist/chrome. Файлы лонгридов фон качает сам по подписанной ссылке из
 * хранилища (Selectel) — такие запросы service worker'а `context.route`
 * не видит, поэтому fetch в нём подменяется (как в metrics.test.ts).
 *
 * Путь целиком: LMS сначала «лежит» (503) — в статусе «LMS не отвечает»;
 * потом оживает — «Остановить» прерывает, одно нажатие «Скачать всё» выгружает всё; страница офлайн
 * показывает курсы, лонгрид, задание с решением, расписание, оценки,
 * посещаемость и профиль; «Сохранить копию на диск» отдаёт zip, и
 * распакованная копия открывается с диска без расширения.
 *
 * Запуск:
 *   bun run build:chrome
 *   bun run test offline-cache
 */

import { test, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';
import { unzipSync, strFromU8 } from 'fflate';
import { LMS_URL, launchExtensionContext, resolveExtensionId } from './helpers/extension.js';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const COURSE = { id: 969, name: 'STEM: Философия и наука' };
// Курс, который студент снял в списке «Курсы»: по нему не должно уйти ни одного запроса.
const SKIPPED = { id: 970, name: 'Скучный курс' };
const SOLVED_TASK = 1476603;
// Задание старше месяца: ни подробностей, ни строки в списке.
const OLD_TASK = 1400000;

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const fileItem = (longreadId: number, name: string, length: number, order: number) => ({
  discriminator: 'file',
  viewType: 'file',
  filename: `longreads/${longreadId}/${name}`,
  version: 'v1',
  length,
  content: { name, filename: `longreads/${longreadId}/${name}`, version: 'v1', length },
  id: 1000 + order,
  order,
});

const API: Record<string, unknown> = {
  '/api/micro-lms/courses/student': { items: [COURSE, SKIPPED] },
  '/api/micro-lms/tasks/student': [
    {
      id: SOLVED_TASK,
      state: 'evaluated',
      score: 9,
      submitAt: daysAgo(6),
      evaluateAt: daysAgo(3),
      deadline: daysAgo(5),
      exercise: { id: 54396, name: 'ДЗ 6', maxScore: 10, activity: { name: 'Домашние задания' } },
      course: COURSE,
      theme: { id: 1, name: 'Неделя 1' },
      longread: { id: 16899, name: 'Домашнее задание' },
    },
    {
      id: OLD_TASK,
      state: 'evaluated',
      score: 7,
      submitAt: daysAgo(60),
      evaluateAt: daysAgo(55),
      deadline: daysAgo(59),
      exercise: { id: 50000, name: 'ДЗ 1', maxScore: 10, activity: { name: 'Домашние задания' } },
      course: COURSE,
      theme: { id: 1, name: 'Неделя 1' },
      longread: { id: 16000, name: 'Старое задание' },
    },
    {
      id: 1500000,
      state: 'backlog',
      score: null,
      submitAt: null,
      deadline: '2099-01-01T19:00:00+00:00',
      exercise: { id: 60000, name: 'ДЗ 7', maxScore: 10, activity: { name: 'Домашние задания' } },
      course: COURSE,
      theme: { id: 1, name: 'Неделя 1' },
      longread: { id: 16900, name: 'Ещё задание' },
    },
  ],
  '/api/micro-lms/students/me/timetables': [
    {
      courseId: SKIPPED.id,
      courseName: SKIPPED.name,
      eventRows: [
        {
          eventType: 'lecture',
          eventRowNumber: 1,
          calendarEvent: {
            eventType: 'lecture',
            schedule: { startTime: '09:00', endTime: '10:20', dayOfWeek: 'wednesday', interval: 1 },
          },
        },
      ],
    },
    {
      courseId: COURSE.id,
      courseName: COURSE.name,
      eventRows: [
        {
          eventType: 'seminar',
          eventRowNumber: 1,
          calendarEvent: {
            eventType: 'seminar',
            // Формат LMS с октября 2026: аудитория — объект, преподаватели — массив.
            calendarEventId: '08de5c52-1724-6d6b-7db3-f7000107e781',
            location: { id: 'loc-1', title: 'F201', building: 'ЦТ' },
            hosts: [{ name: 'Михайлов Игорь ', email: 'i@cu.ru' }],
            schedule: {
              startDate: '2026-02-02',
              endDate: '2026-05-31',
              startTime: '10:00',
              endTime: '11:20',
              dayOfWeek: 'tuesday',
              interval: 1,
            },
          },
        },
      ],
    },
  ],
  '/api/micro-lms/performance/student': {
    courses: [
      { ...COURSE, total: 7.25 },
      { ...SKIPPED, total: 3 },
    ],
  },
  '/api/micro-lms/gradebook': {
    semesters: [
      {
        year: 2025,
        semesterNumber: 1,
        grades: [{ subject: 'Математический анализ', grade: 'Отлично', assessmentType: 'exam' }],
      },
    ],
  },
  '/api/micro-lms/v0/attendance/learn/courses': [
    {
      courseId: COURSE.id,
      courseName: COURSE.name,
      isVisibleForStudents: true,
      stats: { percent: 80, attendedCount: 8, enrolledCount: 10 },
    },
    // Невыбранный курс: в списках LMS он есть, на странице офлайн его быть не должно.
    {
      courseId: SKIPPED.id,
      courseName: SKIPPED.name,
      isVisibleForStudents: true,
      stats: { percent: 50, attendedCount: 1, enrolledCount: 2 },
    },
  ],
  '/api/micro-lms/students/me': {
    lastName: 'Студентов',
    firstName: 'Тест',
    universityEmail: 'test@edu.centraluniversity.ru',
    lateDaysBalance: 42,
  },
  [`/api/micro-lms/courses/${COURSE.id}/overview`]: {
    ...COURSE,
    themes: [
      {
        id: 1,
        name: 'Неделя 1',
        order: 0,
        longreads: [
          { id: 13773, name: 'Лекция 1', exercises: [] },
          { id: 16899, name: 'Домашнее задание', exercises: [{ id: 54396, name: 'ДЗ 6' }] },
        ],
      },
    ],
  },
  [`/api/micro-lms/courses/${COURSE.id}/student-performance`]: {
    tasks: [
      {
        id: SOLVED_TASK,
        exerciseId: 54396,
        state: 'evaluated',
        score: 9,
        maxScore: 10,
        activity: { id: 2714, name: 'Домашние задания', weight: 0.2 },
      },
    ],
    total: 7.25,
  },
  [`/api/micro-lms/courses/${COURSE.id}/exercises`]: {
    exercises: [{ id: 54396, name: 'ДЗ 6', maxScore: 10 }],
  },
  '/api/micro-lms/longreads/13773/materials': {
    items: [
      {
        discriminator: 'markdown',
        viewContent: JSON.stringify({
          value:
            '<h2>Вводная лекция</h2><p>Текст лекции<img src="x" onerror="window.__xss=1"></p><script>window.__xss=1</script>',
          isTuiEditor: true,
        }),
        id: 1,
        order: 0,
      },
      fileItem(13773, 'Презентация: неделя 1.pdf', 1000, 1),
      // Больше лимита по умолчанию (250 МБ) — качать не должны.
      fileItem(13773, 'Огромный архив.zip', 300 * 1024 * 1024, 2),
      { discriminator: 'videoPlatform', name: 'Видео о курсе', id: 3, order: 3 },
    ],
  },
  '/api/micro-lms/longreads/16899/materials': {
    items: [
      {
        discriminator: 'coding',
        name: 'ДЗ 6',
        viewContent: JSON.stringify({ description: '<p>Напиши мини-эссе.</p>' }),
        estimation: {
          deadline: '2026-03-22T19:00:00+00:00',
          maxScore: 10,
          activity: { name: 'Домашние задания', weight: 0.2 },
        },
        attachments: [
          {
            name: 'Условие ДЗ.pdf',
            filename: 'exercises/54396/Условие ДЗ.pdf',
            version: 'v1',
            length: 500,
          },
        ],
        taskId: SOLVED_TASK,
        id: 54396,
        order: 0,
      },
    ],
  },
  [`/api/micro-lms/tasks/${SOLVED_TASK}`]: {
    id: SOLVED_TASK,
    state: 'evaluated',
    score: 9,
    submitAt: '2026-03-22T18:20:36+00:00',
    solution: {
      attachments: [
        {
          name: 'Моё эссе.pdf',
          filename: `tasks/${SOLVED_TASK}/solutions/Моё эссе.pdf`,
          version: 'v1',
          length: 300,
        },
      ],
    },
  },
};

let context: BrowserContext;
let cleanup: () => Promise<void>;
let extensionId: string;
let lmsDown = true;
const requested: string[] = [];

async function worker(): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}

/** Хранилище файлов (Selectel) из service worker'а: файл — это его имя байтами. */
async function stubStorage(): Promise<void> {
  await (
    await worker()
  ).evaluate(() => {
    const scope = self as unknown as { __realFetch?: typeof fetch };
    scope.__realFetch ??= fetch;
    self.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('https://university-lms-materials.s3.ru-7.storage.selcloud.ru/')) {
        const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
          .split('/')
          .pop();
        return Promise.resolve(new Response(`FILE:${name}`, { status: 200 }));
      }
      return scope.__realFetch!(input, init);
    }) as typeof fetch;
  });
}

async function extensionPage(path: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${path}`);
  return page;
}

async function status(page: Page): Promise<any> {
  return page.evaluate(() => chrome.runtime.sendMessage({ action: 'OFFLINE_STATUS' }));
}

test.beforeAll(async () => {
  ({ context, cleanup } = await launchExtensionContext({ headless: true }));
  extensionId = await resolveExtensionId(context);
  await stubStorage();

  await context.route(`${LMS_URL}/**`, (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) {
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><body><main>LMS</main></body></html>',
      });
    }
    requested.push(url.pathname + url.search);
    if (lmsDown) return route.fulfill({ status: 503, body: 'Service Unavailable' });
    // Как 12.10.2026: student-hub лежит, остальная LMS работает.
    if (url.pathname.startsWith('/api/student-hub/')) {
      return route.fulfill({ status: 502, json: { title: 'BadGateway', status: 502 } });
    }
    if (url.pathname === '/api/micro-lms/content/download-link') {
      const filename = url.searchParams.get('filename') || '';
      return route.fulfill({
        json: {
          url: `https://university-lms-materials.s3.ru-7.storage.selcloud.ru/bucket/${encodeURIComponent(filename)}?sig=1`,
        },
      });
    }
    const body = API[url.pathname];
    return body === undefined
      ? route.fulfill({ status: 404, json: {} })
      : route.fulfill({ json: body });
  });
});

test.afterAll(async () => {
  await cleanup?.();
});

test('LMS лежит — в статусе «не отвечает», следующий заход отложен', async () => {
  const lms = await context.newPage();
  await lms.goto(`${LMS_URL}/learn/courses/view/actual`);

  const popup = await extensionPage('popup/popup.html');
  await popup.getByRole('tab', { name: 'Офлайн' }).click();
  await popup.locator('label.switch:has(#offline-cache-toggle)').click();

  await expect
    .poll(async () => (await status(popup)).state?.reason, { timeout: 20_000 })
    .toBe('down');
  const { state } = await status(popup);
  expect(state.nextRunAfter).toBeGreaterThan(Date.now());
  await expect(popup.locator('#offline-status')).toContainText('LMS не отвечает');
  await popup.close();
});

test('LMS ожила — «Остановить» прерывает, «Скачать всё» одним нажатием выгружает всё выбранное', async () => {
  lmsDown = false;
  requested.length = 0;
  const popup = await extensionPage('popup/popup.html');
  await popup.getByRole('tab', { name: 'Офлайн' }).click();
  const button = popup.locator('#offline-sync-btn');

  // Плашка «Функция находится в бете» — первой во вкладке.
  await expect(popup.locator('#offline-beta')).toContainText('Функция находится в бете');
  await popup.screenshot({ path: 'test-results/offline-cache/popup-beta.png' });

  // Справка «Как это работает» — свёрнута, раскрывается по клику.
  const help = popup.locator('#offline-help');
  await expect(help).not.toHaveAttribute('open', '');
  await help.locator('summary').click();
  await expect(help).toContainText('Когда качается');
  await expect(help).toContainText('Как сохранить копию на диск');
  await help.screenshot({ path: 'test-results/offline-cache/popup-help.png' });
  await help.locator('summary').click();

  // Сначала — только список курсов: попап сам просит его, раз его ещё нет.
  // Пока курсы не выбраны, больше ничего не качается и «Скачать всё» недоступна.
  const courseBox = (name: string) =>
    popup.locator('#offline-courses label', { hasText: name }).locator('input');
  await expect(courseBox(COURSE.name)).toBeVisible({ timeout: 20_000 });
  await expect(courseBox(COURSE.name)).not.toBeChecked();
  await expect(courseBox(SKIPPED.name)).not.toBeChecked();
  await expect(button).toBeDisabled();
  await expect(popup.locator('#offline-status')).toContainText('Начать скачивание');
  await expect.poll(async () => (await status(popup)).running).toBe(false);
  expect(requested).toEqual(['/api/micro-lms/courses/student?limit=10000&state=published']);

  const start = popup.locator('#offline-courses-start');
  await expect(start).toBeDisabled();
  await courseBox(COURSE.name).check();
  await expect(start).toHaveText('Начать скачивание (1)');
  // «Скачать всё» доступна, как только отмечен курс, — без «Начать скачивание».
  await expect(button).toBeEnabled();
  await start.click();
  await expect(popup.locator('#offline-courses-actions')).toBeHidden();
  expect(await popup.evaluate(() => chrome.storage.sync.get('offlineCourseIds'))).toEqual({
    offlineCourseIds: [COURSE.id],
  });
  await expect(button).toBeEnabled();

  // «Скачать всё» → «Остановить» прерывает на полпути.
  await expect(button).toHaveText('Скачать всё');
  await button.click();
  await expect(button).toHaveText('Остановить');
  await button.click();
  await expect.poll(async () => (await status(popup)).running).toBe(false);
  const stopped = await status(popup);
  expect(stopped.pending).toBeGreaterThan(0);
  expect(stopped.log.map((line: any) => line.text).join('\n')).toContain('■ Остановлено');
  await expect(button).toHaveText('Скачать всё');

  // Одно нажатие — и всё до конца, без повторных нажатий и пауз между заходами.
  await button.click();
  await expect
    .poll(
      async () => {
        const current = await status(popup);
        return !current.running && current.pending === 0 && current.state?.reason == null;
      },
      { timeout: 90_000, intervals: [500] }
    )
    .toBe(true);
  expect((await status(popup)).log.map((line: any) => line.text).join('\n')).toContain(
    '■ Всё скачано'
  );

  const done = Object.fromEntries(
    (await status(popup)).progress.map((p: any) => [p.key, `${p.done}/${p.total}`])
  );
  expect(done).toMatchObject({
    overviews: '1/1',
    longreads: '2/2',
    longreadFiles: '2/2',
    solutions: '1/1',
    solutionFiles: '1/1',
  });
  // Снятый курс не трогали вовсе.
  expect(requested.filter((r) => r.includes(`/courses/${SKIPPED.id}/`))).toEqual([]);
  // Ведомости, посещаемость и профиль больше не качаются.
  for (const path of [
    '/api/micro-lms/performance/',
    '/api/micro-lms/gradebook',
    '/api/micro-lms/v0/attendance/',
    '/student-performance',
    '/exercises',
  ]) {
    expect(requested.filter((r) => r.includes(path))).toEqual([]);
  }
  expect(
    requested.some(
      (r) => r.startsWith('/api/micro-lms/students/me?') || r === '/api/micro-lms/students/me'
    )
  ).toBe(false);
  expect(requested.some((r) => r.startsWith('/api/student-hub/'))).toBe(false);
  // Задание старше месяца не перечитывали.
  expect(requested).not.toContain(`/api/micro-lms/tasks/${OLD_TASK}`);
  // Лонгриды — раньше заданий и остальных списков.
  const firstLongread = requested.findIndex((r) => r.includes('/longreads/'));
  expect(firstLongread).toBeGreaterThan(-1);
  expect(firstLongread).toBeLessThan(
    requested.findIndex((r) => r.startsWith('/api/micro-lms/tasks/student'))
  );
  // За лонгридом сразу идут его файлы, а не следующий лонгрид.
  const lecture = requested.findIndex((r) => r.includes('/longreads/13773/'));
  expect(requested[lecture + 1]).toContain('download-link');

  // Размер копии: строкой статуса и первой строкой терминала.
  const sized = await status(popup);
  expect(sized.bytes).toBeGreaterThan(0);
  expect(sized.dataBytes).toBeGreaterThan(0);
  await expect(popup.locator('#offline-status')).toContainText('Копия занимает');
  await expect(popup.locator('#offline-size')).toContainText('Размер копии');
  await expect(popup.locator('#offline-size')).toContainText(/\d+ КБ/);

  // Терминал в попапе: прогресс и лог.
  await expect(popup.locator('#offline-progress')).toContainText('Лонгриды');
  await expect(popup.locator('#offline-progress')).toContainText('2 / 2');
  await expect(popup.locator('#offline-log')).toContainText('✓ Лонгрид «Лекция 1»');
  await expect(popup.locator('#offline-log')).toContainText('✓ Файл «Презентация: неделя 1.pdf»');
  // Список курсов: снятый — без галочки.
  await expect(
    popup.locator('#offline-courses label', { hasText: SKIPPED.name }).locator('input')
  ).not.toBeChecked();
  await expect(
    popup.locator('#offline-courses label', { hasText: COURSE.name }).locator('input')
  ).toBeChecked();
  await popup.screenshot({ path: 'test-results/offline-cache/popup-terminal.png', fullPage: true });
  // Огромный файл не запрашивали даже ссылкой.
  expect(requested.some((r) => r.includes(encodeURIComponent('Огромный')))).toBe(false);
  // Невыданное задание без решения не перечитывали.
  expect(requested).not.toContain('/api/micro-lms/tasks/1500000');

  // Второй заход ничего не перекачивает: всё свежее.
  requested.length = 0;
  await popup.evaluate(() => chrome.runtime.sendMessage({ action: 'OFFLINE_SYNC_NOW' }));
  await expect.poll(async () => (await status(popup)).running).toBe(false);
  expect(requested).toEqual([]);
  await popup.close();
});

test('страница «LMS офлайн»: курсы, лонгрид, задание с решением и разделы', async () => {
  const page = await extensionPage('offline/offline.html');

  await expect(page.locator('.card')).toContainText(COURSE.name);
  await expect(page.locator('.card')).toContainText('скачано 2 из 2');
  // В шапке — дата и размер копии.
  await expect(page.locator('.brand__sub')).toContainText(/Данные на .+ · \d+ КБ/);
  // Шрифт LMS (Inter) — из расширения, без сети.
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('16px Inter', 'Курсы')))
    .toBe(true);
  await page.screenshot({ path: 'test-results/offline-cache/courses.png' });

  await page.locator('.card').click();
  // Темы — аккордеоном, как в LMS: свёрнуты, пока не раскроешь.
  await expect(page.getByRole('link', { name: 'Лекция 1' })).toBeHidden();
  await page.locator('.theme summary', { hasText: 'Неделя 1' }).click();
  await page.screenshot({ path: 'test-results/offline-cache/course.png' });
  await page.getByRole('link', { name: 'Лекция 1' }).click();
  await expect(page.locator('.longread h2')).toHaveText('Вводная лекция');
  await expect(page.locator('.longread script')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  const pdf = page.locator('.file a.file__name', { hasText: 'Презентация' });
  await expect(pdf).toHaveAttribute('href', /^blob:/);
  expect(await pdf.evaluate((a: HTMLAnchorElement) => fetch(a.href).then((r) => r.text()))).toBe(
    'FILE:Презентация: неделя 1.pdf'
  );
  await expect(page.locator('.file--missing', { hasText: 'Огромный архив.zip' })).toBeVisible();
  await expect(page.locator('.file--missing', { hasText: 'Видео о курсе' })).toBeVisible();

  await page.goto(`chrome-extension://${extensionId}/offline/offline.html#/longread/16899`);
  await expect(page.locator('.exercise h3')).toHaveText('ДЗ 6');
  await expect(page.locator('.exercise')).toContainText('Напиши мини-эссе.');
  await expect(page.locator('.solution')).toContainText('Оценка: 9');
  await expect(page.locator('.solution a.file__name')).toHaveText('Моё эссе.pdf');
  await page.screenshot({ path: 'test-results/offline-cache/longread.png', fullPage: true });

  await page.getByRole('link', { name: 'Мои задания' }).click();
  await expect(page.locator('.table tbody tr')).toHaveCount(1);
  await expect(page.locator('.table')).toContainText('ДЗ 7');
  await page.getByRole('link', { name: 'Проверенные' }).click();
  await expect(page.locator('.table')).toContainText('9/10');
  // Задание старше месяца в копию не попало.
  await page.getByRole('link', { name: 'Все', exact: true }).click();
  await expect(page.locator('.table tbody tr')).toHaveCount(2);
  await expect(page.locator('.table')).not.toContainText('ДЗ 1');
  await page.screenshot({ path: 'test-results/offline-cache/tasks.png' });

  await page.getByRole('link', { name: 'Мои пары' }).click();
  await expect(page.locator('.day h2')).toHaveText('Вторник');
  await expect(page.locator('.lesson')).toContainText('10:00–11:20');
  await expect(page.locator('.lesson')).toContainText('F201 · ЦТ · Михайлов Игорь');
  await expect(page.locator('.lesson')).not.toContainText('[object Object]');
  // Трансляция — комната Толка по id серии, как в плагине «Мои пары».
  await expect(page.locator('.lesson__join')).toHaveAttribute(
    'href',
    'https://centraluniversity.ktalk.ru/08de5c5217246d6b7db3f7000107e781'
  );
  await page.screenshot({ path: 'test-results/offline-cache/timetable.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'test-results/offline-cache/timetable-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' });

  // Ведомостей, посещаемости и профиля в копии нет — ни вкладок, ни запросов.
  await expect(page.locator('.nav a')).toHaveText(['Курсы', 'Мои задания', 'Мои пары']);
  await expect(page.getByRole('link', { name: 'Профиль' })).toHaveCount(0);
  await page.close();
});

test('без меню: адрес /offline открывает офлайн-копию, остальное LMS не трогается', async () => {
  const page = await context.newPage();
  const offlinePage = new RegExp(`^chrome-extension://${extensionId}/offline/offline\.html`);

  // Адрес, который легко запомнить, — офлайн-копия без плашки.
  await page.goto(`${LMS_URL}/offline`).catch(() => {});
  await expect(page).toHaveURL(offlinePage);
  await expect(page.locator('.card')).toContainText(COURSE.name);

  // Зеркало LMS — тот же адрес. И со слешем на конце.
  for (const url of ['https://my.cu.ru/offline', 'https://my.cu.ru/offline/']) {
    await page.goto('about:blank');
    await page.goto(url).catch(() => {});
    await expect(page).toHaveURL(offlinePage);
  }

  // Обычная страница LMS никуда не перекидывает.
  await page.goto(`${LMS_URL}/learn/courses/view/actual`);
  await expect(page).toHaveURL(`${LMS_URL}/learn/courses/view/actual`);
  await page.close();
});

test('«Сохранить копию на диск»: zip открывается с диска без расширения', async () => {
  const page = await extensionPage('offline/offline.html');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Сохранить копию на диск' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^LMS офлайн \d{4}-\d\d-\d\d\.zip$/);
  const zipPath = await download.path();
  const entries = unzipSync(new Uint8Array(readFileSync(zipPath)));
  const names = Object.keys(entries);

  const lecture = 'Курсы/STEM_ Философия и наука/01. Неделя 1/01. Лекция 1';
  const homework = 'Курсы/STEM_ Философия и наука/01. Неделя 1/02. Домашнее задание';
  expect(names).toEqual(
    expect.arrayContaining([
      'Открыть LMS офлайн.html',
      'README.txt',
      '_offline/data.js',
      '_offline/offline_viewer.js',
      '_offline/offline.css',
      `${lecture}/Лекция 1.html`,
      `${lecture}/Презентация_ неделя 1.pdf`,
      `${homework}/Домашнее задание.html`,
      `${homework}/Условие ДЗ.pdf`,
      `${homework}/Моё решение/Моё эссе.pdf`,
    ])
  );
  expect(names.some((n) => n.includes('Огромный'))).toBe(false);
  expect(names).toEqual(
    expect.arrayContaining(['_offline/fonts/inter-cyrillic.woff2', '_offline/fonts/OFL.txt'])
  );
  // Невыбранного курса нет ни в папках, ни в данных страницы.
  expect(names.some((n) => n.includes(SKIPPED.name))).toBe(false);
  expect(strFromU8(entries['_offline/data.js']!)).not.toContain(SKIPPED.name);
  expect(strFromU8(entries[`${homework}/Моё решение/Моё эссе.pdf`]!)).toBe('FILE:Моё эссе.pdf');
  // Страница лонгрида ссылается на файлы рядом с собой.
  expect(strFromU8(entries[`${homework}/Домашнее задание.html`]!)).toContain(
    `href="${encodeURIComponent('Моё решение')}/${encodeURIComponent('Моё эссе.pdf')}"`
  );
  await page.close();

  // Распаковываем и открываем с диска — без расширения, как у друга.
  const dir = mkdtempSync(join(tmpdir(), 'culms-offline-'));
  try {
    for (const [name, bytes] of Object.entries(entries)) {
      const target = join(dir, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }
    const local = await context.newPage();
    await local.goto(pathToFileURL(join(dir, 'Открыть LMS офлайн.html')).href);
    await expect(local.locator('.card')).toContainText(COURSE.name);
    await local.goto(pathToFileURL(join(dir, 'Открыть LMS офлайн.html')).href + '#/longread/16899');
    const solution = local.locator('.solution a.file__name');
    await expect(solution).toHaveAttribute('href', new RegExp(encodeURIComponent('Моё решение')));
    await expect(local.locator('#export-zip')).toHaveCount(0);

    await local.goto(pathToFileURL(join(dir, lecture, 'Лекция 1.html')).href);
    await expect(local.locator('h1')).toHaveText('Лекция 1');
    await expect(local.locator('.longread h2')).toHaveText('Вводная лекция');
    await local.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
