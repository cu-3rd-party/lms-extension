import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const darkThemeCss = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/dark-theme/dark-theme.css'),
  'utf8'
);

test('dark theme styles real LMS tooltip help icons via ::after background color', () => {
  expect(darkThemeCss).toContain('cu-tooltip tui-icon::after');
  expect(darkThemeCss).toContain('background-color: var(--culms-dark-text-secondary) !important;');
  expect(darkThemeCss).toContain('background-color: var(--text-tertiary-hover-on-dark) !important;');
});
