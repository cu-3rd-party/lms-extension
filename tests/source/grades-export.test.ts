import { expect, test } from 'bun:test';
import vm from 'node:vm';
import { fetchAllGradesForExport } from '../../src/grades-export.ts';

// Сбор оценок для Excel background отправляет во вкладку LMS через
// scripting.executeScript, и туда уезжает только текст функции. Здесь она
// запускается так же: из текста, в пустом контексте, где снаружи есть лишь
// fetch. Сошлись функция на что-то из модуля (как было с lmsApi — экспорт
// падал с «S is not defined»), тест упадёт с тем же ReferenceError.

const LIST = '/api/micro-lms/performance/student';
const course = (id: number) => `/api/micro-lms/courses/${id}`;

const homework = { id: 10, name: 'Домашние задания', weight: 0.6, maxExercisesCount: 3 };
const exam = { id: 11, name: 'Экзамен', weight: 0.4, maxExercisesCount: 1 };

// Курс с одной оценённой домашкой, ещё не выданной домашкой и экзаменом,
// по которому заданий пока нет.
const courseRoutes = (id: number) => ({
  [`${course(id)}/student-performance`]: {
    tasks: [
      {
        id: id * 100,
        exerciseId: id * 10 + 1,
        state: 'evaluated',
        score: 8,
        extraScore: 1,
        maxScore: 10,
        activity: homework,
      },
    ],
  },
  [`${course(id)}/exercises`]: {
    exercises: [
      { id: id * 10 + 1, name: 'ДЗ 1', maxScore: 10, activity: homework },
      { id: id * 10 + 2, name: 'ДЗ 2', maxScore: 10, activity: homework },
    ],
  },
  [`${course(id)}/activities`]: [homework, exam],
});

const ROUTES: Record<string, unknown> = {
  [`${LIST}?isArchived=false`]: {
    courses: [
      { id: 1, name: 'Матанализ', courseStudentsStatus: 'required' },
      { id: 2, name: 'Тестовый курс для плагина', courseStudentsStatus: 'listener' },
    ],
  },
  // В архиве у курсов первого семестра LMS стоит listener, хотя их проходили.
  [`${LIST}?isArchived=true`]: {
    courses: [
      { id: 3, name: 'Линейная алгебра', courseStudentsStatus: 'listener', isArchived: true },
      { id: 4, name: 'Философия', courseStudentsStatus: 'required', isArchived: true },
    ],
  },
  ...courseRoutes(1),
  ...courseRoutes(3),
  ...courseRoutes(4),
};

async function runInTab(archived: boolean, routes = ROUTES, delays: Record<string, number> = {}) {
  const requested: string[] = [];
  const context = vm.createContext({
    fetch: async (url: string) => {
      requested.push(url);
      await new Promise((resolve) => setTimeout(resolve, delays[url] ?? 0));
      const body = routes[url];
      return body === undefined
        ? { ok: false, status: 404, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => body };
    },
    console: { error() {} },
  });

  const func = vm.runInContext(`(${fetchAllGradesForExport.toString()})`, context);
  // Результат из вкладки приходит клоном — сравниваем так же, без чужого realm.
  const result = JSON.parse(JSON.stringify(await func(archived)));
  return { requested, result };
}

test('функция работает из одного текста, без замыкания', async () => {
  const { result } = await runInTab(false);

  expect(result.error).toBeUndefined();
  expect(result.success).toBe(true);
});

test('текущие курсы: слушательские пропускаются, запросы идут на домен вкладки', async () => {
  const { requested, result } = await runInTab(false);

  expect(requested[0]).toBe(`${LIST}?isArchived=false`);
  expect(requested.every((url) => url.startsWith('/api/'))).toBe(true);
  expect(result.courses.map((c: any) => c.name)).toEqual(['Матанализ']);

  const tasks = result.courses[0].tasks;
  expect(tasks.map((task: any) => [task.state, task.exercise?.name])).toEqual([
    ['evaluated', 'ДЗ 1'],
    ['planned', 'Экзамен'],
    ['planned', 'ДЗ 2'],
  ]);
  expect(tasks[0]).toMatchObject({ score: 8, extraScore: 1, activity: { weight: 0.6 } });
});

test('архив: курсы первого семестра со статусом listener не теряются', async () => {
  const { requested, result } = await runInTab(true);

  expect(requested[0]).toBe(`${LIST}?isArchived=true`);
  expect(result.courses.map((c: any) => c.name)).toEqual(['Линейная алгебра', 'Философия']);
  expect(result.courses[0].tasks).toHaveLength(3);
});

test('курсы качаются параллельно, но идут в порядке LMS', async () => {
  // Первый курс отвечает дольше второго — второй готов раньше.
  const { result } = await runInTab(true, ROUTES, { [`${course(3)}/student-performance`]: 30 });

  expect(result.courses.map((c: any) => c.id)).toEqual([3, 4]);
});

test('без активностей курс всё равно выгружается', async () => {
  const routes = { ...ROUTES };
  delete routes[`${course(1)}/activities`];

  const { result } = await runInTab(false, routes);

  expect(result.success).toBe(true);
  expect(result.courses[0].tasks.map((task: any) => task.exercise?.name)).toEqual(['ДЗ 1', 'ДЗ 2']);
});

test('ошибка API доходит до попапа текстом', async () => {
  const routes = { ...ROUTES };
  delete routes[`${course(1)}/exercises`];

  const { result } = await runInTab(false, routes);

  expect(result).toEqual({
    success: false,
    error: `LMS API вернул 404 для ${course(1)}/exercises`,
  });
});
