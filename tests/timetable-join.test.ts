/**
 * «Мои пары»: ссылки на трансляции, плашка «Сейчас / Дальше» и другие группы
 * (timetable/timetable_join.js) — на поддельной странице.
 *
 * Скрипт и стили настоящие, разметка таблицы снята с живой LMS (Taiga 5.15),
 * ответы API — заглушки. Часы заморожены `page.clock`, время — московское.
 * Данные подобраны под то, что уже ломалось или легко сломать:
 *   - в занятиях дня (`calendar-events/.../events/{дата}`) LMS отдаёт только
 *     семинары — идущая сегодня лекция не должна выглядеть отменённой;
 *   - семинар английского сегодня по расписанию есть, а в занятиях дня нет —
 *     перенесли, в плашку он не попадает;
 *   - стресс-менеджмент раз в две недели с 21.09 (пт) — ближайший 9 октября,
 *     а не 2-го;
 *   - «Сердечки» меняют 🔴 на ❤️ в названии курса прямо в таблице.
 *
 * Запуск:
 *   bunx playwright test tests/timetable-join.test.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = resolve(__dirname, '..', 'src', 'plugins', 'timetable');
const JS = readFileSync(resolve(dir, 'timetable_join.js'), 'utf8');
const CSS = readFileSync(resolve(dir, 'timetable_join.css'), 'utf8');
const ORIGIN = 'https://lms.test';

type Slot = {
  id: string;
  day: string;
  start: string;
  end: string;
  host: string;
  place: string;
  interval?: number;
  startDate?: string;
};
type Row = { type: 'lecture' | 'seminar'; number: number; mine: Slot; others: Slot[] };
type Course = { id: number; name: string; rows: Row[] };

const COURSES: Course[] = [
  {
    id: 1,
    name: '🔴 Теория вероятностей. Основной уровень',
    rows: [
      {
        type: 'lecture',
        number: 1,
        mine: {
          id: '08df02ae-ef21-2278-ee51-4e0001020b03',
          day: 'tuesday',
          start: '10:00',
          end: '11:20',
          host: 'Куликов Александр',
          place: 'E201',
        },
        others: [],
      },
      {
        type: 'seminar',
        number: 1,
        mine: {
          id: '08df02ae-ef78-1be9-ee51-4e0001020b08',
          day: 'tuesday',
          start: '11:30',
          end: '14:20',
          host: 'Куликов Александр',
          place: 'S306-1 + S306-2',
        },
        others: [
          // Идёт прямо сейчас (в 10:30) у другой группы.
          {
            id: '08df02ae-0000-0000-0000-00000000aa01',
            day: 'tuesday',
            start: '10:00',
            end: '11:20',
            host: 'Фриман Екатерина',
            place: 'W316',
          },
          {
            id: '08df02ae-0000-0000-0000-00000000aa02',
            day: 'thursday',
            start: '16:00',
            end: '18:50',
            host: 'Платонов Евгений',
            place: 'S308',
          },
        ],
      },
    ],
  },
  {
    id: 2,
    name: 'Машинное обучение (Machine Learning). Бакалавриат',
    rows: [
      {
        type: 'lecture',
        number: 1,
        mine: {
          id: '08df0286-bab0-93c5-4c46-0d000105b3b8',
          day: 'wednesday',
          start: '10:00',
          end: '12:50',
          host: 'Калмыкова Надежда',
          place: 'E301',
        },
        // Второй поток лекции.
        others: [
          {
            id: '08df0286-bd8a-b8e0-4c46-0d000105b3bc',
            day: 'wednesday',
            start: '13:00',
            end: '15:50',
            host: 'Васильев Никита',
            place: 'E301',
          },
        ],
      },
    ],
  },
  {
    id: 3,
    name: 'Английский язык 204S3',
    rows: [
      {
        type: 'seminar',
        number: 1,
        mine: {
          id: '08df02af-013c-459a-ee51-4e0001021a56',
          day: 'tuesday',
          start: '14:30',
          end: '15:50',
          host: 'Смирнова Анна',
          place: 'S307',
        },
        others: [],
      },
    ],
  },
  {
    id: 4,
    name: 'Стресс-менеджмент и эмоциональный интеллект',
    rows: [
      {
        type: 'seminar',
        number: 1,
        mine: {
          id: '08df02af-2520-8cb2-ee51-4e00010228fe',
          day: 'friday',
          start: '16:00',
          end: '18:50',
          interval: 2,
          startDate: '2026-09-21',
          host: 'Ионова Ирина',
          place: 'S307',
        },
        others: [],
      },
    ],
  },
];
// Английский сегодня перенесли: в занятиях дня его нет.
const MOVED = new Set(['08df02af-013c-459a-ee51-4e0001021a56']);

const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const RU_DOW: Record<string, string> = {
  monday: 'Понедельник',
  tuesday: 'Вторник',
  wednesday: 'Среда',
  thursday: 'Четверг',
  friday: 'Пятница',
};

const event = (type: string, s: Slot) => ({
  calendarEventId: s.id,
  eventType: type,
  location: { title: s.place, building: 'ЦТ' },
  hosts: [{ name: s.host + ' ', email: 'teacher@lms.test' }],
  schedule: {
    startDate: s.startDate || '2026-09-07',
    endDate: '2026-12-20',
    startTime: s.start,
    endTime: s.end,
    dayOfWeek: s.day,
    interval: s.interval || 1,
    comment: null,
  },
  format: 'offline',
});

const requests: string[] = [];

function api(path: string): unknown {
  requests.push(path);
  if (path === '/api/micro-lms/students/me/timetables') {
    return COURSES.map((c) => ({
      courseId: c.id,
      courseName: c.name,
      eventRows: c.rows.map((r) => ({
        eventType: r.type,
        eventRowNumber: r.number,
        calendarEvent: event(r.type, r.mine),
      })),
    }));
  }
  let m = path.match(/^\/api\/micro-lms\/students\/me\/timetables\/(\d+)\/(\w+)\/(\d+)$/);
  if (m) {
    const row = COURSES.find((c) => c.id === Number(m![1]))!.rows.find(
      (r) => r.type === m![2] && r.number === Number(m![3])
    )!;
    return [row.mine, ...row.others].map((s) => ({ conflicts: null, ...event(row.type, s) }));
  }
  m = path.match(
    /^\/api\/micro-lms\/calendar-events\/learn\/courses\/(\d+)\/events\/(\d{4}-\d{2}-\d{2})$/
  );
  if (m) {
    // Как настоящая LMS: в занятиях дня только семинары, лекций нет.
    const dow = DOW[new Date(m[2] + 'T12:00:00Z').getUTCDay()];
    return COURSES.find((c) => c.id === Number(m![1]))!
      .rows.filter((r) => r.type === 'seminar')
      .flatMap((r) => [r.mine, ...r.others])
      .filter((s) => s.day === dow && !MOVED.has(s.id))
      .map((s) => ({
        eventId: s.id,
        isParticipant: true,
        actualDate: m![2],
        startTime: s.start,
        endTime: s.end,
        eventType: 'seminar',
        locationTitle: s.place,
        rowNumber: 1,
      }));
  }
  return null;
}

const pageHtml = () => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
  body { margin: 0; font: 14px/20px sans-serif; }
  th, td { text-align: left; padding: 12px; vertical-align: top; }
  .font-text-xs { font-size: 12px; line-height: 16px; }
</style></head><body>
<cu-student-timetable-events><h1 class="text-display-sm-700">Мои пары</h1><tui-loader class="content-loader">
<table class="cu-table table"><thead><tr><th class="course-column">Курс</th><th class="event-type-column">Пара</th><th class="schedule-column">Время</th><th class="host-name-column">Проводит</th></tr></thead><tbody>
${COURSES.map((c) =>
  c.rows
    .map(
      (
        r,
        i
      ) => `<tr>${i === 0 ? `<td class="course-column" rowspan="${c.rows.length}"> ${c.name} </td>` : ''}
<td class="event-type-column"> ${r.type === 'lecture' ? 'Лекция' : 'Семинар'} </td>
<td class="schedule-column"> ${RU_DOW[r.mine.day]}, ${r.mine.start} - ${r.mine.end} <div class="text-secondary font-text-xs"> Каждую неделю </div></td>
<td class="host-name-column"><span>${r.mine.host}</span></td></tr>`
    )
    .join('')
).join('')}
</tbody></table></tui-loader></cu-student-timetable-events></body></html>`;

/** Вторник 6 октября 2026, 10:30 по Москве: идёт лекция теорвера. */
const TUESDAY_1030 = new Date('2026-10-06T10:30:00+03:00');

