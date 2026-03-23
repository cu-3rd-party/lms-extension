import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  clearExtensionStorage,
} from '../helpers/fixtures.js';

const PAGE = `${LMS_URL}/learn/courses/view/actual`;
const STYLE_ID = 'culms-dark-theme-style-base';
const HOST_ID = 'culms-test-statements-links';

test.describe('Issue #192: statements links in dark theme', () => {
  test.afterEach(async ({ context, extensionId, page }) => {
    await page.evaluate((hostId) => {
      document.getElementById(hostId)?.remove();
    }, HOST_ID);
    await clearExtensionStorage(context, extensionId, 'sync', 'themeEnabled');
  });

  test('оставляет ссылки в таблице синими, а обычный текст белым', async ({
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
            <td id="plain-cell">Обычный текст</td>
            <td><a href="#culms-statement-link"><span>Ссылка на задачу</span></a></td>
          </tr>
        </tbody>
      `;
      document.body.append(host);
    }, HOST_ID);

    await expect
      .poll(async () => {
        return page.evaluate((hostId) => {
          const host = document.getElementById(hostId);
          const plain = host?.querySelector('#plain-cell');
          const linkSpan = host?.querySelector('a span');

          return {
            plainColor: plain ? getComputedStyle(plain).color : '',
            linkColor: linkSpan ? getComputedStyle(linkSpan).color : '',
          };
        }, HOST_ID);
      })
      .toEqual({
        plainColor: 'rgb(255, 255, 255)',
        linkColor: 'rgb(138, 180, 248)',
      });
  });
});
