import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  clearExtensionStorage,
} from '../helpers/fixtures.js';

const PAGE = `${LMS_URL}/learn/courses/view/actual`;
const STYLE_ID = 'culms-dark-theme-style-base';
const HOST_ID = 'culms-test-status-chips';

test.describe('Issue #190: task status chip colors in dark theme', () => {
  test.afterEach(async ({ context, extensionId, page }) => {
    await page.evaluate((hostId) => {
      document.getElementById(hostId)?.remove();
    }, HOST_ID);
    await clearExtensionStorage(context, extensionId, 'sync', 'themeEnabled');
  });

  test('сохраняет правильные цвета pale-статусов', async ({ page, context, extensionId }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'themeEnabled', true);

    await page.goto(PAGE);
    await expect(page.locator(`#${STYLE_ID}`)).toBeAttached({ timeout: 10_000 });

    await page.evaluate((hostId) => {
      const host = document.createElement('div');
      host.id = hostId;
      host.innerHTML = `
        <tui-chip data-appearance="support-categorical-13-pale">В работе</tui-chip>
        <tui-chip data-appearance="support-categorical-12-pale">На проверке</tui-chip>
      `;
      document.body.append(host);
    }, HOST_ID);

    await expect
      .poll(async () => {
        return page.evaluate((hostId) => {
          const host = document.getElementById(hostId);
          const work = host?.querySelector("tui-chip[data-appearance='support-categorical-13-pale']");
          const review = host?.querySelector("tui-chip[data-appearance='support-categorical-12-pale']");

          return {
            workBg: work ? getComputedStyle(work).backgroundColor : '',
            reviewBg: review ? getComputedStyle(review).backgroundColor : '',
          };
        }, HOST_ID);
      })
      .toEqual({
        workBg: 'rgba(249, 171, 0, 0.56)',
        reviewBg: 'rgba(66, 133, 244, 0.66)',
      });
  });
});
