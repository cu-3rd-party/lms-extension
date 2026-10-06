/**
 * Полоса посещаемости под «Прогрессом по курсу» на странице курса — на
 * поддельной странице.
 *
 * Логин в LMS и расширение не нужны: скрипты плагина — обычные скрипты
 * страницы, данные они берут из запросов к API, которые подменены заглушками.
 * Разметка виджета повторяет живой `/learn/courses/view/actual/{id}`
 * (`cu-course-progress-widget`, Taiga 5.15), скрипты и стили — настоящие.
 *
 * Время заморожено на четверге 8 октября 2026, 15:00. У курса один семинар по
 * понедельникам, отслеживание — с 21 сентября:
 *   - 21.09 — был;
 *   - 28.09 — отметки нет, прошло больше недели: «не был»;
 *   - 05.10 — отметки нет, прошло меньше недели: «ждёт отметки»;
 *   - дальше — впереди; «за семестр» в LMS — 13.
 * Курс 1143 в посещаемости закрыт — полосы быть не должно.
 *
 * Запуск:
 *   bunx playwright test tests/course-attendance-bar.test.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const plugins = resolve(__dirname, '..', 'src', 'plugins');
const read = (path: string) => readFileSync(resolve(plugins, path), 'utf8');
const SCRIPTS = ['attendance/attendance_api.js', 'course-view/course_attendance_bar.js'].map(read);
const CSS = read('course-view/course_attendance_bar.css');

const ORIGIN = 'https://lms.test';
const NOW = new Date(2026, 9, 8, 15, 0, 0);

// Задержка ответов API: проверяем, что полоса рисуется до них.
let apiDelay = 0;
const requests: string[] = [];

const COURSES = [
  {
    courseId: 1142,
    courseName: 'Основы бизнес-аналитики',
    studentStatus: 'required',
    isVisibleForStudents: true,
    stats: { percent: 8, attendedCount: 1, enrolledCount: 13 },
  },
  {
    courseId: 1143,
    courseName: 'Закрытый курс',
    studentStatus: 'required',
    isVisibleForStudents: false,
    stats: null,
  },
];

const mondayEvent = (date: string) => ({
  eventId: 'bi-mon',
  isParticipant: true,
  actualDate: date,
  startTime: '11:30',
  endTime: '12:50',
  title: COURSES[0].courseName,
  eventType: 'seminar',
  format: 'offline',
  rowNumber: 1,
  locationTitle: 'B702',
  hosts: [{ email: 'teacher@lms.test', name: 'Глухов Илья ' }],
});

function api(url: URL): { status?: number; json: unknown } {
  const path = url.pathname;
  if (path === '/api/micro-lms/v0/attendance/learn/courses') return { json: COURSES };
  if (path === '/api/micro-lms/students/me/timetables') {
    return {
      json: [
        {
          courseId: 1142,
          courseName: COURSES[0].courseName,
          eventRows: [
            {
              eventType: 'seminar',
              eventRowNumber: 1,
              calendarEvent: {
                calendarEventId: 'bi-mon',
                eventType: 'seminar',
                location: { title: 'B702', building: 'ЦТ' },
                hosts: [{ name: 'Глухов Илья ', email: 'teacher@lms.test' }],
                schedule: {
                  startDate: '2026-09-07',
                  endDate: '2026-12-20',
                  startTime: '11:30',
                  endTime: '12:50',
                  dayOfWeek: 'monday',
                  interval: 1,
                  comment: null,
                },
                format: 'offline',
              },
            },
          ],
        },
      ],
    };
  }
  let m = path.match(
    /^\/api\/micro-lms\/calendar-events\/learn\/courses\/1142\/events\/(\d{4}-\d{2}-\d{2})$/
  );
  if (m) {
    const monday = new Date(m[1] + 'T12:00:00Z').getUTCDay() === 1;
    return { json: monday ? [mondayEvent(m[1])] : [] };
  }
  m = path.match(
    /^\/api\/micro-lms\/v0\/attendance\/learn\/courses\/1142\/events\/(\d{4}-\d{2}-\d{2})$/
  );
  if (m) return { json: m[1] === '2026-09-21' ? ['bi-mon'] : [] };
  return { status: 404, json: null };
}

const courseHtml = `
  <cu-course-overview>
    <cu-widgets-panel class="course-widgets"><section class="widgets-container first-section">
      <cu-course-progress-widget class="progress-widget">
        <h3 class="title text-primary">Прогресс по курсу</h3>
        <div class="progress-details">
          <span class="score-details text-secondary"><span class="score text-primary">0.63</span> из 10</span>
          <div class="progress-bar"><div class="progress-item earned" style="width: 6%"></div></div>
        </div>
      </cu-course-progress-widget>
    </section></cu-widgets-panel>
  </cu-course-overview>`;

const page_ = () => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
  body { margin: 0; font: 14px/20px system-ui, sans-serif; background: #fff; color: #1c1c1e; }
  cu-course-progress-widget { display: flex; flex-direction: column; width: 300px; margin: 24px;
    padding: 14px 16px; border: 1px solid #e9eaea; border-radius: 16px; }
  .progress-details { display: flex; flex-direction: column; }
  .score { font-size: 30px; }
</style></head><body><div id="app">${courseHtml}</div></body></html>`;

async function open(page: Page, path: string) {
  await page.clock.setFixedTime(NOW);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      requests.push(url.pathname);
      await new Promise((resolve) => setTimeout(resolve, apiDelay));
      const { status, json } = api(url);
      return route.fulfill({ status: status ?? 200, json });
    }
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: page_() });
  });
  await page.goto(ORIGIN + path);
  await page.addStyleTag({ content: CSS });
  for (const script of SCRIPTS) await page.addScriptTag({ content: script });
}

const block = (page: Page) => page.locator('#culms-course-att');

test.beforeEach(() => {
  apiDelay = 0;
  requests.length = 0;
});

test('под прогрессом по курсу: посещено, прошло, максимум и процент', async ({ page }) => {
  await open(page, '/learn/courses/view/actual/1142');
  await expect(block(page)).toBeVisible();
  // Сразу после родной полосы оценок, внутри того же виджета.
  await expect(
    page.locator('cu-course-progress-widget > .progress-details + #culms-course-att')
  ).toHaveCount(1);
  await expect(block(page).locator('.culms-course-att__big')).toHaveText('1');
  // Из 13 за семестр; процент — от окончательных пар (был и не был): 1 из 2.
  await expect(block(page).locator('.culms-course-att__score')).toContainText('из 13');
  await expect(block(page).locator('.culms-course-att__rate')).toHaveText('50%');
  await expect(block(page).locator('.culms-course-att__rate')).toHaveClass(/is-bad/);
  const rows = block(page).locator('.culms-course-att__row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Посещено1');
  // Максимум 12 (13 за семестр минус один пропуск) минус уже посещённый.
  await expect(rows.nth(1)).toContainText('Еще можно посетить11');
});

test('ширины сегментов — доли семестра', async ({ page }) => {
  await open(page, '/learn/courses/view/actual/1142');
  await expect(block(page)).toBeVisible();
  const widths = await block(page)
    .locator('.culms-course-att__seg')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).style.width));
  expect(widths.map((w) => Math.round(parseFloat(w) * 10) / 10)).toEqual([7.7, 84.6, 7.7]);
});

test('при повторном заходе полоса рисуется сразу, до ответа LMS; грузится только свой курс', async ({
  page,
}) => {
  await open(page, '/learn/courses/view/actual/1142');
  await expect(block(page)).toBeVisible();
  // Загрузка шла только по этому курсу: ни дней чужого курса, ни его отметок.
  expect(requests.filter((r) => /courses\/1143\//.test(r))).toEqual([]);

  // Второй заход: LMS отвечает долго, а полоса уже стоит из сохранённых чисел.
  apiDelay = 3000;
  await page.reload();
  await page.addStyleTag({ content: CSS });
  for (const script of SCRIPTS) await page.addScriptTag({ content: script });
  await expect(block(page)).toBeVisible({ timeout: 1000 });
  await expect(block(page).locator('.culms-course-att__big')).toHaveText('1');
  apiDelay = 0;
});

test('курс с закрытой посещаемостью — полосы нет', async ({ page }) => {
  await open(page, '/learn/courses/view/actual/1143');
  await page.waitForTimeout(500);
  await expect(block(page)).toHaveCount(0);
});

test('архивный курс и другие страницы — полосы нет', async ({ page }) => {
  await open(page, '/learn/courses/view/archived/1142');
  await page.waitForTimeout(500);
  await expect(block(page)).toHaveCount(0);
});
