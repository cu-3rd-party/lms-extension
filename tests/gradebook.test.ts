/**
 * Вкладка «Сводная таблица» в ведомостях — на поддельной странице.
 *
 * Логин в ЛМС и расширение не нужны: `gradebook.js` — обычный скрипт
 * страницы, данные он берёт из пяти запросов к API и из разметки вкладок
 * Taiga. Запросы подменяются заглушками, разметка снята с живых страниц
 * `/learn/reports/student-performance/{actual,archived}/by-semester`, а сам
 * скрипт и стили — настоящие.
 *
 * Данные подобраны под то, что уже ломалось:
 *   - бонус из 1 балла: LMS делит сумму баллов как есть, без приведения к 10
 *     (0.5 + 0.5 из 15 работ — это 0.06, а не 0.66);
 *   - итог курса выше 10 не поднимается;
 *   - одна строка расписания стартует на неделю раньше остальных — нумерация
 *     недель должна идти от большинства, а не от самой ранней даты;
 *   - служебный «Перезачёт» без веса с нулём не должен красить строку;
 *   - работа на проверке с прошедшим дедлайном входит в «можно было набрать»,
 *     но не в цвет накопа;
 *   - в расписании контрольных короткий ключ «Английский» входит в название
 *     курса «Английский язык» — брать нужно самый длинный подходящий;
 *   - контест узнаётся только по названию задания (активность —
 *     «Соревнование»), а «Пересдача экзамена» без веса важной не считается.
 *
 * Запуск:
 *   bunx playwright test tests/gradebook.test.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(__dirname, '..', 'src', 'plugins', 'statements');
const gradebookJs = readFileSync(resolve(pluginDir, 'gradebook.js'), 'utf8');
const gradebookCss = readFileSync(resolve(pluginDir, 'gradebook.css'), 'utf8');

const ORIGIN = 'https://lms.test';
const statementsPath = (scope: 'actual' | 'archived') =>
  `/learn/reports/student-performance/${scope}/by-semester`;

// --- Даты: всё от сегодняшнего дня, чтобы «текущая неделя» была настоящей ---

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const today = new Date();
today.setHours(12, 0, 0, 0);
const shift = (days: number) => new Date(today.getTime() + days * DAY);
const mondayThisWeek = shift(-((today.getDay() + 6) % 7));
// Семестр начался две недели назад — значит, сейчас третья неделя.
const semesterStart = new Date(mondayThisWeek.getTime() - 2 * WEEK);
// Архив: второй семестр начался 20 недель назад, первый — 44.
const archive2Start = new Date(mondayThisWeek.getTime() - 20 * WEEK);
const archive1Start = new Date(mondayThisWeek.getTime() - 44 * WEEK);
const after = (start: Date, days: number) => new Date(start.getTime() + days * DAY);
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const at22 = (d: Date) => {
  const at = new Date(d);
  at.setHours(22, 0, 0, 0);
  return at.toISOString();
};

// --- Заглушки API ---

type Activity = { id: number; name: string; weight: number; maxExercisesCount: number };

const ACT = {
  hw: { id: 11, name: 'Домашнее задание', weight: 0.2, maxExercisesCount: 12 },
  bonus: { id: 12, name: 'Бонусная активность', weight: 0.15, maxExercisesCount: 15 },
  exam: { id: 13, name: 'Экзамен', weight: 0.4, maxExercisesCount: 1 },
  noWeight: { id: 14, name: 'Активность без веса', weight: 0, maxExercisesCount: 1 },
  visits: { id: 21, name: 'Посещение', weight: 1, maxExercisesCount: 2 },
  extra: { id: 22, name: 'Бонусные баллы', weight: 0.5, maxExercisesCount: 1 },
  // Общее название: что тут контест, видно только по заданию.
  contest: { id: 23, name: 'Соревнование', weight: 0.2, maxExercisesCount: 1 },
  peNoWeight: { id: 24, name: 'Без веса', weight: 0, maxExercisesCount: 1 },
  archHw: { id: 31, name: 'Домашние задания', weight: 1, maxExercisesCount: 2 },
  archTest: { id: 32, name: 'Контрольная работа', weight: 1, maxExercisesCount: 1 },
} satisfies Record<string, Activity>;

type Task = {
  id: number;
  courseId: number;
  name: string;
  activity: Activity;
  state: string;
  score: number | null;
  maxScore: number;
  due: Date;
  /** Когда задание открыли — по этому в архиве нумеруются недели. */
  start?: Date;
};

const task = (t: Task) => t;

