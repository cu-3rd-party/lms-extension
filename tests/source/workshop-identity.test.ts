import { expect, test } from 'bun:test';
import vm from 'node:vm';
import {
  LMS_TAB_REQUIRED,
  LOGIN_REQUIRED,
  readStudentIdInPage,
  resolveStudentId,
  type StudentIdAnswer,
} from '../../src/workshop-identity.ts';

// Кто ты в LMS для 3rd-theme workshop. В Safari background не получает кук
// LMS, `/students/me` отвечает ему 401, и мастерская писала «войди в LMS»
// вошедшему студенту. Теперь на 401/403 id спрашивается из вкладки LMS.

const ME = { id: 'student-1', inn: '123456789012', snils: '000-000-000 00', phone: '+7' };

test('функция для вкладки работает из текста и отдаёт только id', async () => {
  const requested: { url: string; init: RequestInit }[] = [];
  const context = vm.createContext({
    fetch: async (url: string, init: RequestInit) => {
      requested.push({ url, init });
      return new Response(JSON.stringify(ME), { status: 200 });
    },
  });
  // Во вкладку уезжает только текст функции — ссылка на что-то из модуля
  // упала бы здесь с ReferenceError.
  const func = vm.runInContext(`(${readStudentIdInPage.toString()})`, context);
  const result = JSON.parse(JSON.stringify(await func()));

  expect(result).toEqual({ status: 200, id: 'student-1' });
  expect(requested.map((r) => r.url)).toEqual(['/api/student-hub/students/me']);
  expect(requested[0]?.init.credentials).toBe('include');
});

test('функция для вкладки на 401 отдаёт только статус', async () => {
  const context = vm.createContext({
    fetch: async () => new Response('{}', { status: 401 }),
  });
  const func = vm.runInContext(`(${readStudentIdInPage.toString()})`, context);
  expect(JSON.parse(JSON.stringify(await func()))).toEqual({ status: 401 });
});

const resolve = (background: StudentIdAnswer, tab: StudentIdAnswer | null) => {
  let tabAsked = 0;
  const promise = resolveStudentId({
    fromBackground: async () => background,
    fromLmsTab: async () => {
      tabAsked += 1;
      return tab;
    },
  });
  return { promise, tabAsked: () => tabAsked };
};

test('куки у background есть — вкладку не трогаем', async () => {
  const run = resolve({ status: 200, id: 'student-1' }, null);
  expect(await run.promise).toBe('student-1');
  expect(run.tabAsked()).toBe(0);
});

test('Safari: background получил 401 — id берётся из вкладки LMS', async () => {
  const run = resolve({ status: 401 }, { status: 200, id: 'student-1' });
  expect(await run.promise).toBe('student-1');
  expect(run.tabAsked()).toBe(1);
});

test('на 403 тоже спрашиваем вкладку', async () => {
  expect(await resolve({ status: 403 }, { status: 200, id: 'student-1' }).promise).toBe(
    'student-1'
  );
});

test('вкладки LMS нет — просим её открыть', async () => {
  await expect(resolve({ status: 401 }, null).promise).rejects.toThrow(LMS_TAB_REQUIRED);
});

test('вкладка тоже не вошла — просим войти', async () => {
  await expect(resolve({ status: 401 }, { status: 401 }).promise).rejects.toThrow(LOGIN_REQUIRED);
});

test('прочие ошибки LMS вкладку не будят', async () => {
  const run = resolve({ status: 502 }, { status: 200, id: 'student-1' });
  await expect(run.promise).rejects.toThrow('LMS: HTTP 502');
  expect(run.tabAsked()).toBe(0);
});

test('без id в ответе — внятная ошибка', async () => {
  await expect(resolve({ status: 200, id: null }, null).promise).rejects.toThrow(
    'LMS не отдала id студента'
  );
});
