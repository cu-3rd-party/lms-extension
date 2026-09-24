/**
 * Экспорт оценок в Excel из меню плагина — на подставной LMS.
 *
 * Логин не нужен: страницу и ответы API отдаёт `context.route`, а расширение
 * настоящее, из dist/chrome. Тест проходит путь пользователя целиком: кнопка
 * «Плагин» в шапке → меню в iframe → кнопка экспорта → background → функция
 * сбора во вкладке LMS → книга Excel → скачанный файл. На этом пути экспорт и
 * ломался: функция сбора ссылалась на `lmsApi` из background и во вкладке
 * падала с «S is not defined».
 *
 * Запуск:
 *   bun run build:chrome
 *   bun run test grades-export
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import XLSX from 'xlsx-js-style';
import { LMS_URL, launchExtensionContext } from './helpers/extension.js';

// Одно меню на оба теста: второй жмёт соседнюю кнопку в том же попапе.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

const homework = { id: 1, name: 'Домашние задания', weight: 0.6, maxExercisesCount: 2 };
const exam = { id: 2, name: 'Экзамен', weight: 0.4, maxExercisesCount: 1 };

const ACTIVE = [
  { id: 101, name: '🔴 Теория вероятностей. Основной уровень', courseStudentsStatus: 'required' },
  { id: 102, name: 'Тестовый курс для плагина', courseStudentsStatus: 'listener' },
];

// Как в настоящем архиве: у курсов первого семестра статус listener, а длинные
// названия после обрезки до 31 символа (предел Excel) совпадают.
const ARCHIVED = [
  { id: 201, name: '🔴 Линейная алгебра и геометрия', courseStudentsStatus: 'listener' },
  {
    id: 202,
    name: 'Вступительный контест по математике. Вариант 1',
    courseStudentsStatus: 'listener',
  },
  {
    id: 203,
    name: 'Вступительный контест по математике. Вариант 2',
    courseStudentsStatus: 'listener',
  },
  { id: 204, name: 'STEM: Философия и наука', courseStudentsStatus: 'required' },
];

/** У каждого курса: оценённое «ДЗ 1», невыданное «ДЗ 2» и экзамен без заданий. */
function apiResponse(url: URL): unknown {
  if (url.pathname === '/api/micro-lms/performance/student') {
    return { courses: url.searchParams.get('isArchived') === 'true' ? ARCHIVED : ACTIVE };
  }

  const match = url.pathname.match(
    /^\/api\/micro-lms\/courses\/(\d+)\/(student-performance|exercises|activities)$/
  );
  if (!match) return undefined;

  const id = Number(match[1]);
  if (match[2] === 'student-performance') {
    return {
      tasks: [
        {
          id: id * 10,
          exerciseId: id * 10 + 1,
          state: 'evaluated',
          score: 8,
          extraScore: null,
          maxScore: 10,
          activity: homework,
        },
      ],
    };
  }
  if (match[2] === 'exercises') {
    return {
      exercises: [
        { id: id * 10 + 1, name: 'ДЗ 1', maxScore: 10, activity: homework },
        { id: id * 10 + 2, name: 'ДЗ 2', maxScore: 10, activity: homework },
      ],
    };
  }
  return [homework, exam];
}

