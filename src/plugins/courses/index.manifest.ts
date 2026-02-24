import type { PluginManifest } from '../types';

const manifest = {
  id: 'courses',
  matches: (url: string) => url.includes('/learn/tasks'),
  scripts: ['plugins/courses/tasks_fix.js'],
} satisfies PluginManifest;

export default manifest;
