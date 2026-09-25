// advanced_statements.js and gradebook.js check the current path themselves:
// both keep working across SPA navigation inside the statements section, so
// they are injected on every statements page, not only on the one they draw on.
import type { PluginManifest } from '../types';

const manifest = {
  id: 'statements',
  matches: (url: string) => url.includes('/learn/reports/student-performance'),
  cssFiles: ['plugins/statements/gradebook.css'],
  scripts: [
    'plugins/statements/advanced_statements.js',
    // Расписание контрольных — общее с курсом и дэшбордом «Мои курсы»:
    // future_exams_api.js до gradebook.js, тот зовёт window.cuLmsFutureExams.
    'plugins/course-view/future_exams_api.js',
    'plugins/statements/gradebook.js',
  ],
} satisfies PluginManifest;

export default manifest;
