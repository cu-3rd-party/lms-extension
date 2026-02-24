import darkThemeLoaderUrl from './index.loader.js?script';
import type { PluginManifest } from '../types';

const manifest = {
  id: 'darkTheme',
  matches: (url: string) => url.startsWith('https://my.centraluniversity.ru/'),
  scripts: [darkThemeLoaderUrl],
} satisfies PluginManifest;

export default manifest;
