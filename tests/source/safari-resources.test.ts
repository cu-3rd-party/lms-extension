import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Safari собирается не из dist целиком, а из списка ресурсов в Xcode-проекте: каждая папка и каждый
// файл верхнего уровня dist/chrome подключены в project.pbxproj отдельной записью. Если в манифест
// попал новый верхний уровень (как когда-то `offline/`), а в Xcode его не добавили, в Safari-сборке
// файла просто нет, и страница открывается как «Safari Can't Find the File» (NSURLErrorDomain -1100).
// Chrome и Firefox при этом работают, поэтому поломку замечают только у пользователей Safari.

const root = resolve(import.meta.dir, '../..');
const manifest = readFileSync(resolve(root, 'manifest.config.js'), 'utf8');
const pbxproj = readFileSync(
  resolve(root, 'safari/CU LMS Enhancer/CU LMS Enhancer.xcodeproj/project.pbxproj'),
  'utf8'
);

/** Первые сегменты путей из web_accessible_resources: `plugins/_shared/a.js` → `plugins`. */
function topLevelOfWebAccessibleResources(): string[] {
  const start = manifest.indexOf('web_accessible_resources');
  const open = manifest.indexOf('resources: [', start);
  const close = manifest.indexOf(']', open);
  if (start === -1 || open === -1 || close === -1) {
    throw new Error('Не нашли web_accessible_resources в manifest.config.js');
  }
  const paths = [...manifest.slice(open, close).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  return [...new Set(paths.map((p) => p.split('/')[0]))];
}

const bundled = new Set(
  [...pbxproj.matchAll(/path = "?\.\.\/\.\.\/\.\.\/dist\/chrome\/([^";]+?)"?;/g)].map((m) => m[1])
);

test('все верхние папки и файлы из web_accessible_resources подключены в Xcode-проект Safari', () => {
  const missing = topLevelOfWebAccessibleResources().filter((name) => !bundled.has(name));
  expect(missing).toEqual([]);
});

test('в Xcode-проекте есть и то, что crxjs кладёт в dist помимо ресурсов из манифеста', () => {
  for (const name of [
    'manifest.json',
    'chunks',
    'service-worker-loader.js',
    'index.loader.js-loader.js',
  ]) {
    expect(bundled.has(name)).toBe(true);
  }
});

test('страница «LMS офлайн» (offline/) включена в Safari-сборку', () => {
  // Её открывает background по адресу расширения; без папки Safari отвечает «файл не найден».
  expect(bundled.has('offline')).toBe(true);
});
