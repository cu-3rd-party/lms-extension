import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  fullyParallel: false,
  workers: 1,
  use: {
    headless: false,
    actionTimeout: 10_000,
  },
});
