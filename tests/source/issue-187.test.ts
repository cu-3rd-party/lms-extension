import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const backgroundTs = readFileSync(resolve(import.meta.dir, '../../src/background.ts'), 'utf8');
const popupHtml = readFileSync(resolve(import.meta.dir, '../../src/popup/popup.html'), 'utf8');
const popupJs = readFileSync(resolve(import.meta.dir, '../../src/popup/popup.js'), 'utf8');
const loaderJs = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/_shared/plugin_page_loader.js'),
  'utf8'
);

test('popup exposes a one-time reload without extension injection', () => {
  expect(popupHtml).toContain('disable-extension-once-btn');
  expect(popupJs).toContain("window.parent.postMessage({ action: 'reloadWithoutExtension' }, '*')");
  expect(popupJs).toContain("action: 'BYPASS_EXTENSION_ONCE'");
  expect(loaderJs).toContain("event.data.action === 'reloadWithoutExtension'");
  expect(backgroundTs).toContain("action: 'BYPASS_EXTENSION_ONCE'");
  expect(backgroundTs).toContain('temporarilyDisabledTabs');
});
