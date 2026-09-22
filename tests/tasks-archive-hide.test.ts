/**
 * Ручное скрытие заданий в архиве и список скрытых — на поддельной таблице.
 *
 * Стенд тот же, что у скрытия по дате (`helpers/tasks-page.ts`): настоящий
 * `tasks_fix.js`, заглушки вместо API и `browser.storage`. Проверяем то, что
 * видит студент: кнопки над таблицей, выбор строк кликом, пропажу строк и
 * возврат их из списка — и что выбор переживает перезагрузку страницы.
 *
 * Запуск:
 *   bunx playwright test tests/tasks-archive-hide.test.ts
 */

import { test, expect, type Page } from '@playwright/test';
import {
  asSettingValue,
  daysFromToday,
  openTasksPage,
  visibleTasks,
  type Row,
} from './helpers/tasks-page.js';

// id в заглушке API идут по порядку строк, попавших в API: 100, 101, 102, 103.
const ROWS: Row[] = [
  { name: 'ДЗ 1. Старое', course: 'Матан', deadline: daysFromToday(-40), inApi: true },
  { name: 'ДЗ 2. Мешает', course: 'Матан', deadline: daysFromToday(-3), inApi: true },
  { name: 'Семинар 3', course: 'Линал', deadline: daysFromToday(-2), inApi: true },
  // Мимо API: id нет, спрятать насовсем такую строку не по чему.
  { name: 'Не из API', course: 'Линал', deadline: daysFromToday(-1), inApi: false },
  { name: 'ДЗ 5. Нужное', course: 'Матан', deadline: daysFromToday(-1), inApi: true },
];
const ALL = ROWS.map((row) => row.name);
// Прячет по дате только «ДЗ 1. Старое».
const BORDER = asSettingValue(daysFromToday(-10));

const openArchive = (
  page: Page,
  options: { enabled?: boolean; date?: string; local?: Record<string, unknown> } = {}
) =>
  openTasksPage(page, {
    archived: true,
    enabled: !!options.enabled,
    date: options.date || '',
    rows: ROWS,
    local: options.local,
  });

const toolbar = (page: Page) => page.locator('#culms-archive-toolbar');
const rowByName = (page: Page, name: string) =>
  page.locator('tr.task-table__task', { hasText: name });
const storedLocal = (page: Page) =>
  page.evaluate(() => JSON.parse(JSON.stringify((window as any).__local)));

test('кнопки есть в архиве и нет на активной странице', async ({ page }) => {
  await openArchive(page);
  await expect(toolbar(page).getByRole('button', { name: 'Выбрать и скрыть' })).toBeVisible();
  await expect(
    toolbar(page).getByRole('button', { name: 'Открыть список скрытых задач' })
  ).toBeVisible();

  await openTasksPage(page, { enabled: false, date: '', rows: ROWS });
  // Даём скрипту отработать, прежде чем утверждать, что панели нет.
  await page.waitForTimeout(300);
  await expect(toolbar(page)).toHaveCount(0);
});

test('выбранные задачи пропадают и запоминаются по id', async ({ page }) => {
  await openArchive(page);
  await toolbar(page).getByRole('button', { name: 'Выбрать и скрыть' }).click();

  await rowByName(page, 'ДЗ 2. Мешает').click();
  await rowByName(page, 'Семинар 3').click();
  // Клик в режиме выбора отмечает строку, а не открывает задание.
  expect(await page.evaluate(() => (window as any).__openedTask)).toBeUndefined();
  await expect(rowByName(page, 'ДЗ 2. Мешает')).toHaveClass(/culms-archive-selected/);

  await toolbar(page).getByRole('button', { name: 'Скрыть выбранные (2)' }).click();

  await expect
    .poll(() => visibleTasks(page))
    .toEqual(['ДЗ 1. Старое', 'Не из API', 'ДЗ 5. Нужное']);
  expect((await storedLocal(page)).hiddenArchivedTaskIds).toEqual(['101', '102']);

  // Режим выбора закончился: клик по строке снова её открывает.
  await expect(toolbar(page).getByRole('button', { name: 'Выбрать и скрыть' })).toBeVisible();
  await rowByName(page, 'ДЗ 5. Нужное').click();
  expect(await page.evaluate(() => (window as any).__openedTask)).toBe(4);
});

test('повторный клик снимает выбор, строку без id выбрать нельзя', async ({ page }) => {
  await openArchive(page);
  await toolbar(page).getByRole('button', { name: 'Выбрать и скрыть' }).click();

  await rowByName(page, 'ДЗ 2. Мешает').click();
  await rowByName(page, 'ДЗ 2. Мешает').click();
  await rowByName(page, 'Не из API').click();

  await expect(rowByName(page, 'Не из API')).toHaveClass(/culms-archive-unselectable/);
  await expect(toolbar(page).getByRole('button', { name: 'Скрыть выбранные (0)' })).toBeDisabled();
});

test('отмена и Escape ничего не прячут', async ({ page }) => {
  await openArchive(page);
  const select = toolbar(page).getByRole('button', { name: 'Выбрать и скрыть' });

  await select.click();
  await rowByName(page, 'ДЗ 2. Мешает').click();
  await toolbar(page).getByRole('button', { name: 'Отмена' }).click();
  await expect(select).toBeVisible();

  await select.click();
  await rowByName(page, 'Семинар 3').click();
  await page.keyboard.press('Escape');
  await expect(select).toBeVisible();

  expect(await visibleTasks(page)).toEqual(ALL);
  expect(await page.evaluate(() => document.body.className)).not.toContain('selecting');
  expect((await storedLocal(page)).hiddenArchivedTaskIds).toBeUndefined();
});

