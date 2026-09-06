import type { PluginManifest } from '../types';

const manifest = {
  id: 'timetable',
  matches: (url: string) => url.includes('/learn/timetable'),
  scripts: [
    'plugins/timetable/timetable_status.js',
    // Порядок важен: swap_api.js кладёт в window общий клиент, которым
    // пользуются оба скрипта ниже.
    'plugins/timetable/swap_api.js',
    'plugins/timetable/swap_order_button.js',
    'plugins/timetable/swap_menu.js',
  ],
  cssFiles: ['plugins/timetable/swap.css'],
} satisfies PluginManifest;

export default manifest;
