import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.js';

const BROWSER = process.env.BROWSER ?? 'chrome';

export default defineConfig({
  // src/ is the extension root — all manifest paths resolve from here
  root: 'src',

  build: {
    outDir: `../dist/${BROWSER}`,
    emptyOutDir: true,
    rollupOptions: {
      // Extension content scripts rely on cross-file globals within a shared
      // executeScript context — disable tree-shaking so function declarations
      // in one file remain available when called by another file.
      treeshake: false,
      output: {
        // Preserve original filenames so background.js can reference them by
        // name via chrome.scripting.executeScript({ files: ['tasks_fix.js'] })
        entryFileNames: '[name].js',
        // Shared chunks from future imports go into a separate folder
        chunkFileNames: 'chunks/[name]-[hash].js',
        // CSS / SVG / PNG keep their original names too
        assetFileNames: '[name][extname]',
      },
    },
  },

  plugins: [
    crx({
      manifest,
      browser: /** @type {'chrome' | 'firefox'} */ (BROWSER),
    }),
  ],
});
