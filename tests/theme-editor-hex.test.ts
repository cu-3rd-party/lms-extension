/**
 * Ввод цвета в редакторе темы: hex, в том числе без решётки.
 *
 * Логин и расширение не нужны: `theme-editor.html` — обычная страница, ей
 * хватает заглушки `browser.storage`. Страницу и её скрипты отдаём с диска
 * через `page.route`, так что проверяется настоящий `theme_editor.js`.
 *
 * Запуск:
 *   bunx playwright test tests/theme-editor-hex.test.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '..', 'src', 'plugins');
const BASE = 'https://ext.test/plugins/theme-editor/theme-editor.html';

// Разбор элемента, как его присылает пипетка со страницы LMS.
const PICK = {
  selector: '.task-card',
  path: 'div.task-card',
  text: 'Карточка',
  matches: 1,
  colors: [{ prop: 'background-color', label: 'Фон', value: 'rgb(255, 255, 255)' }],
  tokens: [],
};

async function openEditor(page: Page) {
  await page.route('https://ext.test/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/plugins\//, '');
    const type = path.endsWith('.js')
      ? 'text/javascript'
      : path.endsWith('.css')
        ? 'text/css'
        : 'text/html; charset=utf-8';
    try {
      route.fulfill({ contentType: type, body: readFileSync(resolve(SRC, path)) });
    } catch {
      route.fulfill({ status: 404, body: '' });
    }
  });

  await page.addInitScript((pick) => {
    const local: Record<string, unknown> = { themePickResult: pick };
    const sync: Record<string, unknown> = { customThemeToggle: true };
    (window as any).__local = local;
    const area = (store: Record<string, unknown>) => ({
      get: (keys: string | string[]) => {
        const out: Record<string, unknown> = {};
        (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
          if (key in store) out[key] = store[key];
        });
        return Promise.resolve(out);
      },
      set: (values: Record<string, unknown>) => {
        Object.assign(store, JSON.parse(JSON.stringify(values)));
        return Promise.resolve();
      },
      remove: (key: string) => {
        delete store[key];
        return Promise.resolve();
      },
    });
    (window as any).browser = {
      storage: { local: area(local), sync: area(sync), onChanged: { addListener: () => {} } },
      runtime: { getURL: (path: string) => path },
    };
  }, PICK);

  await page.goto(BASE);
}

const storedVars = (page: Page) =>
  page.evaluate(() => (window as any).__local.customThemeVars || {});

test('палитра: hex без решётки принимается и сохраняется с ней', async ({ page }) => {
  await openEditor(page);
  const token = page.locator('.token').first();
  const name = await token.getAttribute('data-token');
  const field = token.locator('input[type="text"]');

  await field.fill('ff8800');
  await expect(field).not.toHaveClass(/invalid/);
  await expect(token.locator('input[type="color"]')).toHaveValue('#ff8800');
  await expect.poll(async () => (await storedVars(page))[name!]).toBe('#ff8800');

  await field.fill('#0af');
  await expect(token.locator('input[type="color"]')).toHaveValue('#00aaff');
  await expect.poll(async () => (await storedVars(page))[name!]).toBe('#0af');
});

test('палитра: не цвет подсвечивается и не сохраняется', async ({ page }) => {
  await openEditor(page);
  const token = page.locator('.token').first();
  const name = await token.getAttribute('data-token');
  const field = token.locator('input[type="text"]');

  await field.fill('ff88');
  // Четыре цифры — это hex с прозрачностью, он годится.
  await expect(field).not.toHaveClass(/invalid/);

  await field.fill('ff88z0');
  await expect(field).toHaveClass(/invalid/);
  await page.waitForTimeout(300);
  expect((await storedVars(page))[name!]).toBe('#ff88');
});

test('пипетка: цвет элемента можно ввести hex-ом', async ({ page }) => {
  await openEditor(page);
  await page.locator('button.tab[data-tab="element"]').click();

  const row = page.locator('.prop').filter({ hasText: 'Фон' });
  const field = row.locator('input.prop-input');
  await expect(field).toHaveValue('rgb(255, 255, 255)');

  await field.fill('1e1e2e');
  await field.press('Enter');

  await expect(field).toHaveValue('#1e1e2e');
  await expect(row.locator('input[type="color"]')).toHaveValue('#1e1e2e');
  await expect
    .poll(() => page.evaluate(() => (window as any).__local.customThemeCss || ''))
    .toContain('.task-card {\n  background-color: #1e1e2e !important;');
});
