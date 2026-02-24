import type { PluginManifest } from '../types';

const manifest = {
  id: 'longreads',
  matches: (url: string) => url.includes('/longreads/'),
  scripts: [
    'plugins/longreads/homework_weight_fix.js',
    'plugins/longreads/instant_doc_view_fix.js',
    'plugins/longreads/task_status_adaptation.js',
    'plugins/longreads/rename_hw.js',
  ],
} satisfies PluginManifest;

export default manifest;
