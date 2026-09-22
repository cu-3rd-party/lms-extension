import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// `tasks_fix.js` целиком не выполнить — он сразу лезет в DOM и в storage.
// Берём из него только блок про скрытие старых заданий: если его переставят,
// тест упадёт на срезе, и это лучше, чем проверять исходник грепом.
const source = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/courses/tasks_fix.js'),
  'utf8'
);

const from = source.indexOf('const MONTH_PREFIXES');
const to = source.indexOf('  /** Текст ячейки с дедлайном. */');
if (from === -1 || to === -1 || to < from) {
  throw new Error('Не нашли блок разбора дат в tasks_fix.js');
}

const { parseSettingDate, parseVisibleDate } = new Function(
  source.slice(from, to) + '\nreturn { parseSettingDate, parseVisibleDate };'
)() as {
  parseSettingDate: (value: unknown) => number | null;
  parseVisibleDate: (text: string, now?: Date) => Date | null;
};

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

test('дата из настройки читается как местная полночь', () => {
  expect(parseSettingDate('2026-09-25')).toBe(day(2026, 9, 25));
  // `new Date('2026-09-25')` разбирается как UTC и в плюсовых поясах сдвигает
  // границу на день назад. Сверяемся с этим только там, где сдвиг вообще есть:
  // на машине в UTC оба способа совпадают, и проверять было бы нечего.
  const utcOffset = new Date(2026, 8, 25).getTimezoneOffset();
  if (utcOffset !== 0) {
    expect(parseSettingDate('2026-09-25')).not.toBe(new Date('2026-09-25').getTime());
  }
});

test('пустая и кривая дата означают «фильтр не настроен»', () => {
  expect(parseSettingDate('')).toBeNull();
  expect(parseSettingDate(undefined)).toBeNull();
  expect(parseSettingDate(null)).toBeNull();
  expect(parseSettingDate('25.09.2026')).toBeNull();
  expect(parseSettingDate('2026-9-5')).toBeNull();
});

// Ровно то, что видно в таблице: день недели, число, сокращённый месяц, время.
test('дедлайн из строки таблицы разбирается без года', () => {
  const now = new Date(2026, 8, 22); // 22 сентября 2026
  expect(parseVisibleDate('Пт, 25 сент. 22:00', now)?.getTime()).toBe(day(2026, 9, 25));
  expect(parseVisibleDate('Вт, 3 февр. 18:30', now)?.getTime()).toBe(day(2027, 2, 3));
});

test('время не принимают за год', () => {
  const now = new Date(2026, 8, 22);
  // «22:00» — это часы, а не 2200-й год: год отличаем по четырём цифрам.
  expect(parseVisibleDate('Пт, 25 сент. 22:00', now)?.getFullYear()).toBe(2026);
});

test('год без подсказки берём ближайший к сегодня', () => {
  // Январь: декабрьский дедлайн относится к прошлому году, а не к будущему.
  const january = new Date(2026, 0, 10);
  expect(parseVisibleDate('20 дек. 23:59', january)?.getTime()).toBe(day(2025, 12, 20));

  // Декабрь: январский — к следующему.
  const december = new Date(2026, 11, 20);
  expect(parseVisibleDate('10 янв. 23:59', december)?.getTime()).toBe(day(2027, 1, 10));
});

test('явный год важнее догадки', () => {
  const now = new Date(2026, 8, 22);
  expect(parseVisibleDate('25 сентября 2024', now)?.getTime()).toBe(day(2024, 9, 25));
});

test('«марта» не становится маем', () => {
  const now = new Date(2026, 2, 1);
  expect(parseVisibleDate('5 марта 12:00', now)?.getMonth()).toBe(2);
  expect(parseVisibleDate('5 мая 12:00', now)?.getMonth()).toBe(4);
  expect(parseVisibleDate('5 мар. 12:00', now)?.getMonth()).toBe(2);
});

test('все месяцы узнаются в сокращённом виде', () => {
  const now = new Date(2026, 5, 15);
  const short = [
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
  short.forEach((month, index) => {
    expect(parseVisibleDate(`15 ${month} 10:00`, now)?.getMonth()).toBe(index);
  });
});

test('числовая дата тоже читается', () => {
  const now = new Date(2026, 8, 22);
  expect(parseVisibleDate('25.09.2024 22:00', now)?.getTime()).toBe(day(2024, 9, 25));
  expect(parseVisibleDate('25.09.24 22:00', now)?.getTime()).toBe(day(2024, 9, 25));
});

test('в строке без даты ничего не находится', () => {
  const now = new Date(2026, 8, 22);
  expect(parseVisibleDate('', now)).toBeNull();
  expect(parseVisibleDate('Не сдано', now)).toBeNull();
  // 40-е число — не дата.
  expect(parseVisibleDate('40 сент. 22:00', now)).toBeNull();
  // Слово не месяц.
  expect(parseVisibleDate('5 попугаев', now)).toBeNull();
});

// Граница фильтра: «раньше даты N» — это строго до начала дня N.
test('сравнение с границей дня', () => {
  const border = parseSettingDate('2026-09-25')!;
  expect(new Date(2026, 8, 24, 22, 0).getTime() < border).toBe(true);
  expect(new Date(2026, 8, 25, 0, 0).getTime() < border).toBe(false);
  expect(new Date(2026, 8, 25, 22, 0).getTime() < border).toBe(false);
});
