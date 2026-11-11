/**
 * Бейджи баллов появляются вместе с карточками, а не после них — с настоящим
 * расширением (dist/chrome) и подставной LMS.
 *
 * Проверка: страница вставляет карточки с задержкой, как Angular после ответа
 * API, и в своём MutationObserver (он создан позже расширения, поэтому его
 * колбэк идёт следом, всё ещё до отрисовки кадра) смотрит, есть ли уже бейдж.
 * Если бейдж ставят таймером или после чтения хранилища — тут его ещё нет.
 *
 * Запуск:
 *   bun run build:chrome
 *   bunx playwright test tests/course-card-score-timing.test.ts
 */

import { test, expect, type BrowserContext } from '@playwright/test';
import { LMS_URL, launchExtensionContext, resolveExtensionId } from './helpers/extension.js';

test.describe.configure({ mode: 'serial', timeout: 60_000 });

const COURSE = { id: 7, name: 'Основы маркетинга' };

const html = `<!doctype html><html><head><title>LMS</title></head><body><main></main>
<script>
  window.__atInsert = null;
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1 && node.querySelector?.('cu-course-card') && window.__atInsert === null) {
          // Бейдж уже на месте в тот же момент, когда карточка попала в DOM?
          window.__atInsert = document.querySelector('.culms-card-score')?.textContent ?? '';
        }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  // Карточки приходят позже, чем стартует расширение: как после ответа API.
  setTimeout(() => {
    document.querySelector('main').innerHTML =
      '<ul class="course-list"><li><cu-course-card><span class="course-name">${COURSE.name}</span></cu-course-card></li></ul>';
  }, 600);
</script></body></html>`;

let context: BrowserContext;
let cleanup: () => Promise<void>;
let extensionId: string;

test.beforeAll(async () => {
  ({ context, cleanup } = await launchExtensionContext({ headless: true }));
  extensionId = await resolveExtensionId(context);

  // Расширению нужны включённый тумблер и запомненные данные: как на втором заходе.
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await page.evaluate(async (course) => {
    await chrome.storage.sync.set({ courseCardScoreToggle: true });
    await chrome.storage.local.set({
      courseCardScoreCache: { [course.id]: { earned: 1.5, left: 8, at: Date.now() - 10 * 60 * 1000 } },
      courseMetaCache: [{ id: course.id, name: course.name }],
    });
  }, COURSE);
  await page.close();

  await context.route(`${LMS_URL}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    }
    // Сеть отвечает медленно: к моменту ответа бейдж уже должен стоять из запомненного.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    if (url.pathname === '/api/micro-lms/courses/student') {
      return route.fulfill({ json: { items: [COURSE] } });
    }
    if (url.pathname === `/api/micro-lms/courses/${COURSE.id}/student/progress`) {
      return route.fulfill({ json: { earnedScore: 2.4, leftToEarnScore: 7.5, maxScore: 10 } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
});

test.afterAll(async () => {
  await cleanup?.();
});

test('бейдж стоит уже в тот момент, когда карточка попадает в DOM', async () => {
  const page = await context.newPage();
  await page.goto(`${LMS_URL}/learn/courses/view/actual/all`);
  await expect(page.locator('cu-course-card')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__atInsert)).toBe('1.5(8)');
  // Свежие числа из сети заменяют показанные.
  await expect(page.locator('.culms-card-score')).toHaveText('2.4(7.5)', { timeout: 8000 });
  await page.close();
});