const TASKS: Task[] = [
  // Английский: ДЗ 10/10 сегодня, два бонуса по 0.5 из 1 неделю назад,
  // служебный «Перезачёт» без веса и ДЗ на проверке, дедлайн вчера.
  task({
    id: 101,
    courseId: 1,
    name: 'ДЗ 1',
    activity: ACT.hw,
    state: 'evaluated',
    score: 10,
    maxScore: 10,
    due: today,
  }),
  task({
    id: 102,
    courseId: 1,
    name: 'Бонус 1',
    activity: ACT.bonus,
    state: 'evaluated',
    score: 0.5,
    maxScore: 1,
    due: shift(-7),
  }),
  task({
    id: 103,
    courseId: 1,
    name: 'Бонус 2',
    activity: ACT.bonus,
    state: 'evaluated',
    score: 0.5,
    maxScore: 1,
    due: shift(-7),
  }),
  task({
    id: 104,
    courseId: 1,
    name: 'Перезачет',
    activity: ACT.noWeight,
    state: 'failed',
    score: 0,
    maxScore: 10,
    due: shift(-3),
  }),
  task({
    id: 105,
    courseId: 1,
    name: 'ДЗ 2',
    activity: ACT.hw,
    state: 'review',
    score: null,
    maxScore: 10,
    due: shift(-1),
  }),
  // Физкультура: всё на максимум плюс бонус — сырой накоп 15, итог 10.
  task({
    id: 201,
    courseId: 2,
    name: 'Посещение 1',
    activity: ACT.visits,
    state: 'evaluated',
    score: 10,
    maxScore: 10,
    due: shift(-7),
  }),
  task({
    id: 202,
    courseId: 2,
    name: 'Посещение 2',
    activity: ACT.visits,
    state: 'evaluated',
    score: 10,
    maxScore: 10,
    due: today,
  }),
  task({
    id: 203,
    courseId: 2,
    name: 'Бонус',
    activity: ACT.extra,
    state: 'evaluated',
    score: 10,
    maxScore: 10,
    due: today,
  }),
  // Важная работа по названию задания, и пересдача без веса — не важная.
  task({
    id: 204,
    courseId: 2,
    name: 'Контест 2',
    activity: ACT.contest,
    state: 'evaluated',
    score: 8,
    maxScore: 10,
    due: today,
  }),
  task({
    id: 205,
    courseId: 2,
    name: 'Пересдача экзамена',
    activity: ACT.peNoWeight,
    state: 'backlog',
    score: null,
    maxScore: 10,
    due: shift(2),
  }),
  // Курс вне семестра.
  task({
    id: 301,
    courseId: 3,
    name: 'Тест',
    activity: ACT.hw,
    state: 'inProgress',
    score: null,
    maxScore: 10,
    due: shift(2),
  }),
  // Архив, второй семестр: две домашки по 7 на второй и четвёртой неделе.
  task({
    id: 1101,
    courseId: 11,
    name: 'ДЗ 1',
    activity: ACT.archHw,
    state: 'evaluated',
    score: 7,
    maxScore: 10,
    due: after(archive2Start, 9),
    start: archive2Start,
  }),
  task({
    id: 1102,
    courseId: 11,
    name: 'ДЗ 2',
    activity: ACT.archHw,
    state: 'evaluated',
    score: 7,
    maxScore: 10,
    due: after(archive2Start, 23),
    start: after(archive2Start, 14),
  }),
  // Третья домашка сверх плана в 2: LMS всё равно делит на план.
  task({
    id: 1103,
    courseId: 11,
    name: 'ДЗ 3',
    activity: ACT.archHw,
    state: 'failed',
    score: 0,
    maxScore: 10,
    due: after(archive2Start, 30),
    start: after(archive2Start, 28),
  }),
  // Архив, первый семестр: контрольная на первой неделе.
  task({
    id: 1201,
    courseId: 12,
    name: 'КР 1',
    activity: ACT.archTest,
    state: 'evaluated',
    score: 8,
    maxScore: 10,
    due: after(archive1Start, 2),
    start: archive1Start,
  }),
];

const course = (
  id: number,
  name: string,
  semesterNumber: number | null,
  isArchived: boolean,
  total: number
) => ({
  id,
  name,
  semesterNumber,
  isArchived,
  total,
  courseStudentsStatus: semesterNumber == null ? 'listener' : 'required',
});

const COURSES = [
  course(1, 'Английский язык', 3, false, 0),
  course(2, 'Физкультура', 3, false, 0),
  course(3, 'Тестовый курс', null, false, 0),
];
const ARCHIVED_COURSES = [
  course(11, 'Матанализ 2', 2, true, 7),
  course(12, 'Матанализ 1', 1, true, 8),
];
const ALL_COURSES = [...COURSES, ...ARCHIVED_COURSES];

const COURSE_ACTIVITIES: Record<number, Activity[]> = {
  1: [ACT.hw, ACT.bonus, ACT.exam, ACT.noWeight],
  2: [ACT.visits, ACT.extra, ACT.contest, ACT.peNoWeight],
  3: [ACT.hw],
  11: [ACT.archHw],
  12: [ACT.archTest],
};

function api(url: URL): unknown {
  const path = url.pathname;
  if (path === '/api/micro-lms/performance/student') {
    return { courses: url.searchParams.get('isArchived') === 'true' ? ARCHIVED_COURSES : COURSES };
  }
  if (path === '/api/micro-lms/tasks/student') {
    return TASKS.map((t) => ({
      id: t.id,
      state: t.state,
      score: t.score,
      extraScore: null,
      deadline: at22(t.due),
      exercise: {
        id: t.id + 1000,
        name: t.name,
        maxScore: t.maxScore,
        deadline: at22(t.due),
        startDate: (t.start ?? new Date(t.due.getTime() - WEEK)).toISOString(),
        activity: { id: t.activity.id, name: t.activity.name, weight: t.activity.weight },
      },
      course: { id: t.courseId, name: ALL_COURSES.find((c) => c.id === t.courseId)!.name },
      theme: { id: 500 + t.courseId, name: `Тема курса ${t.courseId}` },
      longread: { id: 600 + t.id, name: 'Лонгрид' },
    }));
  }
  if (path === '/api/micro-lms/students/me/timetables') {
    // Три строки с начала семестра и одна — на неделю раньше.
    const row = (start: Date) => ({ calendarEvent: { schedule: { startDate: ymd(start) } } });
    return [
      { courseId: 1, eventRows: [row(semesterStart), row(semesterStart)] },
      {
        courseId: 2,
        eventRows: [row(semesterStart), row(new Date(semesterStart.getTime() - WEEK))],
      },
    ];
  }
  const match = path.match(/^\/api\/micro-lms\/courses\/(\d+)\/(student-performance|activities)$/);
  if (match) {
    const id = Number(match[1]);
    if (match[2] === 'activities') {
      return COURSE_ACTIVITIES[id].map((a) => ({ ...a, bestScoresCount: null }));
    }
    return {
      total: 0,
      tasks: TASKS.filter((t) => t.courseId === id).map((t) => ({
        id: t.id,
        state: t.state,
        score: t.score,
        extraScore: null,
        exerciseId: t.id + 1000,
        maxScore: t.maxScore,
        activity: { ...t.activity, bestScoresCount: null },
      })),
    };
  }
  return null;
}

