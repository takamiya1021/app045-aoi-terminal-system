import { test, expect } from '@playwright/test';

test('theme colors should be applied correctly', async ({ page }) => {
  await page.goto('/');

  // Login
  await page.getByTestId('auth-token-input').fill('valid_token');
  await page.getByTestId('auth-submit').click({ force: true });


  // bodyの背景色を確認 (Slate-900: #111827 -> rgb(17, 24, 39))
  const body = page.locator('body');
  await expect(body).toHaveCSS('background-color', 'rgb(17, 24, 39)');

  // 文字色を確認 (Gray-100: #f3f4f6 -> rgb(243, 244, 246))
  // 注意: 現状は #ededed (rgb(237, 237, 237)) のはず
  await expect(body).toHaveCSS('color', 'rgb(243, 244, 246)');
});
