import type { PluginManifest } from '../types';

const manifest = {
  id: 'courseView',
  matches: (url: string) => url.includes('/learn/courses/view'),
  cssFiles: ['plugins/course-view/course_cards.css'],
  scripts: [
    // gif_reencode.js должен быть до карточек: они зовут window.cuLmsGifReencode
    'plugins/course-view/gif_reencode.js',
    'plugins/course-view/course_cards.js',
    'plugins/course-view/courses_fix.js',
    'plugins/course-view/course_overview_task_status.js',
    'plugins/course-view/course_overview_autoscroll.js',
    'plugins/course-view/course_friends_list.js',
    'plugins/course-view/future_exams_view.js',
    'plugins/_shared/fflate.umd.min.js',
    'plugins/_shared/pdf-lib.min.js',
    'plugins/course-view/course_exporter.js',
  ],
} satisfies PluginManifest;

export default manifest;