// --- Страница ---

/**
 * Строка вкладок — как её рисует Taiga: первая вкладка прямо в `tui-tabs`,
 * остальные в обёртках `div.t-flex`, «Ещё» — отдельной кнопкой-вкладкой.
 * Стили — только то, от чего зависит раскладка: без них `tui-tabs-with-more`
 * был бы строчным элементом нулевой ширины. Ширина вкладок задана жёстко,
 * чтобы тест узкой строки не зависел от шрифтов машины.
 *
 * Контейнер страницы — с переменными и точками перелома LMS: от 1200px экрана
 * она держит страницу в колонке 66rem, от 1620px — 90.25rem, уже — во всю
 * ширину с полями по 1.5rem.
 */
const page_ = (scope: 'actual' | 'archived') => `<!doctype html><html lang="ru"><head><style>
  body { margin: 0; font: 14px/20px sans-serif; }
  :root { --cu-container-content-width: auto; --cu-container-margin-size: 1.5rem; }
  @media (min-width: 75em) { :root { --cu-container-content-width: 66rem; --cu-container-margin-size: auto; } }
  @media (min-width: 101.25em) { :root { --cu-container-content-width: 90.25rem; } }
  .cu-container {
    margin-left: var(--cu-container-margin-size);
    margin-right: var(--cu-container-margin-size);
    width: var(--cu-container-content-width);
  }
  tui-tabs-with-more, tui-tabs, .t-flex { display: flex; }
  a[tuitab] { display: flex; align-items: center; width: 150px; height: 56px; margin-right: 24px; white-space: nowrap; }
  .t-overflown { margin: 0; inline-size: 0; max-inline-size: 0; overflow: hidden; visibility: hidden; }
</style></head><body>
  <div class="cu-container sidebar__content"><cu-student-performance-layout>
  <section class="content-area">
    <tui-tabs-with-more class="tabs" data-size="l">
      <tui-tabs class="t-tabs _underline" data-size="l">
        <a tuitab href="/learn/reports/student-performance/${scope}/by-semester" class="_active active">Курсы по семестрам</a>
        <div class="t-flex">
          <a tuitab href="/learn/reports/student-performance/${scope}/without-semester">Курсы вне семестра</a>
        </div>
      </tui-tabs>
      <button tuitab type="button" class="t-more t-overflown">Еще</button>
    </tui-tabs-with-more>
    <router-outlet></router-outlet>
    <cu-student-performance>Родная ведомость</cu-student-performance>
  </section>
  </cu-student-performance-layout></div>
  <script>
    // Роутер Angular: переход по вкладке — без перезагрузки страницы.
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[tuitab]');
      if (!link || link.id === 'culms-gradebook-tab') return;
      event.preventDefault();
      history.pushState(null, '', link.getAttribute('href'));
    });
  </script>
</body></html>`;

// --- Расписание контрольных (сервер «Видеть предстоящие контрольные») ---

const ddmm = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')} ${String(d.getMonth() + 1).padStart(2, '0')}`;
const nextMonday = new Date(mondayThisWeek.getTime() + WEEK);

const EXAM_SCHEDULE = {
  // Короче и тоже входит в «Английский язык» — брать нужно длинный ключ.
  Английский: [{ name: 'Тест', date: ddmm(nextMonday) }],
  'Английский язык': [
    { name: 'Контрольная работа', date: ddmm(nextMonday) },
    // Прошедшая — не показываем.
    { name: 'Коллоквиум', date: ddmm(new Date(mondayThisWeek.getTime() - 2 * WEEK)) },
    // На этой неделе — ещё впереди: день внутри недели не известен.
    { name: 'Зачёт', date: ddmm(mondayThisWeek) },
  ],
};

/**
 * Заглушка API расширения: переключатель в `storage.sync`, кеш и скрытые
 * курсы в `storage.local` и фон, который отвечает на FETCH_JSON расписанием.
 * `__setExamsToggle(value)` меняет переключатель, как попап, с событием;
 * запись в `storage.local` тоже рассылает `onChanged` — так же, как если бы
 * список поменяли в другой вкладке. `__local` — что сейчас лежит в
 * `storage.local`.
 */
async function stubExtension(
  page: Page,
  examsEnabled: boolean,
  initialLocal: Record<string, unknown> = {}
) {
  await page.evaluate(
    ({ schedule, enabled, initial }) => {
      const sync: Record<string, unknown> = { futureExamsViewToggle: enabled };
      const local: Record<string, unknown> = { ...initial };
      const listeners: Array<(changes: object, area: string) => void> = [];
      const notify = (changes: object, area: string) =>
        listeners.forEach((fn) => fn(changes, area));
      const pick = (all: Record<string, unknown>, keys: string | string[]) =>
        Object.fromEntries(
          [keys]
            .flat()
            .filter((k) => k in all)
            .map((k) => [k, all[k]])
        );
      (window as any).browser = {
        storage: {
          sync: { get: async (keys: string | string[]) => pick(sync, keys) },
          local: {
            get: async (keys: string | string[]) => pick(local, keys),
            set: async (values: Record<string, unknown>) => {
              const changes = Object.fromEntries(
                Object.entries(values).map(([k, v]) => [k, { oldValue: local[k], newValue: v }])
              );
              Object.assign(local, values);
              notify(changes, 'local');
            },
            remove: async (keys: string | string[]) => {
              const gone = [keys].flat().filter((k) => k in local);
              const changes = Object.fromEntries(gone.map((k) => [k, { oldValue: local[k] }]));
              gone.forEach((k) => delete local[k]);
              notify(changes, 'local');
            },
          },
          onChanged: {
            addListener: (fn: (changes: object, area: string) => void) => listeners.push(fn),
          },
        },
        runtime: {
          sendMessage: async (message: { action: string; url: string }) => {
            (window as any).__examRequests = ((window as any).__examRequests || 0) + 1;
            return message.action === 'FETCH_JSON' && message.url.endsWith('/api/schedule')
              ? { success: true, data: schedule }
              : { success: false, error: 'неизвестный запрос' };
          },
        },
      };
      (window as any).__setExamsToggle = (value: boolean) => {
        sync.futureExamsViewToggle = value;
        notify({ futureExamsViewToggle: { newValue: value } }, 'sync');
      };
      (window as any).__local = local;
    },
    { schedule: EXAM_SCHEDULE, enabled: examsEnabled, initial: initialLocal }
  );
}

