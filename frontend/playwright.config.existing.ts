import { defineConfig, devices } from '@playwright/test';

// 既に起動済みのサーバ（3101/3102）に対してテストする用。
// 通常の `frontend/playwright.config.ts` は webServer で起動まで面倒を見る。
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3101',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

