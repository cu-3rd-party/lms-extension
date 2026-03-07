import { test, expect, LMS_URL, clearExtensionStorage } from './helpers/fixtures.js';

const COURSES_PAGE = `${LMS_URL}/learn/courses/view/actual`;
const ARCHIVED_PAGE = `${LMS_URL}/learn/courses/view/archived`;

test.describe('Archive / Unarchive course', () => {
  test.setTimeout(90_000);

  test.afterEach(async ({ context, extensionId }) => {
    await clearExtensionStorage(context, extensionId, 'local', 'archivedCourseIds');
  });

  test('скрыть первый курс, найти в архиве, вернуть обратно', async ({ page }) => {
    // ── Шаг 1: Открыть список активных курсов ─────────────────────────────
    await page.goto(COURSES_PAGE);
    await page.waitForSelector('ul.course-list.course-archiver-ready', { timeout: 10_000 });

    // ── Шаг 2: Запомнить первую видимую карточку по data-course-id ────────
    const firstCard = page.locator('li.course-list__item:visible').first();
    await expect(firstCard).toBeVisible();

    const courseId = await firstCard.getAttribute('data-course-id');
    const courseName = (
      await firstCard.locator('.course-name.font-text-s-bold').textContent()
    ).trim();

    expect(courseName.length).toBeGreaterThan(0);
    console.log(`Архивируем курс: "${courseName}"`);

    const specificCard = page.locator(`li.course-list__item[data-course-id="${courseId}"]`);

    // ── Шаг 3: Нажать кнопку архива ──────────────────────────────────────
    const archiveButton = firstCard.locator('.archive-action-button');
    await expect(archiveButton).toBeVisible();
    await archiveButton.click();

    // ── Шаг 4: Убедиться что карточка скрылась ────────────────────────────
    await expect(specificCard).toBeHidden({ timeout: 5_000 });

    // ── Шаг 5: Перейти на страницу архивных курсов ────────────────────────
    await page.goto(ARCHIVED_PAGE);

    // ── Шаг 6: Найти заархивированный курс в таблице ──────────────────────
    await page.waitForSelector('table.cu-table tbody', { timeout: 10_000 });

    const archivedRow = page.locator('tr.course-row').filter({
      has: page.locator('.name-cell span', { hasText: courseName }),
    });

    await expect(archivedRow).toBeVisible({ timeout: 5_000 });

    // ── Шаг 7: Разархивировать курс ───────────────────────────────────────
    const unarchiveButton = archivedRow.locator('.unarchive-button');
    await expect(unarchiveButton).toBeVisible();
    await unarchiveButton.click();

    await expect(archivedRow).toBeHidden({ timeout: 5_000 });

    // ── Шаг 8: Вернуться на активные курсы и проверить что курс появился ──
    await page.goto(COURSES_PAGE);
    await expect(specificCard).toBeVisible({ timeout: 5_000 });
  });
});