async function openStatements(
  page: Page,
  scope: 'actual' | 'archived' = 'actual',
  options: { exams?: boolean; local?: Record<string, unknown> } = {}
) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: api(url) });
    const pageScope = url.pathname.includes('/archived') ? 'archived' : 'actual';
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: page_(pageScope) });
  });
  await page.goto(ORIGIN + statementsPath(scope));
  if (options.exams !== undefined || options.local) {
    await stubExtension(page, options.exams ?? false, options.local);
  }
  await injectPlugin(page);
}

async function injectPlugin(page: Page) {
  await page.addStyleTag({ content: gradebookCss });
  await page.addScriptTag({ content: gradebookJs });
}

const tab = (page: Page) => page.locator('#culms-gradebook-tab');
const view = (page: Page) => page.locator('#culms-gradebook');
const row = (page: Page, name: string) =>
  view(page)
    .locator('tbody tr')
    .filter({ has: page.locator('th', { hasText: name }) });
const squash = (text: string | null) => (text || '').replace(/\s+/g, ' ').trim();
/** Подписи недель без диапазона дат под ними. */ const weekLabels = (page: Page) =>
  view(page)
    .locator('thead .culms-gb-week')
    .evaluateAll((ths) => ths.map((th) => th.firstChild!.textContent!.trim()));

async function openGradebook(page: Page) {
  await tab(page).click();
  await expect(view(page).locator('tbody tr').first()).toBeVisible();
}

/** Части плашки активности разделены отступами CSS, а не пробелами. */
const activities = (scope: ReturnType<typeof row>) =>
  scope
    .locator('.culms-gb-act')
    .evaluateAll((items) =>
      items.map((item) => [...item.children].map((part) => part.textContent!.trim()).join(' '))
    );

// --- Тесты ---

test('вкладка встаёт после «Курсы вне семестра» и подменяет содержимое', async ({ page }) => {
  await openStatements(page);

  await expect(tab(page)).toHaveText('Сводная таблица');
  const order = await page.locator('tui-tabs a[tuitab]').allTextContents();
  expect(order.map(squash)).toEqual([
    'Курсы по семестрам',
    'Курсы вне семестра',
    'Сводная таблица',
  ]);

  await openGradebook(page);
  await expect(page.locator('cu-student-performance')).toBeHidden();
  await expect(tab(page)).toHaveClass(/culms-gb-tab-active/);

  // По умолчанию — только курсы семестра, как на первой вкладке.
  await expect(view(page).locator('tbody tr')).toHaveCount(2);
  await view(page).locator('input[data-pref="offSemester"]').check();
  await expect(view(page).locator('tbody tr')).toHaveCount(3);
  await expect(row(page, 'Тестовый курс')).toContainText('вне семестра');
});

test('накоп: набрано и сколько можно было к сегодня, как в LMS', async ({ page }) => {
  await openStatements(page);
  await openGradebook(page);

  const english = row(page, 'Английский язык');
  // ДЗ: 10 / 12 = 0.83. Бонус: (0.5 + 0.5) / 15 = 0.06 — сырые баллы, не из 10.
  // Набрано: 0.2 × 0.833 + 0.15 × 0.067 = 0.176 → LMS отсекает до 0.17.
  await expect(english.locator('.culms-gb-acc__value')).toHaveText('0.17');
  // Можно было: ДЗ 1 и ДЗ 2 на проверке с прошедшим дедлайном — 0.2 × 20 / 12,
  // плюс бонусы 0.15 × 2 / 15 — итого 0.353 → 0.35.
  await expect(english.locator('.culms-gb-acc__of')).toHaveText('/ 0.35');
  await expect(view(page).locator('thead .culms-gb-acc')).toContainText('набрано / можно');

  // Все активности с весом, по убыванию веса; экзамена ещё не было — пунктир.
  expect(await activities(english)).toEqual(['Экзамен — 40%', 'ДЗ 0.83 20%', 'Бонус 0.06 15%']);
  const exam = english.locator('.culms-gb-act', { hasText: 'Экзамен' });
  await expect(exam).toHaveClass(/is-waiting/);
  await expect(exam).toHaveAttribute('title', /Заданий пока не было/);

  // Бонус из одного балла подписан максимумом, иначе «0.5» читается как провал.
  await expect(english.locator('.culms-gb-chip', { hasText: '0.5' }).first()).toHaveText('0.5/1');

  // Физкультура: 1 × 20 / 2 + 0.5 × 10 = 15, но итог выше 10 не бывает.
  const pe = row(page, 'Физкультура');
  await expect(pe.locator('.culms-gb-acc__value')).toHaveText('10');
  await expect(pe.locator('.culms-gb-acc__of')).toHaveText('/ 10');
});

test('недели нумеруются от начала семестра по расписанию', async ({ page }) => {
  await openStatements(page);
  await openGradebook(page);

  const weeks = await weekLabels(page);
  // Дедлайны неделю назад и сегодня — вторая и третья неделя. Строка
  // расписания, начавшаяся раньше остальных, нумерацию не сдвигает.
  expect(weeks).toContain('Неделя 2');
  expect(weeks).toContain('Неделя 3');
  await expect(view(page).locator('thead .culms-gb-week.is-cur-week')).toContainText('Неделя 3');
  await expect(view(page).locator('thead .culms-gb-day.is-today')).toHaveCount(1);

  // «По неделям» — одна колонка на неделю.
  await view(page).locator('[data-cols="weeks"]').click();
  const days = await view(page).locator('thead .culms-gb-day').count();
  expect(days).toBe(weeks.length);
});

