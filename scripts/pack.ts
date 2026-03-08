#!/usr/bin/env bun
/**
 * Pack the built extension into a zip / xpi for distribution.
 *
 * Usage:
 *   bun --bun scripts/pack.ts [chrome|firefox]
 *   BROWSER=firefox bun --bun scripts/pack.ts
 */

import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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
const result = Bun.spawnSync(['zip', '-qr', outFile, '.'], { cwd: distDir });
if (result.exitCode !== 0) {
  console.error(result.stderr.toString());
  process.exit(result.exitCode ?? 1);
}
console.log(`✓  build/lms-extension-${BROWSER}.${ext}`);
