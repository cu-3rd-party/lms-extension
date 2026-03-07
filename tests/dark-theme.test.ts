import { test, expect, LMS_URL, clearExtensionStorage } from './helpers/fixtures.js';

const PAGE = `${LMS_URL}/learn/courses/view/actual`;
const STYLE_ID = 'culms-dark-theme-style-base';
const TOGGLE_SELECTOR = 'li[automation-id="header-action-theme-toggle"] button';

test.describe('Dark theme toggle', () => {
  test.afterEach(async ({ context, extensionId }) => {
    await clearExtensionStorage(context, extensionId, 'sync', 'themeEnabled');
  });

  test('кнопка появляется в хедере', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator(TOGGLE_SELECTOR)).toBeVisible({ timeout: 10_000 });
  });

  test('клик включает тёмную тему', async ({ page }) => {
    await page.goto(PAGE);

    const button = page.locator(TOGGLE_SELECTOR);
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click();

    await expect(page.locator(`#${STYLE_ID}`)).toBeAttached({ timeout: 5_000 });
  });

  test('повторный клик выключает тёмную тему', async ({ page }) => {
    await page.goto(PAGE);

    const button = page.locator(TOGGLE_SELECTOR);
    await expect(button).toBeVisible({ timeout: 10_000 });

    await button.click();
    await expect(page.locator(`#${STYLE_ID}`)).toBeAttached({ timeout: 5_000 });

    await button.click();
    await expect(page.locator(`#${STYLE_ID}`)).not.toBeAttached({ timeout: 5_000 });
  });

  test('тема сохраняется после перезагрузки страницы', async ({ page }) => {
    await page.goto(PAGE);

    const button = page.locator(TOGGLE_SELECTOR);
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click();
    await expect(page.locator(`#${STYLE_ID}`)).toBeAttached({ timeout: 5_000 });

    await page.reload();
    await expect(page.locator(`#${STYLE_ID}`)).toBeAttached({ timeout: 10_000 });
  });
});
