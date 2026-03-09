import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  clearExtensionStorage,
} from '../helpers/fixtures.js';

const PAGE = `${LMS_URL}/learn/courses/view/actual`;
const STYLE_ID = 'culms-dark-theme-style-base';
const TOOLTIP_ID = 'culms-test-tooltip';

test.describe('Issue #185: tooltip icon color in dark theme', () => {
  test.afterEach(async ({ context, extensionId, page }) => {
    await page.evaluate((tooltipId) => {
      document.getElementById(tooltipId)?.remove();
    }, TOOLTIP_ID);
    await clearExtensionStorage(context, extensionId, 'sync', 'themeEnabled');
  });

  test('оставляет иконку подсказки светлой вместо черной', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'themeEnabled', true);

    await page.goto(PAGE);
    await expect(page.locator(`#${STYLE_ID}`)).toBeAttached({ timeout: 10_000 });

    await page.evaluate((tooltipId) => {
      const tooltip = document.createElement('tui-tooltip');
      tooltip.id = tooltipId;
      tooltip.innerHTML = '<tui-icon></tui-icon>';
      document.body.append(tooltip);
    }, TOOLTIP_ID);

    await expect
      .poll(async () => {
        return page.locator(`#${TOOLTIP_ID} tui-icon`).evaluate((icon) => {
          return getComputedStyle(icon, '::after').color;
        });
      })
      .toBe('rgb(232, 234, 237)');
  });
});
