/**
 * Скрытие заданий раньше выбранной даты — на поддельной таблице задач.
 *
 * Логин в ЛМС и расширение тут не нужны: `tasks_fix.js` — обычный скрипт
 * страницы, он берёт данные из DOM, из `/api/micro-lms/tasks/student` и из
 * `browser.storage.sync`. Всё три подменяются заглушками, а сам скрипт
 * выполняется настоящий — иначе проверялась бы копия логики, а не она сама.
 *
 * Разбор дат отдельно закреплён в `tests/source/hide-tasks-before-date.test.ts`;
 * здесь проверяется то, что можно увидеть только в браузере: какие строки
 * реально пропадают со страницы, что архивная страница ведёт себя так же и что
 * настройка применяется без перезагрузки.
 *
 * Запуск:
 *   bunx playwright test tests/tasks-hide-before-date.test.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tasksFix = readFileSync(
  resolve(__dirname, '..', 'src', 'plugins', 'courses', 'tasks_fix.js'),
  'utf8'
);

// LMS пишет месяц сокращённо и без года — ровно так, как их придётся
// разбирать, когда задание не нашлось в API.
const SHORT_MONTHS = [
  'янв.',
  'февр.',
  'мар.',
  'апр.',
  'мая',
  'июн.',
  'июл.',
  'авг.',
  'сент.',
  'окт.',
  'нояб.',
  'дек.',
];

/** Дедлайны считаем от сегодня: год в тексте угадывается по близости к нему. */
function daysFromToday(offset: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(22, 0, 0, 0);
  return date;
}

const asVisibleText = (date: Date) =>
  `Пн, ${date.getDate()} ${SHORT_MONTHS[date.getMonth()]} 22:00`;

const asSettingValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

type Row = { name: string; course: string; deadline: Date | null; inApi: boolean };

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
 * Разметка двух страниц различается, и это важно: в архиве имя и курс лежат
 * внутри одной ячейки `.task-table__info`, а не отдельными `td`. Снято с живой
 * страницы `/learn/tasks/archived-student-tasks`.
 */
function tableHtml(archived: boolean, rowsData: Row[] = ROWS): string {
  const cells = (row: Row) =>
    archived
      ? `<td class="task-table__info">
           <div class="task-table__names">
             <div class="task-table__task-name">${row.name}</div>
             <div class="task-table__course-name">${row.course}</div>
           </div>
         </td>`
      : `<td class="task-table__task-name">${row.name}</td>
         <td class="task-table__course-name">${row.course}</td>`;

  const rows = rowsData
    .map(
      (row) => `
    <tr class="task-table__task">
      ${cells(row)}
      <td class="task-table__state"><cu-task-state-badge><span>Задано</span></cu-task-state-badge></td>
      <td class="task-table__score">-/10</td>
      <td class="task-table__deadline">${row.deadline ? asVisibleText(row.deadline) : ''}</td>
      <td class="task-table__late-days"></td>
    </tr>`
    )
    .join('');

  return `<!doctype html><html lang="ru"><body>
    <table class="task-table">
      <thead>
        <tr class="task-table__header">
          <th class="task-table__task-name">Задание</th>
          <th class="task-table__course-name">Курс</th>
          <th class="task-table__state">Статус</th>
          <th class="task-table__score">Баллы</th>
          <th class="task-table__deadline">Дедлайн</th>
          <th class="task-table__late-days"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`;
}

const apiTasks = (rowsData: Row[] = ROWS) =>
  rowsData
    .filter((row) => row.inApi)
    .map((row, index) => ({
      id: 100 + index,
      deadline: row.deadline ? row.deadline.toISOString() : null,
      score: null,
      exercise: {
        id: 200 + index,
        name: row.name,
        maxScore: 10,
        activity: { id: 1, name: 'Домашние задания', weight: 0.4 },
      },
      course: { id: 1, name: row.course },
    }));

/**
 * Поднимает страницу с таблицей и запускает на ней настоящий `tasks_fix.js`.
 * Адрес важен: архивную страницу плагин узнаёт по `location.href`.
 */
