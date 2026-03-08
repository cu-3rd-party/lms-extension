import { test, expect, LMS_URL } from './helpers/fixtures.js';

const TASKS_PAGE = `${LMS_URL}/learn/tasks/actual-student-tasks`;

test.describe('Tasks fix', () => {
  test.setTimeout(60_000);

  test('добавляет колонку "Вес" в таблицу задач', async ({ page }) => {
    await page.goto(TASKS_PAGE);

    // Ждём пока загрузятся строки таблицы и плагин добавит ячейки веса
    await page.waitForSelector('tr[class*="task-table__task"]', { timeout: 15_000 });
    await expect(page.locator('[data-culms-weight-cell]').first()).toBeAttached({ timeout: 5_000 });
  });

  test('добавляет ячейки веса в строки задач', async ({ page }) => {
    await page.goto(TASKS_PAGE);

    await page.waitForSelector('tr[class*="task-table__task"]', { timeout: 15_000 });

    const weightCells = page.locator('[data-culms-weight-cell]');
    await expect(weightCells.first()).toBeAttached({ timeout: 5_000 });

    const count = await weightCells.count();
    expect(count).toBeGreaterThan(0);
    console.log(`Ячеек веса: ${count}`);
  });

  test('добавляет кнопки скипа на строки задач', async ({ page }) => {
    await page.goto(TASKS_PAGE);

    await page.waitForSelector('tr[class*="task-table__task"]', { timeout: 15_000 });
    await page.waitForSelector('[data-culms-weight-cell]', { timeout: 5_000 });

    const skipButtons = page.locator('.culms-action-button');
    await expect(skipButtons.first()).toBeAttached({ timeout: 5_000 });

    const count = await skipButtons.count();
    expect(count).toBeGreaterThan(0);
    console.log(`Кнопок скипа: ${count}`);
  });

  test('нажатие кнопки скипа показывает модальное окно подтверждения', async ({ page }) => {
    await page.goto(TASKS_PAGE);

    await page.waitForSelector('tr[class*="task-table__task"]', { timeout: 15_000 });
    await page.waitForSelector('[data-culms-weight-cell]', { timeout: 5_000 });

    const skipButton = page.locator('.culms-action-button').first();
    await expect(skipButton).toBeAttached({ timeout: 10_000 });
    await skipButton.click();

    await expect(page.locator('.culms-modal-backdrop')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.culms-modal-confirm')).toBeVisible();
    await expect(page.locator('.culms-modal-cancel')).toBeVisible();

    // Закрываем — не меняем реальное состояние
    await page.locator('.culms-modal-cancel').click();
    await expect(page.locator('.culms-modal-backdrop')).not.toBeVisible({ timeout: 3_000 });
  });
});
