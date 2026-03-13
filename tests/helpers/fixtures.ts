import { test as base, type BrowserContext } from '@playwright/test';
import {
  LMS_URL,
  clearAllExtensionStorage,
  clearExtensionStorage,
  launchAuthenticatedExtensionContext,
  resolveExtensionId,
  setExtensionStorage,
} from './extension.js';

type WorkerFixtures = { workerContext: BrowserContext; extensionId: string };

export const test = base.extend<{ context: BrowserContext }, WorkerFixtures>({
  workerContext: [
    async ({}, use) => {
      const { context, cleanup } = await launchAuthenticatedExtensionContext();
      try {
        await use(context);
      } finally {
        await cleanup();
      }
    },
    { scope: 'worker', timeout: 60_000 },
  ],

  extensionId: [
    async ({ workerContext }, use) => {
      await use(await resolveExtensionId(workerContext));
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
