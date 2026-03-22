import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const darkThemeCss = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/dark-theme/dark-theme.css'),
  'utf8'
);

test('dark theme keeps task status chips mapped to light-theme colors', () => {
  expect(darkThemeCss).toContain("tui-chip[data-appearance='support-categorical-13-pale']");
  expect(darkThemeCss).toContain('background-color: rgba(249, 171, 0, 0.56) !important;');
  expect(darkThemeCss).toContain('background-color: rgba(66, 133, 244, 0.66) !important;');
});
