/**
 * Свой фон на разных страницах и редактор фона — на поддельной странице LMS.
 *
 * Логин и расширение не нужны: скрипты берут всё из DOM, адреса и
 * `browser.storage`. Хранилище подменяется заглушкой, а сами
 * `background_scopes.js`, `custom_background.js` и `background_editor.js` —
 * настоящие. Переходы внутри SPA имитируем `history.pushState` и перерисовкой
 * полотна, как это делает Angular.
 *
 * Запуск:
 *   bunx playwright test tests/custom-background-editor.test.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const shared = (name: string) =>
  readFileSync(resolve(__dirname, '..', 'src', 'plugins', '_shared', name), 'utf8');
const SCRIPTS = [
  shared('background_scopes.js'),
  shared('custom_background.js'),
  shared('background_editor.js'),
];

/** Svg-квадрат своего цвета: по нему видно, какая картинка на фоне. */
const svg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="${color}"/></svg>`;
const dataUrl = (color: string) =>
  'data:image/svg+xml;base64,' + Buffer.from(svg(color)).toString('base64');

const IMAGES = {
  common: dataUrl('#c44569'),
  section: dataUrl('#2e86de'),
  course: dataUrl('#10ac84'),
  page: dataUrl('#f7b731'),
};

const COURSE = '/learn/courses/view/actual/1234';
const OTHER_COURSE = '/learn/courses/view/actual/777';
const LONGREAD = '/learn/courses/view/actual/1234/55/longreads/66';

// Полотно — непрозрачный слой во всю ширину окна, как у LMS.
const PAGE_HTML = `<!doctype html><html lang="ru"><body style="margin:0">
  <main id="canvas" style="width:100vw;height:100vh;background:#f4f4f5"></main>
</body></html>`;

async function openLms(
  page: Page,
  path: string,
  options: { local?: Record<string, unknown>; sync?: Record<string, unknown> } = {}
) {
  await page.route('https://my.cu.test/**', (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE_HTML })
  );
  await page.goto(`https://my.cu.test${path}`);

  await page.evaluate(
    ({ local, sync }) => {
      const listeners: Array<(changes: Record<string, unknown>, area: string) => void> = [];
      const stores: Record<string, Record<string, unknown>> = { local, sync };
      // Сколько раз и какие ключи читали: фон должен читать только свою страницу.
      (window as any).__reads = [];

      const area = (name: string) => ({
        get: (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          if (name === 'local') (window as any).__reads.push(...list);
          const out: Record<string, unknown> = {};
          list.forEach((key) => {
            if (key in stores[name]) out[key] = stores[name][key];
          });
          return Promise.resolve(out);
        },
        set: (values: Record<string, unknown>) => {
          const changes: Record<string, unknown> = {};
          Object.entries(values).forEach(([key, value]) => {
            changes[key] = { oldValue: stores[name][key], newValue: value };
            stores[name][key] = value;
          });
          listeners.forEach((fn) => fn(changes, name));
          return Promise.resolve();
        },
        remove: (key: string) => {
          const changes = { [key]: { oldValue: stores[name][key] } };
          delete stores[name][key];
          listeners.forEach((fn) => fn(changes, name));
          return Promise.resolve();
        },
      });

      (window as any).__stores = stores;
      (window as any).browser = {
        runtime: { id: 'test' },
        storage: {
          local: area('local'),
          sync: area('sync'),
          onChanged: { addListener: (fn: any) => listeners.push(fn) },
        },
      };
    },
    {
      local: options.local || {},
      sync: { customBackgroundToggle: true, backgroundVeil: 0, ...(options.sync || {}) },
    }
  );

  for (const script of SCRIPTS) await page.evaluate(script);
}

/** Переход внутри SPA: адрес меняется, раздел перерисовывается. */
async function navigate(page: Page, path: string) {
  await page.evaluate((next) => {
    history.pushState({}, '', next);
    const canvas = document.getElementById('canvas')!;
    canvas.replaceWith(canvas.cloneNode(true));
  }, path);
}

/** Какая из картинок сейчас на фоне страницы. */
async function shown(page: Page): Promise<string> {
  return page.evaluate((images) => {
    const value = getComputedStyle(document.documentElement).backgroundImage;
    const found = Object.entries(images).find(([, url]) => value.includes(url));
    if (found) return found[0];
    return value === 'none' ? 'none' : 'other';
  }, IMAGES);
}

const stored = (page: Page, key: string) =>
  page.evaluate((k) => (window as any).__stores.local[k] ?? null, key);

// --- выбор картинки ---

