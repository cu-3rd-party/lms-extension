#!/usr/bin/env node
/**
 * Pack the built extension into a zip / xpi for distribution.
 * Replaces build-chrome.sh and build-firefox.sh.
 *
 * Usage:
 *   node scripts/pack.js [chrome|firefox]
 *   BROWSER=firefox node scripts/pack.js
 */

import { execSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const BROWSER = process.argv[2] ?? process.env.BROWSER ?? 'chrome';
const ext = BROWSER === 'firefox' ? 'xpi' : 'zip';

const distDir = resolve(root, `dist/${BROWSER}`);
const buildDir = resolve(root, 'build');
const outFile = resolve(buildDir, `lms-extension-${BROWSER}.${ext}`);

if (!existsSync(distDir)) {
  console.error(`✗ dist/${BROWSER}/ not found — run "build:${BROWSER}" first`);
  process.exit(1);
}

if (!existsSync(buildDir)) {
  mkdirSync(buildDir, { recursive: true });
}

console.log(`Packing ${BROWSER} extension…`);
execSync(`cd "${distDir}" && zip -qr "${outFile}" .`);
console.log(`✓  build/lms-extension-${BROWSER}.${ext}`);