test('служебные задания без веса скрыты, пока не включить галочку', async ({ page }) => {
  await openStatements(page);
  await openGradebook(page);

  const english = row(page, 'Английский язык');
  await expect(english.locator('.culms-gb-chip[data-status="failed"]')).toHaveCount(0);

  await view(page).locator('input[data-pref="zeroWeight"]').check();
  const retake = english.locator('.culms-gb-chip[data-status="failed"]');
  await expect(retake).toHaveCount(1);
  await expect(retake).toHaveClass(/is-weightless/);
});

test('пока оценки нет — иконка статуса, а не символ шрифта', async ({ page }) => {
  await openStatements(page);
  await openGradebook(page);
  await view(page).locator('input[data-pref="offSemester"]').check();

  for (const status of ['review', 'inProgress']) {
    const chip = view(page).locator(`tbody .culms-gb-chip[data-status="${status}"]`).first();
    await expect(chip.locator('svg.culms-gb-icon')).toHaveCount(1);
    expect(squash(await chip.textContent())).toBe('');
  }

  // Те же иконки — в легенде статусов, чтобы их было где выучить.
  await view(page).locator('[data-mode="status"]').click();
  await expect(
    view(page).locator('.culms-gb-legend__item[data-spot="status:inProgress"] svg.culms-gb-icon')
  ).toHaveCount(1);
});

test('при наведении — карточка задания с весом, статусом и ссылкой', async ({ page }) => {
  await openStatements(page);
  await openGradebook(page);

  await row(page, 'Английский язык').locator('.culms-gb-chip', { hasText: '10' }).hover();
  const tip = page.locator('#culms-gradebook-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Английский язык');
  await expect(tip).toContainText('ДЗ 1');
  await expect(tip).toContainText('Оценено');
  // Доля активности в курсе и доля одного задания в итоговой — разные числа,
  // и каждое подписано.
  const weights = tip.locator('.culms-gb-tip__weights');
  await expect(weights).toContainText('Вес активности «Домашнее задание»: 20%');
  // 0.2 × 10 / 12 = 0.167 балла — 1.7% итоговой.
  await expect(weights).toContainText('Вес одной задачи: ≈1.7% итоговой');
  await expect(weights).toContainText('одна из 12 работ активности · до +0.17 балла');
  await expect(tip.locator('a')).toHaveAttribute(
    'href',
    '/learn/courses/view/actual/1/themes/501/longreads/701'
  );

  // Бонус из 1 балла весит вдесятеро меньше, чем «15% на 15 работ», —
  // карточка это оговаривает.
  await row(page, 'Английский язык').locator('.culms-gb-chip', { hasText: '0.5' }).first().hover();
  await expect(weights).toContainText('Вес активности «Бонусная активность»: 15%');
  await expect(weights).toContainText('Вес одной задачи: ≈0.1% итоговой');
  await expect(weights).toContainText(
    'одна из 15 работ активности, оценка из 1 вместо 10 · до +0.01 балла'
  );
});

test('выделение по карточке метрики оставляет яркими только нужные клетки', async ({ page }) => {
  await openStatements(page);
  await openGradebook(page);

  await view(page).locator('button.culms-gb-stat', { hasText: 'на проверке' }).click();
  const bright = view(page).locator('tbody .culms-gb-chip:not(.is-dim)');
  await expect(bright).toHaveCount(1);
  await expect(bright).toHaveAttribute('data-status', 'review');
  // Выделение по статусу включает и подсветку статусов.
  await expect(view(page)).toHaveClass(/culms-gb--mode-status/);
});

test('сводку над таблицей можно скрыть, и это запоминается', async ({ page }) => {
  await openStatements(page);
  await openGradebook(page);

  const toggle = view(page).locator('[data-toggle="stats"]');
  await expect(view(page).locator('.culms-gb-stats')).toBeVisible();
  await expect(toggle).toHaveText('Скрыть сводку');

  await toggle.click();
  await expect(view(page).locator('.culms-gb-stats')).toHaveCount(0);
  await expect(toggle).toHaveText('Показать сводку');

  await page.reload();
  await injectPlugin(page);
  await expect(view(page).locator('tbody tr').first()).toBeVisible();
  await expect(view(page).locator('.culms-gb-stats')).toHaveCount(0);
});

test('родная вкладка закрывает сводную, а выбор переживает перезагрузку', async ({ page }) => {
  await openStatements(page);
  await openGradebook(page);

  await page.locator('tui-tabs a[href$="/without-semester"]').click();
  await expect(view(page)).toHaveCount(0);
  await expect(page.locator('cu-student-performance')).toBeVisible();
  await expect(tab(page)).not.toHaveClass(/culms-gb-tab-active/);

  // Открыли снова и перезагрузили — ведомость открывается сразу на сводной.
  await openGradebook(page);
  await page.reload();
  await injectPlugin(page);
  await expect(view(page).locator('tbody tr').first()).toBeVisible();
  await expect(page.locator('cu-student-performance')).toBeHidden();
});

