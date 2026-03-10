import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const darkThemeCss = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/dark-theme/dark-theme.css'),
  'utf8'
);

const oledCss = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/dark-theme/dark-theme-oled.css'),
  'utf8'
);

test('dark theme preserves custom course cover colors for without-category cards', () => {
  expect(darkThemeCss).toContain("body .course-card.withoutCategory[style*='--cu-island-cover-bg']");
  expect(darkThemeCss).toContain('background-color: var(--cu-island-cover-bg) !important;');
  expect(oledCss).toContain("body .course-card.withoutCategory[style*='--cu-island-cover-bg']");
});
