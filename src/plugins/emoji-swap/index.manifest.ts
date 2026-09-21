import type { PluginManifest } from '../types';
import { isLmsUrl } from '../lms-hosts';

const manifest = {
  id: 'emojiSwap',
  matches: (url: string) => isLmsUrl(url) && !url.includes('/learn/tasks'),
  scripts: ['plugins/emoji-swap/emoji_swap.js'],
} satisfies PluginManifest;

export default manifest;
