/**
 * Скрытие архивных заданий раньше выбранной даты — на поддельной таблице задач.
 *
 * Граница задаётся полем даты в панели над таблицей архива и действует только
 * там: активные задачи она не трогает.
 *
 * Логин в ЛМС и расширение тут не нужны: `tasks_fix.js` — обычный скрипт
 * страницы, он берёт данные из DOM, из `/api/micro-lms/tasks/student` и из
 * `browser.storage.sync`. Всё три подменяются заглушками, а сам скрипт
 * выполняется настоящий — иначе проверялась бы копия логики, а не она сама.
 * Стенд общий с тестом ручного скрытия и лежит в `helpers/tasks-page.ts`.
 *
 * Разбор дат отдельно закреплён в `tests/source/hide-tasks-before-date.test.ts`;
 * здесь проверяется то, что можно увидеть только в браузере: какие строки
 * реально пропадают со страницы, что активная страница остаётся нетронутой и
 * что граница применяется без перезагрузки.
 *
 * Запуск:
 *   bunx playwright test tests/tasks-hide-before-date.test.ts
 */

import { test, expect, type Page } from '@playwright/test';
import {
  asSettingValue,
  daysFromToday,
  openTasksPage as openPage,
  visibleTasks,
  type Row,
} from './helpers/tasks-page.js';

// Пятая строка — задание без дедлайна: судить о нём не по чему, и прятать его
// нельзя ни при какой границе.
const ROWS: Row[] = [
  { name: 'ДЗ 1. Позапрошлое', course: 'Матан', deadline: daysFromToday(-40), inApi: true },
  // Намеренно мимо API: дату придётся читать из видимого текста строки.
  { name: 'ДЗ 2. Старое', course: 'Матан', deadline: daysFromToday(-20), inApi: false },
  { name: 'Семинар 3', course: 'Линал', deadline: daysFromToday(-9), inApi: true },
  { name: 'ДЗ 4. Свежее', course: 'Матан', deadline: daysFromToday(5), inApi: true },
  { name: 'Без дедлайна', course: 'Линал', deadline: null, inApi: true },
];

const BORDER = asSettingValue(daysFromToday(-15));

/**
 * Стенд из `helpers/tasks-page.ts` со строками этого файла по умолчанию.
 * По умолчанию — архив: граница по дате действует только там.
 */
const openTasksPage = (
  page: Page,
  options: { archived?: boolean; enabled: boolean; date: string; rows?: Row[] }
) => openPage(page, { archived: true, ...options, rows: options.rows || ROWS });

const SURVIVORS = ['Семинар 3', 'ДЗ 4. Свежее', 'Без дедлайна'];
const ALL = ROWS.map((row) => row.name);

test('архив: строки с дедлайном раньше границы пропадают', async ({ page }) => {
  await openTasksPage(page, { enabled: true, date: BORDER });

  // «ДЗ 2. Старое» нет в API — значит дату прочитали из видимого текста.
  await expect.poll(() => visibleTasks(page)).toEqual(SURVIVORS);
});

test('точный дедлайн из API попадает на строку архива', async ({ page }) => {
  await openTasksPage(page, { enabled: true, date: BORDER });
  await expect.poll(() => visibleTasks(page)).toEqual(SURVIVORS);

  const stamped = await page.evaluate(() =>
    Array.from(document.querySelectorAll('tr.task-table__task')).map((row) => ({
      name: row.querySelector('.task-table__task-name')!.textContent!.trim(),
      deadline: (row as HTMLElement).dataset.culmsDeadline || null,
    }))
  );

  // В видимом тексте года нет, поэтому точное значение держим на строке.
  expect(stamped.find((row) => row.name === 'Семинар 3')!.deadline).toBeTruthy();
  // Задания вне API остаются без атрибута — для них работает разбор текста.
  expect(stamped.find((row) => row.name === 'ДЗ 2. Старое')!.deadline).toBeNull();
});

test('активные задачи граница по дате не трогает', async ({ page }) => {
  await openTasksPage(page, { archived: false, enabled: true, date: BORDER });

  // Дожидаемся, пока скрипт перестроит таблицу, и только потом смотрим.
  await expect(page.locator('[data-culms-weight-header]')).toHaveCount(1);
  await expect.poll(() => visibleTasks(page)).toEqual(ALL);
  expect(await page.locator('[data-culms-hidden-before-date]').count()).toBe(0);
});

