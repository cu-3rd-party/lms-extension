import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  clearExtensionStorage,
} from '../helpers/fixtures.js';

const COURSES_PAGE = `${LMS_URL}/learn/courses/view/actual`;
const STYLE_ID = 'culms-dark-theme-style-base';
const TEST_CARD_ID = 'culms-test-custom-cover-card';
const CUSTOM_COLOR = 'rgb(12, 34, 56)';

test.describe('Issue #184: custom course cover color in dark theme', () => {
  test.afterEach(async ({ context, extensionId }) => {
    await clearExtensionStorage(context, extensionId, 'sync', 'themeEnabled');
  });

  test('сохраняет индивидуальный цвет обложки курса из --cu-island-cover-bg', async ({
    page,
    context,
    extensionId,
  }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'themeEnabled', true);

    await page.goto(COURSES_PAGE);
    await expect(page.locator(`#${STYLE_ID}`)).toBeAttached({ timeout: 10_000 });

    await page.evaluate(
      ({ testCardId, customColor }) => {
        document.getElementById(testCardId)?.remove();

        const card = document.createElement('div');
        card.id = testCardId;
        card.className = 'course-card withoutCategory';
        card.style.setProperty('--cu-island-cover-bg', customColor);
        card.style.backgroundColor = 'rgb(255, 255, 255)';
        document.body.append(card);
      },
      { testCardId: TEST_CARD_ID, customColor: CUSTOM_COLOR }
    );

    await expect
      .poll(async () => {
        return page.locator(`#${TEST_CARD_ID}`).evaluate((card) => {
          return getComputedStyle(card).backgroundColor;
        });
      })
      .toBe(CUSTOM_COLOR);
  });
});
