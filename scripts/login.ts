/**
 * Интерактивный скрипт входа в LMS с 2FA.
 * Сохраняет сессионные куки в tests/.cookies.json для использования в тестах.
 *
 * Использование:
 *   LMS_LOGIN=... LMS_PASSWORD=... bun run test:login
 *
 * Или создай .env файл с LMS_LOGIN и LMS_PASSWORD.
 */

import { chromium } from 'playwright';
import { createInterface } from 'readline';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIES_FILES = [
  resolve(__dirname, '../tests/.cookies.json'),
  resolve(__dirname, '../tests/helpers/.cookies.json'),
];
const LMS_URL = 'https://my.centraluniversity.ru';
const LOGIN_URL = `${LMS_URL}/login`;

const LOGIN = process.env.LMS_LOGIN;
const PASSWORD = process.env.LMS_PASSWORD;

if (!LOGIN || !PASSWORD) {
  console.error('Нужны переменные окружения LMS_LOGIN и LMS_PASSWORD');
  console.error('Пример: LMS_LOGIN=user@example.com LMS_PASSWORD=secret bun run test:login');
  process.exit(1);
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

console.log('Запускаю браузер...');
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

console.log(`Открываю ${LOGIN_URL}`);
await page.goto(LOGIN_URL, { waitUntil: 'commit' });

// Шаг 1: вводим логин и жмём Next
const loginInput = page.locator('input[name="userName"]');
await loginInput.waitFor({ timeout: 30_000 });
await loginInput.fill(LOGIN);
await page.locator('button[type="submit"]').click();

// Шаг 2: ждём поле пароля и вводим пароль
const passwordInput = page.locator('input[type="password"]');
await passwordInput.waitFor({ timeout: 15_000 });
await passwordInput.fill(PASSWORD);
await page.locator('button[type="submit"]').click();

// Шаг 3: 2FA
const twoFactorInput = page
  .locator(
    'input[name="otp"], input[name="code"], input[name="totp"], input[autocomplete="one-time-code"]'
  )
  .first();

try {
  await twoFactorInput.waitFor({ timeout: 15_000 });
  console.log('Появилось поле 2FA.');
  const code = await prompt('Введи код 2FA: ');
  await twoFactorInput.fill(code);
  await page.locator('button[type="submit"]').click();
} catch {
  console.log('Поле 2FA не найдено, пропускаем.');
}

// Ждём успешного входа
try {
  await page.waitForURL((url) => url.href.startsWith(LMS_URL) && !url.href.includes('/login'), {
    timeout: 30_000,
  });
} catch {
  console.error(`Вход не выполнен. Текущий URL: ${page.url()}`);
  await browser.close();
  process.exit(1);
}

// Сохраняем все куки доменов centraluniversity.ru
const allCookies = await context.cookies();
const sessionCookies = allCookies.filter((c) => c.domain.includes('centraluniversity.ru'));

for (const cookiesFile of COOKIES_FILES) {
  mkdirSync(dirname(cookiesFile), { recursive: true });
  writeFileSync(cookiesFile, JSON.stringify(sessionCookies, null, 2));
}

console.log(`Сохранено ${sessionCookies.length} куки → ${COOKIES_FILES.join(', ')}`);
console.log('Теперь можно запускать тесты: bun run test');

await browser.close();
