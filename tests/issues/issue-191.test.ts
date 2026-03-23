import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  clearExtensionStorage,
} from '../helpers/fixtures.js';

const PAGE = `${LMS_URL}/learn/courses/view/actual`;
const STYLE_ID = 'culms-dark-theme-style-base';
const HOST_ID = 'culms-test-rich-text-list';

test.describe('Issue #191: ordered-list markers in dark theme', () => {
  test.afterEach(async ({ context, extensionId, page }) => {
    await page.evaluate((hostId) => {
      document.getElementById(hostId)?.remove();
    }, HOST_ID);
    await clearExtensionStorage(context, extensionId, 'sync', 'themeEnabled');
  });

  test('перекрашивает нумерацию списка в светлый цвет', async ({ page, context, extensionId }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'themeEnabled', true);

    await page.goto(PAGE);
    await expect(page.locator(`#${STYLE_ID}`)).toBeAttached({ timeout: 10_000 });

    await page.evaluate((hostId) => {
      const host = document.createElement('div');
      host.id = hostId;
      host.className = 'tiptap ProseMirror';
      host.innerHTML = '<ol><li>Первый пункт</li></ol>';
      document.body.append(host);
    }, HOST_ID);

    await expect
      .poll(async () => {
        return page.locator(`#${HOST_ID} li`).evaluate((item) => {
          return getComputedStyle(item, '::marker').color;
        });
      })
      .toBe('rgb(255, 255, 255)');
  });
});
