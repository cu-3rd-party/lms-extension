import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const darkThemeCss = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/dark-theme/dark-theme.css'),
  'utf8'
);

test('dark theme adapts empty-state illustrations in statement blocks', () => {
  expect(darkThemeCss).toContain('.cu-block-status .t-block-image svg');
  expect(darkThemeCss).toContain(".cu-block-status .t-block-image svg [stroke='#000']");
  expect(darkThemeCss).toContain('stroke: var(--culms-dark-text-secondary) !important;');
});
