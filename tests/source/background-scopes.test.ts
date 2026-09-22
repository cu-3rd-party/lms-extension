import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Области своего фона: к каким областям относится адрес, в каком порядке
// они ищутся и что реестр настроек переносит их картинки файлом профиля.
const read = (path: string) => readFileSync(resolve(import.meta.dir, '../..', path), 'utf8');

type Scope = { kind: string; key: string; title: string };

function load(path: string, globalName: string, browser: unknown = {}) {
  const window: Record<string, any> = {};
  new Function('window', 'browser', 'chrome', read(path))(window, browser, browser);
  return window[globalName];
}

const scopes = load('src/plugins/_shared/background_scopes.js', 'cuLmsBackgroundScopes') as {
  sectionFor: (path: string) => string | null;
  courseIdFor: (path: string) => string | null;
  normalizePath: (path: string) => string;
  scopesFor: (path: string) => Scope[];
  isScopeKey: (key: string) => boolean;
};

test('адреса LMS раскладываются по разделам', () => {
  const cases: [string, string | null][] = [
    ['/learn/courses/view/actual/all', 'courses'],
    ['/learn/courses/view/actual', 'courses'],
    ['/learn/courses/view/archived/all/', 'courses'],
    ['/learn/courses/view/actual/1234', 'course'],
    ['/learn/courses/view/archived/1234/themes', 'course'],
    // Лонгрид лежит внутри адреса курса — обязан победить курс.
    ['/learn/courses/view/actual/1234/5678/longreads/91011', 'longreads'],
    ['/learn/tasks/actual-student-tasks', 'tasks'],
    // Архив лежит внутри задач — обязан победить задачи.
    ['/learn/tasks/archived-student-tasks', 'tasksArchive'],
    ['/learn/timetable', 'timetable'],
    ['/learn/reports/student-performance/42/activity', 'reports'],
    ['/learn', null],
    ['/learn/tasksomething', null],
  ];
  cases.forEach(([path, expected]) =>
    expect([path, scopes.sectionFor(path)]).toEqual([path, expected])
  );
});

test('курс узнаётся по id, действующий и архивный — один курс', () => {
  expect(scopes.courseIdFor('/learn/courses/view/actual/1234')).toBe('1234');
  expect(scopes.courseIdFor('/learn/courses/view/archived/1234/5/longreads/6')).toBe('1234');
  expect(scopes.courseIdFor('/learn/courses/view/actual/all')).toBeNull();
  expect(scopes.courseIdFor('/learn/tasks')).toBeNull();
});

test('та же страница с лишней косой чертой — та же страница', () => {
  expect(scopes.normalizePath('/learn/tasks/')).toBe('/learn/tasks');
  expect(scopes.normalizePath('/learn//tasks')).toBe('/learn/tasks');
  expect(scopes.normalizePath('/')).toBe('/');
});

test('области идут от узкой к широкой', () => {
  const longread = scopes.scopesFor('/learn/courses/view/actual/1234/5678/longreads/91011/');
  expect(longread.map((scope) => [scope.kind, scope.key])).toEqual([
    ['page', 'customBackground.page:/learn/courses/view/actual/1234/5678/longreads/91011'],
    ['course', 'customBackground.course:1234'],
    ['section', 'customBackground.section:longreads'],
    ['all', 'customBackground'],
  ]);

  // Вне курса и вне разделов остаются только страница и «все страницы».
  expect(scopes.scopesFor('/learn/profile').map((scope) => scope.kind)).toEqual(['page', 'all']);
  expect(scopes.scopesFor('/learn/tasks').map((scope) => scope.kind)).toEqual([
    'page',
    'section',
    'all',
  ]);
});

test('ключ области отличается от прочих ключей хранилища', () => {
  expect(scopes.isScopeKey('customBackground')).toBe(true);
  expect(scopes.isScopeKey('customBackground.course:1')).toBe(true);
  expect(scopes.isScopeKey('customBackgroundToggle')).toBe(false);
  expect(scopes.isScopeKey('customLogo')).toBe(false);
});

// --- реестр настроек ---

function loadRegistry(local: Record<string, unknown> = {}) {
  const browser = {
    storage: {
      sync: { get: async () => ({}) },
      local: {
        get: async (keys: string[] | null) => {
          if (keys === null) return { ...local };
          const out: Record<string, unknown> = {};
          keys.forEach((key) => {
            if (key in local) out[key] = local[key];
          });
          return out;
        },
      },
    },
    runtime: { getManifest: () => ({ version: 'test' }) },
  };
  return load('src/plugins/_shared/settings_registry.js', 'cuLmsSettings', browser) as {
    entryFor: (key: string) => { group: string; area: string; type: string } | null;
    inspect: (raw: unknown) => {
      ok: boolean;
      accepted: { key: string }[];
      rejected: { key: string }[];
    };
    collect: (kind: string) => Promise<{ values: Record<string, unknown> }>;
  };
}

test('картинки областей описаны в реестре префиксом', () => {
  const registry = loadRegistry();
  ['customBackground.page:/learn/tasks', 'customBackground.course:1234'].forEach((key) =>
    expect(registry.entryFor(key)).toMatchObject({
      group: 'content',
      area: 'local',
      type: 'string',
    })
  );
  // Сам префикс без хвоста — не ключ области.
  expect(registry.entryFor('customBackground.')).toBeNull();
  // Флаг открытого редактора — служебный, в профиль не попадает.
  expect(registry.entryFor('backgroundEditorActive')).toMatchObject({ group: 'private' });
});

test('визуальный пак увозит и привозит картинки всех страниц', async () => {
  const local = {
    customBackground: 'data:image/png;base64,AAAA',
    'customBackground.page:/learn/tasks': 'data:image/png;base64,BBBB',
    'customBackground.course:1234': 'data:image/png;base64,CCCC',
    backgroundEditorActive: true,
    courseNames: { 1: 'Свой' },
  };
  const registry = loadRegistry(local);
  const profile = await registry.collect('visual');

  expect(profile.values).toMatchObject({
    customBackground: local.customBackground,
    'customBackground.page:/learn/tasks': local['customBackground.page:/learn/tasks'],
    'customBackground.course:1234': local['customBackground.course:1234'],
  });
  expect(profile.values).not.toHaveProperty('backgroundEditorActive');
  expect(profile.values).not.toHaveProperty('courseNames');

  const inspected = registry.inspect(
    JSON.stringify({ ...profile, values: { ...profile.values, backgroundEditorActive: true } })
  );
  expect(inspected.ok).toBe(true);
  expect(inspected.accepted.map((item) => item.key).sort()).toEqual(
    Object.keys(profile.values).sort()
  );
  expect(inspected.rejected.map((item) => item.key)).toEqual(['backgroundEditorActive']);
});
