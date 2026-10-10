/**
 * Установка и примерка сохраняют выбранную пользователем базовую тему,
 * даже если профиль автора задаёт другой themeEnabled. Настоящие workshop.js,
 * API-клиент и реестр; сервер и browser.storage подставные, поэтому логин
 * и расширение не нужны.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src/plugins');
const ORIGIN = 'https://ext.test';
const CSS = 'body { outline: 3px solid hotpink; }';

async function openWorkshop(page: Page, mode: boolean | null, profileMode: boolean | null = null) {
  const values: Record<string, unknown> = { customThemeToggle: true, customThemeCss: CSS };
  if (profileMode !== null) values.themeEnabled = profileMode;
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/')) {
      let json: unknown;
      if (path === '/api/v1/register') json = { id: 'student', nickname: 'Тестер' };
      else if (path === '/api/v1/rooms')
        json = [{ id: 'room', name: 'Общая', is_public: true, theme_count: 1 }];
      else if (path.endsWith('/payload'))
        json = {
          profile: { format: 'cu-lms-extension/profile', version: 1, kind: 'workshop', values },
          assets: {},
        };
      else if (path === '/api/v1/themes/theme')
        json = {
          id: 'theme',
          room_id: 'room',
          author: { nickname: 'Автор' },
          likes: 0,
          installs: 0,
          versions: [
            {
              id: 'version',
              number: 1,
              title: 'Розовая',
              status: 'approved',
              created_at: '2026-10-03T00:00:00Z',
              payload_bytes: 100,
              layers: profileMode === null ? ['theme'] : ['theme', 'appearance'],
              screenshot_urls: [],
            },
          ],
        };
      else if (path.endsWith('/install')) json = {};
      else throw new Error(`Unexpected API request: ${path}`);
      await route.fulfill({ json });
      return;
    }
    const type = path.endsWith('.js')
      ? 'text/javascript'
      : path.endsWith('.css')
        ? 'text/css'
        : 'text/html; charset=utf-8';
    await route.fulfill({
      contentType: type,
      body: readFileSync(resolve(SRC, path.replace(/^\/plugins\//, ''))),
    });
  });
  await page.addInitScript(
    ({ mode, origin }) => {
      const sync: Record<string, unknown> = { customThemeToggle: true };
      if (mode !== null) sync.themeEnabled = mode;
      const local: Record<string, unknown> = {
        workshopBackendUrl: origin,
        customThemeCss: 'body { outline: 1px solid gray; }',
        customBackground: 'old-background',
      };
      const listeners: ((changes: Record<string, unknown>, area: string) => void)[] = [];
      const modeChanges: unknown[] = [];
      (window as any).__storage = { sync, local, modeChanges };
      const area = (store: Record<string, unknown>, name: string) => {
        const notify = (changes: Record<string, any>) => {
          if ('themeEnabled' in changes) modeChanges.push(changes.themeEnabled);
          for (const listener of listeners) listener(changes, name);
        };
        return {
          get: async (keys: string | string[] | null) =>
            keys === null
              ? { ...store }
              : Object.fromEntries(
                  (Array.isArray(keys) ? keys : [keys])
                    .filter((key) => key in store)
                    .map((key) => [key, store[key]])
                ),
          set: async (values: Record<string, unknown>) => {
            const changes: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(values)) {
              if (JSON.stringify(store[key]) !== JSON.stringify(value))
                changes[key] = { oldValue: store[key], newValue: value };
              store[key] = structuredClone(value);
            }
            notify(changes);
          },
          remove: async (keys: string | string[]) => {
            const changes: Record<string, unknown> = {};
            for (const key of Array.isArray(keys) ? keys : [keys]) {
              if (key in store) changes[key] = { oldValue: store[key] };
              delete store[key];
            }
            notify(changes);
          },
        };
      };
      (window as any).browser = {
        storage: {
          sync: area(sync, 'sync'),
          local: area(local, 'local'),
          onChanged: {
            addListener: (listener: (typeof listeners)[number]) => listeners.push(listener),
          },
        },
        runtime: {
          getManifest: () => ({ version: '2.7.5' }),
          sendMessage: async () => ({ success: true, studentId: 'student' }),
        },
      };
    },
    { mode, origin: ORIGIN }
  );
  await page.goto(`${ORIGIN}/plugins/workshop/workshop.html#theme/theme`);
  await expect(page.locator('.panel h1')).toHaveText('Розовая');
}

const stored = (page: Page) => page.evaluate(() => (window as any).__storage);

for (const action of ['Установить', 'Примерить']) {
  for (const mode of [true, false, null]) {
    test(`${action}: палитра сохраняет themeEnabled=${mode}`, async ({ page }) => {
      await openWorkshop(page, mode);
      await page.getByRole('button', { name: action, exact: true }).click();
      await expect.poll(async () => (await stored(page)).local.customThemeCss).toBe(CSS);
      const storage = await stored(page);
      expect(storage.sync.themeEnabled).toBe(mode === null ? undefined : mode);
      expect(storage.modeChanges).toEqual([]);
      // Прежний фон по-прежнему снимается, а новая палитра включается.
      expect(storage.local.customBackground).toBeUndefined();
      expect(storage.sync.customThemeToggle).toBe(true);
      if (action === 'Примерить')
        expect(storage.local.workshopTryOn.backup.local.customThemeCss).toBe(
          'body { outline: 1px solid gray; }'
        );
      await expect(page.locator('body')).toHaveClass(mode === true ? /dark/ : /^(?!.*dark)/);
    });
  }
}

for (const action of ['Установить', 'Примерить']) {
  for (const mode of [true, false, null]) {
    test(`${action}: режим автора не заменяет themeEnabled=${mode}`, async ({ page }) => {
      await openWorkshop(page, mode, !mode);
      await page.getByRole('button', { name: action, exact: true }).click();
      await expect.poll(async () => (await stored(page)).local.customThemeCss).toBe(CSS);
      const storage = await stored(page);
      expect(storage.sync.themeEnabled).toBe(mode === null ? undefined : mode);
      expect(storage.modeChanges).toEqual([]);
      if (action === 'Примерить')
        expect(storage.local.workshopTryOn.backup.sync).not.toHaveProperty('themeEnabled');
      await expect(page.locator('body')).toHaveClass(mode === true ? /dark/ : /^(?!.*dark)/);
    });
  }
}

test('невыбранные переключатели не меняют базовую тему', async ({ page }) => {
  await openWorkshop(page, true, false);
  await page.getByLabel('Переключатели оформления').uncheck();
  await page.getByRole('button', { name: 'Установить', exact: true }).click();
  await expect.poll(async () => (await stored(page)).local.customThemeCss).toBe(CSS);
  const storage = await stored(page);
  expect(storage.sync.themeEnabled).toBe(true);
  expect(storage.modeChanges).toEqual([]);
});

test('явный возврат к теме по умолчанию по-прежнему сбрасывает тёмный режим', async ({ page }) => {
  await openWorkshop(page, true);
  await page.getByRole('button', { name: 'Поставить тему по умолчанию' }).click();
  await page.getByRole('button', { name: 'Поставить', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('Тема по умолчанию: сброшено');
  expect((await stored(page)).sync.themeEnabled).toBeUndefined();
  await expect(page.locator('body')).not.toHaveClass(/dark/);
});