const PAGE_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head>
<body><header><ul class="user-actions"></ul></header><main></main></body></html>`;

let context: BrowserContext;
let cleanup: () => Promise<void>;
let page: Page;
const apiRequests: string[] = [];

test.beforeAll(async () => {
  ({ context, cleanup } = await launchExtensionContext({ headless: true }));

  await context.route(`${LMS_URL}/**`, (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE_HTML });
    }

    apiRequests.push(url.pathname + url.search);
    const body = apiResponse(url);
    return body === undefined
      ? route.fulfill({ status: 404, json: {} })
      : route.fulfill({ json: body });
  });

  page = await context.newPage();
  await page.goto(`${LMS_URL}/learn/courses/view/actual`);

  // Кнопку «Плагин» вставляет MutationObserver, когда Angular дорисовывает
  // шапку. Страница у нас статичная — дёргаем DOM, пока кнопка не появится.
  const pluginButton = page.locator('#cu-plugin-main-button');
  await expect(async () => {
    await page.evaluate(() => document.querySelector('main')?.append(document.createElement('i')));
    await expect(pluginButton).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 30_000 });
  await pluginButton.click();

  // Разделы меню свёрнуты в аккордеон — раскрываем нужный, как пользователь.
  await menu().locator('h3', { hasText: 'Экспорт оценок' }).click();
  await expect(menu().locator('#grades-export-archived-btn')).toBeVisible();
});

test.afterAll(async () => {
  await cleanup?.();
});

function menu() {
  return page.frameLocator('#cu-plugin-overlay-container iframe');
}

/** Жмёт кнопку экспорта в меню и возвращает скачанную книгу. */
async function exportFrom(buttonId: string, fileName: string) {
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
  await menu().locator(buttonId).click();

  await expect(menu().locator('#grades-export-status')).toHaveText(`Готово: ${fileName} скачан.`, {
    timeout: 30_000,
  });
  await expect(menu().locator('#grades-export-btn')).toBeEnabled();
  await expect(menu().locator('#grades-export-archived-btn')).toBeEnabled();

  // Имя файла тут не проверить: Playwright сохраняет скачанное под GUID, а
  // `filename` из downloads.download Chrome применяет уже после. Сверяем, что
  // файл отдало расширение, и разбираем саму книгу.
  const download = await downloadPromise;
  expect(download.url()).toMatch(/^blob:chrome-extension:\/\//);
  const path = await download.path();
  // Формулы в книге без посчитанных значений — их считает Excel при открытии,
  // а SheetJS такие ячейки без sheetStubs пропускает.
  return XLSX.read(readFileSync(path), { cellFormula: true, sheetStubs: true });
}

test('текущие курсы выгружаются в grades.xlsx без слушательских', async () => {
  const workbook = await exportFrom('#grades-export-btn', 'grades.xlsx');

  expect(apiRequests).toContain('/api/micro-lms/performance/student?isArchived=false');
  expect(workbook.SheetNames).toEqual(['Сводка', 'Теория вероятностей. Основной у']);

  const summary = workbook.Sheets['Сводка']!;
  expect(summary['A2'].f).toBe(
    `HYPERLINK("#'Теория вероятностей. Основной у'!A1","🔴 Теория вероятностей. Основной уровень")`
  );
  expect(summary['B2'].f).toBe(`'Теория вероятностей. Основной у'!C1`);

  // Категории лежат по три строки: название с заданиями, баллы, пустая.
  const course = workbook.Sheets['Теория вероятностей. Основной у']!;
  expect(course['C1'].f).toBe('ROUND(SUM(D5,D8),2)');
  expect([course['A5'].v, course['F5'].v, course['G5'].v]).toEqual([
    'Домашние задания',
    'ДЗ 1',
    'ДЗ 2',
  ]);
  expect(course['F6'].v).toBe(8);
  expect([course['A8'].v, course['F8'].v]).toEqual(['Экзамен', 'Экзамен']);
});

test('архивные курсы — отдельной кнопкой в grades-archive.xlsx, первый семестр на месте', async () => {
  const workbook = await exportFrom('#grades-export-archived-btn', 'grades-archive.xlsx');

  expect(apiRequests).toContain('/api/micro-lms/performance/student?isArchived=true');
  expect(workbook.SheetNames).toEqual([
    'Сводка',
    'Линейная алгебра и геометрия',
    'Вступительный контест по матема',
    'Вступительный контест по мате 2',
    'STEM Философия и наука',
  ]);

  const summary = workbook.Sheets['Сводка']!;
  expect(summary['A5'].f).toBe(
    `HYPERLINK("#'STEM Философия и наука'!A1","STEM: Философия и наука")`
  );

  const course = workbook.Sheets['Вступительный контест по мате 2']!;
  expect([course['B2'].v, course['F5'].v, course['F6'].v]).toEqual([
    'Вступительный контест по математике. Вариант 2',
    'ДЗ 1',
    8,
  ]);
});
