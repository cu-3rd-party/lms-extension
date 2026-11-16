/**
 * Выгрузка оценок из меню плагина на странице LMS — оно открывается iframe'ом
 * с popup.html (plugin_page_loader.js), а не окошком у иконки расширения.
 * Настоящее расширение (dist/chrome), подставная LMS, реальный сбор оценок и
 * Excel, а сохранение — страницей save_file.html (путь Safari, где нет downloads).
 *
 * Запуск:
 *   bun run build:chrome
 *   bunx playwright test tests/grades-export-iframe.test.ts
 */

import { test, expect, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'fs';
import { LMS_URL, launchExtensionContext, resolveExtensionId } from './helpers/extension.js';

test.describe.configure({ mode: 'serial', timeout: 90_000 });

let context: BrowserContext;
let cleanup: () => Promise<void>;
let extensionId: string;

const homework = { id: 10, name: 'Домашние задания', weight: 0.6, maxExercisesCount: 3 };

test.beforeAll(async () => {
  ({ context, cleanup } = await launchExtensionContext({ headless: true }));
  extensionId = await resolveExtensionId(context);

  await context.route(`${LMS_URL}/**`, (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) {
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><body><main>LMS</main></body></html>',
      });
    }
    if (url.pathname === '/api/micro-lms/performance/student') {
      return route.fulfill({
        json: { courses: [{ id: 1, name: 'Матанализ', courseStudentsStatus: 'required' }] },
      });
    }
    if (url.pathname === '/api/micro-lms/courses/1/student-performance') {
      return route.fulfill({
        json: {
          tasks: [
            {
              id: 100,
              exerciseId: 11,
              state: 'evaluated',
              score: 8,
              extraScore: 1,
              maxScore: 10,
              activity: homework,
            },
          ],
        },
      });
    }
    if (url.pathname === '/api/micro-lms/courses/1/exercises') {
      return route.fulfill({
        json: { exercises: [{ id: 11, name: 'ДЗ 1', maxScore: 10, activity: homework }] },
      });
    }
    if (url.pathname === '/api/micro-lms/courses/1/activities') {
      return route.fulfill({ json: [homework] });
    }
    return route.fulfill({ status: 404, json: {} });
  });
});

test.afterAll(async () => {
  await cleanup?.();
});

test('меню в iframe на странице LMS: выгрузка оценок доезжает до страницы сохранения', async () => {
  const lms = await context.newPage();
  await lms.goto(`${LMS_URL}/learn/courses/view/actual`);

  // Так меню открывает plugin_page_loader.js: iframe с popup.html поверх страницы.
  await lms.evaluate((id) => {
    const frame = document.createElement('iframe');
    frame.id = 'menu';
    frame.src = `chrome-extension://${id}/popup/popup.html`;
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0';
    document.body.append(frame);
  }, extensionId);
  const menu = lms.frameLocator('#menu');
  await expect(menu.locator('#grades-export-btn')).toBeAttached();
  // popup.js грузится после разметки: клик раньше него ничего не сделает.
  await menu.locator('body').evaluate(
    () =>
      new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (typeof (window as any).handleGradesExportClick === 'function') {
            clearInterval(timer);
            resolve();
          }
        }, 50);
      })
  );

  // Safari: API загрузок нет. В Chromium он есть — прячем его в iframe, чтобы пройти тот же путь.
  await menu.locator('body').evaluate(() => {
    const real = (window as any).browser;
    (window as any).browser = new Proxy(real, {
      get: (target, key) => (key === 'downloads' ? undefined : target[key]),
    });
  });

  const [saver] = await Promise.all([
    context.waitForEvent('page', { timeout: 30_000 }),
    menu.locator('#grades-export-btn').dispatchEvent('click'),
  ]);
  await saver.waitForLoadState();
  await expect(saver.locator('#title')).toHaveText('Файл готов', { timeout: 15_000 });
  await expect(saver.locator('#name')).toHaveText('grades.xlsx');

  const [download] = await Promise.all([
    saver.waitForEvent('download'),
    saver.getByRole('button', { name: 'Сохранить' }).click(),
  ]);
  const file = readFileSync((await download.path())!);
  // xlsx — это zip: начинается с «PK».
  expect(file.subarray(0, 2).toString()).toBe('PK');
  expect(file.length).toBeGreaterThan(1000);
  await expect(menu.locator('#grades-export-status')).toContainText('Готово');
  // Журнал выгрузки: по шагам, с путём сохранения, — его копируют из меню, когда что-то не так.
  const log = menu.locator('#grades-export-log');
  await expect(log).toContainText('iframe=true');
  await expect(log).toContainText('API загрузок нет, открываю страницу сохранения');
  await expect(log).toContainText('OPEN_SAVE_PAGE: {"success":true}');
  await expect(log).toContainText('готово');
  await saver.close();
  await lms.close();
});