test('архивные ведомости: свои курсы, семестры, итог LMS и ссылки в архив', async ({ page }) => {
  await openStatements(page, 'archived');
  await expect(tab(page)).toHaveAttribute(
    'href',
    '/learn/reports/student-performance/archived/by-semester#gradebook'
  );
  await openGradebook(page);

  // По умолчанию — последний семестр архива.
  await expect(view(page).locator('tbody tr')).toHaveCount(1);
  const analysis2 = row(page, 'Матанализ 2');
  await expect(view(page).locator('[data-semester="2"]')).toHaveClass(/is-on/);

  // Недели — от первой недели курсов семестра (дат расписания в архиве нет).
  const weeks = await weekLabels(page);
  expect(weeks).toEqual(['Неделя 2', 'Неделя 4', 'Неделя 5']);
  // Прошлое: ни текущей недели, ни «дедлайнов на неделе».
  await expect(view(page).locator('thead .is-cur-week')).toHaveCount(0);
  await expect(view(page).locator('.culms-gb-stat', { hasText: 'дедлайнов' })).toHaveCount(0);

  // 1 × (7 + 7 + 0) / 2 = 7: три работы при плане в две, а делим на план.
  // Возможных — 10 (15 на максимум, но выше 10 итог не бывает), итог LMS — 7.
  await expect(analysis2.locator('.culms-gb-acc__value')).toHaveText('7');
  await expect(analysis2.locator('.culms-gb-acc__of')).toHaveText('/ 10');
  await expect(analysis2.locator('.culms-gb-acc__final')).toHaveText('итог 7');
  await expect(analysis2.locator('.culms-gb-course__link')).toHaveAttribute(
    'href',
    '/learn/reports/student-performance/archived/11/activity'
  );
  await expect(analysis2.locator('.culms-gb-chip').first()).toHaveAttribute(
    'href',
    '/learn/courses/view/archived/11/themes/511/longreads/1701'
  );

  // Переключатель семестров.
  await view(page).locator('[data-semester="1"]').click();
  await expect(view(page).locator('tbody tr')).toHaveCount(1);
  await expect(row(page, 'Матанализ 1').locator('.culms-gb-acc__final')).toHaveText('итог 8');
  await expect(view(page).locator('thead .culms-gb-week').first()).toContainText('Неделя 1');
});

test('предстоящие контрольные — когда в меню включено «видеть предстоящие контрольные»', async ({
  page,
}) => {
  await openStatements(page, 'actual', { exams: true });
  await openGradebook(page);

  const english = row(page, 'Английский язык');
  const exams = english.locator('.culms-gb-chip[data-exam]');
  // Зачёт на этой неделе и КР на следующей; прошедший коллоквиум скрыт, а
  // «Тест» из более короткого ключа «Английский» чужой.
  await expect(exams).toHaveCount(2);
  expect((await exams.allTextContents()).map(squash)).toEqual(['Зачёт', 'КР']);

  // Дня у контрольной нет — у недели свой столбец «на неделе».
  const examCols = view(page).locator('thead .culms-gb-day.is-exam-col');
  await expect(examCols).toHaveCount(2);
  await expect(examCols.first()).toContainText('Контр.');
  await expect(
    view(page).locator('.culms-gb-stat', { hasText: 'контрольных впереди' })
  ).toContainText('2');

  await exams.filter({ hasText: 'КР' }).hover();
  const tip = page.locator('#culms-gradebook-tip');
  await expect(tip).toContainText('Контрольная работа');
  await expect(tip).toContainText('на следующей неделе');
  await expect(tip).toContainText('4 семестра');
  await expect(tip.locator('a')).toHaveAttribute('href', '/learn/courses/view/actual/1');

  // «По неделям» — контрольная в колонке своей недели, отдельного столбца нет.
  await view(page).locator('[data-cols="weeks"]').click();
  await expect(view(page).locator('thead .is-exam-col')).toHaveCount(0);
  await expect(english.locator('.culms-gb-chip[data-exam]')).toHaveCount(2);

  // Выключили в меню — пропадают сразу, без перезагрузки.
  await page.evaluate(() => (window as any).__setExamsToggle(false));
  await expect(english.locator('.culms-gb-chip[data-exam]')).toHaveCount(0);
  await expect(view(page).locator('.culms-gb-stat', { hasText: 'контрольных' })).toHaveCount(0);
});

test('без «видеть предстоящие контрольные» расписание даже не запрашивается', async ({ page }) => {
  await openStatements(page, 'actual', { exams: false });
  await openGradebook(page);

  await expect(view(page).locator('.culms-gb-chip[data-exam]')).toHaveCount(0);
  await expect(view(page).locator('thead .is-exam-col')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__examRequests || 0)).toBe(0);
});

test('колонку активностей можно свернуть в полосу, и это запоминается', async ({ page }) => {
  await openStatements(page);
  await openGradebook(page);

  const head = view(page).locator('thead th.culms-gb-acts');
  await expect(head).toContainText('По активностям');
  await expect(view(page).locator('tbody .culms-gb-acts__list').first()).toBeVisible();
  expect((await head.boundingBox())!.width).toBeGreaterThan(200);

  await head.locator('[data-toggle="acts"]').click();
  await expect(view(page).locator('tbody .culms-gb-acts__list')).toHaveCount(0);
  await expect(head).toContainText('Активности');
  await expect(head.locator('[data-toggle="acts"]')).toHaveAttribute('aria-expanded', 'false');
  const strip = (await head.boundingBox())!;
  expect(strip.width).toBeLessThan(50);

  // «Накоп» съезжает к краю вслед за колонкой — без щели между ними.
  const acc = (await view(page).locator('thead th.culms-gb-acc').boundingBox())!;
  expect(Math.abs(acc.x + acc.width - strip.x)).toBeLessThanOrEqual(1);

  await page.reload();
  await injectPlugin(page);
  await expect(view(page).locator('tbody tr').first()).toBeVisible();
  await expect(view(page).locator('tbody .culms-gb-acts__list')).toHaveCount(0);

  await view(page).locator('thead [data-toggle="acts"]').click();
  await expect(view(page).locator('tbody .culms-gb-acts__list').first()).toBeVisible();
});

