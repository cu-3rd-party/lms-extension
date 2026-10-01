/**
 * LMS без сертификатов Минцифры — на подставной LMS.
 *
 * Часть запросов LMS уходит на хосты Т-Банка с сертификатами Минцифры. Без
 * этого корня запросы падают на TLS; хуже всего с Thermostat — у LMS пустая
 * шапка и сломан сайдбар (см. src/plugins/_shared/README.md, раздел
 * `mincifry_fallback.js`). Ошибку сертификата тут изображает
 * `route.abort('failed')`: для страницы это тот же сетевой сбой.
 *
 * Страница сама шлёт запросы так же, как SDK LMS, уже после того, как
 * отработали контент-скрипты:
 *   - Thermostat — `fetch(new Request(...))`;
 *   - флаги видеоплеера — `fetch(url, { method, body })`;
 *   - Statist — XHR с одной функцией на onload/onerror/ontimeout.
 *
 * Запуск:
 *   bun run build:chrome
 *   bun run test mincifry-fallback
 */

import { test, expect, type BrowserContext } from '@playwright/test';
import { LMS_URL, launchExtensionContext, resolveExtensionId } from './helpers/extension.js';

test.describe.configure({ mode: 'serial', timeout: 60_000 });

const RESOLVE_URL = 'https://public-thermostat-provider.tbank.ru/api/v2/resolve';
const TOGGLES_URL = 'https://cfg.tbank.ru/api-gateway/v2/getToggles';
const EVENTS_URL = 'https://api-statist.tinkoff.ru/gateway/v1/events';

const REAL_RESOLVE = {
  version: 7,
  status: 'complete',
  lastUpdatedAt: '2026-09-30T00:00:00.000Z',
  resolvedAt: '2026-10-01T00:00:00.000Z',
  resolvedParameters: [{ context: { key: 'service-desk-enabled' }, status: 'ok', value: 'true' }],
  unknownParameters: [],
  disabledParameters: [],
};

// Тела без Content-Type: простые CORS-запросы, без preflight, который пришлось
// бы отдельно отвечать через route.
const PAGE = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><script>
  const settle = (p) => p.then(
    async (r) => ({ ok: true, status: r.status, body: await r.json() }),
    (e) => ({ ok: false, error: String(e) })
  );
  const statist = new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const done = (event) => resolve({ event: event.type, status: xhr.status });
    xhr.onload = done;
    xhr.onerror = done;
    xhr.ontimeout = done;
    xhr.open('POST', ${JSON.stringify(EVENTS_URL)}, true);
    xhr.send(JSON.stringify([{ eventParameters: { sequence: 1 } }]));
  });
  window.__results = Promise.all([
    settle(fetch(new Request(${JSON.stringify(RESOLVE_URL)}, {
      method: 'POST',
      body: JSON.stringify({ parameters: [{ key: 'service-desk-enabled', type: 'boolean' }] }),
    }))),
    settle(fetch(${JSON.stringify(TOGGLES_URL)}, {
      method: 'POST',
      body: JSON.stringify({ path: 'vpl/web/VPL_2125_timeline_thumbnails' }),
    })),
    statist,
  ]).then(([thermostat, toggles, statist]) => ({ thermostat, toggles, statist }));
</script></head><body><main class="main">LMS</main></body></html>`;

type Settled = { ok: boolean; status?: number; body?: unknown; error?: string };
type Results = {
  thermostat: Settled;
  toggles: Settled;
  statist: { event: string; status: number };
};

// Что отвечают хосты Т-Банка: упали по сети, работают или отдают 503.
let tbank: 'down' | 'up' | '5xx' = 'down';

let context: BrowserContext;
let cleanup: () => Promise<void>;
let extensionId: string;

async function setToggle(enabled: boolean) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.evaluate(
    (value) => chrome.storage.sync.set({ mincifryFallbackEnabled: value }),
    enabled
  );
  await popup.close();
}

async function openLms(): Promise<Results> {
  const page = await context.newPage();
  await page.goto(`${LMS_URL}/learn/courses/view/actual`);
  const results = await page.evaluate(
    () => (window as unknown as { __results: Promise<Results> }).__results
  );
  await page.close();
  return results;
}

test.beforeAll(async () => {
  ({ context, cleanup } = await launchExtensionContext({ headless: true }));
  extensionId = await resolveExtensionId(context);

  await context.route(`${LMS_URL}/**`, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE })
  );

  const cors = { 'access-control-allow-origin': '*' };
  const real: Record<string, unknown> = {
    [RESOLVE_URL]: REAL_RESOLVE,
    [TOGGLES_URL]: { response: { items: [{ path: 'real' }] } },
    [EVENTS_URL]: {},
  };
  for (const url of Object.keys(real)) {
    await context.route(url, (route) => {
      if (tbank === 'down') return route.abort('failed');
      if (tbank === '5xx') return route.fulfill({ status: 503, json: {}, headers: cors });
      return route.fulfill({ json: real[url], headers: cors });
    });
  }
});

test.afterAll(async () => {
  await cleanup?.();
});

test('с галочкой упавшие ручки получают подставные ответы', async () => {
  tbank = 'down';
  await setToggle(true);

  const { thermostat, toggles, statist } = await openLms();

  expect(thermostat).toMatchObject({ ok: true, status: 200 });
  expect(thermostat.body).toMatchObject({
    status: 'complete',
    resolvedParameters: [],
    unknownParameters: [],
    disabledParameters: ['service-desk-enabled'],
  });
  expect(toggles).toEqual({ ok: true, status: 200, body: { response: { items: [] } } });
  // SDK Statist смотрит только на статус: 204 для него — «принято».
  expect(statist).toEqual({ event: 'error', status: 204 });
});

test('с галочкой рабочие ручки отвечают как есть', async () => {
  tbank = 'up';
  await setToggle(true);

  const { thermostat, toggles, statist } = await openLms();

  expect(thermostat.body).toEqual(REAL_RESOLVE);
  expect(toggles.body).toEqual({ response: { items: [{ path: 'real' }] } });
  expect(statist).toEqual({ event: 'load', status: 200 });
});

test('5xx подменяется у флагов, но не у аналитики', async () => {
  tbank = '5xx';
  await setToggle(true);

  const { thermostat, toggles, statist } = await openLms();

  expect(thermostat).toMatchObject({ ok: true, status: 200 });
  expect(toggles.body).toEqual({ response: { items: [] } });
  // Сервер Statist жив, но сбоит: события должны дождаться повтора SDK.
  expect(statist).toEqual({ event: 'load', status: 503 });
});

test('без галочки упавшие ручки так и падают', async () => {
  tbank = 'down';
  await setToggle(false);

  const { thermostat, toggles, statist } = await openLms();

  expect(thermostat.ok).toBe(false);
  expect(thermostat.error).toContain('TypeError');
  expect(toggles.ok).toBe(false);
  expect(statist).toEqual({ event: 'error', status: 0 });
});
