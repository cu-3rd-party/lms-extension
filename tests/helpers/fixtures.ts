import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIES_FILES = [
  resolve(__dirname, '../.cookies.json'),
  resolve(__dirname, './.cookies.json'),
];
const EXTENSION_PATH = resolve(__dirname, '../../dist/chrome');
export const LMS_URL = 'https://my.centraluniversity.ru';

type WorkerFixtures = { workerContext: BrowserContext; extensionId: string };

function getCookiesFile(): string | null {
  return COOKIES_FILES.find((file) => existsSync(file)) ?? null;
}

export const test = base.extend<{ context: BrowserContext }, WorkerFixtures>({
  workerContext: [
    async ({}, use) => {
      const cookiesFile = getCookiesFile();
      if (cookiesFile) {
        const profileDir = mkdtempSync(join(tmpdir(), 'culms-playwright-'));
        // Чистый профиль + инжектируем куки из файла
        const ctx = await chromium.launchPersistentContext(profileDir, {
          headless: false,
          args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
          ],
        });
        const cookies = JSON.parse(readFileSync(cookiesFile, 'utf-8'));
        await ctx.addCookies(cookies);
        await use(ctx);
        await ctx.close();
        rmSync(profileDir, { recursive: true, force: true });
      } else {
        throw new Error(
          `Куки не найдены. Ожидался один из файлов: ${COOKIES_FILES.join(', ')}. Сохрани сессию: bun run test:login`
        );
      }
    },
    { scope: 'worker', timeout: 60_000 },
  ],

  extensionId: [
    async ({ workerContext }, use) => {
      let sw = workerContext.serviceWorkers()[0];
      if (!sw) {
        sw = await workerContext
          .waitForEvent('serviceworker', { timeout: 20_000 })
          .catch(() => null);
      }
      await use(sw ? new URL(sw.url()).hostname : '');
    },
    { scope: 'worker', timeout: 30_000 },
  ],

  context: async ({ workerContext }, use) => {
    await use(workerContext);
  },

  page: async ({ context, extensionId }, use) => {
    await clearAllExtensionStorage(context, extensionId);
    const page = await context.newPage();
    await use(page);
    await page.close();
    await clearAllExtensionStorage(context, extensionId);
  },
});


export { expect } from '@playwright/test';

async function openExtensionPage(context: BrowserContext, extensionId: string) {
  const extensionUrl = `chrome-extension://${extensionId}/popup/popup.html`;
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    const page = await context.newPage();

    try {
      await page.goto(extensionUrl, { waitUntil: 'domcontentloaded' });
      return page;
    } catch (error) {
      lastError = error;
      await page.close();
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw lastError;
}

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
  const page = await openExtensionPage(context, extensionId);
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
  const page = await openExtensionPage(context, extensionId);
  await page.evaluate(
    ({ area, key }) =>
      area === 'local' ? chrome.storage.local.remove(key) : chrome.storage.sync.remove(key),
    { area, key }
  );
  await page.close();
}

async function clearAllExtensionStorage(
  context: BrowserContext,
  extensionId: string
): Promise<void> {
  if (!extensionId) return;
  const page = await openExtensionPage(context, extensionId);
  await page.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
  });
  await page.close();
}