test('пока открыта сводная, страница во всю ширину, а не в колонке LMS', async ({ page }) => {
  // 1536px — экран 1920 с масштабом 125%: LMS держит страницу в 66rem.
  await page.setViewportSize({ width: 1536, height: 900 });
  await openStatements(page);
  const container = page.locator('.cu-container');
  const width = async () => (await container.boundingBox())!.width;
  expect(await width()).toBe(1056);

  await openGradebook(page);
  // Во всю ширину окна за вычетом полей по 1.5rem, как LMS на узком экране.
  const full = await page.evaluate(() => document.documentElement.clientWidth - 48);
  expect(await width()).toBe(full);

  // На родной вкладке — обычная колонка LMS.
  await page.locator('tui-tabs a[href$="/without-semester"]').click();
  await expect(view(page)).toHaveCount(0);
  expect(await width()).toBe(1056);
});

test('важные работы — экзамены, зачёты, КР, коллоквиумы, контесты — помечены', async ({ page }) => {
  await openStatements(page);
  await openGradebook(page);

  // Контест узнан по названию задания: активность называется «Соревнование».
  const pe = row(page, 'Физкультура');
  const contest = pe.locator('.culms-gb-chip[data-important]');
  await expect(contest).toHaveCount(1);
  await expect(contest).toHaveAttribute('data-important', 'контест');
  await expect(contest).toHaveText('8');
  // Экзамен английского ещё не начался, но активность помечена по названию.
  await expect(
    row(page, 'Английский язык').locator('.culms-gb-act[data-important="экзамен"]')
  ).toHaveCount(1);
  // Обычные ДЗ и бонусы — без метки.
  await expect(row(page, 'Английский язык').locator('.culms-gb-chip[data-important]')).toHaveCount(
    0
  );

  // «Пересдача экзамена» без веса на оценку не влияет — не важная.
  await view(page).locator('input[data-pref="zeroWeight"]').check();
  await expect(pe.locator('.culms-gb-chip[aria-label^="Пересдача экзамена"]')).toHaveCount(1);
  await expect(
    pe.locator('.culms-gb-chip[aria-label^="Пересдача экзамена"][data-important]')
  ).toHaveCount(0);

  await contest.hover();
  await expect(page.locator('#culms-gradebook-tip')).toContainText('Важная работа — контест');

  // Пункт легенды выделяет только важные.
  await view(page).locator('.culms-gb-legend__item[data-spot="important"]').click();
  const bright = view(page).locator('tbody .culms-gb-chip:not(.is-dim)');
  await expect(bright).toHaveCount(1);
  await expect(bright).toHaveAttribute('data-important', 'контест');
});

test('колесо мыши над таблицей листает недели, а у края — страницу', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 500 });
  await openStatements(page);
  await openGradebook(page);
  // Как в LMS: листается не окно, а `main` под шапкой, — прокрутка у края
  // должна дойти до него через таблицу. Снизу место, чтобы было куда листать.
  await page.evaluate(() => {
    const container = document.querySelector<HTMLElement>('.cu-container')!;
    const main = document.createElement('main');
    main.className = 'main';
    main.style.cssText = 'height: 100vh; overflow: auto;';
    container.before(main);
    main.append(container);
    container.style.paddingBottom = '1500px';
  });

  const scroller = view(page).locator('.culms-gb-scroll');
  const state = () =>
    scroller.evaluate((el) => ({
      left: el.scrollLeft,
      max: el.scrollWidth - el.clientWidth,
      pageY: document.querySelector('main')!.scrollTop,
    }));
  await scroller.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await scroller.scrollIntoViewIfNeeded();
  const start = await state();
  expect(start.max).toBeGreaterThan(50);

  const box = (await scroller.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await state()).left).toBeGreaterThan(0);
  // Страница при этом стоит.
  expect((await state()).pageY).toBe(start.pageY);

  // Доехали до конца недель — дальше колесо листает страницу.
  await scroller.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await page.waitForTimeout(300);
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await state()).pageY).toBeGreaterThan(start.pageY);

  // И в начале недель колесо вверх листает страницу вверх.
  await scroller.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await page.waitForTimeout(300);
  const down = await state();
  await page.mouse.wheel(0, -120);
  await expect.poll(async () => (await state()).pageY).toBeLessThan(down.pageY);
  expect((await state()).left).toBe(0);
});

