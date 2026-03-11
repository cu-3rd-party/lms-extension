import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  clearExtensionStorage,
} from '../helpers/fixtures.js';

const TASKS_PAGE = `${LMS_URL}/learn/tasks/actual-student-tasks`;

test.describe('Issue #189: task hover icons in dark theme', () => {
  test.setTimeout(60_000);

  test.afterEach(async ({ context, extensionId }) => {
    await clearExtensionStorage(context, extensionId, 'sync', 'themeEnabled');
  });

  test('не инвертирует кастомную иконку действия при hover строки', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'themeEnabled', true);

    await page.goto(TASKS_PAGE);
    await page.waitForSelector('tr[class*="task-table__task"]', { timeout: 15_000 });
    await page.waitForSelector('.culms-action-button', { timeout: 10_000 });

    const row = page.locator('tr[class*="task-table__task"]').first();
    await row.hover();

    await expect
      .poll(async () => {
        return row.locator('.culms-action-button').first().evaluate((button) => {
          const svg = button.querySelector('svg');
          return {
            buttonFilter: getComputedStyle(button).filter,
            svgFilter: svg ? getComputedStyle(svg).filter : '',
          };
        });
      })
      .toEqual({
        buttonFilter: 'none',
        svgFilter: 'none',
      });
  });

  test('не инвертирует warning icon при hover строки', async ({ page, context, extensionId }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'themeEnabled', true);

    await page.goto(TASKS_PAGE);
    await page.waitForSelector('tr[class*="task-table__task"]', { timeout: 15_000 });
    await page.waitForSelector('tui-icon.warning-icon', { timeout: 10_000 });

    const warningIcon = page.locator('tui-icon.warning-icon').first();
    const row = page.locator('tr[class*="task-table__task"]').filter({ has: warningIcon }).first();
    await row.hover();

    await expect
      .poll(async () => {
        return warningIcon.evaluate((icon) => getComputedStyle(icon).filter);
      })
      .toBe('none');
  });
});
