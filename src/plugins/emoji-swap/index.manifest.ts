import type { PluginManifest } from '../types';

const manifest = {
  id: 'emojiSwap',
  matches: (url: string) =>
    url.startsWith('https://my.centraluniversity.ru/') && !url.includes('/learn/tasks'),
  scripts: ['plugins/emoji-swap/emoji_swap.js'],
} satisfies PluginManifest;

export default manifest;
