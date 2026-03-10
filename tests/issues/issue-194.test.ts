import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  clearExtensionStorage,
} from '../helpers/fixtures.js';

const PAGE = `${LMS_URL}/learn/courses/view/actual`;
const STYLE_ID = 'culms-dark-theme-style-base';
const HOST_ID = 'culms-test-empty-state';

test.describe('Issue #194: statements empty-state illustration in dark theme', () => {
  test.afterEach(async ({ context, extensionId, page }) => {
    await page.evaluate((hostId) => {
      document.getElementById(hostId)?.remove();
    }, HOST_ID);
    await clearExtensionStorage(context, extensionId, 'sync', 'themeEnabled');
  });

  test('осветляет черные stroke и fill в SVG пустого состояния', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'themeEnabled', true);

    await page.goto(PAGE);
    await expect(page.locator(`#${STYLE_ID}`)).toBeAttached({ timeout: 10_000 });

    await page.evaluate((hostId) => {
      const host = document.createElement('div');
      host.id = hostId;
      host.className = 'cu-block-status';
      host.innerHTML = `
        <div class="t-block-image">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path id="stroke-path" d="M2 12h20" stroke="#000"></path>
            <rect id="fill-rect" x="4" y="4" width="8" height="8" fill="#000000"></rect>
          </svg>
        </div>
      `;
      document.body.append(host);
    }, HOST_ID);

    await expect
      .poll(async () => {
        return page.evaluate((hostId) => {
          const host = document.getElementById(hostId);
          const strokePath = host?.querySelector('#stroke-path');
          const fillRect = host?.querySelector('#fill-rect');

          return {
            stroke: strokePath ? getComputedStyle(strokePath).stroke : '',
            fill: fillRect ? getComputedStyle(fillRect).fill : '',
          };
        }, HOST_ID);
      })
      .toEqual({
        stroke: 'rgb(232, 234, 237)',
        fill: 'rgb(232, 234, 237)',
      });
  });
});
