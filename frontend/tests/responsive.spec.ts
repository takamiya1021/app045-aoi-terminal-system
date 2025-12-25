import { test, expect, devices } from '@playwright/test';

test('should have a responsive layout on mobile', async ({ page }) => {
  // iPhone 12相当のビューポートに設定
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  // 1. ヘッダーのタイトルが表示されているか
  await expect(page.locator('header h1')).toHaveText('Aoi-Terminals');

  // Login
  await page.getByTestId('auth-token-input').fill('valid_token');
  await page.getByTestId('auth-submit').click({ force: true });


  // 2. ターミナルが表示されているか
  await expect(page.locator('[data-testid="terminal-container"]')).toBeVisible();

  // 3. コントロールパネルが表示されているか
  await expect(page.locator('[data-testid="control-panel"]')).toBeVisible();

  // 4. フッターが隠れていないか（あるいはモバイルでは非表示にする設計ならそれを検証）
  // 今回は一旦「存在する」ことを確認
  await expect(page.locator('footer')).toBeVisible();
});
