// Plain JS scripts are referenced as hardcoded paths so they are injected as
// regular global scripts (not ES module bundles), preserving cross-file globals.
import type { PluginManifest } from '../types';
import { isLmsUrl } from '../lms-hosts';

const manifest = {
  id: '_shared',
  matches: (url: string) => isLmsUrl(url),
  cssFiles: ['styles.css'],
  scripts: [
    // browser-polyfill must be first so subsequent scripts can use `browser.*`
    'browser-polyfill.js',
    'plugins/_shared/course_names.js',
    'plugins/_shared/custom_logo.js',
    'plugins/_shared/custom_background.js',
    'plugins/_shared/version_check.js',
    'plugins/_shared/reset.js',
    'plugins/_shared/friends_tab.js',
    'plugins/_shared/hide_bonus.js',
    'plugins/_shared/cu-clubs.js',
    'plugins/_shared/plugin_page_loader.js',
    'plugins/_shared/feedback_menu.js',
    'plugins/_shared/snow.js',
  ],
} satisfies PluginManifest;

export default manifest;
