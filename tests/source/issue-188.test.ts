import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const tasksFixSource = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/courses/tasks_fix.js'),
  'utf8'
);

test('tasks late-days layout reserves space for both LMS and custom action buttons', () => {
  expect(tasksFixSource).toContain(
    '.task-table__late-days { min-width: 72px !important; white-space: nowrap; }'
  );
  expect(tasksFixSource).toContain(
    '.culms-late-days-container { display: flex; align-items: center; justify-content: flex-start; gap: 4px; }'
  );
  expect(tasksFixSource).not.toContain('margin-right: 8px;');
});
