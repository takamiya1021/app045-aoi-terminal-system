import { test, expect } from '@playwright/test';

// Before each test, launch the backend and frontend servers
test.beforeEach(async ({ page }) => {
  // Start backend server (assuming it runs on port 3101 as configured)
  // You might need a more robust way to manage background processes in Playwright tests
  // For now, we assume backend is either already running or will be started separately.
  // In a full CI/CD, this would be handled by a 'webServer' config in playwright.config.ts

  // Start frontend server
  await page.goto('/'); // baseURL is http://localhost:3101
});

test('should connect to WebSocket and display terminal', async ({ page }) => {
  await page.goto('/');

  // 認証（Cookie方式）
  await page.getByTestId('auth-token-input').fill('valid_token');
  await page.getByTestId('auth-submit').click({ force: true });

  // Check if terminal element is visible
  await expect(page.locator('[data-testid="xterm-terminal"]')).toBeVisible();

  // Optionally, check for a "connected" message in the console or terminal output
  // This requires a way to inspect xterm.js output or console logs.
  // For now, just ensure the element is there.

  // Simulate typing (this will only be local echo without backend integration)
  // await page.locator('[data-testid="xterm-terminal"]').type('hello');
  // await expect(page.locator('[data-testid="xterm-terminal"]')).toContainText('hello');
});

test('should reject connection without token', async ({ page }) => {
  await page.goto('/'); // No token provided

  // Expect an error message or redirection, or simply no terminal content
  // This depends on how the frontend handles connection rejection.
  // For now, we can check if the terminal is NOT visible or if an error message is displayed.
  await expect(page.locator('[data-testid="xterm-terminal"]')).not.toBeVisible();
  // If there's an error message on screen, check for it
  // await expect(page.locator('text=Authentication required')).toBeVisible();
});
