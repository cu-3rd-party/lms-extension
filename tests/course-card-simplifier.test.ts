import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  clearExtensionStorage,
} from './helpers/fixtures.js';

const COURSES_PAGE = `${LMS_URL}/learn/courses/view/actual`;

test.describe('Course card simplifier', () => {
  test.setTimeout(60_000);

  test.afterEach(async ({ context, extensionId }) => {
    await clearExtensionStorage(context, extensionId, 'sync', 'oldCoursesDesignToggle');
  });

  test('включает упрощённый дизайн карточек', async ({ page, context, extensionId }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'oldCoursesDesignToggle', true);

    await page.goto(COURSES_PAGE);
    await page.waitForSelector('ul.course-list.course-archiver-ready', { timeout: 15_000 });

    const cards = page.locator('.simplified-course-card');
    await expect(cards.first()).toBeAttached({ timeout: 5_000 });

    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    console.log(`Упрощённых карточек: ${count}`);
  });

  test('не показывает упрощённые карточки когда фича выключена', async ({ page }) => {
    // oldCoursesDesignToggle не установлен → стандартный дизайн
    await page.goto(COURSES_PAGE);
    await page.waitForSelector('ul.course-list.course-archiver-ready', { timeout: 15_000 });

    await page.waitForTimeout(1_000);
    await expect(page.locator('.simplified-course-card')).toHaveCount(0);
  });

  test('карточка содержит название курса', async ({ page, context, extensionId }) => {
    await setExtensionStorage(context, extensionId, 'sync', 'oldCoursesDesignToggle', true);

    await page.goto(COURSES_PAGE);
    await page.waitForSelector('ul.course-list.course-archiver-ready', { timeout: 15_000 });

    const firstCard = page.locator('.simplified-course-card').first();
    await expect(firstCard).toBeAttached({ timeout: 5_000 });

    const text = await firstCard.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
    console.log(`Первая карточка: "${text?.trim()}"`);
  });
});
