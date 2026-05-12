import { chromium } from 'playwright';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = resolve(__dirname, './dist/chrome');

(async () => {
  console.log('Запускаю браузер...');

  // Создаем временную директорию для профиля (Playwright требует ее для persistent context)
  const profileDir = fs.mkdtempSync(join(tmpdir(), 'debug-browser-'));

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });

  const page = await context.newPage();
  await page.goto('https://my.centraluniversity.ru/learn/courses/view/actual/969');

  console.log('==================================================');
  console.log('БРАУЗЕР ОТКРЫТ! Пожалуйста, залогиньтесь (я подожду).');
  console.log('DOM будет сохраняться в файл debug.html каждые 5 секунд.');
  console.log('==================================================');

  const interval = setInterval(async () => {
    try {
      const content = await page.content();
      fs.writeFileSync('debug.html', content);
    } catch (e) {
      // ignore
    }
  }, 5000);

  // Сохраняем скрипт открытым
  await new Promise<void>((resolve) => {
    context.on('close', () => {
      resolve();
    });
  });

  clearInterval(interval);
  fs.rmSync(profileDir, { recursive: true, force: true });
})();
