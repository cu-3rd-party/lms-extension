import type { PluginManifest } from '../types';

const manifest = {
  id: 'courseView',
  matches: (url: string) => url.includes('/learn/courses/view'),
  scripts: [
    'plugins/course-view/course_card_simplifier.js',
    'plugins/course-view/courses_fix.js',
    'plugins/course-view/course_overview_task_status.js',
    'plugins/course-view/course_overview_autoscroll.js',
    'plugins/course-view/course_friends_list.js',
    'plugins/course-view/future_exams_view.js',
  ],
} satisfies PluginManifest;

export default manifest;
