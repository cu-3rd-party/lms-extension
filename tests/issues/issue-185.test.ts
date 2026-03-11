import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  clearExtensionStorage,
} from '../helpers/fixtures.js';

const PAGE = `${LMS_URL}/learn/reports/student-performance/actual/by-semester`;
const STYLE_ID = 'culms-dark-theme-style-base';

async function openActivityPageWithTooltips(page) {
  await page.goto(PAGE);
  await expect(page.locator('tr.course-row').first()).toBeVisible({ timeout: 15_000 });

  const rowCount = await page.locator('tr.course-row').count();
  const attempts = Math.min(rowCount, 5);

  for (let index = 0; index < attempts; index += 1) {
    await page.goto(PAGE);
    await expect(page.locator('tr.course-row').first()).toBeVisible({ timeout: 15_000 });
    await page.locator('tr.course-row').nth(index).click();
    await expect(page.locator('a[href*="/activity"]')).toBeVisible({ timeout: 10_000 });

    await page.locator('a[href*="/activity"]').click();
    await expect(page).toHaveURL(/\/learn\/reports\/student-performance\/actual\/\d+\/activity/);

    const tooltipCount = await expect
      .poll(async () => {
        return page.locator('cu-tooltip tui-icon').count();
      }, { timeout: 15_000 })
      .toBeGreaterThan(0)
      .then(() => page.locator('cu-tooltip tui-icon').count())
      .catch(() => 0);

    if (tooltipCount > 0) {
      return;
    }
  }

  throw new Error('Не удалось найти страницу активности с tooltip-иконками для issue #185');
}

async function resolveCssColor(page, value) {
  return page.evaluate((cssValue) => {
    const probe = document.createElement('div');
    probe.style.color = cssValue;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, value);
}

test.describe('Issue #185: tooltip icon color in dark theme', () => {
  test.afterEach(async ({ context, extensionId }) => {
    await clearExtensionStorage(context, extensionId, 'sync', 'themeEnabled');
    await clearExtensionStorage(context, extensionId, 'sync', 'advancedStatementsEnabled');
    await clearExtensionStorage(context, extensionId, 'sync', 'endOfCourseCalcEnabled');
  });

  test('делает реальную tooltip-иконку заметно светлее на тёмной теме', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'themeEnabled', true);
    await setExtensionStorage(context, extensionId, 'sync', 'advancedStatementsEnabled', true);
    await setExtensionStorage(context, extensionId, 'sync', 'endOfCourseCalcEnabled', true);

    await openActivityPageWithTooltips(page);
    await expect(page.locator(`#${STYLE_ID}`)).toBeAttached({ timeout: 10_000 });

    const tooltip = page.locator('cu-tooltip').first();
    const icon = tooltip.locator('tui-icon');
    const defaultColor = await resolveCssColor(page, 'var(--text-primary-on-dark)');
    const hoverColor = await resolveCssColor(page, 'var(--culms-dark-text-primary)');

    await expect
      .poll(async () => {
        return icon.evaluate((node) => getComputedStyle(node).filter);
      })
      .not.toBe('none');

    await expect
      .poll(async () => {
        return icon.evaluate((node) => getComputedStyle(node).opacity);
      })
      .toBe('0.96');

    await expect
      .poll(async () => {
        return icon.evaluate((node) => getComputedStyle(node, '::after').maskImage);
      })
      .not.toBe('none');

    await expect
      .poll(async () => {
        return icon.evaluate((icon) => {
          return getComputedStyle(icon, '::after').backgroundColor;
        });
      })
      .toBe(defaultColor);

    await tooltip.hover();

    await expect
      .poll(async () => {
        return icon.evaluate((icon) => {
          return getComputedStyle(icon, '::after').backgroundColor;
        });
      })
      .toBe(hoverColor);
  });
});
