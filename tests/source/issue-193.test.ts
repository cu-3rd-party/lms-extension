import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const darkThemeCss = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/dark-theme/dark-theme.css'),
  'utf8'
);

test('dark theme adapts status chips inside statement tables', () => {
  expect(darkThemeCss).toContain(".cu-table tbody td tui-chip[data-appearance='positive-pale']");
  expect(darkThemeCss).toContain(".cu-table tbody td tui-chip[data-appearance='support-neutral']");
  expect(darkThemeCss).toContain('background-color: rgba(66, 133, 244, 0.66) !important;');
});
