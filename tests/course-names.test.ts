// Тест переименования курсов: подмена видна, но плагины получают оригинал.
import {
  test,
  expect,
  LMS_URL,
  setExtensionStorage,
  clearExtensionStorage,
} from './helpers/fixtures.js';

const COURSES_PAGE = `${LMS_URL}/learn/courses/view/actual/all`;
const TASKS_PAGE = `${LMS_URL}/learn/tasks/actual-student-tasks`;
const REPORTS_PAGE = `${LMS_URL}/learn/reports/student-performance/actual/by-semester`;
const CUSTOM_NAME = 'CULMS ТЕСТОВОЕ ИМЯ';

async function firstCourse(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/micro-lms/courses/student?limit=200&offset=0', {
      headers: { accept: 'application/json' },
    });
    const payload = await response.json();
    const first = (payload.items || [])[0];
    return { id: String(first.id), name: first.name as string };
  });
}

test.describe('Свои названия курсов', () => {
  test.setTimeout(60_000);

  test.afterEach(async ({ context, extensionId }) => {
    await clearExtensionStorage(context, extensionId, 'sync', 'customCourseNamesToggle');
    await clearExtensionStorage(context, extensionId, 'local', 'courseNames');
  });

  test('подменяет название в списке курсов и хранит оригинал рядом', async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(COURSES_PAGE);
    await page.waitForSelector('.course-name', { timeout: 15_000 });
    const course = await firstCourse(page);

    await setExtensionStorage(context, extensionId, 'sync', 'customCourseNamesToggle', true);
    await setExtensionStorage(context, extensionId, 'local', 'courseNames', {
      [course.id]: CUSTOM_NAME,
    });

    const renamed = page.locator(`.course-name[data-culms-orig-name="${course.name}"]`);
    await expect(renamed).toHaveText(CUSTOM_NAME, { timeout: 10_000 });
  });

  test('без тумблера названия остаются родными', async ({ page, context, extensionId }) => {
    await page.goto(COURSES_PAGE);
    await page.waitForSelector('.course-name', { timeout: 15_000 });
    const course = await firstCourse(page);

    await setExtensionStorage(context, extensionId, 'local', 'courseNames', {
      [course.id]: CUSTOM_NAME,
    });
    await page.waitForTimeout(1_500);

    await expect(page.locator(`.course-name:text-is("${CUSTOM_NAME}")`)).toHaveCount(0);
  });

  test('в таблице заданий имя подменено, но плагин видит оригинал', async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(COURSES_PAGE);
    await page.waitForSelector('.course-name', { timeout: 15_000 });
    const course = await firstCourse(page);

    await setExtensionStorage(context, extensionId, 'sync', 'customCourseNamesToggle', true);
    await setExtensionStorage(context, extensionId, 'local', 'courseNames', {
      [course.id]: CUSTOM_NAME,
    });

    await page.goto(TASKS_PAGE);
    await page.waitForSelector('tr[class*="task-table__task"]', { timeout: 15_000 });

    const cell = page.locator(`.task-table__course-name:text-is("${CUSTOM_NAME}")`).first();
    // У курса может не быть активных заданий — тогда проверять нечего.
    if ((await cell.count()) === 0) test.skip(true, 'У курса нет активных заданий');

    await expect(cell).toHaveAttribute('data-culms-orig-name', course.name);

    const resolved = await page.evaluate(
      (name) =>
        (
          window as unknown as { cuLmsCourseNames: { toOriginal(t: string): string } }
        ).cuLmsCourseNames.toOriginal(name),
      CUSTOM_NAME
    );
    expect(resolved).toBe(course.name);
  });

  test('подмена не откладывается и переживает перерисовку списка', async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(COURSES_PAGE);
    await page.waitForSelector('.course-name', { timeout: 15_000 });
    const course = await firstCourse(page);

    await setExtensionStorage(context, extensionId, 'sync', 'customCourseNamesToggle', true);
    await setExtensionStorage(context, extensionId, 'local', 'courseNames', {
      [course.id]: CUSTOM_NAME,
    });
    await expect(page.locator(`.course-name:text-is("${CUSTOM_NAME}")`)).toHaveCount(1, {
      timeout: 10_000,
    });

    // Смена вкладки фильтра пересобирает список: подмена обязана вернуться и
    // не должна проходить через кадр с родным названием (`applyAll()` зовётся
    // синхронно в колбэке MutationObserver, то есть до отрисовки).
    const sawOriginal = await page.evaluate(
      async (names) => {
        let seen = false;
        let running = true;
        const check = () => {
          const nodes = Array.from(document.querySelectorAll('.course-name'));
          if (nodes.some((n) => n.textContent?.trim() === names.original)) seen = true;
          if (running) requestAnimationFrame(check);
        };
        check();

        const tab = Array.from(document.querySelectorAll('button, a')).find(
          (el) => el.textContent?.trim() === 'Обязательные'
        );
        (tab as HTMLElement | undefined)?.click();

        await new Promise((resolve) => setTimeout(resolve, 1500));
        running = false;
        return seen;
      },
      { original: course.name }
    );

    expect(sawOriginal).toBe(false);
  });

  test('фильтр «Курс» в заданиях показывает своё название, но фильтрует по настоящему', async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(COURSES_PAGE);
    await page.waitForSelector('.course-name', { timeout: 15_000 });
    const course = await firstCourse(page);

    await setExtensionStorage(context, extensionId, 'sync', 'customCourseNamesToggle', true);
    await setExtensionStorage(context, extensionId, 'local', 'courseNames', {
      [course.id]: CUSTOM_NAME,
    });

    await page.goto(TASKS_PAGE);
    await page.waitForSelector('tr[class*="task-table__task"]', { timeout: 15_000 });

    // Раскрываем фильтр «Курс»: клик по скрытому нативному input не открывает
    // список, поэтому используем клавиатуру, как это делает пользователь.
    const input = page.locator('cu-multiselect-filter.tasks-filter__course input').first();
    await input.focus();
    await input.press('ArrowDown');

    const option = page.locator(`tui-multi-select-option span:text-is("${CUSTOM_NAME}")`).first();
    await expect(option).toBeVisible({ timeout: 10_000 });

    // Рядом с подменой всегда лежит оригинал — по нему фильтр и работает.
    await expect(option).toHaveAttribute('data-culms-orig-name', course.name);

    // Комментарии-якоря Angular внутри опции должны уцелеть: подмена пишет
    // в текстовый узел, а не в textContent.
    const anchors = await option.evaluate(
      (el) => Array.from(el.childNodes).filter((n) => n.nodeType === Node.COMMENT_NODE).length
    );
    expect(anchors).toBeGreaterThan(0);

    // Выбираем курс — свёрнутый чип фильтра тоже должен показать своё название,
    // но подпись «Курс:» рядом с ним обязана уцелеть: в чипе это отдельный
    // текстовый узел, и подменять надо только второй.
    await option.click();
    await page.keyboard.press('Escape');

    const chip = page.locator('.cu-filter-value__first').first();
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toContainText(CUSTOM_NAME);
    await expect(chip).toContainText('Курс:');
    await expect(chip).not.toContainText(course.name);
  });

  test('курс переименован в крошках и внутри темы, и внутри урока', async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(COURSES_PAGE);
    await page.waitForSelector('.course-name', { timeout: 15_000 });
    const course = await firstCourse(page);

    await setExtensionStorage(context, extensionId, 'sync', 'customCourseNamesToggle', true);
    await setExtensionStorage(context, extensionId, 'local', 'courseNames', {
      [course.id]: CUSTOM_NAME,
    });

    // Заходим на страницу курса и проваливаемся в первую тему/урок: там курс
    // становится средним звеном крошек, а не последним.
    await page.goto(`${LMS_URL}/learn/courses/view/actual/${course.id}`);
    const crumbs = page.locator('.breadcrumbs:not(.breadcrumbs_invisible) .breadcrumbs__item');
    await expect(crumbs.filter({ hasText: CUSTOM_NAME })).toHaveCount(1, { timeout: 15_000 });

    const link = page.locator('a[href*="/themes/"][href*="/longreads/"]').first();
    if ((await link.count()) === 0) test.skip(true, 'В курсе нет уроков');
    await link.click();

    await expect(page).toHaveURL(/\/longreads\/\d+/, { timeout: 15_000 });
    await expect(crumbs.filter({ hasText: CUSTOM_NAME })).toHaveCount(1, { timeout: 15_000 });
    // Соседние крошки не задеты: подменяется только совпавшая по названию.
    await expect(crumbs.filter({ hasText: course.name })).toHaveCount(0);
    expect(await crumbs.count()).toBeGreaterThan(3);
  });

  test('в ведомостях имя подменяется в списке и в заголовке ведомости', async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(COURSES_PAGE);
    await page.waitForSelector('.course-name', { timeout: 15_000 });
    const course = await firstCourse(page);

    await page.goto(REPORTS_PAGE);
    // На широком экране список ведомостей — таблица, на узком — карточки.
    await page.waitForSelector('td.name-cell, a.report-card', { timeout: 15_000 });

    const row = page
      .locator(`td.name-cell:text-is("${course.name}"), a.report-card h4:text-is("${course.name}")`)
      .first();
    if ((await row.count()) === 0) test.skip(true, 'У курса нет ведомости в этом семестре');

    await setExtensionStorage(context, extensionId, 'sync', 'customCourseNamesToggle', true);
    await setExtensionStorage(context, extensionId, 'local', 'courseNames', {
      [course.id]: CUSTOM_NAME,
    });

    const renamed = page
      .locator(`[data-culms-orig-name="${course.name}"]`)
      .filter({ hasText: CUSTOM_NAME })
      .first();
    await expect(renamed).toHaveText(CUSTOM_NAME, { timeout: 10_000 });

    // Переход по строке идёт не по тексту, а по id курса, поэтому подмена
    // не должна ломать навигацию.
    await renamed.click();
    await expect(page).toHaveURL(new RegExp(`/student-performance/actual/${course.id}$`));
    await expect(page.locator('cu-student-course-performance h1.title')).toHaveText(CUSTOM_NAME, {
      timeout: 10_000,
    });
    await expect(page.locator('.breadcrumbs__item_last')).toHaveText(CUSTOM_NAME);
  });

  test('сброс названий возвращает родные', async ({ page, context, extensionId }) => {
    await page.goto(COURSES_PAGE);
    await page.waitForSelector('.course-name', { timeout: 15_000 });
    const course = await firstCourse(page);

    await setExtensionStorage(context, extensionId, 'sync', 'customCourseNamesToggle', true);
    await setExtensionStorage(context, extensionId, 'local', 'courseNames', {
      [course.id]: CUSTOM_NAME,
    });
    await expect(page.locator(`.course-name:text-is("${CUSTOM_NAME}")`)).toHaveCount(1, {
      timeout: 10_000,
    });

    await clearExtensionStorage(context, extensionId, 'local', 'courseNames');

    await expect(page.locator(`.course-name:text-is("${CUSTOM_NAME}")`)).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(page.locator('[data-culms-orig-name]')).toHaveCount(0);
  });
});