async function openTasksPage(
  page: Page,
  options: { archived?: boolean; enabled: boolean; date: string; rows?: Row[] }
) {
  const archived = !!options.archived;
  const rowsData = options.rows || ROWS;
  const path = archived ? '/learn/tasks/archived-student-tasks' : '/learn/tasks';
  await page.route('**/*', (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: tableHtml(archived, rowsData) })
  );
  await page.goto(`https://lms.test${path}`);

  await page.evaluate(
    ({ tasks, enabled, date, isArchive }) => {
      const state = { enabled, date };
      const listeners: Array<(changes: Record<string, unknown>) => void> = [];

      (window as any).cuLmsLog = () => {};
      (window as any).waitForElement = (selector: string) =>
        Promise.resolve(document.querySelector(selector));

      (window as any).browser = {
        storage: {
          sync: {
            get: (keys: string | string[]) => {
              const all: Record<string, unknown> = {
                hideTasksBeforeEnabled: state.enabled,
                hideTasksBeforeDate: state.date,
              };
              const wanted = Array.isArray(keys) ? keys : [keys];
              const out: Record<string, unknown> = {};
              wanted.forEach((key) => {
                if (key in all) out[key] = all[key];
              });
              return Promise.resolve(out);
            },
          },
          onChanged: {
            addListener: (fn: (c: Record<string, unknown>) => void) => listeners.push(fn),
          },
        },
        runtime: { getURL: (path: string) => `https://lms.test/${path}` },
      };

      // Смена настройки из попапа: пишем новое значение и будим слушателей.
      (window as any).__changeSetting = (nextEnabled: boolean, nextDate: string) => {
        state.enabled = nextEnabled;
        state.date = nextDate;
        listeners.forEach((fn) =>
          fn({
            hideTasksBeforeEnabled: { newValue: nextEnabled },
            hideTasksBeforeDate: { newValue: nextDate },
          })
        );
      };

      const realFetch = window.fetch.bind(window);
      window.fetch = ((url: string) => {
        const address = String(url);
        if (address.includes('/api/micro-lms/tasks/student')) {
          // Активные задания и архив LMS просит по разным наборам `state`,
          // и плагин обязан спрашивать тот же адрес, что и сама страница.
          const wantsArchive = address.includes('state=evaluated');
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(wantsArchive === isArchive ? tasks : []),
          });
        }
        if (address.includes('/icons/')) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve('<svg></svg>') });
        }
        return realFetch(url);
      }) as typeof window.fetch;
    },
    { tasks: apiTasks(rowsData), enabled: options.enabled, date: options.date, isArchive: archived }
  );

  await page.evaluate(tasksFix);
}

/** Названия заданий, которые сейчас реально видны на странице. */
async function visibleTasks(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('tr.task-table__task'))
      .filter((row) => (row as HTMLElement).style.display !== 'none')
      .map((row) => row.querySelector('.task-table__task-name')!.textContent!.trim())
  );
}

const SURVIVORS = ['Семинар 3', 'ДЗ 4. Свежее', 'Без дедлайна'];
const ALL = ROWS.map((row) => row.name);

test('активные задачи: строки с дедлайном раньше границы пропадают', async ({ page }) => {
  await openTasksPage(page, { enabled: true, date: BORDER });

  // «ДЗ 2. Старое» нет в API — значит дату прочитали из видимого текста.
  await expect.poll(() => visibleTasks(page)).toEqual(SURVIVORS);
});

test('точный дедлайн из API попадает на строку', async ({ page }) => {
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

test('архивные задачи прячутся по той же границе', async ({ page }) => {
  await openTasksPage(page, { archived: true, enabled: true, date: BORDER });

  // На архивной странице плагин снимает с себя всё остальное, но скрытие по
  // дате обязано работать — иначе настройка прячет задания только наполовину.
  await expect.poll(() => visibleTasks(page)).toEqual(SURVIVORS);
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
  await openTasksPage(page, { archived: true, enabled: true, date: border, rows });

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
