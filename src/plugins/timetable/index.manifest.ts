import type { PluginManifest } from '../types';

const manifest = {
  id: 'timetable',
  matches: (url: string) => url.includes('/learn/timetable'),
  scripts: ['plugins/timetable/timetable_status.js'],
} satisfies PluginManifest;

export default manifest;