test('скрытые вручную не возвращаются после перезагрузки', async ({ page }) => {
  await openArchive(page, { local: { hiddenArchivedTaskIds: ['101'] } });
  await expect.poll(() => visibleTasks(page)).not.toContain('ДЗ 2. Мешает');
  expect(await visibleTasks(page)).toHaveLength(ALL.length - 1);
});

test('в списке и скрытые вручную, и скрытые по дате; их можно вернуть', async ({ page }) => {
  await openArchive(page, {
    enabled: true,
    date: BORDER,
    local: { hiddenArchivedTaskIds: ['101'] },
  });
  await expect.poll(() => visibleTasks(page)).toEqual(['Семинар 3', 'Не из API', 'ДЗ 5. Нужное']);

  await toolbar(page).getByRole('button', { name: 'Открыть список скрытых задач (2)' }).click();
  const dialog = page.getByRole('dialog', { name: 'Скрытые задачи' });
  await expect(dialog).toBeVisible();

  const items = dialog.locator('.culms-hidden-item');
  await expect(items).toHaveCount(2);
  await expect(items.filter({ hasText: 'ДЗ 2. Мешает' })).toContainText('скрыта вами');
  await expect(items.filter({ hasText: 'ДЗ 1. Старое' })).toContainText('раньше даты');

  await dialog.getByText('Выбрать все').click();
  await dialog.getByRole('button', { name: 'Вернуть в архив (2)' }).click();

  await expect(dialog.getByText('Скрытых задач нет')).toBeVisible();
  await expect.poll(() => visibleTasks(page)).toEqual(ALL);

  // Задание, спрятанное датой, возвращается исключением — иначе дата
  // спрятала бы его снова.
  const local = await storedLocal(page);
  expect(local.hiddenArchivedTaskIds).toEqual([]);
  expect(local.shownArchivedTaskIds).toEqual(['100']);
});

test('возвращённое задание не прячется датой и после перезагрузки', async ({ page }) => {
  await openArchive(page, {
    enabled: true,
    date: BORDER,
    local: { shownArchivedTaskIds: ['100'] },
  });
  await expect.poll(() => visibleTasks(page)).toEqual(ALL);
});

test('вернуть можно только отмеченные', async ({ page }) => {
  await openArchive(page, {
    enabled: true,
    date: BORDER,
    local: { hiddenArchivedTaskIds: ['101', '102'] },
  });
  await toolbar(page)
    .getByRole('button', { name: /Открыть список скрытых задач/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Скрытые задачи' });
  await expect(dialog.locator('.culms-hidden-item')).toHaveCount(3);

  await dialog.locator('.culms-hidden-item', { hasText: 'Семинар 3' }).click();
  await dialog.getByRole('button', { name: 'Вернуть в архив (1)' }).click();

  await expect(dialog.locator('.culms-hidden-item')).toHaveCount(2);
  await expect.poll(() => visibleTasks(page)).toContain('Семинар 3');
  expect((await storedLocal(page)).hiddenArchivedTaskIds).toEqual(['101']);
  // Дата «Семинар 3» не прячет — исключение для него не нужно.
  expect((await storedLocal(page)).shownArchivedTaskIds).toEqual([]);

  await dialog.getByRole('button', { name: 'Закрыть' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    toolbar(page).getByRole('button', { name: 'Открыть список скрытых задач (2)' })
  ).toBeVisible();
});

test('Shift отмечает диапазон и пропускает спрятанное', async ({ page }) => {
  // «ДЗ 2. Мешает» уже спрятано — в диапазон оно попасть не должно.
  await openArchive(page, { local: { hiddenArchivedTaskIds: ['101'] } });
  await toolbar(page).getByRole('button', { name: 'Выбрать и скрыть' }).click();

  await rowByName(page, 'ДЗ 1. Старое').click();
  await rowByName(page, 'ДЗ 5. Нужное').click({ modifiers: ['Shift'] });

  // ДЗ 1, Семинар 3 и ДЗ 5; строку без id диапазон тоже обходит.
  await expect(toolbar(page).getByRole('button', { name: 'Скрыть выбранные (3)' })).toBeVisible();
  await expect(rowByName(page, 'Семинар 3')).toHaveClass(/culms-archive-selected/);
  await expect(rowByName(page, 'Не из API')).not.toHaveClass(/culms-archive-selected/);
  expect(await page.evaluate(() => (window as any).__openedTask)).toBeUndefined();

  // Диапазон снимается так же: берётся новое состояние кликнутой строки.
  await rowByName(page, 'Семинар 3').click();
  await rowByName(page, 'ДЗ 1. Старое').click({ modifiers: ['Shift'] });
  await expect(toolbar(page).getByRole('button', { name: 'Скрыть выбранные (1)' })).toBeVisible();
  await expect(rowByName(page, 'ДЗ 5. Нужное')).toHaveClass(/culms-archive-selected/);

  await toolbar(page).getByRole('button', { name: 'Скрыть выбранные (1)' }).click();
  expect((await storedLocal(page)).hiddenArchivedTaskIds).toEqual(['101', '103']);
});

test('Shift отмечает диапазон и в списке скрытых', async ({ page }) => {
  await openArchive(page, {
    enabled: true,
    date: BORDER,
    local: { hiddenArchivedTaskIds: ['101', '102'] },
  });
  await toolbar(page)
    .getByRole('button', { name: /Открыть список скрытых задач/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Скрытые задачи' });
  const items = dialog.locator('.culms-hidden-item');
  await expect(items).toHaveCount(3);

  await items.first().click();
  await items.last().click({ modifiers: ['Shift'] });
  await expect(dialog.getByRole('button', { name: 'Вернуть в архив (3)' })).toBeEnabled();

  await dialog.getByRole('button', { name: 'Вернуть в архив (3)' }).click();
  await expect.poll(() => visibleTasks(page)).toEqual(ALL);
});
