/**
 * Файл сохраняет вкладка LMS (DOWNLOAD_IN_TAB) — путь для Safari, где нет API
 * загрузок, а blob из попапа не открывается (WebKitBlobResource, ошибка 1).
 *
 * Настоящее расширение (dist/chrome) и подставная LMS. Попап в Safari
 * недоступен, поэтому сообщение шлёт страница расширения — то же, что делает
 * попап в `downloadInLmsTab`.
 *
 * Запуск:
 *   bun run build:chrome
 *   bunx playwright test tests/save-in-page.test.ts
 */

import { test, expect, type BrowserContext } from '@playwright/test';
import { LMS_URL, launchExtensionContext, resolveExtensionId } from './helpers/extension.js';

test.describe.configure({ mode: 'serial', timeout: 60_000 });

let context: BrowserContext;
let cleanup: () => Promise<void>;
let extensionId: string;

test.beforeAll(async () => {
  ({ context, cleanup } = await launchExtensionContext({ headless: true }));
  extensionId = await resolveExtensionId(context);
  await context.route(`${LMS_URL}/**`, (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><body><main>LMS</main></body></html>',
    })
  );
});

test.afterAll(async () => {
  await cleanup?.();
});

test('вкладка LMS сохраняет файл под нужным именем и с нужным содержимым', async () => {
  const lms = await context.newPage();
  await lms.goto(`${LMS_URL}/learn/courses/view/actual`);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

  const bytes = [80, 75, 3, 4, 0, 255, 128, 1, 2, 3];
  const [download, response] = await Promise.all([
    lms.waitForEvent('download'),
    popup.evaluate(
      async ({ lmsUrl, bytes }) => {
        const [tab] = await chrome.tabs.query({ url: `${lmsUrl}/*` });
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return chrome.runtime.sendMessage({
          action: 'DOWNLOAD_IN_TAB',
          tabId: tab!.id,
          base64: btoa(binary),
          filename: 'grades.xlsx',
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
      },
      { lmsUrl: LMS_URL, bytes }
    ),
  ]);

  expect(response).toMatchObject({ success: true });
  expect(download.suggestedFilename()).toBe('grades.xlsx');
  const { readFileSync } = await import('fs');
  expect([...readFileSync((await download.path())!)]).toEqual(bytes);
  await popup.close();
  await lms.close();
});

test('не LMS-вкладка и неверный tabId — ошибка, а не молчание', async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  const response = await popup.evaluate(() =>
    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_IN_TAB',
      tabId: 999999,
      base64: '',
      filename: 'x.bin',
      mime: 'application/octet-stream',
    })
  );
  expect(response).toMatchObject({ success: false });
  await popup.close();
});
