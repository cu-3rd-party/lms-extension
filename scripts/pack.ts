/**
 * Pack the built extension into a zip / xpi for distribution.
 *
 * Usage:
 *   bun --bun scripts/pack.ts [chrome|firefox]
 *   BROWSER=firefox bun --bun scripts/pack.ts
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { resolve, dirname, relative, join } from 'path';
import { fileURLToPath } from 'url';
import { zipSync } from 'fflate';

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

function collectFiles(dir: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(distDir, full).replace(/\\/g, '/');
    if (statSync(full).isDirectory()) {
      Object.assign(files, collectFiles(full));
    } else {
      files[rel] = new Uint8Array(readFileSync(full));
    }
  }
  return files;
}

console.log(`Packing ${BROWSER} extension…`);
const files = collectFiles(distDir);
const zipped = zipSync(files, { level: 6 });
writeFileSync(outFile, zipped);
console.log(`✓  build/lms-extension-${BROWSER}.${ext}`);