test('под таблицей остаётся место — её можно поднять к середине экрана', async ({ page }) => {
  // Экран ниже содержимого: без места под таблицей в конце страницы она
  // упиралась бы в нижний край.
  await page.setViewportSize({ width: 1280, height: 360 });
  await openStatements(page);
  await openGradebook(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  const { bottom, height } = await view(page)
    .locator('.culms-gb-scroll')
    .evaluate((el) => ({ bottom: el.getBoundingClientRect().bottom, height: window.innerHeight }));
  expect(bottom).toBeLessThanOrEqual(height * 0.55);
});

const hiddenBar = (page: Page) => view(page).locator('.culms-gb-hidden');
/** Кнопки-курсы в строке скрытых — без «Вернуть все». */
const hiddenCourses = (page: Page) =>
  hiddenBar(page).locator('[data-show-course]:not([data-show-course="all"])');
const gradedStat = (page: Page) =>
  view(page)
    .locator('.culms-gb-stat', { hasText: 'заданий оценено' })
    .locator('.culms-gb-stat__value');
const storedLocal = (page: Page) =>
  page.evaluate(() => ({ ...(window as any).__local }) as Record<string, unknown>);

test('курс можно скрыть и вернуть, а скрытые не входят в сводку', async ({ page }) => {
  await openStatements(page, 'actual', { local: {} });
  await openGradebook(page);
  await expect(gradedStat(page)).toHaveText('7/8');
  await expect(hiddenBar(page)).toHaveCount(0);

  // Кнопка появляется на строке под мышью.
  const pe = row(page, 'Физкультура');
  const hide = pe.locator('[data-hide-course]');
  await expect(hide).toHaveCSS('opacity', '0');
  await pe.hover();
  await expect(hide).toHaveCSS('opacity', '1');
  await expect(hide).toHaveAttribute('aria-label', /^Скрыть курс «Физкультура/);
  await hide.click();

  await expect(pe).toHaveCount(0);
  await expect(view(page).locator('tbody tr')).toHaveCount(1);
  await expect(gradedStat(page)).toHaveText('3/4');
  // Единственная важная работа была в скрытом курсе — пункта в легенде нет.
  await expect(view(page).locator('.culms-gb-legend__item[data-spot="important"]')).toHaveCount(0);
  expect((await storedLocal(page)).gradebookHiddenCourseIds).toEqual([2]);

  // Курс ждёт в строке под таблицей — не над ней, иначе строки таблицы
  // съезжали бы вниз из-под мыши. Нажатие возвращает его.
  await expect(hiddenCourses(page)).toHaveCount(1);
  await expect(hiddenCourses(page)).toHaveText('Физкультура');
  await expect(hiddenCourses(page)).toHaveAttribute(
    'aria-label',
    'Вернуть курс «Физкультура» в таблицу'
  );
  // «Вернуть все» — только когда скрыто больше одного.
  await expect(hiddenBar(page).locator('[data-show-course="all"]')).toHaveCount(0);
  const table = (await view(page).locator('.culms-gb-scroll').boundingBox())!;
  const bar = (await hiddenBar(page).boundingBox())!;
  expect(bar.y).toBeGreaterThanOrEqual(table.y + table.height);
  await hiddenCourses(page).click();

  await expect(pe).toHaveCount(1);
  await expect(hiddenBar(page)).toHaveCount(0);
  await expect(gradedStat(page)).toHaveText('7/8');
  expect(await storedLocal(page)).not.toHaveProperty('gradebookHiddenCourseIds');

  // Скрыто всё — вместо таблицы подсказка, а «Вернуть все» возвращает разом.
  for (const name of ['Физкультура', 'Английский язык']) {
    await row(page, name).hover();
    await row(page, name).locator('[data-hide-course]').click();
  }
  await expect(view(page).locator('.culms-gb-empty')).toContainText('Все курсы скрыты');
  await expect(hiddenCourses(page)).toHaveText(['Английский язык', 'Физкультура']);
  await hiddenBar(page).locator('[data-show-course="all"]').click();
  await expect(view(page).locator('tbody tr')).toHaveCount(2);
  await expect(hiddenBar(page)).toHaveCount(0);
  expect(await storedLocal(page)).not.toHaveProperty('gradebookHiddenCourseIds');
});

test('скрытые курсы помнятся и меняются из другой вкладки', async ({ page }) => {
  // Физкультуру скрыли в прошлый раз.
  await openStatements(page, 'actual', { local: { gradebookHiddenCourseIds: [2] } });
  await openGradebook(page);
  await expect(view(page).locator('tbody tr')).toHaveCount(1);
  await expect(row(page, 'Физкультура')).toHaveCount(0);
  await expect(hiddenCourses(page)).toHaveText(['Физкультура']);

  // В другой вкладке скрыли и английский — таблица пустеет сразу.
  await page.evaluate(() =>
    (window as any).browser.storage.local.set({ gradebookHiddenCourseIds: [1, 2] })
  );
  await expect(view(page).locator('.culms-gb-empty')).toContainText('Все курсы скрыты');
  await expect(hiddenCourses(page)).toHaveCount(2);

  // А там же вернули всё.
  await page.evaluate(() =>
    (window as any).browser.storage.local.remove('gradebookHiddenCourseIds')
  );
  await expect(view(page).locator('tbody tr')).toHaveCount(2);
  await expect(hiddenBar(page)).toHaveCount(0);
});

test('скрывать и возвращать можно с клавиатуры — фокус не теряется', async ({ page }) => {
  await openStatements(page, 'actual', { local: {} });
  await openGradebook(page);

  await row(page, 'Физкультура').locator('[data-hide-course]').focus();
  await page.keyboard.press('Enter');
  await expect(row(page, 'Физкультура')).toHaveCount(0);

  // Строки больше нет — фокус на кнопке соседнего курса, и её видно.
  const english = row(page, 'Английский язык').locator('[data-hide-course]');
  await expect(english).toBeFocused();
  await expect(english).toHaveCSS('opacity', '1');

  // Скрыли последний — фокус переходит в строку скрытых, на первый курс.
  await page.keyboard.press('Enter');
  await expect(view(page).locator('tbody tr')).toHaveCount(0);
  await expect(hiddenCourses(page).first()).toBeFocused();

  // Вернули его — фокус на соседнем скрытом; вернули и тот — на его строке.
  await page.keyboard.press('Enter');
  await expect(hiddenCourses(page)).toHaveCount(1);
  await expect(hiddenCourses(page)).toBeFocused();
  const last = await hiddenCourses(page).getAttribute('data-show-course');
  await page.keyboard.press('Enter');
  await expect(hiddenBar(page)).toHaveCount(0);
  await expect(view(page).locator(`[data-hide-course="${last}"]`)).toBeFocused();
});

test('на узкой строке вкладка уходит в «Ещё», а не выталкивает его', async ({ page }) => {
  // Три вкладки по 150 с отступами — 498: родные с «Ещё» влезают, наша — нет.
  await page.setViewportSize({ width: 450, height: 800 });
  await openStatements(page);

  // Taiga «Ещё» при этом не показывает — родные ведь влезли, — поэтому его
  // показывает скрипт.
  await expect(tab(page)).toHaveClass(/culms-gb-tab-folded/);
  await expect(page.locator('tui-tabs-with-more')).toHaveClass(/culms-gb-force-more/);
  const more = page.locator('tui-tabs-with-more > button');
  await expect(more).toBeVisible();
  const box = await more.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(450);

  // На широкой строке всё возвращается.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(tab(page)).not.toHaveClass(/culms-gb-tab-folded/);
  await expect(page.locator('tui-tabs-with-more')).not.toHaveClass(/culms-gb-force-more/);
});
