/**
 * «Мои пары»: столбец «Трансляция», плашка «Сейчас / Дальше», ссылки в drawer
 * LMS «Выбрать время» (timetable/timetable_join.js) и показ выбора пар при
 * закрытой записи без права пересесть (timetable/slot_view_main.js) — на
 * поддельной странице.
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

/**
 * Страница «Мои пары». `opened` — колонка действий LMS: она есть, только
 * пока запись открыта (или её показал slot_view_main.js). Кнопка действия
 * открывает drawer «Выбрать время» — разметка снята с живой LMS: варианты
 * идут в порядке ответа `timetables/{курс}/{тип}/{номер}`, внизу — кнопка
 * отправки, она и шлёт пересадку.
 */
const pageHtml = (
  opened: boolean
) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
  body { margin: 0; font: 14px/20px sans-serif; }
  th, td { text-align: left; padding: 12px; vertical-align: top; }
  .font-text-xs { font-size: 12px; line-height: 16px; }
  .drawer { position: fixed; top: 0; right: 0; width: 480px; height: 100%; background: #fff; overflow: auto; }
</style></head><body>
<cu-student-timetable-events><h1 class="text-display-sm-700">Мои пары</h1>
${opened ? '<cu-timetable-banner>Настрой расписание под себя</cu-timetable-banner>' : ''}
<tui-loader class="content-loader">
<table class="cu-table table"><thead><tr><th class="course-column">Курс</th><th class="event-type-column">Пара</th><th class="schedule-column">Время</th><th class="host-name-column">Проводит</th>${opened ? '<th class="actions-column"></th>' : ''}</tr></thead><tbody>
${COURSES.map((c) =>
  c.rows
    .map(
      (
        r,
        i
      ) => `<tr>${i === 0 ? `<td class="course-column" rowspan="${c.rows.length}"> ${c.name} </td>` : ''}
<td class="event-type-column"> ${r.type === 'lecture' ? 'Лекция' : 'Семинар'} </td>
<td class="schedule-column"> ${RU_DOW[r.mine.day]}, ${r.mine.start} - ${r.mine.end} <div class="text-secondary font-text-xs"> Каждую неделю </div></td>
<td class="host-name-column"><span>${r.mine.host}</span></td>
${opened ? `<td class="actions-column"><button type="button" class="action" data-row="${c.id}/${r.type}/${r.number}">✎</button></td>` : ''}</tr>`
    )
    .join('')
).join('')}
</tbody></table></tui-loader></cu-student-timetable-events>
<script>
  const VARIANTS = ${JSON.stringify(
    Object.fromEntries(
      COURSES.flatMap((c) =>
        c.rows.map((r) => [
          `${c.id}/${r.type}/${r.number}`,
          { course: c.name, type: r.type, slots: [r.mine, ...r.others] },
        ])
      )
    )
  )};
  const RU = ${JSON.stringify(RU_DOW)};
  // Как Angular: по действию строки открывается drawer с вариантами.
  document.addEventListener('click', (event) => {
    const action = event.target.closest('button.action');
    if (!action) return;
    document.querySelector('.drawer')?.remove();
    const v = VARIANTS[action.dataset.row];
    const drawer = document.createElement('div');
    drawer.className = 'drawer';
    drawer.innerHTML = '<form class="form"><div class="header"><h2 class="header__title">Выбрать время</h2><div cutext="m">' +
      (v.type === 'lecture' ? 'Лекция' : 'Семинар') + ' «' + v.course + '»</div></div>' +
      '<tui-loader class="loader"><tui-data-list class="events-list">' +
      v.slots.map((s) => '<button tuioption type="button" class="events-list__item"><div><span cutext="m"><span cutext="m-bold">' +
        RU[s.day] + ', ' + s.start + ' - ' + s.end + '</span>, Каждую неделю , ЦТ</span><div class="hosts"><div class="host"><span class="text-primary">' +
        s.host + ' </span></div></div></div></button>').join('') +
      '</tui-data-list></tui-loader><div class="footer"><button tuibutton type="submit"> Выбрать время </button></div></form>';
    drawer.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      window.__submitted = (window.__submitted || 0) + 1;
    });
    document.body.appendChild(drawer);
  });
