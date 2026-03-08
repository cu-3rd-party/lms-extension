import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIES_FILE = resolve(__dirname, '../.cookies.json');
const PROFILE_DIR = resolve(__dirname, '../.chrome-profile');
const EXTENSION_PATH = resolve(__dirname, '../../dist/chrome');
export const LMS_URL = 'https://my.centraluniversity.ru';

type WorkerFixtures = { workerContext: BrowserContext; extensionId: string };

export const test = base.extend<{ context: BrowserContext }, WorkerFixtures>({
  workerContext: [
    async ({}, use) => {
      if (existsSync(COOKIES_FILE)) {
        // Чистый профиль + инжектируем куки из файла
        const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
          headless: false,
          args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
          ],
        });
        const cookies = JSON.parse(readFileSync(COOKIES_FILE, 'utf-8'));
        await ctx.addCookies(cookies);
        await use(ctx);
        await ctx.close();
      } else {
        throw new Error('Куки не найдены. Сохрани сессию: bun run test:login');
      }
    },
    { scope: 'worker' },
  ],

  extensionId: [
    async ({ workerContext }, use) => {
      let sw = workerContext.serviceWorkers()[0];
      if (!sw) {
        sw = await workerContext
          .waitForEvent('serviceworker', { timeout: 10_000 })
          .catch(() => null);
      }
      await use(sw ? new URL(sw.url()).hostname : '');
    },
    { scope: 'worker' },
  ],

  context: async ({ workerContext }, use) => {
    await use(workerContext);
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';

/**
 * Записывает значение в chrome.storage через popup-страницу расширения.
 */
export async function setExtensionStorage(
  context: BrowserContext,
  extensionId: string,
  area: 'local' | 'sync',
  key: string,
  value: unknown
): Promise<void> {
  if (!extensionId) return;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await page.evaluate(
    ({ area, key, value }) =>
      area === 'local'
        ? chrome.storage.local.set({ [key]: value })
        : chrome.storage.sync.set({ [key]: value }),
    { area, key, value }
  );
  await page.close();
}

/**
 * Очищает chrome.storage через popup-страницу расширения.
 * Надёжнее чем service worker — SW MV3 завершается Chrome в любой момент.
 */
export async function clearExtensionStorage(
  context: BrowserContext,
  extensionId: string,
  area: 'local' | 'sync',
  key: string
): Promise<void> {
  if (!extensionId) return;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await page.evaluate(
    ({ area, key }) =>
      area === 'local' ? chrome.storage.local.remove(key) : chrome.storage.sync.remove(key),
    { area, key }
  );
  await page.close();
}
