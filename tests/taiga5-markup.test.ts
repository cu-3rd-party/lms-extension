/**
 * Наши элементы в разметке Taiga 5 — на подставной LMS.
 *
 * После перехода LMS на Taiga 5 стили вешаются на `data-tui-version` и
 * `_ngcontent-*`, а собранные строкой элементы их не получали: «Друзья» в
 * шапке подчёркивались, на месте кнопки темы была пустая рамка, «Плагин» и «Оставить фидбек» в меню профиля стояли
 * без отступов и иконок. Ещё сменился признак раскрытой темы в обзоре курса
 * (`aria-expanded` уехал с `tui-expand` на кнопку аккордеона), и статусы
 * заданий перестали появляться. Иконка категории на `tui-icon` переехала из
 * `--t-icon` в `--t-icon-start` — на обложках старого дизайна карточек вместо
 * неё были белые квадраты.
 *
 * Логин не нужен: страницу и ответы API отдаёт `context.route`.
 *
 * Запуск:
 *   bun run build:chrome
 *   bun run test taiga5-markup
 */

import { test, expect, type BrowserContext } from '@playwright/test';
import { LMS_URL, launchExtensionContext, resolveExtensionId } from './helpers/extension.js';

test.describe.configure({ mode: 'serial', timeout: 60_000 });

const COURSE_ID = 776;
const LONGREAD_ID = 12284;
const TUI = 'data-tui-version="5.15.0"';

// Разметка снята с живой LMS (Taiga 5.15, 2026-09-29) и урезана до нужного.
const PAGE_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head><body>
<header>
  <tui-tabs-with-more class="header__tabs"><tui-tabs ${TUI} class="t-tabs" data-size="l">
    <a _ngcontent-ng-c1="" ${TUI} tuiicons="" type="button" tuitab="" class="header__tab-link header__tab-link_active _active" href="/learn/">Обучение</a>
  </tui-tabs></tui-tabs-with-more>
  <ul class="header__actions-list"><li><cu-user-profile-menu><span ${TUI} tuiavatar="">ФЖ</span></cu-user-profile-menu></li></ul>
  <ul _ngcontent-ng-c2="" class="user-actions"><li _ngcontent-ng-c2=""><button _ngcontent-ng-c2="" ${TUI} tuiappearance="" tuiicons="" tuibutton="" type="button" size="m" custatistevent="header.click" class="user-actions__action-button" style="transition: none; --t-icon-start: url(assets/cu/icons/cuIconUser01.svg);" data-appearance="tertiary" data-icon-start="cuIconUser01" data-size="m"><div _ngcontent-ng-c2="" class="user-actions__action-title">Профиль</div></button></li></ul>
</header>
<main>
  <cu-course-overview><tui-accordion ${TUI} class="cu-accordion">
    <button _ngcontent-ng-c3="" ${TUI} tuiaccordion="" tuibutton="" type="button" aria-expanded="false">Тема</button>
    <tui-expand _ngcontent-ng-c3=""><div class="t-wrapper"></div></tui-expand>
  </tui-accordion></cu-course-overview>
</main>
</body></html>`;

// Список курсов (Taiga 5.15, 2026-10-03): у `tui-icon` иконка в `--t-icon-start`,
// подписи категории в карточке больше нет.
const COURSES_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head><body><main>
<ul class="course-list">${[
  ['cuIconBrandDoc', 'Тестовый курс для плагина'],
  ['cuIconBrandMath', 'Теория вероятностей. Основной уровень'],
]
  .map(
    ([
      icon,
      name,
    ]) => `<li class="course-list__item"><cu-course-card class="course-list__card" tabindex="0">
  <div class="card-header"><div class="course-category"><tui-icon ${TUI} tuiicons="" class="category-icon" data-icon-start="${icon}" style="--t-icon-start: url(assets/cu/icons/${icon}.svg);"></tui-icon></div></div>
  <span cutext="s-bold" class="limited-lines-text course-name font-text-s-bold">${name}</span>
</cu-course-card></li>`
  )
  .join('')}</ul>
</main></body></html>`;
const COURSES = {
  items: [
    { id: 1, name: 'Тестовый курс для плагина', category: 'withoutCategory' },
    { id: 2, name: 'Теория вероятностей. Основной уровень', category: 'mathematics' },
  ],
};

const EXERCISES = {
  name: 'Тестовый курс для плагина',
  exercises: [{ id: 1, name: 'ДЗ 1', longread: { id: LONGREAD_ID } }],
};
const PERFORMANCE = { tasks: [{ id: 10, exerciseId: 1, state: 'review', score: 0 }] };

let context: BrowserContext;
let cleanup: () => Promise<void>;

