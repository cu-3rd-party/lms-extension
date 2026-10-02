/**
 * Анонимная статистика (src/metrics.ts) в собранном расширении: что уходит из
 * service worker в Яндекс Метрику и что выключатель в попапе её глушит.
 *
 * Логин не нужен: страницы LMS отдаёт `context.route`. В настоящий счётчик
 * ничего не уходит — хелпер запуска закрывает mc.yandex.ru, а здесь `fetch`
 * в service worker подменён и только записывает адреса.
 *
 * Запуск:
 *   bun run build:chrome
 *   bun run test metrics
 */

import { test, expect, type BrowserContext, type Worker } from '@playwright/test';
import { LMS_URL, launchExtensionContext, resolveExtensionId } from './helpers/extension.js';

test.describe.configure({ mode: 'serial', timeout: 60_000 });

let context: BrowserContext;
let cleanup: () => Promise<void>;
let extensionId: string;

async function worker(): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}

/** Подменяет fetch в service worker: адреса Метрики записываются, наружу не идут. */
async function recordHits(): Promise<void> {
  await (
    await worker()
  ).evaluate(() => {
    const scope = self as unknown as { __hits?: string[]; __realFetch?: typeof fetch };
    scope.__hits = [];
    scope.__realFetch ??= fetch;
    self.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('https://mc.yandex.ru/')) {
        scope.__hits!.push(url);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return scope.__realFetch!(input, init);
    }) as typeof fetch;
  });
}

async function hits(): Promise<URL[]> {
  const urls = await (
    await worker()
  ).evaluate(() => (self as unknown as { __hits?: string[] }).__hits ?? []);
  return urls.map((url) => new URL(url));
}

async function popupEval<T>(fn: () => Promise<T>): Promise<T> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  const result = await page.evaluate(fn);
  await page.close();
  return result;
}

async function openLms(): Promise<void> {
  const page = await context.newPage();
  await page.goto(`${LMS_URL}/learn/courses/view/actual/all`);
  // Снимок шлётся по webNavigation.onCompleted — после загрузки страницы.
  await page.waitForTimeout(1500);
  await page.close();
}

test.beforeAll(async () => {
  ({ context, cleanup } = await launchExtensionContext({ headless: true }));
  extensionId = await resolveExtensionId(context);

  await context.route(`${LMS_URL}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><body><cu-root></cu-root></body></html>',
    });
  });
});

test.afterAll(async () => {
  await cleanup?.();
});

test('выключенная статистика не шлёт ничего', async () => {
  await popupEval(async () => {
    await chrome.storage.sync.set({ metricsEnabled: false });
  });
  await recordHits();

  await openLms();
  await popupEval(async () => {
    await chrome.runtime.sendMessage({ action: 'METRICS_GOAL', goal: 'settings_import' });
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  expect(await hits()).toHaveLength(0);
  // День не «потрачен»: включат — снимок уйдёт на следующей странице.
  expect(
    await popupEval(
      async () => (await chrome.storage.local.get('metricsLastDaily')).metricsLastDaily
    )
  ).toBeUndefined();
});

test('раз в сутки уходит снимок: версия, сборка и тумблеры функций', async () => {
  await popupEval(async () => {
    await chrome.storage.sync.remove('metricsEnabled');
    await chrome.storage.sync.set({ themeEnabled: true });
  });
  await recordHits();

  await openLms();
  await openLms();

  const daily = (await hits()).filter((url) =>
    url.searchParams.get('page-url')?.endsWith('/daily')
  );
  expect(daily).toHaveLength(1);

  const [hit] = daily;
  expect(hit.pathname).toBe('/watch/113341269');
  const params = JSON.parse(hit.searchParams.get('site-info') ?? '{}');
  expect(params.build).toBe('chrome');
  expect(params.version).toMatch(/^\d+\.\d+/);
  expect(params.features.themeEnabled).toBe('on');
  expect(params.features.friendsEnabled).toBe('on');
  expect(params.features.oledEnabled).toBe('off');

  // Ничего из LMS: ни адресов страниц, ни данных пользователя.
  expect(hit.toString()).not.toContain('centraluniversity');

  // Id установки — один и тот же, в формате _ym_uid.
  const clientId = await popupEval(
    async () => (await chrome.storage.local.get('metricsClientId')).metricsClientId
  );
  expect(clientId).toMatch(/^\d{17,19}$/);
  expect(hit.searchParams.get('browser-info')).toContain(`:u:${clientId}:`);
});

test('цель из попапа доходит, незнакомая отбрасывается', async () => {
  await recordHits();
  await popupEval(async () => {
    await chrome.runtime.sendMessage({ action: 'METRICS_GOAL', goal: 'settings_export' });
    await chrome.runtime.sendMessage({ action: 'METRICS_GOAL', goal: 'evil_goal' });
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  const goals = (await hits()).map((url) => url.searchParams.get('page-url'));
  expect(goals).toEqual(['goal://ext.cu3rd.ru/settings_export']);
});

test('переключатель в попапе показывает и меняет metricsEnabled', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  const toggle = page.locator('#metrics-toggle');

  // Нет ключа — включено.
  await expect(toggle).toBeChecked();

  await toggle.evaluate((input: HTMLInputElement) => input.click());
  await expect
    .poll(() =>
      page.evaluate(async () => (await chrome.storage.sync.get('metricsEnabled')).metricsEnabled)
    )
    .toBe(false);
  await page.close();
});
