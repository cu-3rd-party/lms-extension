import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  clearExtensionStorage,
} from '../helpers/fixtures.js';

const PAGE = `${LMS_URL}/learn/courses/view/actual`;
const STYLE_ID = 'culms-dark-theme-style-base';
const POPUP_PATH = 'popup/popup.html';
const DISABLE_BUTTON_TEXT = 'Перезагрузить без плагина';

test.describe('Issue #187: one-time reload without extension', () => {
  test.setTimeout(60_000);

  test.afterEach(async ({ context, extensionId }) => {
    await clearExtensionStorage(context, extensionId, 'sync', 'themeEnabled');
  });

  test('popup page can trigger a one-time reload without extension injection', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'themeEnabled', true);

    await page.goto(PAGE);
    await expect(page.locator(`#${STYLE_ID}`)).toBeAttached({ timeout: 10_000 });

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/${POPUP_PATH}`);

    const disableButton = popupPage.getByRole('button', { name: DISABLE_BUTTON_TEXT });
    await expect(disableButton).toBeVisible({ timeout: 10_000 });

    await popupPage.evaluate(async (targetUrl) => {
      const tabs = await chrome.tabs.query({ url: 'https://my.centraluniversity.ru/*' });
      const targetTab = tabs.find((tab) => tab.url === targetUrl);

      if (typeof targetTab?.id !== 'number') {
        throw new Error(`Target LMS tab not found for ${targetUrl}`);
      }

      await chrome.runtime.sendMessage({ action: 'BYPASS_EXTENSION_ONCE', tabId: targetTab.id });
    }, PAGE);

    await popupPage.close();
    await expect(page.locator(`#${STYLE_ID}`)).not.toBeAttached({ timeout: 10_000 });

    await page.waitForTimeout(16_000);
    await page.reload();
    await expect(page.locator(`#${STYLE_ID}`)).toBeAttached({ timeout: 10_000 });
  });
});
