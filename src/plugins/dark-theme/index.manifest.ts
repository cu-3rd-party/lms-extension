import darkThemeLoaderUrl from './index.loader.js?script';
import type { PluginManifest } from '../types';
import { isLmsUrl } from '../lms-hosts';

const manifest = {
  id: 'darkTheme',
  matches: (url: string) => isLmsUrl(url),
  scripts: [darkThemeLoaderUrl],
} satisfies PluginManifest;

export default manifest;
