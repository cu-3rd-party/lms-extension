/**
 * Посещаемость: сводная по семинарам и полоса своих семинаров курса — на
 * поддельной странице.
 *
 * Логин в LMS и расширение не нужны: скрипты плагина — обычные скрипты
 * страницы, данные они берут из запросов к API. Запросы подменяются
 * заглушками, разметка повторяет живые `/learn/attendance/courses` и
 * `/learn/attendance/courses/{id}` (Taiga 5.15), скрипты и стили — настоящие.
 *
 * Время заморожено на четверге 8 октября 2026, 15:00 — так статусы не
 * зависят от дня запуска. Данные подобраны под то, что легко сломать:
 *   - у матана два семинара в неделю (пн и ср) — «4 из 26» в LMS;
 *   - 21 сентября своей пары в LMS нет (праздник) — это «пары не было», а не
 *     пропуск, и в счёт не идёт;
 *   - пары моложе недели без отметки — «ждёт отметки», не «не был»;
 *   - сегодняшний семинар линала ещё не кончился — он «впереди»;
 *   - английского нет в расписании — его пары ищутся по всем дням;
 *   - у теорвера посещаемость закрыта (403 на отметки) — он только в списке
 *     закрытых;
 *   - `eventId` один на всю серию: отметка ищется по дате + id.
 *
 * Запуск:
 *   bunx playwright test tests/attendance.test.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const plugins = resolve(__dirname, '..', 'src', 'plugins');
const read = (path: string) => readFileSync(resolve(plugins, path), 'utf8');
const SCRIPTS = [
  'course-view/future_exams_api.js',
  'attendance/attendance_api.js',
  'attendance/attendance_summary.js',
  'attendance/attendance_course.js',
].map(read);
const CSS = read('attendance/attendance.css');

const ORIGIN = 'https://lms.test';
const LIST = '/learn/attendance/courses';
const NOW = new Date(2026, 9, 8, 15, 0, 0);

// --- Данные ---

type Series = {
  id: string;
  courseId: number;
  day: string;
  start: string;
  end: string;
  host: string;
  place: string;
  row: number;
};

const SERIES: Series[] = [
  // Матан — два семинара в неделю.
  {
    id: 'mat-mon',
    courseId: 10,
    day: 'monday',
    start: '11:30',
    end: '12:50',
    host: 'Глухов Илья',
    place: 'B702',
    row: 1,
  },
  {
    id: 'mat-wed',
    courseId: 10,
    day: 'wednesday',
    start: '13:00',
    end: '14:20',
    host: 'Диваков Алексей',
    place: 'B506',
    row: 2,
  },
  {
    id: 'lin-thu',
    courseId: 11,
    day: 'thursday',
    start: '14:30',
    end: '15:50',
    host: 'Котельникова Александра',
    place: 'B202',
    row: 1,
  },
  {
    id: 'tv-tue',
    courseId: 12,
    day: 'tuesday',
    start: '11:30',
    end: '14:20',
    host: 'Куликов Александр',
    place: 'E201',
    row: 1,
  },
];

const COURSES = [
  {
    courseId: 10,
    courseName: '🔴 Математический анализ. Основной уровень',
    studentStatus: 'required',
    isVisibleForStudents: true,
    stats: { percent: 19, attendedCount: 5, enrolledCount: 26 },
  },
  {
    courseId: 11,
    courseName: 'Линейная алгебра и геометрия',
    studentStatus: 'required',
    isVisibleForStudents: true,
    stats: { percent: 15, attendedCount: 2, enrolledCount: 13 },
  },
  {
    courseId: 12,
    courseName: '🔴 Теория вероятностей. Основной уровень',
    studentStatus: 'required',
    isVisibleForStudents: false,
    stats: null,
  },
  {
    courseId: 13,
    courseName: 'Английский язык 204S3',
    studentStatus: 'required',
    isVisibleForStudents: true,
    stats: { percent: 10, attendedCount: 1, enrolledCount: 10 },
  },
];

// Отметки: «дата/серия». Сентябрь 21 — праздник: пар нет вообще.
const HOLIDAYS = new Set(['2026-09-21']);
const VISITED = new Set([
  '2026-09-07/mat-mon',
  '2026-09-09/mat-wed',
  '2026-09-14/mat-mon',
  '2026-09-28/mat-mon',
  '2026-09-30/mat-wed',
  '2026-09-10/lin-thu',
  '2026-09-24/lin-thu',
  '2026-09-15/eng',
]);
// Английского нет в расписании: пары по вторникам 15 и 29 сентября.
const ENGLISH_DAYS = new Set(['2026-09-15', '2026-09-29']);

const WEEKDAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const weekdayOf = (date: string) => WEEKDAY[new Date(date + 'T12:00:00Z').getUTCDay()];

function eventsOn(courseId: number, date: string) {
  if (HOLIDAYS.has(date)) return [];
  const event = (id: string, mine: boolean, s: Partial<Series>) => ({
    eventId: id,
    isParticipant: mine,
    actualDate: date,
    startTime: s.start,
    endTime: s.end,
    title: COURSES.find((c) => c.courseId === courseId)!.courseName,
    eventType: 'seminar',
    format: 'offline',
    rowNumber: s.row ?? 1,
    locationTitle: s.place,
    hosts: [{ email: 'teacher@lms.test', name: s.host + ' ' }],
  });
  if (courseId === 13) {
    return ENGLISH_DAYS.has(date)
      ? [event('eng', true, { start: '14:30', end: '15:50', host: 'Смирнова Анна', place: 'S307' })]
      : [];
  }
  const out = SERIES.filter((s) => s.courseId === courseId && s.day === weekdayOf(date)).map((s) =>
    event(s.id, true, s)
  );
  // Чужая группа в тот же день — её строка в родной таблице прячется.
  if (out.length) {
    out.push(
      event(`other-${courseId}`, false, {
        start: '09:00',
        end: '10:20',
        host: 'Скубачевский Антон',
        place: 'F304',
        row: 1,
      })
    );
  }
  return out;
}

const requests: string[] = [];

function api(url: URL): { status?: number; json: unknown } {
  const path = url.pathname;
  requests.push(path);
  if (path === '/api/micro-lms/v0/attendance/learn/courses') return { json: COURSES };
  if (path === '/api/micro-lms/students/me/timetables') {
    const byCourse = new Map<number, Series[]>();
    for (const s of SERIES) byCourse.set(s.courseId, [...(byCourse.get(s.courseId) || []), s]);
    return {
      json: [...byCourse].map(([courseId, list]) => ({
        courseId,
        courseName: COURSES.find((c) => c.courseId === courseId)!.courseName,
        eventRows: [
          // Лекции в посещаемость не идут — и в сводной их быть не должно.
          {
            eventType: 'lecture',
            eventRowNumber: 1,
            calendarEvent: {
              calendarEventId: `lec-${courseId}`,
              eventType: 'lecture',
              schedule: {
                startDate: '2026-09-07',
                endDate: '2026-12-20',
                startTime: '10:00',
                endTime: '11:20',
                dayOfWeek: 'tuesday',
                interval: 1,
              },
            },
          },
          ...list.map((s) => ({
            eventType: 'seminar',
            eventRowNumber: s.row,
            calendarEvent: {
              calendarEventId: s.id,
              eventType: 'seminar',
              location: { title: s.place, building: 'ЦТ' },
              hosts: [{ name: s.host + ' ', email: 'teacher@lms.test' }],
              schedule: {
                startDate: '2026-09-07',
                endDate: '2026-12-20',
                startTime: s.start,
                endTime: s.end,
                dayOfWeek: s.day,
                interval: 1,
                comment: null,
              },
              format: 'offline',
            },
          })),
        ],
      })),
    };
  }
  let m = path.match(
    /^\/api\/micro-lms\/calendar-events\/learn\/courses\/(\d+)\/events\/(\d{4}-\d{2}-\d{2})$/
  );
  if (m) return { json: eventsOn(Number(m[1]), m[2]) };
  m = path.match(
    /^\/api\/micro-lms\/v0\/attendance\/learn\/courses\/(\d+)\/events\/(\d{4}-\d{2}-\d{2})$/
  );
  if (m) {
    const course = COURSES.find((c) => c.courseId === Number(m![1]));
    if (!course?.isVisibleForStudents)
      return { status: 403, json: { title: 'Forbidden', status: 403 } };
    return {
      json: eventsOn(Number(m[1]), m[2])
        .map((e) => e.eventId)
        .filter((id) => VISITED.has(`${m![2]}/${id}`)),
    };
  }
  return { status: 404, json: null };
}

// --- Страница ---

const listHtml = (archived: boolean) => `
  <cu-courses-attendance><tui-loader><fieldset class="t-content">
    <div class="top-bar"><h1 class="page-title">Посещаемость курсов</h1>
      <cu-tabs><tui-scrollbar><div class="t-content"><div class="tabs-container">
        <a class="tab${archived ? '' : ' active'}" routerlinkactive="active" href="${LIST}"><span class="font-text-s-bold">Актуальные</span></a>
        <a class="tab${archived ? ' active' : ''}" routerlinkactive="active" href="${LIST}?isArchived=true"><span class="font-text-s-bold">Архивные</span></a>
      </div></div></tui-scrollbar></cu-tabs>
    </div>
    <div class="support-notification">Если посещение не отобразилось спустя неделю после пары — свяжись с поддержкой в Маяке</div>
    <table class="cu-table table"><thead><tr><th>Курс</th><th>Статус</th><th>Посещаемость</th><th>За весь семестр</th></tr></thead>
    <tbody>${COURSES.map(
      (
        c
      ) => `<tr class="course-row${c.isVisibleForStudents ? '' : ' is-unavailable'}" data-id="${c.courseId}" tabindex="0">
        <td class="name-cell"><span>${c.courseName}</span></td><td> Обязательный </td>
        <td><span class="visibility-chip">${c.isVisibleForStudents ? 'Доступна' : 'Недоступна'}</span></td>
        <td> ${c.stats ? `${c.stats.attendedCount} из ${c.stats.enrolledCount} (${c.stats.percent}%)` : '-'} </td></tr>`
    ).join('')}</tbody></table>
  </fieldset></tui-loader></cu-courses-attendance>`;

/** Страница курса за 30 сентября (среда): своя пара матана и чужая. */
const courseHtml = (id: number, date: string) => {
  const events = eventsOn(id, date);
  const rows = events
    .map(
      (
        e
      ) => `<tr class="course-row"><td><div class="icon-container${e.isParticipant ? ' _participant' : ''}"><tui-icon></tui-icon></div></td>
        <td><div class="date"><span>${date}</span><span>${e.startTime}-${e.endTime}</span></div></td>
        <td>Семинар ${e.rowNumber}</td><td>${e.hosts[0].name}<span>${e.locationTitle}</span></td><td><span>Не был</span></td></tr>`
    )
    .join('');
  return `
  <cu-course-attendance-events>
    <div class="top-bar"><h1 class="page-title">${COURSES.find((c) => c.courseId === id)!.courseName}</h1>
      <cu-date-filter class="date-filter"><input value="Дата: ${date}" readonly></cu-date-filter></div>
    <tui-loader class="loader"><fieldset class="t-content">
      ${rows ? `<table class="cu-table table"><tbody>${rows}</tbody></table>` : '<cu-empty-content>Нет событий</cu-empty-content>'}
    </fieldset></tui-loader>
  </cu-course-attendance-events>`;
};

