/**
 * Страница сохранения файла (plugins/_shared/save_file.html) — путь для Safari,
 * где нет API загрузок, а blob из попапа не открывается (WebKitBlobResource,
 * ошибка 1), и во вкладке LMS запуск сохранения перезагружает страницу.
 *
 * Настоящее расширение (dist/chrome). Попап Safari недоступен, поэтому шаги
 * попапа (запись в storage.local и сообщение OPEN_SAVE_PAGE) делает страница
 * расширения — то же, что `downloadViaSavePage` в popup.js.
 *
 * Запуск:
 *   bun run build:chrome
 *   bunx playwright test tests/save-file-page.test.ts
 */

import { test, expect, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'fs';
import { launchExtensionContext, resolveExtensionId } from './helpers/extension.js';

test.describe.configure({ mode: 'serial', timeout: 60_000 });

let context: BrowserContext;
let cleanup: () => Promise<void>;
let extensionId: string;

test.beforeAll(async () => {
  ({ context, cleanup } = await launchExtensionContext({ headless: true }));
  extensionId = await resolveExtensionId(context);
});

test.afterAll(async () => {
  await cleanup?.();
});

const bytes = [80, 75, 3, 4, 0, 255, 128, 1, 2, 3];

test('попап кладёт файл в хранилище, background открывает страницу, кнопка сохраняет файл', async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

  const [saver] = await Promise.all([
    context.waitForEvent('page'),
    popup.evaluate(async (bytes) => {
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      await chrome.storage.local.set({
        'pendingSave:test-1': {
          base64: btoa(binary),
          filename: 'grades.xlsx',
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          at: Date.now(),
        },
      });
      return chrome.runtime.sendMessage({ action: 'OPEN_SAVE_PAGE', id: 'test-1' });
    }, bytes),
  ]);

  await saver.waitForLoadState();
  expect(saver.url()).toContain('plugins/_shared/save_file.html?id=test-1');
  await expect(saver.locator('#title')).toHaveText('Файл готов');
  await expect(saver.locator('#name')).toHaveText('grades.xlsx');

  // Сохранение — по клику, как у zip офлайн-копии; blob и ссылка — на странице расширения.
  const [download] = await Promise.all([
    saver.waitForEvent('download'),
    saver.getByRole('button', { name: 'Сохранить' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('grades.xlsx');
  expect([...readFileSync((await download.path())!)]).toEqual(bytes);

  // Запись из хранилища забрана и стёрта: файл там не лежит.
  const left = await popup.evaluate(() => chrome.storage.local.get('pendingSave:test-1'));
  expect(left).toEqual({});

  await saver.close();
  await popup.close();
});

test('повторное открытие и пустой адрес — понятное сообщение, а не белый экран', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/plugins/_shared/save_file.html?id=test-1`);
  await expect(page.locator('#title')).toHaveText('Не получилось сохранить');
  await expect(page.locator('#note')).toContainText('Файла уже нет');
  await page.goto(`chrome-extension://${extensionId}/plugins/_shared/save_file.html`);
  await expect(page.locator('#title')).toHaveText('Не получилось сохранить');
  await page.close();
});

test('OPEN_SAVE_PAGE с мусорным id отклоняется', async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  const response = await popup.evaluate(() =>
    chrome.runtime.sendMessage({ action: 'OPEN_SAVE_PAGE', id: '../x?y' })
  );
  expect(response).toMatchObject({ success: false });
  await popup.close();
});

test('downloadViaSavePage из popup.js: файл доезжает до страницы без искажений', async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  // Достаточно длинный файл, чтобы пройти несколько кусков base64-кодирования (0x8000).
  const big = Array.from({ length: 70_000 }, (_, i) => (i * 7) % 256);

  const [saver, opened] = await Promise.all([
    context.waitForEvent('page'),
    popup.evaluate(async (bytes) => {
      const data = new Uint8Array(bytes).buffer;
      // @ts-expect-error — функция из popup.js, обычный скрипт
      return downloadViaSavePage(data, 'big.bin', 'application/octet-stream');
    }, big),
  ]);
  expect(opened).toBe(true);
  await saver.waitForLoadState();
  const [download] = await Promise.all([
    saver.waitForEvent('download'),
    saver.getByRole('button', { name: 'Сохранить' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('big.bin');
  expect([...readFileSync((await download.path())!)]).toEqual(big);
  await saver.close();
  await popup.close();
});
