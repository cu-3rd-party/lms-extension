import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.js';
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
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
      // For Firefox, explicitly include background.ts as an entry point since
      // crxjs does not bundle it automatically for Firefox builds.
      ...(BROWSER === 'firefox' && {
        input: { background: resolve(__dirname, 'src/background.ts') },
      }),
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
    {
      name: 'copy-browser-polyfill',
      buildStart() {
        fs.copyFileSync(
          'node_modules/webextension-polyfill/dist/browser-polyfill.js',
          'src/browser-polyfill.js'
        );
      },
    },
    crx({
      manifest,
      browser: /** @type {'chrome' | 'firefox'} */ (BROWSER),
    }),
    BROWSER === 'firefox' && {
      name: 'fix-firefox-background',
      closeBundle() {
        const manifestPath = resolve(__dirname, `dist/firefox/manifest.json`);
        if (!fs.existsSync(manifestPath)) return;
        const mf = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        mf.background = { scripts: ['background.js'], type: 'module' };
        fs.writeFileSync(manifestPath, JSON.stringify(mf, null, 2));
      },
    },
  ],
});
