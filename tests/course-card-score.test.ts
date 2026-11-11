/**
 * «Накоплено (ещё можно набрать)» на карточках «Мои курсы» — на поддельной
 * странице с заглушками списка курсов и `student/progress`.
 *
 * Запуск:
 *   bunx playwright test tests/course-card-score.test.ts
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Общая формула «можно было набрать» (манифест грузит её перед скриптом бейджа).
const SHARED = readFileSync(
  resolve(__dirname, '..', 'src', 'plugins', '_shared/possible_score.js'),
  'utf8'
);
const SCRIPT = readFileSync(
  resolve(__dirname, '..', 'src', 'plugins', 'course-view/course_card_score.js'),
  'utf8'
);

const courses = [
  { id: 1, name: '🔴 Основы маркетинга' },
  { id: 2, name: 'Продуктовый менеджмент' },
  { id: 3, name: 'Без данных' },
];
const progress: Record<number, unknown> = {
  1: { earnedScore: 0.5333, leftToEarnScore: 9.84, maxScore: 10 },
  2: { earnedScore: 2.4741666, leftToEarnScore: 6.641025, maxScore: 10 },
};

// emoji-swap уже заменил кружок на сердце — в API он остаётся кружком.
const html = `<!doctype html><html><body><ul>
  <li><cu-course-card><span class="course-name">❤️ Основы маркетинга</span></cu-course-card></li>
  <li><cu-course-card><span class="course-name">Продуктовый менеджмент</span></cu-course-card></li>
  <li><cu-course-card><span class="course-name">Без данных</span></cu-course-card></li>
  <li><cu-course-card><span class="course-name">Чужой курс</span></cu-course-card></li>
</ul></body></html>`;

async function open(page: import('@playwright/test').Page, path: string) {
  const requested: string[] = [];
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) requested.push(url.pathname);
    if (url.pathname === '/api/micro-lms/courses/student') {
      return route.fulfill({ json: { items: courses } });
    }
    const match = url.pathname.match(/^\/api\/micro-lms\/courses\/(\d+)\/student\/progress$/);
    if (match) {
      const body = progress[Number(match[1])];
      return body ? route.fulfill({ json: body }) : route.fulfill({ status: 500, body: 'x' });
    }
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
  });
  await page.goto(`https://lms.test${path}`);
  await page.addScriptTag({ content: SHARED });
  await page.addScriptTag({ content: SCRIPT });
  return requested;
}

test('на карточке: накоплено до сотых зелёным, остаток до десятых жёлтым', async ({ page }) => {
  await open(page, '/learn/courses/view/actual/all');
  const cards = page.locator('cu-course-card');
  await expect(cards.nth(0).locator('.culms-card-score')).toHaveText('0.53(9.8)');
  await expect(cards.nth(1).locator('.culms-card-score')).toHaveText('2.47(6.6)');
  await expect(cards.nth(0).locator('.culms-card-score__earned')).toHaveCSS(
    'color',
    'rgb(46, 164, 79)'
  );
  await expect(cards.nth(0).locator('.culms-card-score__left')).toHaveCSS(
    'color',
    'rgb(224, 161, 0)'
  );
  // Справа снизу, а не в потоке карточки.
  await expect(cards.nth(0).locator('.culms-card-score')).toHaveCSS('position', 'absolute');
  // Курс, у которого баллы не пришли, и курс не из списка — без бейджа, остальное работает.
  await expect(cards.nth(2).locator('.culms-card-score')).toHaveCount(0);
  await expect(cards.nth(3).locator('.culms-card-score')).toHaveCount(0);
});

test('на странице самого курса бейджей нет', async ({ page }) => {
  const requested = await open(page, '/learn/courses/view/actual/1');
  await page.waitForTimeout(400);
  await expect(page.locator('.culms-card-score')).toHaveCount(0);
  expect(requested.some((path) => path.includes('/student/progress'))).toBe(false);
});

test('баллы каждого курса запрашиваются один раз', async ({ page }) => {
  const requested = await open(page, '/learn/courses/view/actual');
  await expect(page.locator('.culms-card-score')).toHaveCount(2);
  // Перерисовка списка (смена вкладки-фильтра) запросов не добавляет.
  await page.evaluate(() => {
    const list = document.querySelector('ul')!;
    list.append(list.firstElementChild!.cloneNode(true));
  });
  await expect(page.locator('.culms-card-score')).toHaveCount(3);
  expect(
    requested.filter((path) => path === '/api/micro-lms/courses/1/student/progress')
  ).toHaveLength(1);
});

test('тёмная тема не перекрашивает числа', async ({ page }) => {
  await open(page, '/learn/courses/view/actual/all');
  // Правило тёмной темы (dark-theme.css): всё в карточке — светлым, с !important.
  await page.addStyleTag({ content: 'cu-course-card * { color: rgb(240, 240, 240) !important; }' });
  const badge = page.locator('cu-course-card').nth(0).locator('.culms-card-score');
  await expect(badge.locator('.culms-card-score__earned')).toHaveCSS('color', 'rgb(46, 164, 79)');
  await expect(badge.locator('.culms-card-score__left')).toHaveCSS('color', 'rgb(224, 161, 0)');
});

test('«старый дизайн» прячет родное содержимое карточки, но не бейдж', async ({ page }) => {
  await open(page, '/learn/courses/view/actual/all');
  await page.evaluate(() =>
    document.querySelector('ul')!.classList.add('course-list', 'culms-old-design')
  );
  await page.addStyleTag({
    content:
      'ul.course-list.culms-old-design cu-course-card > *:not(.culms-cover) { display: none !important; }',
  });
  // Бейдж подключается заново при следующей перерисовке; стиль уже в странице.
  await page.evaluate(() => document.querySelector('ul')!.append(document.createElement('li')));
  const badge = page.locator('cu-course-card').nth(0).locator('.culms-card-score');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.6)');
});

test('баллы рисуются сразу из запомненного, свежие приходят следом и запоминаются', async ({
  page,
}) => {
  const saved: unknown[] = [];
  await page.exposeFunction('__saveCache', (value: unknown) => saved.push(value));
  await page.addInitScript(() => {
    (window as any).chrome = {
      storage: {
        sync: { get: async () => ({ courseCardScoreToggle: true }) },
        onChanged: { addListener() {} },
        local: {
          get: async () => ({
            courseCardScoreCache: { 1: { earned: 1.5, left: 8, at: 0 } },
            courseMetaCache: [{ id: 1, name: '🔴 Основы маркетинга' }],
          }),
          set: async (value: unknown) => (window as any).__saveCache(value),
        },
      },
    };
  });
  // Сеть отвечает медленно: бейдж должен появиться не дожидаясь её.
  await page.route('**/api/micro-lms/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const url = new URL(route.request().url());
    if (url.pathname === '/api/micro-lms/courses/student') {
      return route.fulfill({ json: { items: courses } });
    }
    return route.fulfill({ json: progress[1] });
  });
  await page.route('https://lms.test/learn/**', (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: html })
  );
  await page.goto('https://lms.test/learn/courses/view/actual/all');
  await page.addScriptTag({ content: SHARED });
  await page.addScriptTag({ content: SCRIPT });

  const badge = page.locator('cu-course-card').nth(0).locator('.culms-card-score');
  await expect(badge).toHaveText('1.5(8)', { timeout: 1000 });
  await expect(badge).toHaveText('0.53(9.8)', { timeout: 5000 });
  await expect.poll(() => saved.length).toBeGreaterThan(0);
  expect(JSON.stringify(saved.at(-1))).toContain('"earned":0.5333');
});

