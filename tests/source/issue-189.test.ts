import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const darkThemeCss = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/dark-theme/dark-theme.css'),
  'utf8'
);

test('dark theme does not invert custom task action buttons on row hover', () => {
  expect(darkThemeCss).toContain(
    '.task-table__task:hover button:not(.culms-action-button)'
  );
  expect(darkThemeCss).toContain('.task-table__task:hover .culms-action-button');
  expect(darkThemeCss).toContain('filter: none !important;');
});