test('дату выбирают в панели над архивом', async ({ page }) => {
  await openTasksPage(page, { enabled: false, date: '' });
  const toolbar = page.locator('#culms-archive-toolbar');
  const dateInput = toolbar.getByLabel('Скрывать задачи с дедлайном раньше даты');
  await expect(dateInput).toHaveValue('');

  await dateInput.fill(BORDER);
  await expect.poll(() => visibleTasks(page)).toEqual(SURVIVORS);
  expect(await page.evaluate(() => (window as any).__sync)).toEqual({
    enabled: true,
    date: BORDER,
  });

  await toolbar.getByRole('button', { name: 'Не скрывать по дате' }).click();
  await expect.poll(() => visibleTasks(page)).toEqual(ALL);
  await expect(dateInput).toHaveValue('');
  expect(await page.evaluate(() => (window as any).__sync)).toEqual({ enabled: false, date: '' });
});

test('сохранённая дата стоит в поле при открытии архива', async ({ page }) => {
  await openTasksPage(page, { enabled: true, date: BORDER });
  await expect(page.getByLabel('Скрывать задачи с дедлайном раньше даты')).toHaveValue(BORDER);
});

// Ради этого теста всё и переделывалось: в архиве LMS печатает дедлайн без
// года, а лежат там несколько лет сразу. На живой странице из 694 строк 302
// угадывались не тем годом, поэтому дедлайны архива берутся из API.
test('архив: год берётся из API, а не угадывается по тексту', async ({ page }) => {
  // Тот же день и месяц, что и у свежего задания, но годом раньше: по тексту
  // («14 ...») их не различить вообще никак.
  const lastYear = daysFromToday(-5);
  lastYear.setFullYear(lastYear.getFullYear() - 1);
  const thisYear = daysFromToday(-5);

  const rows: Row[] = [
    { name: 'Прошлогоднее', course: 'Матан', deadline: lastYear, inApi: true },
    { name: 'Свежее', course: 'Матан', deadline: thisYear, inApi: true },
  ];

  // Граница — начало текущего года: прошлогоднее обязано пропасть, свежее нет.
  const border = `${thisYear.getFullYear()}-01-01`;
  await openTasksPage(page, { enabled: true, date: border, rows });

  await expect.poll(() => visibleTasks(page)).toEqual(['Свежее']);

  // И проверяем, что дата действительно приехала из API, а не совпала случайно.
  const stamped = await page.evaluate(() =>
    Array.from(document.querySelectorAll('tr.task-table__task')).map(
      (row) => (row as HTMLElement).dataset.culmsDeadline || null
    )
  );
  expect(stamped.every(Boolean)).toBe(true);
});

test('выключенная настройка ничего не прячет', async ({ page }) => {
  await openTasksPage(page, { enabled: false, date: BORDER });
  await expect.poll(() => visibleTasks(page)).toEqual(ALL);
});

test('невыбранная дата ничего не прячет', async ({ page }) => {
  await openTasksPage(page, { enabled: true, date: '' });
  await expect.poll(() => visibleTasks(page)).toEqual(ALL);
});

test('смена настройки применяется без перезагрузки', async ({ page }) => {
  await openTasksPage(page, { enabled: true, date: BORDER });
  await expect.poll(() => visibleTasks(page)).toEqual(SURVIVORS);

  await page.evaluate(() => (window as any).__changeSetting(false, ''));
  await expect.poll(() => visibleTasks(page)).toEqual(ALL);

  // И обратно: строки, спрятанные прошлым проходом, должны вернуться и уйти.
  await page.evaluate((date) => (window as any).__changeSetting(true, date), BORDER);
  await expect.poll(() => visibleTasks(page)).toEqual(SURVIVORS);
});

test('сдвиг границы назад возвращает строки на экран', async ({ page }) => {
  await openTasksPage(page, { enabled: true, date: BORDER });
  await expect.poll(() => visibleTasks(page)).toEqual(SURVIVORS);

  const earlier = asSettingValue(daysFromToday(-30));
  await page.evaluate((date) => (window as any).__changeSetting(true, date), earlier);
  await expect
    .poll(() => visibleTasks(page))
    .toEqual(['ДЗ 2. Старое', 'Семинар 3', 'ДЗ 4. Свежее', 'Без дедлайна']);
});

test('сам день границы остаётся видимым', async ({ page }) => {
  // Граница — полночь этого дня, сравнение строгое: дедлайн в 22:00 того же
  // дня ещё не «раньше».
  const sameDay = asSettingValue(daysFromToday(-9));
  await openTasksPage(page, { enabled: true, date: sameDay });
  await expect.poll(() => visibleTasks(page)).toContain('Семинар 3');
});
