/**
 * 3rd-theme workshop: комната, публикация, примерка с откатом, установка,
 * модерация в общей комнате.
 *
 * Тест сквозной: настоящее расширение из dist/chrome и настоящий сервер
 * мастерской (https://github.com/cu-3rd-party/lms-workshop), поднятый
 * локально. LMS подставная: `students/me` и страницы отдаёт `context.route`,
 * логин не нужен.
 *
 * Запуск:
 *   # в lms-workshop
 *   DATABASE_URL=sqlite:///./ws.db ADMIN_PASSWORD=secret alembic upgrade head
 *   DATABASE_URL=sqlite:///./ws.db ADMIN_PASSWORD=secret uvicorn app.main:app --port 8765
 *   # здесь
 *   bun run build:chrome
 *   WORKSHOP_URL=http://127.0.0.1:8765 WORKSHOP_ADMIN_PASSWORD=secret bun run test workshop
 *
 * Без WORKSHOP_URL тест пропускается.
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import {
  LMS_URL,
  getExtensionStorage,
  launchExtensionContext,
  resolveExtensionId,
  setExtensionStorage,
} from './helpers/extension.js';

const WORKSHOP_URL = process.env.WORKSHOP_URL;
const ADMIN_PASSWORD = process.env.WORKSHOP_ADMIN_PASSWORD || 'secret';

test.describe.configure({ mode: 'serial', timeout: 120_000 });
test.skip(!WORKSHOP_URL, 'нужен локальный сервер мастерской: WORKSHOP_URL');

// PNG 1×1 — сервер узнаёт картинки по сигнатуре.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64'
);
const LOGO = `data:image/png;base64,${PNG.toString('base64')}`;
const AUTHOR_CSS = 'body { outline: 3px solid hotpink; }';
const OWN_CSS = 'body { outline: 1px solid gray; }';

const LMS_PAGE = `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head>
<body><main class="main"><h1>Мои курсы</h1></main></body></html>`;

let context: BrowserContext;
let cleanup: () => Promise<void>;
let extensionId: string;
const studentId = randomUUID();
// База сервера живёт между прогонами — названия делаем уникальными.
const PUBLIC_TITLE = `Для всех ${studentId.slice(0, 6)}`;

async function local<T>(key: string) {
  return getExtensionStorage<T>(context, extensionId, 'local', key);
}

async function openWorkshop(hash = ''): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/plugins/workshop/workshop.html${hash}`);
  await expect(page.locator('.room-link').first()).toBeVisible();
  return page;
}

async function publish(page: Page, roomName: string, title: string) {
  await page.locator('#publish-btn').click();
  await expect(page.getByRole('heading', { name: 'Опубликовать тему' })).toBeVisible();
  await page.locator('form.form select').selectOption({ label: roomName });
  const nickname = page.getByPlaceholder('Как тебя подписать');
  if (await nickname.isVisible()) await nickname.fill('Тестер');
  await page.getByPlaceholder('Например: «Ночной Иннополис»').fill(title);
  await page.locator('form.form textarea').first().fill('Розовая рамка на всю LMS');

  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Главный экран — обязательно').click();
  await (await chooser).setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('.shot.cover-shot img')).toBeVisible();

  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
}

test.beforeAll(async () => {
  const launched = await launchExtensionContext({ headless: true });
  context = launched.context;
  cleanup = launched.cleanup;
  extensionId = await resolveExtensionId(context);

  await context.route(`${LMS_URL}/api/student-hub/students/me`, (route) =>
    route.fulfill({ json: { id: studentId, emails: [] } })
  );
  await context.route(`${LMS_URL}/learn/**`, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: LMS_PAGE })
  );

  await setExtensionStorage(context, extensionId, 'local', 'workshopBackendUrl', WORKSHOP_URL);
  // Настройки автора темы: их и опубликуем.
  await setExtensionStorage(context, extensionId, 'sync', 'customThemeToggle', true);
  await setExtensionStorage(context, extensionId, 'local', 'customThemeCss', AUTHOR_CSS);
  await setExtensionStorage(context, extensionId, 'local', 'customThemeVars', {
    '--tui-background-base': '#2b0d1f',
  });
  await setExtensionStorage(context, extensionId, 'local', 'customLogo', LOGO);
  await setExtensionStorage(context, extensionId, 'local', 'courseNames', { '1245': 'Матан' });
});

test.afterAll(async () => {
  await cleanup?.();
});

let roomCode = '';

test('создаёт приватную комнату и публикует в неё тему без модерации', async () => {
  const page = await openWorkshop();
  await expect(page.locator('.room-link').first()).toContainText('Общая');

  await page.locator('#create-room-btn').click();
  await page.getByPlaceholder('Например: Б-101').fill('Б-101');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  roomCode = (await page.locator('.modal .code').textContent())!.trim();
  expect(roomCode).toMatch(/^[A-Z2-9]{6}$/);
  await page.keyboard.press('Escape');

  await publish(page, 'Б-101', 'Розовая');
  await expect(page.locator('.panel h1')).toHaveText('Розовая');
  await expect(page.locator('.panel')).toContainText('Тестер');
  await page.screenshot({ path: 'test-results/workshop-theme.png', fullPage: true });

  await page.getByRole('button', { name: /← Б-101/ }).click();
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.room-head')).toContainText(roomCode);
  await page.screenshot({ path: 'test-results/workshop-room.png', fullPage: true });
  await page.close();
});

test('примерка ставит тему, а «Вернуть как было» — откатывает', async () => {
  // Свои настройки, отличные от темы.
  await setExtensionStorage(context, extensionId, 'local', 'customThemeCss', OWN_CSS);
  await setExtensionStorage(context, extensionId, 'local', 'courseNames', { '7': 'Своё' });

  const page = await openWorkshop();
  await page.locator('.room-link', { hasText: 'Б-101' }).click();
  await page.locator('.card').first().click();
  await page.getByRole('button', { name: 'Примерить' }).click();

  await expect.poll(() => local<string>('customThemeCss')).toBe(AUTHOR_CSS);
  // Тема заменяет оформление целиком: свои названия курсов на время примерки
  // уходят, а «Вернуть как было» их возвращает.
  await expect.poll(() => local('courseNames')).toEqual({ '1245': 'Матан' });
  const tryOn = await local<{ title: string }>('workshopTryOn');
  expect(tryOn?.title).toBe('Розовая');

  // На LMS висит плашка примерки.
  const lms = await context.newPage();
  await lms.goto(`${LMS_URL}/learn/courses/view/actual`);
  await expect(lms.locator('#culms-workshop-tryon')).toBeAttached({ timeout: 15_000 });
  await lms.screenshot({ path: 'test-results/workshop-tryon-lms.png' });

  await page.bringToFront();
  await expect(page.locator('#tryon-bar')).toContainText('Примеряешь «Розовая»');
  await page.getByRole('button', { name: 'Вернуть как было' }).click();

  await expect.poll(() => local<string>('customThemeCss')).toBe(OWN_CSS);
  await expect.poll(() => local('courseNames')).toEqual({ '7': 'Своё' });
  expect(await local('workshopTryOn')).toBeUndefined();
  await expect(lms.locator('#culms-workshop-tryon')).not.toBeAttached();
  await lms.close();
  await page.close();
});

test('установка по слоям: снятая галочка оставляет слой по умолчанию', async () => {
  const page = await openWorkshop();
  await page.locator('.room-link', { hasText: 'Б-101' }).click();
  await page.locator('.card').first().click();
  await page.locator('.panel label', { hasText: 'Палитра и CSS' }).locator('input').uncheck();
  await page.getByRole('button', { name: 'Установить' }).click();
  await expect(page.locator('.panel')).toContainText('Эта версия у тебя установлена');

  // Тема снимает прежнее оформление во всех слоях: своего CSS больше нет, а
  // из темы палитру не взяли — слой остаётся по умолчанию.
  expect(await local('customThemeCss')).toBeUndefined();
  expect(await local('customLogo')).toBe(LOGO);
  const installed = await local<Record<string, { number: number }>>('workshopInstalled');
  expect(Object.values(installed ?? {})[0]?.number).toBe(1);

  await page.locator('.back').click();
  await expect(page.locator('.card .badge')).toHaveText('стоит сейчас');
  await expect(page.locator('.card .stats')).toContainText('⤓ 1');
  await page.close();
});

test('в общей комнате тема ждёт модерации', async ({ request }) => {
  const page = await openWorkshop();
  await publish(page, 'Общая — с модерацией', PUBLIC_TITLE);
  await expect(page.getByRole('heading', { name: 'Мои темы' })).toBeVisible();
  await expect(page.locator('.mine-item', { hasText: PUBLIC_TITLE })).toContainText('на модерации');
  await page.screenshot({ path: 'test-results/workshop-mine.png', fullPage: true });

  await page.locator('.room-link', { hasText: 'Общая' }).click();
  await expect(page.locator('.grid')).toBeVisible();
  await expect(page.locator('.card', { hasText: PUBLIC_TITLE })).toHaveCount(0);

  const login = await request.post(`${WORKSHOP_URL}/api/admin/login`, {
    data: { username: 'admin', password: ADMIN_PASSWORD },
  });
  const headers = { Authorization: `Bearer ${(await login.json()).token}` };
  const queue = await (await request.get(`${WORKSHOP_URL}/api/admin/queue`, { headers })).json();
  const item = queue.find((i: { version: { title: string } }) => i.version.title === PUBLIC_TITLE);
  expect(item).toBeTruthy();
  const approved = await request.post(
    `${WORKSHOP_URL}/api/admin/versions/${item.version.id}/approve`,
    { headers }
  );
  expect(approved.ok()).toBe(true);

  await page.reload();
  await page.locator('.room-link', { hasText: 'Общая' }).click();
  await expect(page.locator('.card', { hasText: PUBLIC_TITLE })).toBeVisible();
  await page.close();
});