const page_ = () => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
  body { margin: 0; font: 14px/20px system-ui, sans-serif; background: #fff; color: #1c1c1e; }
  .cu-container { max-width: 1240px; margin: 0 auto; padding: 24px; }
  .top-bar { display: flex; flex-direction: column; gap: 16px; margin-bottom: 16px; }
  .page-title { margin: 0; font-size: 28px; }
  .tabs-container { display: flex; gap: 8px; }
  a.tab { padding: 10px 16px; border-radius: 24px; background: #f4f4f5; color: #1c1c1e; text-decoration: none; }
  a.tab.active { background: #323336; color: #fff; }
  .support-notification { padding: 12px 16px; border-radius: 12px; background: #fff4e0; margin-bottom: 16px; }
  table.cu-table { width: 100%; border-collapse: collapse; }
  table.cu-table td, table.cu-table th { padding: 14px 12px; border-bottom: 1px solid #e9eaea; text-align: left; vertical-align: top; }
  .icon-container { width: 24px; height: 24px; border: 1px solid #e9eaea; border-radius: 8px; }
  .icon-container._participant { background: #e7eefe; border: 0; }
  body.dark { background: #1f2023; color: #fff; }
  body.dark a.tab { background: #2b2c30; color: #fff; }
  body.dark a.tab.active { background: #fff; color: #1c1c1e; }
  body.dark .support-notification { background: #3a3220; }
  body.dark table.cu-table td, body.dark table.cu-table th { border-color: #333; }
</style></head><body><div class="cu-container" id="app"></div>
<script>
  // Роутер Angular: переходы без перезагрузки страницы.
  const LIST = ${JSON.stringify(LIST)};
  const views = { list: ${JSON.stringify(listHtml(false))}, archived: ${JSON.stringify(listHtml(true))} };
  const courses = ${JSON.stringify(Object.fromEntries(COURSES.map((c) => [c.courseId, courseHtml(c.courseId, '2026-09-30')])))};
    function render() {
    const app = document.getElementById('app');
    const m = location.pathname.match(/\\/courses\\/(\\d+)/);
    app.innerHTML = m ? courses[m[1]] : location.search.includes('isArchived=true') ? views.archived : views.list;
  }
  document.addEventListener('click', (event) => {
    const tab = event.target.closest('a.tab');
    if (tab && tab.id !== 'culms-att-tab') {
      event.preventDefault();
      history.pushState(null, '', tab.getAttribute('href'));
      render();
      return;
    }
    const row = event.target.closest('cu-courses-attendance tr.course-row');
    if (row) {
      history.pushState(null, '', LIST + '/' + row.dataset.id);
      render();
    }
  });
  window.addEventListener('popstate', render);
  render();
</script></body></html>`;

/** Заглушка расширения: «Видеть предстоящие контрольные» и сервер расписания. */
async function stubExtension(page: Page) {
  await page.evaluate(() => {
    (window as any).browser = {
      storage: {
        sync: { get: async () => ({ futureExamsViewToggle: true }) },
        local: { get: async () => ({}), set: async () => {} },
        onChanged: { addListener: () => {} },
      },
      runtime: {
        sendMessage: async (message: { action: string; url: string }) => {
          if (message.url.endsWith('/api/schedule')) {
            return {
              success: true,
              data: { 'Математический анализ': [{ name: 'Контрольная работа 1', date: '12 10' }] },
            };
          }
          if (message.url.endsWith('/api/config'))
            return { success: true, data: { semesterStart: '07 09' } };
          return { success: false };
        },
      },
    };
  });
}

async function open(page: Page, path = LIST, options: { exams?: boolean } = {}) {
  requests.length = 0;
  await page.clock.setFixedTime(NOW);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      const { status, json } = api(url);
      return route.fulfill({ status: status ?? 200, json });
    }
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: page_() });
  });
  await page.goto(ORIGIN + path);
  if (options.exams) await stubExtension(page);
  await page.addStyleTag({ content: CSS });
  for (const script of SCRIPTS) await page.addScriptTag({ content: script });
}

const view = (page: Page) => page.locator('#culms-attendance');
const tab = (page: Page) => page.locator('#culms-att-tab');
const courseRow = (page: Page, name: string) =>
  view(page)
    .locator('tbody tr')
    .filter({ has: page.locator('th', { hasText: name }) });
const marks = (scope: ReturnType<typeof courseRow>) =>
  scope
    .locator('.culms-att-mark')
    .evaluateAll((els) => els.map((el) => el.className.replace('culms-att-mark is-', '')));
const squash = (text: string | null) => (text || '').replace(/\s+/g, ' ').trim();

// --- Тесты ---

test('в родной колонке «За весь семестр» — прошедшие с отметкой и максимум', async ({ page }) => {
  await open(page);
  const note = (name: string) =>
    page
      .locator('cu-courses-attendance tr.course-row', { hasText: name })
      .locator('.culms-att-native');

  // Одной строкой, как K/D/A: был / мог быть (уже прошло) / всего за семестр по LMS.
  // Матан: прошло 9 (7 с отметкой и 2 моложе недели), был на 5; 5 из 7 с
  // отметкой — 71%, ниже нормы ЦУ 75% — «был» жёлтый.
  await expect(note('Математический')).toHaveText('5/9/26');
  await expect(note('Математический').locator('.culms-att-native__rate')).toHaveClass(/is-warn/);
  await expect(note('Математический').locator('.culms-att-kda')).toHaveAttribute(
    'title',
    /Ещё 2 — меньше недели назад/
  );
  // Линал: 1 октября — ровно неделя назад, это уже прошло; сегодняшний ещё идёт.
  await expect(note('Линейная')).toHaveText('2/4/13');
  await expect(note('Линейная').locator('.culms-att-native__rate')).toHaveClass(/is-bad/);
  // Английский — без расписания, пары найдены обходом дней.
  await expect(note('Английский')).toHaveText('1/2/10');
  // Закрытый курс не трогаем.
  await expect(note('Теория вероятностей')).toHaveCount(0);

  // Что значат числа — одной подписью под таблицей.
  const legend = page.locator('#culms-att-native-legend');
  await expect(legend).toHaveCount(1);
  await expect(legend).toContainText('был/мог быть/всего');
  await expect(legend).toContainText('посещено / уже прошло / за семестр');
  await expect(legend).toContainText('нормы 75%');

  // В архиве ни дописок, ни подписи.
  await page.locator('cu-tabs a.tab', { hasText: 'Архивные' }).click();
  await expect(page.locator('.culms-att-native')).toHaveCount(0);
});

test('вкладка «Сводная» встаёт после «Архивные» и подменяет таблицу', async ({ page }) => {
  await open(page);
  await expect(tab(page)).toHaveText('Сводная');
  const tabs = page.locator('cu-tabs a.tab');
  await expect(tabs).toHaveText(['Актуальные', 'Архивные', 'Сводная']);

  await tab(page).click();
  await expect(view(page)).toBeVisible();
  await expect(tab(page)).toHaveClass(/active/);
  await expect(tabs.first()).not.toHaveClass(/active/);
  await expect(page.locator('cu-courses-attendance table.cu-table')).toBeHidden();
  await expect(page.locator('.support-notification')).toBeVisible();

  // Родная вкладка закрывает сводную и возвращает себе подсветку.
  await tabs.first().click();
  await expect(view(page)).toHaveCount(0);
  await expect(tabs.first()).toHaveClass(/active/);
  await expect(tab(page)).not.toHaveClass(/active/);
  await expect(page.locator('cu-courses-attendance table.cu-table')).toBeVisible();
});

test('таблица: недели семестра, свои семинары по статусам, лекций нет', async ({ page }) => {
  await open(page, LIST + '#summary');
  await expect(view(page).locator('tbody tr')).toHaveCount(3);

  // 15 недель: 7 сентября — 14 декабря; текущая — пятая.
  const weeks = view(page).locator('thead .culms-att-week');
  await expect(weeks).toHaveCount(15);
  await expect(weeks.nth(4)).toHaveClass(/is-now/);

  const mat = courseRow(page, 'Математический');
  // Неделя 3: 21-е — праздник, 23-е — пропуск.
  const week3 = await mat
    .locator('td.culms-att-cell')
    .nth(2)
    .locator('.culms-att-mark')
    .evaluateAll((els) => els.map((el) => el.className.replace('culms-att-mark is-', '')));
  expect(week3).toEqual(['none', 'missed']);
  const all = await marks(mat);
  expect(all.filter((s) => s === 'attended')).toHaveLength(5);
  expect(all.filter((s) => s === 'missed')).toHaveLength(2);
  expect(all.filter((s) => s === 'pending')).toHaveLength(2);
  expect(all.filter((s) => s === 'upcoming')).toHaveLength(20);
  await expect(mat.locator('td.culms-att-num').first()).toHaveText(/5\/7\s*71% · \+2 ждёт/);

  // Сегодняшний семинар линала ещё не кончился.
  const lin = await marks(courseRow(page, 'Линейная'));
  expect(lin.slice(0, 5)).toEqual(['attended', 'missed', 'attended', 'missed', 'upcoming']);

  // Карточки — по всем открытым курсам.
  await expect(view(page).locator('.culms-att-stat').first()).toHaveText(
    /8 \/ 13\s*был на семинарах · 62%/
  );
  await expect(view(page).locator('.culms-att-closed')).toHaveText(
    /закрыта: .*Теория вероятностей/
  );
});

test('норма красит процент и запоминается', async ({ page }) => {
  await open(page, LIST + '#summary');
  // Норма ЦУ — 75%: матан с 71% — жёлтый.
  await expect(view(page).locator('input[data-pref="norm"]')).toHaveValue('75');
  const rate = courseRow(page, 'Математический').locator('.culms-att-rate');
  await expect(rate).toHaveClass(/is-warn/);
  await view(page).locator('input[data-pref="norm"]').fill('70');
  await view(page).locator('input[data-pref="norm"]').dispatchEvent('change');
  await expect(courseRow(page, 'Математический').locator('.culms-att-rate')).toHaveClass(/is-ok/);
  await view(page).locator('input[data-pref="norm"]').fill('80');
  await view(page).locator('input[data-pref="norm"]').dispatchEvent('change');
  await expect(courseRow(page, 'Математический').locator('.culms-att-rate')).toHaveClass(/is-warn/);
  await expect(courseRow(page, 'Линейная').locator('.culms-att-rate')).toHaveClass(/is-bad/);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('culms.attendance.prefs')!).norm)
  ).toBe(80);
});

test('по неделям: список по дням и стрелки', async ({ page }) => {
  await open(page, LIST + '#summary');
  await view(page).locator('[data-view="week"]').click();
  await expect(view(page).locator('.culms-att-weeknav__title')).toHaveText(/Неделя 5/);
  const items = view(page).locator('.culms-att-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toHaveText(
    /11:30–12:50.*Математический.*Семинар 1 · Глухов Илья · B702.*Ждёт отметки/
  );
  await expect(items.nth(2)).toHaveText(/Линейная.*Впереди/);
  await expect(view(page).locator('.culms-att-day.is-today')).toHaveText(/чт, 8 октября · сегодня/);

  await view(page).getByRole('button', { name: 'Предыдущая неделя' }).click();
  await expect(view(page).locator('.culms-att-weeknav__title')).toHaveText(/Неделя 4/);
  await expect(items).toHaveCount(4);
  // Пропуски — английский во вторник и линал в четверг.
  await expect(items.filter({ hasText: 'Не был' })).toHaveCount(2);
  await view(page).getByRole('button', { name: 'Текущая неделя' }).click();
  await expect(view(page).locator('.culms-att-weeknav__title')).toHaveText(/Неделя 5/);

  // Вид запоминается.
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('culms.attendance.prefs')!).view)
  ).toBe('week');
});

test('контрольная из расписания — флажок в неделе и предупреждение', async ({ page }) => {
  await open(page, LIST + '#summary', { exams: true });
  const cell = courseRow(page, 'Математический').locator('td.culms-att-cell').nth(5);
  await expect(cell).toHaveClass(/has-exam/);
  await expect(cell.locator('.culms-att-exam')).toHaveAttribute('title', /Контрольная работа 1/);

  await view(page).locator('[data-view="week"]').click();
  await view(page).getByRole('button', { name: 'Следующая неделя' }).click();
  await expect(view(page).locator('.culms-att-banner')).toHaveText(
    /Контрольная работа 1 — .*Математический/
  );
});

test('страница курса: свои семинары за семестр и только своя группа в таблице', async ({
  page,
}) => {
  await open(page, LIST + '/10');
  const panel = page.locator('#culms-att-course');
  await expect(panel).toContainText('был на 5 из 7 (71%)');
  await expect(panel).toContainText('ещё 2 ждёт отметки');
  await expect(panel.locator('.culms-att-chip')).toHaveCount(30);
  await expect(panel.locator('.culms-att-chip.is-none')).toHaveText('21.09 пн');

  // В родной таблице за 30.09 — своя пара и чужая; чужая спрятана.
  const rows = page.locator('cu-course-attendance-events tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ visible: true })).toHaveCount(1);
  await expect(rows.filter({ visible: true })).toContainText('Диваков');

  await panel.getByLabel('Только мой семинар').uncheck();
  await expect(rows.filter({ visible: true })).toHaveCount(2);
});

test('страница курса: если своей пары в день нет — объясняем пустую таблицу', async ({ page }) => {
  await open(page, LIST);
  await page.locator('cu-courses-attendance tr.course-row', { hasText: 'Линейная' }).click();
  // На поддельной странице линал за 30.09 — пар нет вовсе: подсказки нет.
  await expect(page.locator('#culms-att-course')).toContainText('был на 2 из 4');
  await expect(page.locator('#culms-att-course')).not.toContainText('скрыто');

  // Подставим день, где есть только чужая группа.
  await page.evaluate(() => {
    const body = document.querySelector('cu-course-attendance-events fieldset')!;
    body.innerHTML =
      '<table class="cu-table table"><tbody><tr class="course-row"><td><div class="icon-container"></div></td><td>Семинар 1</td></tr></tbody></table>';
  });
  await expect(page.locator('#culms-att-course')).toContainText(
    'своего семинара нет — скрыто пар других групп: 1'
  );
});

test('прошедшие дни берутся из кеша: повторный заход почти без запросов', async ({ page }) => {
  await open(page, LIST + '#summary');
  await expect(view(page).locator('tbody tr')).toHaveCount(3);
  const first = requests.filter((r) => r.includes('/events/')).length;

  requests.length = 0;
  await page.reload();
  await page.addStyleTag({ content: CSS });
  for (const script of SCRIPTS) await page.addScriptTag({ content: script });
  await expect(view(page).locator('tbody tr')).toHaveCount(3);
  const second = requests.filter((r) => r.includes('/events/')).length;

  // Окончательные — старше 8 дней; заново спрашиваются только свежие.
  expect(second).toBeGreaterThan(0);
  expect(second).toBeLessThan(first / 3);
});
