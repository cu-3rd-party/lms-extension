import { test, expect, LMS_URL } from '../helpers/fixtures.js';

const PAGE = `${LMS_URL}/learn/courses/view/actual`;
const DISABLE_BUTTON = '#disable-extension-once-btn';

test.describe('Issue #187: one-time reload without extension', () => {
  test('popup button sends a bypass request for the LMS tab', async ({ page, context, extensionId }) => {
    await page.goto(PAGE);

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await expect(popupPage.locator(DISABLE_BUTTON)).toBeVisible({ timeout: 10_000 });

    const targetTabId = await popupPage.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://my.centraluniversity.ru/*' });
      return tab?.id ?? null;
    });

    expect(targetTabId).not.toBeNull();

    await popupPage.evaluate((tabId) => {
      const originalQuery = chrome.tabs.query.bind(chrome.tabs);
      const originalSendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
      const originalClose = window.close.bind(window);

      window.__culmsSentMessage = null;
      window.__culmsClosed = false;

      chrome.tabs.query = async () => [{ id: tabId }];
      chrome.runtime.sendMessage = async (payload) => {
        window.__culmsSentMessage = payload;
        return { success: true };
      };
      window.close = () => {
        window.__culmsClosed = true;
      };

      window.__culmsRestore = () => {
        chrome.tabs.query = originalQuery;
        chrome.runtime.sendMessage = originalSendMessage;
        window.close = originalClose;
      };
    }, targetTabId);

    await popupPage.locator(DISABLE_BUTTON).click();

    await expect
      .poll(async () => {
        return popupPage.evaluate(() => ({
          message: window.__culmsSentMessage,
          closed: window.__culmsClosed,
        }));
      })
      .toEqual({
        message: { action: 'BYPASS_EXTENSION_ONCE', tabId: targetTabId },
        closed: true,
      });

    await popupPage.evaluate(() => {
      window.__culmsRestore?.();
    });
    await popupPage.close();
  });
});
