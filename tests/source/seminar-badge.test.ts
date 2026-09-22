import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// `tasks_fix.js` целиком не выполнить — он сразу лезет в DOM и в storage.
// Берём из него только блок про аудиторные работы: если его переставят,
// тест упадёт на срезе, и это лучше, чем проверять исходник грепом.
const source = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/courses/tasks_fix.js'),
  'utf8'
);

const from = source.indexOf('const SEMINAR_ACTIVITY_KEYWORDS');
const to = source.indexOf('// --- КЭШ ДЛЯ ЗАГРУЖЕННЫХ ИКОНОК ---');
if (from === -1 || to === -1 || to < from) {
  throw new Error('Не нашли блок определения аудиторных работ в tasks_fix.js');
}

const { looksLikeHomework, isSeminarTask } = new Function(
  source.slice(from, to) + '\nreturn { looksLikeHomework, isSeminarTask };'
)() as {
  looksLikeHomework: (name: string) => boolean;
  isSeminarTask: (task: unknown, status: string, row: unknown) => boolean;
};

const row = (name: string) => ({ querySelector: () => ({ textContent: name }) });
const task = (exerciseName: string, activityName: string) => ({
  exercise: { name: exerciseName, activity: { name: activityName } },
});

test('домашку узнаём по началу слова в названии', () => {
  expect(looksLikeHomework('ДЗ 3_1. Матрично-векторное дифференцирование')).toBe(true);
  expect(looksLikeHomework('Д/З 5. Градиентный спуск')).toBe(true);
  expect(looksLikeHomework('Домашнее задание 2')).toBe(true);
  expect(looksLikeHomework('HW. Week 6')).toBe(true);

  expect(looksLikeHomework('Семинар 1. Неделя 2')).toBe(false);
  expect(looksLikeHomework('Контрольная работа')).toBe(false);
  // «дз» в середине слова — не домашка.
  expect(looksLikeHomework('Надзорная практика')).toBe(false);
});

// Ровно тот случай со скриншота: ДЗ по метоптам лежит в семинарской корзине
// оценок и из-за этого светилось «Аудиторной».
test('ДЗ в семинарской активности не становится аудиторной', () => {
  const homework = task('ДЗ 3_1. Матрично-векторное дифференцирование', 'Активность');
  expect(isSeminarTask(homework, 'Задано', row('ДЗ 3_1. Матрично-векторное дифференц...'))).toBe(
    false
  );
});

test('настоящая аудиторная работа помечается по-прежнему', () => {
  const seminar = task('Семинар 4. Неделя 5', 'Аудиторная работа на семинарах');
  expect(isSeminarTask(seminar, 'Задано', row('Семинар 4. Неделя 5'))).toBe(true);
  expect(isSeminarTask(seminar, 'В работе', row('Семинар 4. Неделя 5'))).toBe(true);
});

test('у сданного задания свой статус важнее типа', () => {
  const seminar = task('Семинар 4', 'Аудиторная работа на семинарах');
  expect(isSeminarTask(seminar, 'Решение прикреплено', row('Семинар 4'))).toBe(false);
  expect(isSeminarTask(seminar, 'Оценено', row('Семинар 4'))).toBe(false);
});

test('обычная активность без ключевых слов не трогается', () => {
  const exam = task('Контрольная 1', 'Контрольные работы');
  expect(isSeminarTask(exam, 'Задано', row('Контрольная 1'))).toBe(false);
});

// Строки сопоставляются с задачами по тексту и могут промахнуться, поэтому
// видимый заголовок проверяется отдельно от названия из API.
test('домашку видно и по заголовку строки, если из API приехало другое', () => {
  const mismatched = task('Семинар 4', 'Аудиторная работа на семинарах');
  expect(isSeminarTask(mismatched, 'Задано', row('ДЗ 4. Двойственность'))).toBe(false);
});
