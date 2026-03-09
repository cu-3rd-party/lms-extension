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
      tooltip.style.display = 'inline-flex';
      tooltip.style.padding = '12px';
      tooltip.innerHTML = '<tui-icon></tui-icon>';
      document.body.append(tooltip);
    }, TOOLTIP_ID);

    const tooltip = page.locator(`#${TOOLTIP_ID}`);
    const icon = tooltip.locator('tui-icon');

    await expect
      .poll(async () => {
        return icon.evaluate((icon) => {
          return getComputedStyle(icon, '::after').color;
        });
      })
      .toBe('rgb(232, 234, 237)');

    await tooltip.hover();

    await expect
      .poll(async () => {
        const hoveredColor = await icon.evaluate((icon) => {
          return getComputedStyle(icon, '::after').color;
        });

        return hoveredColor !== 'rgb(0, 0, 0)' && hoveredColor !== 'rgba(0, 0, 0, 1)';
      })
      .toBe(true);
  });
});
