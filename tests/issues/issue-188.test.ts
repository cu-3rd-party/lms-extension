import { test, expect, LMS_URL } from '../helpers/fixtures.js';

const TASKS_PAGE = `${LMS_URL}/learn/tasks/actual-student-tasks`;

test.describe('Issue #188: tasks hover layout', () => {
  test.setTimeout(60_000);

  test('кнопка late-days остается внутри ячейки и не выталкивает верстку', async ({ page }) => {
    await page.goto(TASKS_PAGE);

    const row = page.locator('tr[class*="task-table__task"]').first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    const lateDaysCell = row.locator('.task-table__late-days');
    await expect(lateDaysCell).toBeVisible({ timeout: 10_000 });

    const lateDaysContainer = row.locator('.culms-late-days-container').first();
    const actionButton = row.locator('.culms-action-button').first();

    await expect(lateDaysContainer).toBeVisible({ timeout: 10_000 });
    await expect(actionButton).toBeVisible({ timeout: 10_000 });

    const [cellBox, containerBox, buttonBox] = await Promise.all([
      lateDaysCell.boundingBox(),
      lateDaysContainer.boundingBox(),
      actionButton.boundingBox(),
    ]);

    expect(cellBox).not.toBeNull();
    expect(containerBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();

    expect(buttonBox!.x).toBeGreaterThanOrEqual(cellBox!.x);
    expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(cellBox!.x + cellBox!.width);
    expect(containerBox!.x + containerBox!.width).toBeLessThanOrEqual(cellBox!.x + cellBox!.width);
  });
});
