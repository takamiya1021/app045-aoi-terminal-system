import { test, expect, type Browser } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function loginWithMasterToken(page: any) {
  test.setTimeout(60_000);
  await page.goto('/');
  // Next dev の初回コンパイル/水和が遅いと、入力の状態が反映されるまで時間がかかることがある
  await page.getByTestId('auth-token-input').fill('valid_token');
  await expect(page.getByTestId('auth-submit')).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId('auth-submit').click();
  await expect(page.locator('[data-testid="terminal-container"]')).toBeVisible({ timeout: 10000 });
}

test('share link issues one-time token and clears it from URL', async ({ page, browser }) => {
  await loginWithMasterToken(page);

  await page.getByRole('button', { name: 'Share (QR)' }).click();
  await page.getByRole('button', { name: '新しいリンクを発行' }).click();

  const urlBox = page.locator('text=/\\?token=/').first();
  await expect(urlBox).toBeVisible({ timeout: 10000 });

  const urlText = (await urlBox.textContent())?.trim();
  expect(urlText).toBeTruthy();

  const url = urlText as string;

  // 新しいブラウザコンテキスト（=別端末想定）でアクセスして、自動ログインできること
  const freshContext = await (browser as Browser).newContext();
  const freshPage = await freshContext.newPage();
  await freshPage.goto(url);

  // トークン互換ログインが走って、URLから消える（search が空）
  await expect
    .poll(async () => new URL(freshPage.url()).search, { timeout: 10000 })
    .toBe('');

  // ログイン画面が消えてターミナルが出てくる
  await expect(freshPage.getByTestId('auth-token-input')).toHaveCount(0, { timeout: 15000 });
  await expect(freshPage.getByTestId('xterm-terminal')).toBeVisible({ timeout: 15000 });

  await freshContext.close();
});

test('share token is one-time: second use should fail', async ({ page, browser }) => {
  await loginWithMasterToken(page);

  await page.getByRole('button', { name: 'Share (QR)' }).click();
  await page.getByRole('button', { name: '新しいリンクを発行' }).click();
  const urlBox = page.locator('text=/\\?token=/').first();
  await expect(urlBox).toBeVisible({ timeout: 10000 });
  const url = ((await urlBox.textContent()) || '').trim();
  expect(url).toContain('?token=');

  const ctx1 = await (browser as Browser).newContext();
  const p1 = await ctx1.newPage();
  await p1.goto(url);
  await expect(p1.getByTestId('xterm-terminal')).toBeVisible({ timeout: 15000 });
  await ctx1.close();

  // 同じURLをもう一回（別コンテキスト）で開くと、認証失敗してログイン画面のまま
  const ctx2 = await (browser as Browser).newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(url);
  await expect(p2.getByTestId('auth-token-input')).toBeVisible({ timeout: 10000 });
  await ctx2.close();
});
