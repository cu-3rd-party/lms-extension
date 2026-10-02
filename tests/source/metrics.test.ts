import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  FEATURE_TOGGLES,
  GOALS,
  buildHitUrl,
  featureSnapshot,
  isGoal,
  localDay,
  makeClientId,
} from '../../src/metrics-hit';

// Анонимная статистика в Яндекс Метрику (src/metrics.ts): что именно уходит в
// запросе и что список тумблеров не разъехался с реестром настроек.
const read = (path: string) => readFileSync(resolve(import.meta.dir, '../..', path), 'utf8');

type Entry = { key: string; type: string; group: string; fallback?: unknown };

const registry = (() => {
  const window: Record<string, any> = {};
  new Function('window', 'browser', 'chrome', read('src/plugins/_shared/settings_registry.js'))(
    window,
    {},
    {}
  );
  return window.cuLmsSettings as { REGISTRY: Entry[] };
})();

test('тумблеры функций совпадают с реестром настроек вместе со значениями по умолчанию', () => {
  const fromRegistry = Object.fromEntries(
    registry.REGISTRY.filter(
      (entry) =>
        entry.type === 'boolean' &&
        ['appearance', 'theme', 'features', 'integrations'].includes(entry.group)
    ).map((entry) => [entry.key, entry.fallback])
  );
  expect({ ...FEATURE_TOGGLES } as Record<string, unknown>).toEqual(fromRegistry);
});

test('ключи статистики описаны в реестре и в файл настроек не попадают', () => {
  for (const key of ['metricsEnabled', 'metricsClientId', 'metricsLastDaily']) {
    const entry = registry.REGISTRY.find((e) => e.key === key);
    expect(entry?.group).toBe('private');
  }
});

test('снимок: отсутствующий ключ — значение по умолчанию', () => {
  const snapshot = featureSnapshot({ themeEnabled: true, friendsEnabled: false });
  expect(snapshot.themeEnabled).toBe('on');
  expect(snapshot.friendsEnabled).toBe('off');
  expect(snapshot.oledEnabled).toBe('off');
  expect(Object.keys(snapshot)).toEqual(Object.keys(FEATURE_TOGGLES));

  // Свежая установка: вкладка друзей включена, остальное нет.
  expect(featureSnapshot({}).friendsEnabled).toBe('on');
});

test('id установки — в формате _ym_uid, который ждёт Метрика', () => {
  for (let i = 0; i < 50; i++) expect(makeClientId()).toMatch(/^\d{19}$/);
  expect(makeClientId(Date.UTC(2026, 9, 3)).startsWith('1790985600')).toBe(true);
});

test('просмотр: страница на условном адресе и параметры визита', () => {
  const now = new Date(2026, 9, 3, 9, 5, 7);
  const url = new URL(
    buildHitUrl({
      kind: 'pageview',
      target: 'daily',
      title: 'Ежедневный снимок',
      params: { version: '1.2.3', features: { themeEnabled: 'on' } },
      clientId: '1790985600123456789',
      language: 'ru-RU',
      now,
    })
  );

  expect(url.origin + url.pathname).toBe('https://mc.yandex.ru/watch/113341269');
  expect(url.searchParams.get('page-url')).toBe('https://ext.cu3rd.ru/daily');
  expect(JSON.parse(url.searchParams.get('site-info') ?? '')).toEqual({
    version: '1.2.3',
    features: { themeEnabled: 'on' },
  });

  const info = url.searchParams.get('browser-info') ?? '';
  expect(info.startsWith('pv:1:')).toBe(true);
  expect(info).toContain(':i:20261003090507:');
  expect(info).toContain(':u:1790985600123456789:');
  expect(info).toContain(':la:ru-RU:');
  // Заголовок — последним: в нём может быть двоеточие.
  expect(info.endsWith(':t:Ежедневный снимок')).toBe(true);
});

test('цель: goal:// вместо адреса и без заголовка', () => {
  const url = new URL(
    buildHitUrl({ kind: 'goal', target: 'grades_export', clientId: '1790985600123456789' })
  );
  expect(url.searchParams.get('page-url')).toBe('goal://ext.cu3rd.ru/grades_export');
  expect(url.searchParams.get('page-ref')).toBe('https://ext.cu3rd.ru/');
  expect(url.searchParams.get('browser-info')?.startsWith('ar:1:')).toBe(true);
  expect(url.searchParams.has('site-info')).toBe(false);
});

test('цели: только из списка, имена годятся для Метрики', () => {
  for (const goal of GOALS) expect(goal).toMatch(/^[a-z_]+$/);
  expect(new Set(GOALS).size).toBe(GOALS.length);
  expect(isGoal('grades_export')).toBe(true);
  expect(isGoal('anything_else')).toBe(false);
  expect(isGoal(42)).toBe(false);
});

test('цели, которые шлют страницы, есть в списке', () => {
  const sources = [
    'src/background.ts',
    'src/popup/popup.js',
    'src/plugins/statements/gradebook.js',
    'src/plugins/course-view/course_exporter.js',
  ];
  const used = new Set<string>();
  for (const path of sources) {
    for (const match of read(path).matchAll(/(?:trackGoal|cuLmsTrack\?\.)\(\s*'([a-z_]+)'/g)) {
      if (match[1]) used.add(match[1]);
    }
  }
  expect(used.size).toBeGreaterThan(5);
  for (const goal of used) expect(isGoal(goal)).toBe(true);
});

test('день снимка — местный, ГГГГ-ММ-ДД', () => {
  expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
});
