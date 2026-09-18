import { test as base, type BrowserContext } from '@playwright/test';

// Тесты импортируют всё из этого модуля (см. tests/README.md), поэтому
// пробрасываем наружу и `expect`, и хелперы из extension.ts.
export { expect } from '@playwright/test';
export {
  LMS_URL,
  ISSUE_185_ACTIVITY_URL,
  clearAllExtensionStorage,
  clearExtensionStorage,
  getExtensionStorage,
  getExtensionPopupUrl,
  resolveExtensionId,
  setExtensionStorage,
} from './extension.js';
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
