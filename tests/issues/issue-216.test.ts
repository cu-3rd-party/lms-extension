import { test, expect, LMS_URL } from '../helpers/fixtures.js';

const TASKS_PAGE = `${LMS_URL}/learn/tasks/actual-student-tasks`;
const FILTER_KEY = 'cu.lms.actual-student-tasks-custom-filter';

async function waitForTasksLoaded(page) {
  // state: 'attached' — достаточно, чтобы строки появились в DOM (некоторые могут быть скрыты фильтром)
  await page.waitForSelector('tr[class*="task-table__task"]', { state: 'attached', timeout: 15_000 });
  await page.waitForSelector('[data-culms-weight-cell]', { state: 'attached', timeout: 10_000 });
}

async function getVisibleTaskRows(page) {
  return page.locator('tr[class*="task-table__task"]').filter({ has: page.locator(':not([style*="display: none"])') }).evaluateAll((rows) =>
    rows.filter((r) => r.style.display !== 'none').length
  );
}

async function getTotalTaskRows(page) {
  return page.locator('tr[class*="task-table__task"]').count();
}

async function getCurrentCourseNames(page): Promise<string[]> {
  return page.locator('tr[class*="task-table__task"] .task-table__course-name').evaluateAll(
    (els) => [...new Set(els.map((el) => el.textContent.trim()).filter(Boolean))]
  );
}

test.describe('Issue #216: фильтр курсов при смене семестра', () => {
  test.setTimeout(60_000);

  test('старый формат без knownCourses: все задачи видны после перезагрузки', async ({ page }) => {
    await page.goto(TASKS_PAGE);
    await waitForTasksLoaded(page);

    const total = await getTotalTaskRows(page);
    expect(total).toBeGreaterThan(0);

    // Имитируем старый формат localStorage — без knownCourses, с несуществующими курсами
    await page.evaluate((key) => {
      const stale = {
        statuses: ['В работе', 'Есть решение', 'На проверке', 'Не начато', 'Аудиторная', 'Метод скипа', 'Доработка'],
        courses: ['Математический анализ. 1 семестр', 'Линейная алгебра. 1 семестр'],
        // knownCourses отсутствует — старый формат
        timestamp: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      };
      localStorage.setItem(key, JSON.stringify(stale));
    }, FILTER_KEY);

    await page.reload();
    await waitForTasksLoaded(page);

    const visible = await getVisibleTaskRows(page);
    expect(visible).toBe(total);
  });

  test('курсы нового семестра автоматически выбираются', async ({ page }) => {
    await page.goto(TASKS_PAGE);
    await waitForTasksLoaded(page);

    const currentCourses = await getCurrentCourseNames(page);
    expect(currentCourses.length).toBeGreaterThan(0);

    // Имитируем состояние после смены семестра:
    // knownCourses содержит только старые курсы, которых нет в DOM
    await page.evaluate(({ key, courses }) => {
      const stale = {
        statuses: ['В работе', 'Есть решение', 'На проверке', 'Не начато', 'Аудиторная', 'Метод скипа', 'Доработка'],
        courses: ['Старый курс 1 семестра', 'Ещё один старый курс'],
        knownCourses: ['Старый курс 1 семестра', 'Ещё один старый курс'],
        timestamp: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      };
      localStorage.setItem(key, JSON.stringify(stale));
    }, { key: FILTER_KEY, courses: currentCourses });

    await page.reload();
    await waitForTasksLoaded(page);

    const total = await getTotalTaskRows(page);
    const visible = await getVisibleTaskRows(page);
    expect(visible).toBe(total);
  });

  test('явно снятый пользователем курс остаётся снятым после перезагрузки', async ({ page }) => {
    await page.goto(TASKS_PAGE);
    await waitForTasksLoaded(page);

    const currentCourses = await getCurrentCourseNames(page);
    expect(currentCourses.length).toBeGreaterThan(1);

    const deselectedCourse = currentCourses[0];
    const selectedCourses = currentCourses.slice(1);

    // Имитируем ситуацию: пользователь снял один курс
    // knownCourses содержит ВСЕ текущие курсы — значит курс известен, но снят намеренно
    await page.evaluate(({ key, selected, known }) => {
      localStorage.setItem(key, JSON.stringify({
        statuses: ['В работе', 'Есть решение', 'На проверке', 'Не начато', 'Аудиторная', 'Метод скипа', 'Доработка'],
        courses: selected,
        knownCourses: known,
        timestamp: new Date().toISOString(),
      }));
    }, { key: FILTER_KEY, selected: selectedCourses, known: currentCourses });

    await page.reload();
    await waitForTasksLoaded(page);

    // Задачи снятого курса должны быть скрыты
    const hiddenRows = await page.locator('tr[class*="task-table__task"]').evaluateAll(
      (rows, course) => rows.filter(
        (r) => r.style.display === 'none' &&
               r.querySelector('.task-table__course-name')?.textContent.trim() === course
      ).length,
      deselectedCourse
    );

    const totalForCourse = await page.locator('tr[class*="task-table__task"]').evaluateAll(
      (rows, course) => rows.filter(
        (r) => r.querySelector('.task-table__course-name')?.textContent.trim() === course
      ).length,
      deselectedCourse
    );

    expect(totalForCourse).toBeGreaterThan(0);
    expect(hiddenRows).toBe(totalForCourse);
  });
});
