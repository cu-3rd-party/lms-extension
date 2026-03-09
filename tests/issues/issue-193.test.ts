import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  clearExtensionStorage,
} from '../helpers/fixtures.js';

const PAGE = `${LMS_URL}/learn/courses/view/actual`;
const STYLE_ID = 'culms-dark-theme-style-base';
const HOST_ID = 'culms-test-statements-statuses';

test.describe('Issue #193: statements statuses in dark theme', () => {
  test.afterEach(async ({ context, extensionId, page }) => {
    await page.evaluate((hostId) => {
      document.getElementById(hostId)?.remove();
    }, HOST_ID);
    await clearExtensionStorage(context, extensionId, 'sync', 'themeEnabled');
  });

  test('применяет темную палитру к чипам статусов в таблице ведомости', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'themeEnabled', true);

    await page.goto(PAGE);
    await expect(page.locator(`#${STYLE_ID}`)).toBeAttached({ timeout: 10_000 });

    await page.evaluate((hostId) => {
      const host = document.createElement('table');
      host.id = hostId;
      host.className = 'cu-table';
      host.innerHTML = `
        <tbody>
          <tr>
            <td><tui-chip data-appearance="positive-pale">Сдано</tui-chip></td>
            <td><tui-chip data-appearance="support-neutral">Не начато</tui-chip></td>
          </tr>
        </tbody>
      `;
      document.body.append(host);
    }, HOST_ID);

    await expect
      .poll(async () => {
        return page.evaluate((hostId) => {
          const host = document.getElementById(hostId);
          const positive = host?.querySelector("tui-chip[data-appearance='positive-pale']");
          const neutral = host?.querySelector("tui-chip[data-appearance='support-neutral']");

          return {
            positiveBg: positive ? getComputedStyle(positive).backgroundColor : '',
            neutralBg: neutral ? getComputedStyle(neutral).backgroundColor : '',
          };
        }, HOST_ID);
      })
      .toEqual({
        positiveBg: 'rgba(30, 142, 62, 0.56)',
        neutralBg: 'rgba(60, 64, 67, 0.72)',
      });
  });
});