test.beforeAll(async () => {
  ({ context, cleanup } = await launchExtensionContext({ headless: true }));
  const extensionId = await resolveExtensionId(context);

  const settings = await context.newPage();
  await settings.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await settings.evaluate(() =>
    chrome.storage.sync.set({ courseOverviewTaskStatusToggle: true, oldCoursesDesignToggle: true })
  );
  await settings.close();

  await context.route(`${LMS_URL}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/micro-lms/courses/student') {
      return route.fulfill({ json: COURSES });
    }
    if (pathname === '/learn/courses/view/actual/all') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: COURSES_HTML });
    }
    if (pathname === `/api/micro-lms/courses/${COURSE_ID}/exercises`) {
      return route.fulfill({ json: EXERCISES });
    }
    if (pathname === `/api/micro-lms/courses/${COURSE_ID}/student-performance`) {
      return route.fulfill({ json: PERFORMANCE });
    }
    return pathname.startsWith('/api/')
      ? route.fulfill({ status: 404, json: {} })
      : route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE_HTML });
  });
});

test.afterAll(async () => {
  await cleanup?.();
});

test('вкладка «Друзья», кнопка темы и пункты меню профиля получают атрибуты Taiga 5', async () => {
  const page = await context.newPage();
  await page.goto(`${LMS_URL}/learn/courses/view/actual/${COURSE_ID}`);

  const friends = page.locator('#custom-friends-link');
  // Стилей Taiga на подставной странице нет, поэтому проверяем сам атрибут:
  // на живой LMS именно он снимает подчёркивание.
  await expect(friends).toHaveAttribute('data-tui-version', '5.15.0', { timeout: 15_000 });

  for (const [id, title] of [
    ['cu-plugin-main-button', 'Плагин'],
    ['cu-plugin-feedback-button', 'Оставить фидбек'],
  ]) {
    const button = page.locator(`#${id}`);
    await expect(button).toHaveText(title, { timeout: 15_000 });
    await expect(button).toHaveAttribute('data-tui-version', '5.15.0');
    await expect(button).toHaveAttribute('_ngcontent-ng-c2', '');
    await expect(button).toHaveAttribute('data-icon-start', 'svg');
    await expect(button).not.toHaveAttribute('custatistevent');
    const icon = await button.evaluate((el) => el.style.getPropertyValue('--t-icon-start'));
    expect(icon).not.toContain('cuIconUser01');
  }
  // Кнопка темы в шапке: без `data-tui-version` Taiga 5 рисует пустую рамку.
  const themeButton = page.locator('.theme-toggle-container button');
  await expect(themeButton).toHaveAttribute('data-tui-version', '5.15.0', { timeout: 15_000 });
  await expect(themeButton).toHaveAttribute('data-icon-start', 'svg');
  await expect
    .poll(() => themeButton.evaluate((el) => el.style.getPropertyValue('--t-icon-start')))
    .toContain('icons/moon.svg');

  // Родной пункт клон не задел.
  await expect(page.locator('.user-actions__action-title').first()).toHaveText('Профиль');
  await page.close();
});

test('статус задания появляется, когда тема раскрыта', async () => {
  const page = await context.newPage();
  await page.goto(`${LMS_URL}/learn/courses/view/actual/${COURSE_ID}`);
  await page.waitForTimeout(1_500);

  // Так Taiga 5 раскрывает тему: ссылки рисуются внутрь `tui-expand`, а
  // `aria-expanded` меняется у кнопки, не у него.
  await page.evaluate((longreadId) => {
    document.querySelector('button[tuiaccordion]')!.setAttribute('aria-expanded', 'true');
    document.querySelector('tui-expand .t-wrapper')!.innerHTML =
      `<div class="longreads"><a class="longread" href="/learn/courses/view/actual/776/themes/1/longreads/${longreadId}"><h3>Урок 1</h3></a></div>`;
  }, LONGREAD_ID);

  const badge = page.locator('a.longread cu-task-state-badge');
  await expect(badge).toHaveText('На проверке', { timeout: 10_000 });
  await expect(badge).toHaveCount(1);
  await page.close();
});

test('обложка старого дизайна берёт иконку категории из --t-icon-start', async () => {
  const page = await context.newPage();
  await page.goto(`${LMS_URL}/learn/courses/view/actual/all`);

  const icons = page.locator('.culms-cover__cat-icon');
  await expect(icons).toHaveCount(2, { timeout: 15_000 });
  // Пустая переменная оставляет `mask-image: none` — и иконка рисуется
  // залитым квадратом цвета текста.
  await expect
    .poll(() => icons.evaluateAll((els) => els.map((el) => getComputedStyle(el).maskImage)))
    .toEqual([
      `url("${LMS_URL}/assets/cu/icons/cuIconBrandDoc.svg")`,
      `url("${LMS_URL}/assets/cu/icons/cuIconBrandMath.svg")`,
    ]);
  await expect(page.locator('.culms-cover__cat-name').nth(1)).toHaveText('Математика');
  await page.close();
});
