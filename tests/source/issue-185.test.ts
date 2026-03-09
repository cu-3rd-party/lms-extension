import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const darkThemeCss = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/dark-theme/dark-theme.css'),
  'utf8'
);

test('dark theme defines a non-black default color for tooltip icons', () => {
  expect(darkThemeCss).toContain('tui-tooltip tui-icon:after');
  expect(darkThemeCss).toContain('color: var(--culms-dark-text-secondary) !important;');
});
