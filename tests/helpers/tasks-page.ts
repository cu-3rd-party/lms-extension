/**
 * Поддельная страница задач LMS для тестов `tasks_fix.js` без логина.
 *
 * `tasks_fix.js` — обычный скрипт страницы: он берёт данные из DOM, из
 * `/api/micro-lms/tasks/student` и из `browser.storage`. Здесь всё это
 * подменяется заглушками, а сам скрипт выполняется настоящий — иначе
 * проверялась бы копия логики, а не она сама.
 */

import type { Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tasksFix = readFileSync(
  resolve(__dirname, '..', '..', 'src', 'plugins', 'courses', 'tasks_fix.js'),
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
export function daysFromToday(offset: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(22, 0, 0, 0);
  return date;
}

export const asVisibleText = (date: Date) =>
  `Пн, ${date.getDate()} ${SHORT_MONTHS[date.getMonth()]} 22:00`;

export const asSettingValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

export type Row = { name: string; course: string; deadline: Date | null; inApi: boolean };

/**
 * Разметка двух страниц различается, и это важно: в архиве имя и курс лежат
 * внутри одной ячейки `.task-table__info`, а не отдельными `td`. Снято с живой
 * страницы `/learn/tasks/archived-student-tasks`.
 */
function tableHtml(archived: boolean, rowsData: Row[]): string {
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

  // Строки в LMS — ссылки на задание: режим выбора обязан их перехватывать.
  const rows = rowsData
    .map(
      (row, index) => `
    <tr class="task-table__task" onclick="window.__openedTask = ${index}">
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

/** id задачи в заглушке API: 100, 101, … по порядку строк, попавших в API. */
const apiTasks = (rowsData: Row[]) =>
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

export type TasksPageOptions = {
  archived?: boolean;
  enabled: boolean;
  date: string;
  rows: Row[];
  /** Начальное содержимое `browser.storage.local`. */
  local?: Record<string, unknown>;
};

/**
 * Поднимает страницу с таблицей и запускает на ней настоящий `tasks_fix.js`.
 * Адрес важен: архивную страницу плагин узнаёт по `location.href`.
 *
 * На странице остаются помощники:
 *   `__changeSetting(enabled, date)` — смена границы из другой вкладки;
 *   `__sync` — граница скрытия по дате, как она лежит в `storage.sync`;
 *   `__local` — что сейчас лежит в `storage.local`.
 */
export async function openTasksPage(page: Page, options: TasksPageOptions) {
  const archived = !!options.archived;
  const path = archived ? '/learn/tasks/archived-student-tasks' : '/learn/tasks';
  await page.route('**/*', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: tableHtml(archived, options.rows),
    })
  );
  await page.goto(`https://lms.test${path}`);

  await page.evaluate(
    ({ tasks, enabled, date, isArchive, local }) => {
      const state = { enabled, date };
      (window as any).__sync = state;
      const localState: Record<string, unknown> = { ...local };
      (window as any).__local = localState;
      const listeners: Array<(changes: Record<string, unknown>, area: string) => void> = [];

      (window as any).cuLmsLog = () => {};
      (window as any).waitForElement = (selector: string) =>
        Promise.resolve(document.querySelector(selector));

      const pick = (all: Record<string, unknown>, keys: string | string[]) => {
        const wanted = Array.isArray(keys) ? keys : [keys];
        const out: Record<string, unknown> = {};
        wanted.forEach((key) => {
          if (key in all) out[key] = all[key];
        });
        return out;
      };

      (window as any).browser = {
        storage: {
          sync: {
            get: (keys: string | string[]) =>
              Promise.resolve(
                pick(
                  { hideTasksBeforeEnabled: state.enabled, hideTasksBeforeDate: state.date },
                  keys
                )
              ),
            set: (values: { hideTasksBeforeEnabled?: boolean; hideTasksBeforeDate?: string }) => {
              const changes: Record<string, unknown> = {};
              if ('hideTasksBeforeEnabled' in values) {
                state.enabled = !!values.hideTasksBeforeEnabled;
                changes.hideTasksBeforeEnabled = { newValue: state.enabled };
              }
              if ('hideTasksBeforeDate' in values) {
                state.date = values.hideTasksBeforeDate || '';
                changes.hideTasksBeforeDate = { newValue: state.date };
              }
              listeners.forEach((fn) => fn(changes, 'sync'));
              return Promise.resolve();
            },
          },
          local: {
            get: (keys: string | string[]) =>
              Promise.resolve(JSON.parse(JSON.stringify(pick(localState, keys)))),
            set: (values: Record<string, unknown>) => {
              const changes: Record<string, unknown> = {};
              Object.entries(values).forEach(([key, value]) => {
                const copy = JSON.parse(JSON.stringify(value));
                changes[key] = { oldValue: localState[key], newValue: copy };
                localState[key] = copy;
              });
              listeners.forEach((fn) => fn(changes, 'local'));
              return Promise.resolve();
            },
          },
          onChanged: {
            addListener: (fn: (c: Record<string, unknown>, area: string) => void) =>
              listeners.push(fn),
          },
        },
        runtime: { getURL: (path: string) => `https://lms.test/${path}` },
      };

      // Смена границы извне (другая вкладка, загрузка профиля): пишем новое
      // значение и будим слушателей.
      (window as any).__changeSetting = (nextEnabled: boolean, nextDate: string) => {
        state.enabled = nextEnabled;
        state.date = nextDate;
        listeners.forEach((fn) =>
          fn(
            {
              hideTasksBeforeEnabled: { newValue: nextEnabled },
              hideTasksBeforeDate: { newValue: nextDate },
            },
            'sync'
          )
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
    {
      tasks: apiTasks(options.rows),
      enabled: options.enabled,
      date: options.date,
      isArchive: archived,
      local: options.local || {},
    }
  );

  await page.evaluate(tasksFix);
}

/** Названия заданий, которые сейчас реально видны на странице. */
export async function visibleTasks(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('tr.task-table__task'))
      .filter((row) => (row as HTMLElement).style.display !== 'none')
      .map((row) => row.querySelector('.task-table__task-name')!.textContent!.trim())
  );
}
