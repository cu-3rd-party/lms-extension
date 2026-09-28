import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// `apricot_tasks_fix.js` целиком не выполнить — он сразу лезет в DOM и шлёт запросы.
// Берём из него только сопоставление задач LMS с задачами AKHCheck.
const source = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/courses/apricot_tasks_fix.js'),
  'utf8'
);

const from = source.indexOf('const STATUS_MAP');
const to = source.indexOf('let isFetching');
if (from === -1 || to === -1 || to < from) {
  throw new Error('Не нашли блок сопоставления задач в apricot_tasks_fix.js');
}

type Match = {
  finalStatus: string | null;
  scoreStr: string;
  akhDeadline: string | null;
  isDeadlineUrgent: boolean;
} | null;

const { normalize, namesMatch, matchInCourse } = new Function(
  source.slice(from, to) + '\nreturn { normalize, namesMatch, matchInCourse };'
)() as {
  normalize: (name: string) => string;
  namesMatch: (lmsName: string, akhName: string | null | undefined) => boolean;
  matchInCourse: (lmsName: string, course: unknown) => Match;
};

const course = (over: Record<string, unknown> = {}) => ({
  individualTasks: [],
  taskGroups: [],
  courseTasks: [],
  ...over,
});

test('задачу находим по имени без префикса «ДЗ N»', () => {
  const match = matchInCourse(
    normalize('ДЗ 2. Связные списки'),
    course({
      individualTasks: [{ name: 'Связные списки', status: 'On review', score: 3, maxScore: 10 }],
    })
  );
  expect(match?.finalStatus).toBe('On review');
  expect(match?.scoreStr).toBe('3/10');
});

test('имя, пустое после normalize, не совпадает с каждой задачей', () => {
  expect(namesMatch(normalize('ДЗ 3.'), 'Связные списки')).toBe(false);
  expect(namesMatch(normalize('Связные списки'), 'ДЗ 3.')).toBe(false);
  expect(namesMatch(normalize('Связные списки'), null)).toBe(false);

  const match = matchInCourse(
    normalize('Связные списки'),
    course({ individualTasks: [{ name: 'ДЗ 3.', status: 'Accepted' }] })
  );
  expect(match).toBeNull();
});

test('задача не из этого курса — null, чтобы искать в следующем', () => {
  const match = matchInCourse(
    normalize('Хеш-таблицы'),
    course({ individualTasks: [{ name: 'Связные списки', status: 'Accepted' }] })
  );
  expect(match).toBeNull();
});

test('группа git без имени не роняет поиск', () => {
  const match = matchInCourse(
    normalize('Git basics'),
    course({
      taskGroups: [
        { groupName: null, tasks: [{ status: 'Accepted' }] },
        { groupName: 'Git', aggregatedMaxScore: 5, tasks: [{ status: 'Accepted', score: 5 }] },
      ],
    })
  );
  expect(match?.finalStatus).toBe('Accepted');
  expect(match?.scoreStr).toBe('5/5');
});

test('дедлайн берём из деталей курса, даже без статуса', () => {
  const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const match = matchInCourse(
    normalize('Хеш-таблицы'),
    course({ courseTasks: [{ name: 'Хеш-таблицы', deadline: soon }] })
  );
  expect(match?.finalStatus).toBeNull();
  expect(match?.akhDeadline).toBeTruthy();
  expect(match?.isDeadlineUrgent).toBe(true);
});
