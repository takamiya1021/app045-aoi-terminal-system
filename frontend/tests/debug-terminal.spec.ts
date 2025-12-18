import { test, expect } from '@playwright/test';

test('debug terminal connection', async ({ page }) => {
  const logs: string[] = [];
  const errors: string[] = [];

  page.on('console', msg => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);
    console.log(`BROWSER LOG: ${text}`);
  });
  page.on('pageerror', err => {
    errors.push(err.message);
    console.log(`BROWSER ERROR: ${err.message}`);
  });

  await page.goto('/');

  // 認証（Cookie方式）
  await page.getByTestId('auth-token-input').fill('valid_token');
  await page.getByTestId('auth-submit').click();
  
  // ターミナルが表示されるのを待機
  console.log('Waiting for terminal container...');
  const container = page.locator('[data-testid="terminal-container"]');
  await expect(container).toBeVisible({ timeout: 10000 });

  // 実際のxtermのDOM要素を探す
  console.log('Checking xterm-screen...');
  
  // 10秒間、データが届くのを監視
  let hasText = false;
  for (let i = 0; i < 20; i++) {
    const content = await page.innerText('body');
    if (content.includes('$') || content.includes('ustar') || content.length > 500) {
      hasText = true;
      console.log('Text detected in terminal!');
      break;
    }
    await page.waitForTimeout(500);
  }

  console.log('Final State:');
  console.log(`Errors: ${errors.length}`);
  console.log(`Logs: ${logs.length}`);
  
  if (!hasText) {
    throw new Error(`Terminal remains blank. Errors: ${errors.join(', ')}`);
  }
});
