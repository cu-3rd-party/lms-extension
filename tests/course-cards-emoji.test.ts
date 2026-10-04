/**
 * Свои картинки курсов вместе с «сердечками» и своими названиями — на
 * подставной LMS.
 *
 * emoji-swap меняет 🔴 на ❤️ прямо в тексте страницы. Раньше после этого
 * course_names.js не узнавал свою подстановку и снимал метку с оригинальным
 * названием, а course_cards.js терял ключ картинки — обложка у курсов с
 * эмодзи пустела при первой же мутации DOM (например, открыли левую панель).
 *
 * Запуск:
 *   bun run build:chrome
 *   bun run test course-cards-emoji
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { LMS_URL, launchExtensionContext, resolveExtensionId } from './helpers/extension.js';

test.describe.configure({ mode: 'serial', timeout: 90_000 });

const LIST_URL = `${LMS_URL}/learn/courses/view/actual/all`;

const COURSES = [
  // Переименован с эмодзи в своём названии.
  { id: 1418, name: '🔴 Теория вероятностей. Основной уровень', category: 'mathematics' },
  // Не переименован, эмодзи из названия LMS.
  { id: 1500, name: '🔴 Язык программирования Python. Основной', category: 'development' },
  // Переименован, синий кружок.
  { id: 1600, name: '🔵 Линейная алгебра и геометрия', category: 'mathematics' },
  { id: 1245, name: 'Машинное обучение', category: 'development' },
].map((course) => ({ ...course, state: 'published' }));

const NAMES = { 1418: '🔴 Красная стата', 1600: '🔵 Линал' };

/** 1×1 PNG. */
const ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const LIST_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head>
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
let page: Page;

test.beforeAll(async () => {
  ({ context, cleanup } = await launchExtensionContext({ headless: true }));
  const extensionId = await resolveExtensionId(context);

  await context.route(`${LMS_URL}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/micro-lms/courses/student')) {
      return route.fulfill({ json: { items: COURSES, paging: { total: COURSES.length } } });
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: LIST_HTML });
  });

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.evaluate(
    async ({ names, icon }) => {
      await chrome.storage.sync.set({
        oldCoursesDesignToggle: true,
        customCourseNamesToggle: true,
        emojiHeartsEnabled: true,
      });
      await chrome.storage.local.set({
        courseNames: names,
        courseIcons: { 1418: icon, 1500: icon, 1600: icon, 1245: icon },
      });
    },
    { names: NAMES, icon: ICON }
  );
  await popup.close();

  page = await context.newPage();
  await page.goto(LIST_URL);
});

test.afterAll(async () => {
  await cleanup?.();
});

const cover = (id: number) => page.locator(`.culms-cover[data-culms-key="${id}"]`);

async function expectAllIcons() {
  for (const course of COURSES) {
    await expect(cover(course.id)).toHaveClass(/culms-cover--custom/);
    await expect(cover(course.id).locator('.culms-cover__img')).toHaveAttribute('src', ICON);
  }
}

test('картинки на месте и после сердечек, и после мутаций страницы', async () => {
  await expect(page.locator('.culms-cover')).toHaveCount(COURSES.length, { timeout: 30_000 });
  // Сердечки включаются не сразу (ждут tasks_fix.js до 2 с).
  await expect(page.locator('.course-name').first()).toHaveText('❤️ Красная стата', {
    timeout: 10_000,
  });
  await expect(page.locator('.course-name').nth(1)).toHaveText(
    '❤️ Язык программирования Python. Основной'
  );
  await expect(page.locator('.course-name').nth(2)).toHaveText('💙 Линал');
  await expectAllIcons();

  // Любая мутация DOM — как открытие левой панели.
  for (let round = 0; round < 3; round++) {
    await page.evaluate(() => {
      const node = document.createElement('div');
      node.className = 'sidebar-opened';
      document.body.appendChild(node);
    });
    await page.waitForTimeout(300);
    await expectAllIcons();
  }
  await expect(page.locator('.course-name').first()).toHaveText('❤️ Красная стата');
  await expect(page.locator('.course-name').nth(2)).toHaveText('💙 Линал');
});
