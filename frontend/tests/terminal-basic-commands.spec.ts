import { test, expect } from '@playwright/test';

test('terminal executes basic commands (pwd, ls)', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('auth-token-input').fill('valid_token');
  await expect(page.getByTestId('auth-submit')).toBeEnabled({ timeout: 60000 });
  await page.getByTestId('auth-submit').click({ force: true });

  await expect(page.locator('[data-testid="terminal-container"]')).toBeVisible({ timeout: 10000 });

  // xterm の内部DOMが描画されるまで待つ
  const xterm = page.getByTestId('xterm-terminal');
  await expect(xterm).toBeVisible({ timeout: 10000 });

  // xterm はローカルエコーしないので、出力が出ない＝WS/描画が死んでるのサインになる
  await xterm.click();

  await page.keyboard.type('pwd');
  await page.keyboard.press('Enter');

  const rows = page.locator('.xterm-rows');
  await expect(rows).toContainText('/home', { timeout: 10000 });

  await page.keyboard.type('ls');
  await page.keyboard.press('Enter');

  await expect(rows).toContainText('projects', { timeout: 10000 });
});