// Формат «накоплено/можно было набрать»: активность «ДЗ» с весом 0.5 и плановыми 4 работами;
// проверены две (10/10 и 5/10), одна на проверке. Максимум к сегодняшнему дню — только за
// проверенные: 0.5 × (10 + 10) / 4 = 2.5.
const activity = { id: 1, name: 'ДЗ', weight: 0.5, maxExercisesCount: 4, bestScoresCount: 0 };
const performance = {
  tasks: [
    { id: 1, activity, score: 10, maxScore: 10 },
    { id: 2, activity, score: 5, maxScore: 10 },
    { id: 3, activity, score: null, maxScore: 10 },
  ],
};

async function openWithFormat(page: import('@playwright/test').Page, format: string) {
  await page.addInitScript((value) => {
    (window as any).chrome = {
      storage: {
        sync: { get: async () => ({ courseCardScoreToggle: true, courseCardScoreFormat: value }) },
        onChanged: { addListener() {} },
      },
    };
  }, format);
  const requested: string[] = [];
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) requested.push(url.pathname);
    if (url.pathname === '/api/micro-lms/courses/student') {
      return route.fulfill({ json: { items: courses } });
    }
    if (url.pathname === '/api/micro-lms/courses/1/student/progress') {
      return route.fulfill({ json: progress[1] });
    }
    if (url.pathname === '/api/micro-lms/courses/1/student-performance') {
      return route.fulfill({ json: performance });
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 500, body: 'x' });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
  });
  await page.goto('https://lms.test/learn/courses/view/actual/all');
  await page.addScriptTag({ content: SHARED });
  await page.addScriptTag({ content: SCRIPT });
  return requested;
}

test('формат «possible»: накоплено/можно было набрать к сегодняшнему дню', async ({ page }) => {
  await openWithFormat(page, 'possible');
  const badge = page.locator('cu-course-card').nth(0).locator('.culms-card-score');
  await expect(badge).toHaveText('0.53/2.5');
  await expect(badge.locator('.culms-card-score__possible')).toHaveCSS('color', 'rgb(244, 82, 30)');
  await expect(badge.locator('.culms-card-score__earned')).toHaveCSS('color', 'rgb(46, 164, 79)');
  // Курс, у которого нет весов или данные не пришли, — только накоплено, без «/».
  await expect(page.locator('cu-course-card').nth(1).locator('.culms-card-score')).toHaveCount(0);
});

test('формат «left» не просит student-performance', async ({ page }) => {
  const requested = await openWithFormat(page, 'left');
  await expect(page.locator('cu-course-card').nth(0).locator('.culms-card-score')).toHaveText(
    '0.53(9.8)'
  );
  expect(requested.some((path) => path.endsWith('/student-performance'))).toBe(false);
});
