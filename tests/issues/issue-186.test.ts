import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  clearExtensionStorage,
} from '../helpers/fixtures.js';

const PAGE = `${LMS_URL}/learn/courses/view/actual`;
const STYLE_ID = 'culms-dark-theme-style-base';
const EDITOR_ID = 'culms-test-editor';

test.describe('Issue #186: dark-theme link contrast', () => {
  test.afterEach(async ({ context, extensionId, page }) => {
    await page.evaluate((editorId) => {
      document.getElementById(editorId)?.remove();
    }, EDITOR_ID);
    await clearExtensionStorage(context, extensionId, 'sync', 'themeEnabled');
  });

  test('делает ссылки заметно синими на фоне обычного текста', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'themeEnabled', true);

    await page.goto(PAGE);
    await expect(page.locator(`#${STYLE_ID}`)).toBeAttached({ timeout: 10_000 });

    await page.evaluate((editorId) => {
      const editor = document.createElement('div');
      editor.id = editorId;
      editor.className = 'tiptap ProseMirror';
      editor.innerHTML =
        '<p id="plain-text">Обычный текст</p><p><a href="#culms-link">Проверка ссылки</a></p>';
      document.body.append(editor);
    }, EDITOR_ID);

    await expect
      .poll(async () => {
        return page.locator(`#${EDITOR_ID} a`).evaluate((anchor) => {
          const plainText = document.getElementById('plain-text');
          return {
            linkColor: getComputedStyle(anchor).color,
            plainTextColor: plainText ? getComputedStyle(plainText).color : '',
          };
        });
      })
      .toEqual({
        linkColor: 'rgb(138, 180, 248)',
        plainTextColor: 'rgb(255, 255, 255)',
      });
  });
});
