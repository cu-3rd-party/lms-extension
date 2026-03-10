import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const darkThemeCss = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/dark-theme/dark-theme.css'),
  'utf8'
);

test('dark theme styles real LMS tooltip help icons with bright contrast in dark theme', () => {
  expect(darkThemeCss).toContain('cu-tooltip tui-icon::after');
  expect(darkThemeCss).toContain('cu-tooltip tui-icon.hint');
  expect(darkThemeCss).toContain('filter: brightness(0) invert(1) !important;');
  expect(darkThemeCss).toContain('opacity: 0.96 !important;');
  expect(darkThemeCss).toContain('--cu-tooltip-icon-color: var(--text-primary-on-dark) !important;');
  expect(darkThemeCss).toContain('background-color: var(--text-primary-on-dark) !important;');
  expect(darkThemeCss).toContain('--cu-tooltip-icon-color: var(--culms-dark-text-primary) !important;');
  expect(darkThemeCss).toContain('opacity: 1 !important;');
  expect(darkThemeCss).toContain('background-color: var(--culms-dark-text-primary) !important;');
});
