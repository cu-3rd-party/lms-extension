import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const darkThemeCss = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/dark-theme/dark-theme.css'),
  'utf8'
);

test('dark theme keeps links blue even when LMS wraps them in spans', () => {
  expect(darkThemeCss).toContain('.tiptap.ProseMirror a span');
  expect(darkThemeCss).toContain('color: var(--culms-dark-text-link-hover) !important;');
  expect(darkThemeCss).toContain('text-underline-offset: 0.15em;');
});
