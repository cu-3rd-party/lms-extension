import { defineConfig, devices } from '@playwright/test';

// В tests/source лежат проверки на bun:test — Playwright их грузить не должен.
// Шаблон повторяется в проекте chromium: свой testIgnore проекта заменяет
// общий, а не дополняет его.
const BUN_TESTS = 'tests/source/**';

export default defineConfig({
  testDir: './tests',
  testIgnore: [BUN_TESTS],
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  fullyParallel: false,
  workers: 1,
  use: {
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      // Регрессия на Gecko живёт в отдельном проекте ниже
      testIgnore: [BUN_TESTS, /pdf-viewer-firefox\.test\.ts/],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Единственный тест, которому нужен именно Firefox: страница тёмного PDF
      // ломалась только в Gecko. Расширение и логин в ЛМС тут не нужны.
      name: 'firefox',
      testMatch: /pdf-viewer-firefox\.test\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
  ],
});
