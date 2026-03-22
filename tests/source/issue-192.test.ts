import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const darkThemeCss = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/dark-theme/dark-theme.css'),
  'utf8'
);

test('dark theme keeps table links blue in statements', () => {
  expect(darkThemeCss).toContain('.cu-table tbody td a span');
  expect(darkThemeCss).toContain('color: var(--culms-dark-text-link-hover) !important;');
});
