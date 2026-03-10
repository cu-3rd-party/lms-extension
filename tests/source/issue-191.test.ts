import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const darkThemeCss = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/dark-theme/dark-theme.css'),
  'utf8'
);

test('dark theme recolors ordered-list markers inside the rich text editor', () => {
  expect(darkThemeCss).toContain('.tiptap.ProseMirror ol li::marker');
  expect(darkThemeCss).toContain('color: var(--culms-dark-text-primary) !important;');
});
