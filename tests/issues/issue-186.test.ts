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

  test('сохраняет контрастный синий цвет ссылок даже с вложенным span', async ({
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
        '<p><a href="#culms-link"><span style="color: rgb(255, 255, 255);">Проверка ссылки</span></a></p>';
      document.body.append(editor);
    }, EDITOR_ID);

    await expect
      .poll(async () => {
        return page.locator(`#${EDITOR_ID} a span`).evaluate((span) => {
          const anchor = span.closest('a');
          const spanStyle = getComputedStyle(span);
          const anchorStyle = anchor ? getComputedStyle(anchor) : null;
          return {
            spanColor: spanStyle.color,
            anchorColor: anchorStyle?.color ?? '',
          };
        });
      })
      .toEqual({
        spanColor: 'rgb(138, 180, 248)',
        anchorColor: 'rgb(138, 180, 248)',
      });
  });
});