async function open(page: Page, when = TUESDAY_1030, before?: () => void) {
  requests.length = 0;
  await page.clock.setFixedTime(when);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: api(url.pathname) });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageHtml() });
  });
  await page.goto(ORIGIN + '/learn/timetable');
  if (before) await page.evaluate(before);
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: JS });
  await expect(page.locator('.culms-tt-join-row')).toHaveCount(5);
}

const line = (page: Page, n: number) => page.locator('.culms-tt-join-row').nth(n);
const banner = (page: Page) => page.locator('#culms-tt-join-banner');

test('у каждой пары — ближайшее занятие и комната Толка по calendarEventId', async ({ page }) => {
  await open(page);
  await expect(line(page, 0).getByRole('link', { name: 'Трансляция ↗' })).toHaveAttribute(
    'href',
    'https://centraluniversity.ktalk.ru/08df02aeef212278ee514e0001020b03'
  );
  await expect(line(page, 1)).toContainText('Ближайшая: сегодня, 11:30–14:20');
  await expect(line(page, 2)).toContainText('Ближайшая: завтра, 10:00');
  // Раз в две недели с 25.09 — следующий 9 октября, а не 2-го.
  await expect(line(page, 4)).toContainText('Ближайшая: пт, 9 окт., 16:00');
});

