import { test, expect, LMS_URL } from './helpers/fixtures.js';

const COURSES_PAGE = `${LMS_URL}/learn/courses/view/actual`;

test.describe('Advanced statements', () => {
  test.setTimeout(60_000);

  async function getFirstCourseId(page: import('@playwright/test').Page): Promise<string | null> {
    await page.goto(COURSES_PAGE);
    await page.waitForSelector('ul.course-list.course-archiver-ready', { timeout: 15_000 });
    return page.locator('li.course-list__item[data-course-id]:visible').first().getAttribute('data-course-id');
  }

  test('не добавляет блок на странице без /activity', async ({ page }) => {
    const courseId = await getFirstCourseId(page);
    if (!courseId) test.skip(true, 'Нет курсов с data-course-id');

    await page.goto(`${LMS_URL}/learn/reports/student-performance/actual/${courseId}`);
    await page.waitForTimeout(3_000);

    await expect(page.locator('#advanced-statements-container')).toHaveCount(0);
  });
});
