import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Каталог — обычный скрипт, который вешает объект на window. Запускаем его в
// подставном window: так тестируется ровно тот код, что уезжает в расширение.
const source = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/_shared/theme_tokens.js'),
  'utf8'
);
const darkThemeCss = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/dark-theme/dark-theme.css'),
  'utf8'
);

const scope: { cuLmsThemeTokens?: any } = {};
new Function('window', source)(scope);
const tokens = scope.cuLmsThemeTokens!;

test('каталог отдаёт группы и токены', () => {
  expect(tokens.GROUPS.map((group: any) => group.id)).toEqual(['lms', 'taiga', 'dark']);
  expect(tokens.TOKENS.length).toBeGreaterThan(50);
  tokens.TOKENS.forEach((token: any) => {
    expect(token.name.startsWith('--')).toBe(true);
    expect(token.label.length).toBeGreaterThan(0);
    expect(token.hint.length).toBeGreaterThan(0);
    expect(tokens.GROUPS.some((group: any) => group.id === token.group)).toBe(true);
  });
});

// Значения в каталоге — это подписи к реальным строкам тёмной темы. Если тема
// поменялась, а каталог нет, редактор будет показывать вчерашние цвета.
test('значения по умолчанию совпадают с dark-theme.css', () => {
  const missing = tokens.TOKENS.filter((token: any) => {
    if (!token.dark) return false;
    const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      escaped(token.name) + '\\s*:\\s*' + escaped(token.dark) + '\\s*(!important)?\\s*;'
    );
    return !pattern.test(darkThemeCss);
  });

  expect(missing.map((token: any) => token.name)).toEqual([]);
});

test('чужие переменные и мусорные значения не проходят', () => {
  const clean = tokens.normalizeVars({
    '--accent': '#ff0000',
    '--not-our-variable': '#00ff00',
    '--background': 'red; } body { display: none',
    '--text-link': 42,
  });

  expect(clean['--accent']).toBe('#ff0000');
  expect(clean['--not-our-variable']).toBeUndefined();
  expect(clean['--text-link']).toBeUndefined();
  // Значение остаётся, но закрыть правило и дописать своё им уже нельзя.
  expect(clean['--background']).not.toContain(';');
  expect(clean['--background']).not.toContain('}');
});

test('!important в значении не удваивается', () => {
  expect(tokens.normalizeValue('#fff !important')).toBe('#fff');
  expect(tokens.buildCss({ '--accent': '#fff !important' }, '')).toContain(
    '--accent: #fff !important;'
  );
});

test('стиль собирается из переменных и своего CSS', () => {
  const css = tokens.buildCss({ '--accent': '#123456' }, '.card { border-radius: 8px; }');

  // Широкий селектор нужен, чтобы перебить объявления Taiga на [tuiTheme].
  expect(css).toContain(':root,\n:host,\n[tuiTheme] {');
  expect(css).toContain('--accent: #123456 !important;');
  expect(css).toContain('.card { border-radius: 8px; }');
});

test('пустая тема даёт пустой стиль', () => {
  expect(tokens.buildCss({}, '')).toBe('');
  expect(tokens.buildCss(null, '   ')).toBe('');
});

test('слишком длинный CSS обрезается', () => {
  const huge = '/* ' + 'x'.repeat(tokens.CSS_MAX) + ' */';
  expect(tokens.normalizeCss(huge).length).toBe(tokens.CSS_MAX);
});
