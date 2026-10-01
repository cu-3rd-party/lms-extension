/**
 * Меню плагина: вкладки слева, настройки справа.
 *
 * Логин не нужен: попап открывается как страница расширения, а панель на
 * странице — на подставной LMS (`context.route`). Проверяется раскладка, а не
 * сами настройки: что каждая вкладка на месте, переключается мышью и
 * стрелками, запоминается, что ни один тумблер не потерялся при переносе
 * по вкладкам и что меню помещается в окно попапа и в панель на странице.
 *
 * Запуск:
 *   bun run build:chrome
 *   bun run test popup-tabs
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { LMS_URL, launchExtensionContext, resolveExtensionId } from './helpers/extension.js';

test.describe.configure({ mode: 'serial', timeout: 60_000 });

const TABS = ['Тема', 'Оформление', 'Курсы', 'Сроки', 'Задания', 'Оценки', 'Друзья', 'Настройки'];

// Все тумблеры меню — из объекта `toggles` в popup.js (два закомментированных
// в разметке не в счёт). Каждый обязан жить ровно в одной вкладке.
const TOGGLES: Record<string, string> = {
  'theme-toggle': 'Тема',
  'oled-toggle': 'Тема',
  'dark-pdf-toggle': 'Тема',
  'custom-theme-toggle': 'Тема',
  'custom-logo-toggle': 'Оформление',
  'custom-background-toggle': 'Оформление',
  'emoji-hearts-toggle': 'Оформление',
  'snow-toggle': 'Оформление',
  'old-courses-design-toggle': 'Курсы',
  'custom-course-names-toggle': 'Курсы',
  'course-overview-task-status-toggle': 'Курсы',
  'course-overview-autoscroll-toggle': 'Курсы',
  'future-exams-view-toggle': 'Сроки',
  'future-exams-dashboard-toggle': 'Сроки',
  'future-exams-dashboard-deadlines-toggle': 'Сроки',
  'auto-rename-toggle': 'Задания',
  'akh-integration-toggle': 'Задания',
  'contest-integration-toggle': 'Задания',
  'friends-toggle': 'Друзья',
  'hide-bonus-button-toggle': 'Друзья',
};

const PAGE_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head>
<body><header><ul class="user-actions"></ul></header><main></main></body></html>`;

let context: BrowserContext;
let cleanup: () => Promise<void>;
let extensionId: string;

test.beforeAll(async () => {
  ({ context, cleanup } = await launchExtensionContext({ headless: true }));
  extensionId = await resolveExtensionId(context);

  await context.route(`${LMS_URL}/**`, (route) => {
    const url = new URL(route.request().url());
    return url.pathname.startsWith('/api/')
      ? route.fulfill({ status: 404, json: {} })
      : route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE_HTML });
  });
});

test.afterAll(async () => {
  await cleanup?.();
});

async function openPopup(): Promise<Page> {
  const popup = await context.newPage();
  // Окно попапа браузер не делает больше 800×600.
  await popup.setViewportSize({ width: 800, height: 600 });
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await expect(popup.getByRole('tab')).toHaveCount(TABS.length);
  return popup;
}

test('вкладки по порядку, открыта первая и видна одна панель', async () => {
  const popup = await openPopup();
  await popup.evaluate(() => localStorage.removeItem('culms.popup.tab'));
  await popup.reload();

  await expect(popup.getByRole('tab')).toHaveText(TABS);
  await expect(popup.getByRole('tab', { name: 'Тема' })).toHaveAttribute('aria-selected', 'true');
  await expect(popup.locator('.tab-panel:visible')).toHaveCount(1);
  await expect(popup.locator('.tab-panel:visible .tab-title')).toHaveText('Тема');
  await expect(popup.locator('#menu-version')).toContainText('версия');

  await popup.screenshot({ path: 'test-results/popup-tabs/popup-theme.png' });
  await popup.close();
});

test('тёмная тема красит и список вкладок', async () => {
  const popup = await openPopup();
  await popup.evaluate(() => chrome.storage.sync.set({ themeEnabled: true }));
  await popup.reload();
  await expect(popup.locator('body.dark-theme')).toHaveCount(1);

  const colors = await popup.evaluate(() => ({
    nav: getComputedStyle(document.querySelector('.menu-nav')!).backgroundColor,
    selected: getComputedStyle(document.querySelector('.menu-tab[aria-selected="true"]')!)
      .backgroundColor,
  }));
  // Светлые #fff и #e3f0fd на тёмном фоне резали бы глаз.
  expect(colors.nav).toBe('rgb(40, 41, 44)');
  expect(colors.selected).toBe('rgb(43, 58, 77)');

  await popup.screenshot({ path: 'test-results/popup-tabs/popup-dark.png' });
  await popup.evaluate(() => chrome.storage.sync.remove('themeEnabled'));
  await popup.close();
});

test('каждый тумблер ровно в одной вкладке, и там, где его ждут', async () => {
  const popup = await openPopup();

  const placement = await popup.evaluate(() =>
    [...document.querySelectorAll('.tab-panel input[type="checkbox"][id]')].map((input) => ({
      id: input.id,
      tab: (input.closest('.tab-panel') as HTMLElement).dataset.title,
    }))
  );
  expect(Object.fromEntries(placement.map((p) => [p.id, p.tab]))).toEqual(TOGGLES);
  expect(placement).toHaveLength(Object.keys(TOGGLES).length);

  // Вне вкладок настроек не осталось: всё, что было в разделах, переехало.
  await expect(popup.locator('body > .section, .menu-content > .section')).toHaveCount(0);

  for (const [id, tab] of Object.entries(TOGGLES)) {
    await popup.getByRole('tab', { name: tab }).click();
    await expect(popup.locator(`label.switch:has(#${id})`)).toBeVisible();
  }
  await popup.close();
});

test('выбор вкладки мышью, стрелками и после переоткрытия', async () => {
  const popup = await openPopup();

  await popup.getByRole('tab', { name: 'Сроки' }).click();
  await expect(popup.locator('.tab-panel:visible .tab-title')).toHaveText('Сроки');
  await popup.screenshot({ path: 'test-results/popup-tabs/popup-deadlines.png' });

  await popup.keyboard.press('ArrowDown');
  await expect(popup.getByRole('tab', { name: 'Задания' })).toBeFocused();
  await expect(popup.locator('.tab-panel:visible .tab-title')).toHaveText('Задания');
  await popup.keyboard.press('End');
  await expect(popup.locator('.tab-panel:visible .tab-title')).toHaveText('Настройки');
  await popup.keyboard.press('ArrowDown');
  await expect(popup.locator('.tab-panel:visible .tab-title')).toHaveText('Тема');

  await popup.getByRole('tab', { name: 'Оценки' }).click();
  await popup.reload();
  await expect(popup.getByRole('tab', { name: 'Оценки' })).toHaveAttribute('aria-selected', 'true');
  await popup.close();
});

test('попап 800×600: листается только правая часть, вбок не едет', async () => {
  const popup = await openPopup();
  // Самая длинная вкладка — с раскрытыми настройками логотипа и фона.
  await popup.evaluate(() =>
    chrome.storage.sync.set({ customLogoToggle: true, customBackgroundToggle: true })
  );
  await popup.reload();
  await popup.getByRole('tab', { name: 'Оформление' }).click();
  await expect(popup.locator('#custom-background-container')).toBeVisible();

  const size = await popup.evaluate(() => {
    const content = document.querySelector('.menu-content') as HTMLElement;
    return {
      bodyWidth: document.body.offsetWidth,
      bodyHeight: document.body.offsetHeight,
      pageScrollWidth: document.documentElement.scrollWidth,
      contentScrolls: content.scrollHeight > content.clientHeight,
      navWidth: (document.querySelector('.menu-nav') as HTMLElement).offsetWidth,
      inFrame: document.documentElement.classList.contains('in-frame'),
    };
  });
  expect(size.inFrame).toBe(false);
  expect(size.bodyWidth).toBe(800);
  // Ровно в окно: меньше — под меню остаётся серая полоса.
  expect(size.bodyHeight).toBe(600);
  expect(size.pageScrollWidth).toBeLessThanOrEqual(800);
  expect(size.contentScrolls).toBe(true);
  expect(size.navWidth).toBeGreaterThan(150);

  await popup.screenshot({ path: 'test-results/popup-tabs/popup-look.png' });
  await popup.evaluate(() =>
    chrome.storage.sync.remove(['customLogoToggle', 'customBackgroundToggle'])
  );
  await popup.close();
});

async function openPageMenu(page: Page) {
  await page.goto(`${LMS_URL}/learn/courses/view/actual`);
  const pluginButton = page.locator('#cu-plugin-main-button');
  // Кнопку вставляет MutationObserver — дёргаем DOM, пока она не появится.
  await expect(async () => {
    await page.evaluate(() => document.querySelector('main')?.append(document.createElement('i')));
    await expect(pluginButton).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 30_000 });
  await pluginButton.click();
  const menu = page.frameLocator('#cu-plugin-overlay-container iframe');
  await expect(menu.getByRole('tab')).toHaveCount(TABS.length);
  return menu;
}

test('панель на странице: меню шире попапа и занимает весь iframe', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  const menu = await openPageMenu(page);

  const iframe = page.locator('#cu-plugin-overlay-container iframe');
  const frameBox = await iframe.boundingBox();
  expect(frameBox!.width).toBeGreaterThan(900);

  const inner = await menu.locator('body').evaluate((body) => ({
    inFrame: document.documentElement.classList.contains('in-frame'),
    width: body.offsetWidth,
    height: body.offsetHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }));
  expect(inner.inFrame).toBe(true);
  expect(inner.width).toBe(inner.viewportWidth);
  expect(inner.height).toBe(inner.viewportHeight);

  await menu.getByRole('tab', { name: 'Курсы' }).click();
  await expect(menu.locator('#open-card-editor-btn')).toBeVisible();
  await page.screenshot({ path: 'test-results/popup-tabs/page-menu.png' });
  await page.close();
});

test('узкое окно: вкладки полосой сверху', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 600, height: 800 });
  const menu = await openPageMenu(page);

  const tabs = menu.getByRole('tab');
  const first = await tabs.nth(0).boundingBox();
  const second = await tabs.nth(1).boundingBox();
  // В одну строку: вторая вкладка правее первой, а не под ней.
  expect(second!.x).toBeGreaterThan(first!.x);
  expect(Math.abs(second!.y - first!.y)).toBeLessThan(4);

  const overflow = await menu
    .locator('body')
    .evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Кнопка «Что нового» висит над меню, а не на полосе вкладок.
  const news = await page.locator('#cu-plugin-news-button').boundingBox();
  const frame = await page.locator('#cu-plugin-overlay-container iframe').boundingBox();
  expect(news!.y + news!.height).toBeLessThanOrEqual(frame!.y);

  await page.screenshot({ path: 'test-results/popup-tabs/page-menu-narrow.png' });
  await page.close();
});