test('побеждает самая узкая область: страница → курс → раздел → все', async ({ page }) => {
  await openLms(page, LONGREAD, {
    local: {
      customBackground: IMAGES.common,
      'customBackground.section:longreads': IMAGES.section,
      'customBackground.course:1234': IMAGES.course,
      ['customBackground.page:' + LONGREAD]: IMAGES.page,
    },
  });
  await expect.poll(() => shown(page)).toBe('page');

  // Другая страница того же курса — картинка курса.
  await navigate(page, COURSE);
  await expect.poll(() => shown(page)).toBe('course');

  // Другой курс: своей картинки нет ни у страницы, ни у курса, а раздел
  // «Страницы курсов» пустой — остаётся общая.
  await navigate(page, OTHER_COURSE);
  await expect.poll(() => shown(page)).toBe('common');

  // Лонгрид другого курса — картинка раздела «Материалы курсов».
  await navigate(page, OTHER_COURSE + '/1/longreads/2');
  await expect.poll(() => shown(page)).toBe('section');

  await navigate(page, LONGREAD + '/');
  await expect.poll(() => shown(page)).toBe('page');
});

test('страница читает из хранилища только свои области', async ({ page }) => {
  await openLms(page, '/learn/tasks', { local: { customBackground: IMAGES.common } });
  await expect.poll(() => shown(page)).toBe('common');

  const reads: string[] = await page.evaluate(() => (window as any).__reads);
  expect(reads.filter((key) => key.startsWith('customBackground')).sort()).toEqual(
    [
      'customBackground',
      'customBackground.page:/learn/tasks',
      'customBackground.section:tasks',
    ].sort()
  );
});

test('без картинок фона нет, но переходы отслеживаются', async ({ page }) => {
  await openLms(page, '/learn/timetable', {
    local: { ['customBackground.page:/learn/tasks']: IMAGES.page },
  });
  await page.waitForTimeout(200);
  expect(await shown(page)).toBe('none');

  await navigate(page, '/learn/tasks');
  await expect.poll(() => shown(page)).toBe('page');
});

// --- редактор ---

const panel = (page: Page) => page.locator('#culms-background-editor .panel');

test('редактор открывается флагом и закрывается кнопкой «Готово»', async ({ page }) => {
  await openLms(page, COURSE, { local: { backgroundEditorActive: true } });
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toContainText(COURSE);
  await expect(panel(page)).toContainText('обычная заливка');

  // Для курса есть все четыре области.
  await expect(panel(page).locator('.scope')).toHaveText([
    /Эта страница/,
    /Весь этот курс/,
    /Раздел «Страницы курсов»/,
    /Все страницы/,
  ]);

  await panel(page)
    .getByRole('button', { name: /Готово/ })
    .click();
  await expect(page.locator('#culms-background-editor')).toHaveCount(0);
  expect(await stored(page, 'backgroundEditorActive')).toBe(false);
});

test('картинка из редактора ложится на эту страницу и только на неё', async ({ page }) => {
  await openLms(page, COURSE, {
    local: { backgroundEditorActive: true },
    sync: { customBackgroundToggle: false },
  });
  await expect(panel(page)).toBeVisible();

  await panel(page)
    .locator('input[type="file"]')
    .setInputFiles({
      name: 'bg.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(svg('#f7b731')),
    });

  await expect.poll(() => stored(page, 'customBackground.page:' + COURSE)).toBe(IMAGES.page);
  // Тумблер был выключен — редактор включает его сам, иначе картинки не видно.
  expect(await page.evaluate(() => (window as any).__stores.sync.customBackgroundToggle)).toBe(
    true
  );
  await expect.poll(() => shown(page)).toBe('page');
  await expect(panel(page).locator('.scope[data-kind="page"]')).toContainText('на экране');

  // Другой курс этой картинки не получает.
  await navigate(page, OTHER_COURSE);
  await expect.poll(() => shown(page)).toBe('none');
  await expect(panel(page)).toContainText(OTHER_COURSE);
});

test('в редакторе можно выбрать курс целиком и убрать картинку', async ({ page }) => {
  await openLms(page, COURSE, {
    local: { backgroundEditorActive: true, customBackground: IMAGES.common },
  });
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toContainText('Сейчас на фоне: все страницы');

  await panel(page).locator('.scope[data-kind="course"]').click();
  await panel(page)
    .locator('input[type="file"]')
    .setInputFiles({
      name: 'bg.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(svg('#10ac84')),
    });
  await expect.poll(() => stored(page, 'customBackground.course:1234')).toBe(IMAGES.course);
  await expect.poll(() => shown(page)).toBe('course');

  // Лонгрид этого курса тоже получает картинку курса.
  await navigate(page, LONGREAD);
  await expect.poll(() => shown(page)).toBe('course');

  // Выбор области сохраняется при переходе — убираем картинку курса.
  await expect(panel(page).locator('.scope.selected')).toHaveAttribute('data-kind', 'course');
  await panel(page).getByRole('button', { name: 'Убрать' }).click();
  await expect.poll(() => stored(page, 'customBackground.course:1234')).toBeNull();
  await expect.poll(() => shown(page)).toBe('common');
});