test('идущая лекция — «Сейчас», хотя в занятиях дня LMS лекций не отдаёт', async ({ page }) => {
  await open(page);
  await expect(line(page, 0)).toContainText('Ближайшая: сегодня, 10:00–11:20');
  await expect(line(page, 0)).not.toContainText('нет');
  const live = banner(page).locator('.culms-tt-join-item--live');
  await expect(live).toHaveCount(1);
  await expect(live).toContainText('Теория вероятностей');
  await expect(live).toContainText('лекция · сегодня, 10:00–11:20 · E201 · ЦТ');
  await expect(live.getByRole('link', { name: 'Подключиться' })).toHaveAttribute(
    'href',
    /08df02aeef212278ee514e0001020b03$/
  );
  await expect(banner(page)).toContainText('Дальше');
});

test('перенесённый сегодня семинар помечен и в плашку не попадает', async ({ page }) => {
  await open(page, new Date('2026-10-06T14:19:00+03:00'));
  await expect(line(page, 3)).toContainText('Сегодня в LMS её нет');
  await expect(banner(page)).not.toContainText('Английский');
  // Свой семинар теорвера ещё идёт — он «Сейчас»; английский по расписанию
  // начинался бы через 11 минут и тоже попал бы туда.
  await expect(banner(page).locator('.culms-tt-join-item--live')).toContainText('семинар');
});

test('другие группы: варианты строки со ссылками, свой не повторяется', async ({ page }) => {
  await open(page);
  const toggle = line(page, 1).getByRole('button', { name: 'Другие группы' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const others = page.locator('.culms-tt-join-others').nth(1).locator('.culms-tt-join-other');
  await expect(others).toHaveCount(2);
  // Идущая сейчас — первой и с пометкой.
  await expect(others.first()).toHaveClass(/culms-tt-join-other--live/);
  await expect(others.first()).toContainText('Фриман Екатерина');
  await expect(others.first()).toContainText('вт · 10:00–11:20 · W316 · ЦТ');
  await expect(others.first()).toContainText('идёт сейчас');
  await expect(others.first().getByRole('link')).toHaveAttribute(
    'href',
    'https://centraluniversity.ktalk.ru/08df02ae00000000000000000000aa01'
  );
  await expect(others.nth(1)).toContainText('Платонов Евгений');
  await expect(others.nth(1)).toContainText('ближайшая: чт, 8 окт.');

  // Второй поток лекции.
  await line(page, 2).getByRole('button', { name: 'Другие группы' }).click();
  await expect(page.locator('.culms-tt-join-others').nth(2)).toContainText('Васильев Никита');

  // Варианты грузятся только по нажатию.
  expect(requests.filter((r) => /timetables\/\d+\//.test(r))).toHaveLength(2);

  // Без других групп — так и пишем.
  await line(page, 0).getByRole('button', { name: 'Другие группы' }).click();
  await expect(page.locator('.culms-tt-join-others').nth(0)).toHaveText(
    'Других групп у этой пары нет'
  );

  // Свернуть.
  await toggle.click();
  await expect(page.locator('.culms-tt-join-others').nth(1)).toBeHidden();
});

test('раскрытый список переживает перерисовку таблицы Angular', async ({ page }) => {
  await open(page);
  await line(page, 1).getByRole('button', { name: 'Другие группы' }).click();
  await expect(page.locator('.culms-tt-join-other')).toHaveCount(2);
  // Angular перерисовал таблицу — наших строк в ней не стало.
  await page.evaluate(() =>
    document
      .querySelectorAll('.culms-tt-join-row, .culms-tt-join-others')
      .forEach((n) => n.remove())
  );
  await expect(page.locator('.culms-tt-join-row')).toHaveCount(5);
  await expect(page.locator('.culms-tt-join-other')).toHaveCount(2);
});

test('«Сердечки» и свои названия курсов не мешают найти строки', async ({ page }) => {
  await open(page, TUESDAY_1030, () => {
    for (const cell of document.querySelectorAll('td.course-column')) {
      cell.textContent = cell.textContent!.replace('🔴', '❤️');
      if (cell.textContent.includes('Машинное')) {
        const original = cell.textContent.trim();
        cell.innerHTML = `<span data-culms-orig-name="${original}">Машинка</span>`;
        (window as any).cuLmsCourseNames = {
          originalFor: (el: Element, text: string) =>
            el.closest('[data-culms-orig-name]')?.getAttribute('data-culms-orig-name') ?? text,
          toOriginal: (text: string) => text,
        };
      }
    }
  });
  await expect(line(page, 0)).toContainText('Ближайшая: сегодня, 10:00–11:20');
  await expect(line(page, 2)).toContainText('Ближайшая: завтра, 10:00');
});