</script></body></html>`;

/** Вторник 6 октября 2026, 10:30 по Москве: идёт лекция теорвера. */
const TUESDAY_1030 = new Date('2026-10-06T10:30:00+03:00');

type OpenOptions = { when?: Date; opened?: boolean; peek?: boolean; before?: () => void };

async function open(page: Page, options: OpenOptions = {}) {
  const { when = TUESDAY_1030, opened = false, peek = false, before } = options;
  requests.length = 0;
  // Толк в тестах не открываем по-настоящему.
  await page.context().route('https://centraluniversity.ktalk.ru/**', (r) => r.abort());
  await page.clock.setFixedTime(when);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: api(url.pathname) });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageHtml(opened) });
  });
  await page.goto(ORIGIN + '/learn/timetable');
  if (peek) {
    // Так помечает страницу slot_view_main.js, когда показывает выбор пар
    // при закрытой записи.
    await page.evaluate(() =>
      document.documentElement.setAttribute('data-culms-slot-view', 'peek')
    );
  }
  if (before) await page.evaluate(before);
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: JS });
  await expect(page.locator('td.culms-tt-join-cell .culms-tt-join-row')).toHaveCount(5);
}

const cell = (page: Page, n: number) => page.locator('td.culms-tt-join-cell').nth(n);
const banner = (page: Page) => page.locator('#culms-tt-join-banner');
const drawer = (page: Page) => page.locator('form.form');

test('свой столбец «Трансляция»: ближайшее занятие и комната Толка', async ({ page }) => {
  await open(page);
  await expect(page.locator('thead th').last()).toHaveText('Трансляция');
  await expect(cell(page, 0).getByRole('link', { name: 'Трансляция ↗' })).toHaveAttribute(
    'href',
    'https://centraluniversity.ktalk.ru/08df02aeef212278ee514e0001020b03'
  );
  await expect(cell(page, 1)).toContainText('сегодня, 11:30–14:20');
  await expect(cell(page, 2)).toContainText('завтра, 10:00');
  // Раз в две недели с 25.09 — следующий 9 октября, а не 2-го.
  await expect(cell(page, 4)).toContainText('пт, 9 окт., 16:00');
  // Под временем LMS ничего не дописано.
  await expect(page.locator('td.schedule-column .culms-tt-join-row')).toHaveCount(0);
  // Без колонки действий LMS открывать нечего — и кнопки нет.
  await expect(page.getByRole('button', { name: 'Все группы' })).toHaveCount(0);
});

test('идущая лекция — «Сейчас», хотя в занятиях дня LMS лекций не отдаёт', async ({ page }) => {
  await open(page);
  await expect(cell(page, 0)).toContainText('сегодня, 10:00–11:20');
  await expect(cell(page, 0).locator('.culms-tt-join-when--live')).toHaveCount(1);
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
  await open(page, { when: new Date('2026-10-06T14:19:00+03:00') });
  await expect(cell(page, 3)).toContainText('Сегодня в LMS её нет');
  await expect(banner(page)).not.toContainText('Английский');
  // Свой семинар теорвера ещё идёт — он «Сейчас»; английский по расписанию
  // начинался бы через 11 минут и тоже попал бы туда.
  await expect(banner(page).locator('.culms-tt-join-item--live')).toContainText('семинар');
});

test('запись закрыта: в drawer нет кнопки пересадки, у вариантов — трансляции', async ({
  page,
}) => {
  await open(page, { opened: true, peek: true });
  // Столбец — перед колонкой действий LMS.
  await expect(page.locator('thead th.culms-tt-join-column + th.actions-column')).toHaveCount(1);
  // Баннер «Настрой расписание» звал бы записываться.
  await expect(page.locator('cu-timetable-banner')).toBeHidden();
  // Значок «изменить» LMS не показываем: drawer открывает «Все группы».
  await expect(page.locator('th.actions-column')).toBeHidden();
  await expect(page.locator('button.action').first()).toBeHidden();

  await cell(page, 1).getByRole('button', { name: 'Все группы' }).click();
  await expect(drawer(page).locator('.header__title')).toHaveText('Все группы');
  await expect(drawer(page).locator('button[type="submit"]')).toHaveCount(0);
  await expect(drawer(page).locator('.footer')).toContainText('Запись на пары закрыта');

  const options = drawer(page).locator('[tuioption]');
  await expect(options.locator('.culms-tt-join-drawer-line')).toHaveCount(3);
  await expect(options.nth(0)).toContainText('твоя группа');
  await expect(options.nth(0).getByRole('link')).toHaveAttribute(
    'href',
    'https://centraluniversity.ktalk.ru/08df02aeef781be9ee514e0001020b08'
  );
  // Фриман ведёт прямо сейчас.
  await expect(options.nth(1)).toContainText('идёт сейчас');
  await expect(options.nth(1).getByRole('link')).toHaveAttribute(
    'href',
    'https://centraluniversity.ktalk.ru/08df02ae00000000000000000000aa01'
  );
  await expect(options.nth(2)).toContainText('ближайшая: чт, 8 окт., 16:00');

  // Ссылка открывает Толк в новой вкладке и не выбирает вариант.
  const request = page
    .context()
    .waitForEvent('request', (r) => r.url().startsWith('https://centraluniversity.ktalk.ru/'));
  await options.nth(2).getByRole('link').click();
  expect((await request).url()).toBe(
    'https://centraluniversity.ktalk.ru/08df02ae00000000000000000000aa02'
  );
  expect(await page.evaluate(() => (window as any).__submitted || 0)).toBe(0);
});

test('запись открыта: значок LMS на месте, drawer по нему тоже со ссылками', async ({ page }) => {
  await open(page, { opened: true });
  await page.locator('button.action[data-row="2/lecture/1"]').click();
  const options = drawer(page).locator('[tuioption]');
  await expect(options).toHaveCount(2);
  await expect(options.nth(1)).toContainText('Васильев Никита');
  await expect(options.nth(1).getByRole('link')).toHaveAttribute('href', /0d000105b3bc$/);
});

test('запись открыта по-настоящему: drawer LMS не трогаем, кроме ссылок', async ({ page }) => {
  await open(page, { opened: true });
  await expect(page.locator('cu-timetable-banner')).toBeVisible();
  await cell(page, 1).getByRole('button', { name: 'Все группы' }).click();
  await expect(drawer(page).locator('.header__title')).toHaveText('Выбрать время');
  await expect(drawer(page).locator('button[type="submit"]')).toBeVisible();
  await expect(drawer(page).locator('.culms-tt-join-drawer-line')).toHaveCount(3);
});

test('ушли с «Моих пар» — плашка и столбец исчезают, чужие таблицы не трогаем', async ({
  page,
}) => {
  await open(page);
  await expect(banner(page)).toBeVisible();
  // Переход роутером Angular: страница та же, разметка — архив курсов.
  await page.evaluate(() => {
    history.pushState(null, '', '/learn/courses/view/archived');
    document.body.innerHTML =
      '<h1>Архивные курсы</h1><table class="cu-table table"><thead><tr><th>Название</th></tr></thead>' +
      '<tbody><tr><td class="schedule-column">Курс</td></tr></tbody></table>';
  });
  await expect(banner(page)).toHaveCount(0);
  await page.waitForTimeout(600);
  await expect(page.locator('.culms-tt-join-column, .culms-tt-join-cell')).toHaveCount(0);
});

test('столбец возвращается после перерисовки таблицы Angular', async ({ page }) => {
  await open(page);
  await page.evaluate(() =>
    document
      .querySelectorAll('.culms-tt-join-column, .culms-tt-join-cell')
      .forEach((n) => n.remove())
  );
  await expect(page.locator('th.culms-tt-join-column')).toHaveCount(1);
  await expect(page.locator('td.culms-tt-join-cell .culms-tt-join-row')).toHaveCount(5);
});

test('«Сердечки» и свои названия курсов не мешают найти строки', async ({ page }) => {
  await open(page, {
    before: () => {
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
    },
  });
  await expect(cell(page, 0)).toContainText('сегодня, 10:00–11:20');
  await expect(cell(page, 2)).toContainText('завтра, 10:00');
});

// --- slot_view_main.js: подмена окна записи и запрет пересадки ---

const MAIN = readFileSync(resolve(dir, 'slot_view_main.js'), 'utf8');
const CLOSED = {
  openDate: '2026-09-01T07:07:00Z',
  closeDate: '2026-09-20T20:59:00Z',
  isEnabled: false,
};
const OPEN = {
  openDate: '2026-10-01T07:00:00Z',
  closeDate: '2026-10-20T20:59:00Z',
  isEnabled: true,
};

async function openMain(page: Page, config: object) {
  const posts: string[] = [];
  await page.clock.setFixedTime(TUESDAY_1030);
  await page.addInitScript(MAIN);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/slot-management/config')) return route.fulfill({ json: config });
    if (url.pathname.startsWith('/api/')) {
      posts.push(`${route.request().method()} ${url.pathname}`);
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>lms</title>' });
  });
  await page.goto(ORIGIN + '/learn/timetable');
  // Как HttpClient Angular: JSON он просит текстом и разбирает сам.
  const xhr = (method: string, url: string) =>
    page.evaluate(
      ([m, u]) =>
        new Promise<{ text?: string; thrown?: string }>((resolveXhr) => {
          const x = new XMLHttpRequest();
          x.open(m, u);
          x.responseType = 'text';
          x.onload = () => resolveXhr({ text: x.responseText });
          try {
            x.send(m === 'POST' ? '{}' : null);
          } catch (e) {
            resolveXhr({ thrown: (e as Error).name });
          }
        }),
      [method, url]
    );
  return { posts, xhr };
}

test('запись закрыта: окно подменяется, пересадка на сервер не уходит', async ({ page }) => {
  const { posts, xhr } = await openMain(page, CLOSED);
  const got = await xhr('GET', '/api/micro-lms/calendar-events/slot-management/config');
  const cfg = JSON.parse(got.text!);
  const now = TUESDAY_1030.getTime();
  expect(Date.parse(cfg.openDate)).toBeLessThanOrEqual(now);
  expect(Date.parse(cfg.closeDate)).toBeGreaterThanOrEqual(now);
  expect(
    await page.evaluate(() => document.documentElement.getAttribute('data-culms-slot-view'))
  ).toBe('peek');

  const post = await xhr('POST', '/api/micro-lms/students/me/timetables/2/seminar/1');
  expect(post.thrown).toBe('NotAllowedError');
  const put = await xhr('PUT', '/api/micro-lms/calendar-events/slot-management/config');
  expect(put.thrown).toBe('NotAllowedError');
  expect(posts).toEqual([]);
  // Остальные запросы — как были.
  await xhr('GET', '/api/micro-lms/students/me/timetables/2/seminar/1');
  expect(posts).toEqual(['GET /api/micro-lms/students/me/timetables/2/seminar/1']);
});

test('запись открыта: ответ не трогаем, записаться можно', async ({ page }) => {
  const { posts, xhr } = await openMain(page, OPEN);
  const got = await xhr('GET', '/api/micro-lms/calendar-events/slot-management/config');
  expect(JSON.parse(got.text!)).toEqual(OPEN);
  expect(
    await page.evaluate(() => document.documentElement.hasAttribute('data-culms-slot-view'))
  ).toBe(false);
  const post = await xhr('POST', '/api/micro-lms/students/me/timetables/2/seminar/1');
  expect(post.thrown).toBeUndefined();
  expect(posts).toEqual(['POST /api/micro-lms/students/me/timetables/2/seminar/1']);
});
