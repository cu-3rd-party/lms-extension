import type { PluginManifest } from '../types';

// Раздел «Посещаемость» студента. Не `includes('/learn/attendance')`: под
// этим же префиксом лежит `/learn/attendance-management` преподавателей.
// Оба скрипта сами смотрят на адрес и живут, пока живёт SPA, поэтому
// внедряются на любой странице раздела.
const manifest = {
  id: 'attendance',
  matches: (url: string) => /\/learn\/attendance(?:[/?#]|$)/.test(url),
  cssFiles: ['plugins/attendance/attendance.css'],
  scripts: [
    // Расписание контрольных — общее со сводной ведомостей и курсом.
    'plugins/course-view/future_exams_api.js',
    // attendance_api.js раньше обоих: они зовут window.cuLmsAttendance.
    'plugins/attendance/attendance_api.js',
    'plugins/attendance/attendance_summary.js',
    'plugins/attendance/attendance_course.js',
  ],
} satisfies PluginManifest;

export default manifest;
