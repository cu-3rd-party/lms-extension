import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  clearExtensionStorage,
} from './helpers/fixtures.js';

const COURSES_PAGE = `${LMS_URL}/learn/courses/view/actual`;

// Курсы из расписания плагина — найдём первый доступный у пользователя
const SCHEDULED_COURSES = [
  'Английский язык 103S2B',
  'Английский язык 103S2',
  'Английский язык 102S2',
  'Дискретная математика',
  'Kotlin',
];

test.describe('Future exams view', () => {
  test.setTimeout(90_000);

  test.afterEach(async ({ context, extensionId }) => {
    await clearExtensionStorage(context, extensionId, 'sync', 'futureExamsViewToggle');
  });

  test('показывает предстоящие контрольные на странице курса', async ({
    page,
    context,
    extensionId,
  }) => {
    // ── Шаг 1: Включаем фичу ─────────────────────────────────────────────
    await setExtensionStorage(context, extensionId, 'sync', 'futureExamsViewToggle', true);

    // ── Шаг 2: Находим курс из расписания в списке активных курсов ───────
    await page.goto(COURSES_PAGE);
    await page.waitForSelector('ul.course-list.course-archiver-ready', { timeout: 10_000 });

    let courseId: string | null = null;

    for (const courseName of SCHEDULED_COURSES) {
      const card = page
        .locator('li.course-list__item:visible')
        .filter({ has: page.locator('.course-name', { hasText: courseName }) })
        .first();

      if (await card.isVisible()) {
        courseId = await card.getAttribute('data-course-id');
        console.log(`Нашли курс: "${courseName}" (id=${courseId})`);
        break;
      }
    }

    if (!courseId) {
      test.skip(true, 'Ни один курс из расписания не найден в списке активных курсов');
    }

    // ── Шаг 3: Переходим на страницу курса ───────────────────────────────
    await page.goto(`${COURSES_PAGE}/${courseId}`);

    // ── Шаг 4: Ждём аккордеон (рендерит Angular) ─────────────────────────
    await page.waitForSelector('tui-accordion.cu-accordion.themes-accordion', {
      timeout: 15_000,
    });

    // ── Шаг 5: Проверяем что плагин добавил элементы контрольных ─────────
    const examItems = page.locator('.custom-future-exam-item');
    await expect(examItems.first()).toBeVisible({ timeout: 10_000 });
    console.log(`Найдено элементов контрольных: ${await examItems.count()}`);
  });

  test('не показывает контрольные когда фича выключена', async ({ page }) => {
    // futureExamsViewToggle не установлен → плагин не должен добавлять элементы

    await page.goto(COURSES_PAGE);
    await page.waitForSelector('ul.course-list.course-archiver-ready', { timeout: 10_000 });

    let courseId: string | null = null;
    for (const courseName of SCHEDULED_COURSES) {
      const card = page
        .locator('li.course-list__item:visible')
        .filter({ has: page.locator('.course-name', { hasText: courseName }) })
        .first();
      if (await card.isVisible()) {
        courseId = await card.getAttribute('data-course-id');
        break;
      }
    }

    if (!courseId) {
      test.skip(true, 'Ни один курс из расписания не найден');
    }

    await page.goto(`${COURSES_PAGE}/${courseId}`);
    await page.waitForSelector('tui-accordion.cu-accordion.themes-accordion', {
      timeout: 15_000,
    });

    // Даём время на случай если плагин всё же попытается что-то добавить
    await page.waitForTimeout(2_000);

    await expect(page.locator('.custom-future-exam-item')).toHaveCount(0);
  });
});
