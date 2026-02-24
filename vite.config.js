import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const BROWSER = process.env.BROWSER ?? 'chrome';

const chromeManifest = require('./src/manifest.json');
const firefoxManifest = require('./src/manifest_firefox.json');

export default defineConfig({
  // src/ is the extension root — all manifest paths resolve from here
  root: 'src',

  build: {
    outDir: `../dist/${BROWSER}`,
    emptyOutDir: true,
    rollupOptions: {
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
      manifest: BROWSER === 'firefox' ? firefoxManifest : chromeManifest,
      // crx handles web_accessible_resources, service-worker vs background-page,
      // and strips use_dynamic_url for Firefox automatically
      browser: /** @type {'chrome' | 'firefox'} */ (BROWSER),
    }),
  ],
});
