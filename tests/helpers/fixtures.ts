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
